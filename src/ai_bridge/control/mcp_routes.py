"""FastAPI route handlers for managing external MCP services and connectors."""
from __future__ import annotations

import html
import json
import logging
import os
import secrets
import time
import urllib.parse
import uuid
from typing import Any

from fastapi import Header, HTTPException, Request
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, Field

from .mcp_client import execute_mcp_tool, fetch_mcp_tools
from .mcp_oauth import (
    discover_oauth_metadata,
    ensure_valid_mcp_token,
    exchange_authorization_code,
    fetch_client_credentials_token,
    generate_pkce_pair,
    register_oauth_client,
)

logger = logging.getLogger("ai_bridge.mcp_routes")


class MCPServerIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    url: str = Field(min_length=3, max_length=1000)
    transport: str = "http"
    auth_type: str = "bearer"  # none | bearer | oauth2_client_credentials | oauth2_pkce
    auth_header: str = ""
    auth_token: str = ""
    oauth_client_id: str = ""
    oauth_client_secret: str = ""
    oauth_auth_url: str = ""
    oauth_token_url: str = ""
    oauth_scopes: str = ""
    headers: dict[str, str] = Field(default_factory=dict)
    enabled: bool = True


class MCPServerPatch(BaseModel):
    name: str | None = None
    url: str | None = None
    transport: str | None = None
    auth_type: str | None = None
    auth_header: str | None = None
    auth_token: str | None = None
    oauth_client_id: str | None = None
    oauth_client_secret: str | None = None
    oauth_auth_url: str | None = None
    oauth_token_url: str | None = None
    oauth_scopes: str | None = None
    headers: dict[str, str] | None = None
    enabled: bool | None = None


class MCPDiscoverIn(BaseModel):
    url: str = Field(min_length=3, max_length=1000)


class MCPExecuteIn(BaseModel):
    tool: str
    arguments: dict[str, Any] = Field(default_factory=dict)


def _mask(val: str) -> str:
    s = (val or "").strip()
    if not s:
        return ""
    return f"{s[:4]}...{s[-4:]}" if len(s) > 8 else "****"


def _serialize_mcp_server(row: dict[str, Any]) -> dict[str, Any]:
    out = dict(row)
    out["enabled"] = bool(out.get("enabled"))
    try:
        tools = json.loads(out.pop("tools_json", "[]") or "[]")
    except Exception:
        tools = []
    out["tools"] = tools
    out["tools_count"] = len(tools)
    try:
        headers = json.loads(out.pop("headers_json", "{}") or "{}")
    except Exception:
        headers = {}
    out["headers"] = headers

    token = str(out.pop("auth_token", None) or "").strip()
    out["token_masked"] = _mask(token)
    out["oauth_connected"] = bool(token)

    secret = str(out.pop("oauth_client_secret", None) or "").strip()
    out["oauth_secret_configured"] = bool(secret)

    refresh_tok = str(out.pop("oauth_refresh_token", None) or "").strip()
    out["oauth_has_refresh_token"] = bool(refresh_tok)
    return out


def _callback_url(request: Request) -> str:
    pub = (os.environ.get("AI_BRIDGE_PUBLIC_URL") or "").strip().rstrip("/")
    if pub:
        return f"{pub}/api/mcp/oauth/callback"
    base = str(request.base_url).rstrip("/")
    return f"{base}/api/mcp/oauth/callback"


POPULAR_MCP_TEMPLATES = [
    {
        "id": "local-ai-bridge",
        "name": "Local AI Bridge Fleet MCP",
        "url": "http://mcp-http:8001",
        "description": "Exposes the internal AI Bridge device and automation tools over standard Model Context Protocol.",
        "category": "core",
        "requires_auth": False,
    },
    {
        "id": "github-mcp",
        "name": "GitHub MCP",
        "url": "https://api.githubcopilot.com/mcp",
        "description": "Search repos, inspect pull requests, read issues, and commit code via GitHub's official MCP server.",
        "category": "developer",
        "requires_auth": True,
        "auth_placeholder": "ghp_...",
    },
    {
        "id": "slack-mcp",
        "name": "Slack MCP",
        "url": "http://127.0.0.1:3000/mcp",
        "description": "Send channel messages, query conversation history, and alert your team via Slack MCP bridge.",
        "category": "communication",
        "requires_auth": True,
        "auth_placeholder": "xoxb-...",
    },
    {
        "id": "brave-search-mcp",
        "name": "Brave Web Search MCP",
        "url": "https://api.search.brave.com/res/v1/mcp",
        "description": "Perform live internet web searches, extract webpage content, and query current world facts.",
        "category": "search",
        "requires_auth": True,
        "auth_placeholder": "BSA...",
    },
    {
        "id": "postgres-mcp",
        "name": "PostgreSQL Database MCP",
        "url": "http://127.0.0.1:5433/mcp",
        "description": "Read schemas, run analytical SQL queries, and inspect relational database tables via Database MCP.",
        "category": "database",
        "requires_auth": False,
    },
    {
        "id": "custom-mcp",
        "name": "Custom HTTP / SSE MCP Server",
        "url": "http://127.0.0.1:8080/mcp",
        "description": "Any self-hosted or cloud service implementing the Model Context Protocol (tools/list & tools/call).",
        "category": "custom",
        "requires_auth": False,
    },
]


def install_mcp_routes(app: Any, conn: Any, require_role: Any, audit: Any) -> None:
    """Attach MCP Server management and automated OAuth2 routes."""

    @app.get("/api/mcp/templates")
    def get_mcp_templates(
        x_admin_token: str | None = Header(default=None),
        x_session_token: str | None = Header(default=None),
    ):
        require_role("viewer", x_admin_token, x_session_token)
        return {"ok": True, "templates": POPULAR_MCP_TEMPLATES}

    @app.get("/api/mcp/servers")
    def list_mcp_servers(
        tenant: str = "default",
        x_admin_token: str | None = Header(default=None),
        x_session_token: str | None = Header(default=None),
    ):
        require_role("viewer", x_admin_token, x_session_token)
        rows = conn.execute(
            "SELECT * FROM mcp_servers WHERE tenant=? ORDER BY created_at DESC", (tenant,)
        ).fetchall()
        return {"ok": True, "servers": [_serialize_mcp_server(dict(r)) for r in rows]}

    @app.post("/api/mcp/oauth/discover")
    def discover_mcp_oauth(
        body: MCPDiscoverIn,
        x_admin_token: str | None = Header(default=None),
        x_session_token: str | None = Header(default=None),
    ):
        require_role("admin", x_admin_token, x_session_token)
        return discover_oauth_metadata(body.url)

    @app.post("/api/mcp/servers")
    def create_mcp_server(
        body: MCPServerIn,
        x_admin_token: str | None = Header(default=None),
        x_session_token: str | None = Header(default=None),
    ):
        actor = require_role("admin", x_admin_token, x_session_token)
        url = body.url.strip()
        name = body.name.strip()
        if not name or not url:
            raise HTTPException(status_code=400, detail="Server name and URL cannot be empty.")

        auth_type = (body.auth_type or "bearer").strip().lower()
        if auth_type not in ("none", "bearer", "oauth2_client_credentials", "oauth2_pkce"):
            raise HTTPException(status_code=400, detail=f"Unsupported auth_type: {auth_type}")

        auth_token = body.auth_token.strip()
        auth_header = body.auth_header.strip()
        oauth_auth_url = body.oauth_auth_url.strip()
        oauth_token_url = body.oauth_token_url.strip()
        oauth_client_id = body.oauth_client_id.strip()
        oauth_client_secret = body.oauth_client_secret.strip()
        oauth_scopes = body.oauth_scopes.strip()
        oauth_refresh_token = ""
        oauth_token_expires_at = None

        now = time.time()
        tools: list[dict[str, Any]] = []
        ok = False
        msg = ""
        status = "offline"

        if auth_type == "oauth2_client_credentials":
            if not oauth_token_url:
                meta = discover_oauth_metadata(url)
                if meta.get("ok"):
                    oauth_token_url = meta.get("token_endpoint", "")
            if not oauth_token_url or not oauth_client_id or not oauth_client_secret:
                raise HTTPException(
                    status_code=400,
                    detail="OAuth2 Client Credentials requires Token URL, Client ID, and Client Secret.",
                )
            tok_res = fetch_client_credentials_token(oauth_token_url, oauth_client_id, oauth_client_secret, oauth_scopes)
            if tok_res.get("ok"):
                auth_token = tok_res["access_token"]
                oauth_refresh_token = tok_res.get("refresh_token") or ""
                oauth_token_expires_at = tok_res.get("expires_at")
                ok, tools, msg = fetch_mcp_tools(
                    url=url,
                    auth_header=auth_header or "Authorization",
                    auth_token=auth_token,
                    extra_headers=body.headers,
                )
                status = "healthy" if ok else "offline"
            else:
                msg = f"OAuth2 token request failed: {tok_res.get('error', 'unknown error')}"
                status = "offline"
        elif auth_type == "oauth2_pkce":
            if not oauth_auth_url or not oauth_token_url:
                meta = discover_oauth_metadata(url)
                if meta.get("ok"):
                    oauth_auth_url = oauth_auth_url or meta.get("authorization_endpoint", "")
                    oauth_token_url = oauth_token_url or meta.get("token_endpoint", "")
            if auth_token:
                ok, tools, msg = fetch_mcp_tools(
                    url=url,
                    auth_header=auth_header or "Authorization",
                    auth_token=auth_token,
                    extra_headers=body.headers,
                )
                status = "healthy" if ok else "offline"
            else:
                status = "pending_auth"
                msg = "Saved. Click 'Connect OAuth2' to authorize in your browser."
        else:
            if auth_type == "none":
                auth_token = ""
                auth_header = ""
            ok, tools, msg = fetch_mcp_tools(
                url=url,
                auth_header=auth_header,
                auth_token=auth_token,
                extra_headers=body.headers,
            )
            status = "healthy" if ok else "offline"

        server_id = f"mcp-{uuid.uuid4().hex[:8]}"
        conn.execute(
            "INSERT INTO mcp_servers (id, name, url, transport, auth_type, auth_header, auth_token, "
            "oauth_client_id, oauth_client_secret, oauth_auth_url, oauth_token_url, oauth_scopes, "
            "oauth_refresh_token, oauth_token_expires_at, headers_json, tools_json, enabled, status, "
            "last_checked_at, last_error, tenant, created_at, updated_at) "
            "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (
                server_id,
                name,
                url,
                body.transport,
                auth_type,
                auth_header,
                auth_token,
                oauth_client_id,
                oauth_client_secret,
                oauth_auth_url,
                oauth_token_url,
                oauth_scopes,
                oauth_refresh_token,
                oauth_token_expires_at,
                json.dumps(body.headers or {}),
                json.dumps(tools),
                1 if body.enabled else 0,
                status,
                now,
                "" if ok or status == "pending_auth" else msg,
                "default",
                now,
                now,
            ),
        )
        conn.commit()
        audit(actor, "", "create_mcp_server", {"server_id": server_id, "name": name, "url": url, "auth_type": auth_type}, "allowed")

        row = conn.execute("SELECT * FROM mcp_servers WHERE id=?", (server_id,)).fetchone()
        return {
            "ok": True,
            "message": msg,
            "server": _serialize_mcp_server(dict(row)),
            "tools_count": len(tools),
        }

    @app.post("/api/mcp/servers/{server_id}/oauth/start")
    def start_mcp_oauth(
        server_id: str,
        request: Request,
        x_admin_token: str | None = Header(default=None),
        x_session_token: str | None = Header(default=None),
    ):
        actor = require_role("admin", x_admin_token, x_session_token)
        row = conn.execute("SELECT * FROM mcp_servers WHERE id=?", (server_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="MCP Server not found.")
        s = dict(row)

        auth_url = str(s.get("oauth_auth_url") or "").strip()
        token_url = str(s.get("oauth_token_url") or "").strip()
        client_id = str(s.get("oauth_client_id") or "").strip()
        client_secret = str(s.get("oauth_client_secret") or "").strip()
        reg_endpoint = ""

        if not auth_url or not token_url or not client_id:
            meta = discover_oauth_metadata(s["url"])
            if meta.get("ok"):
                auth_url = auth_url or meta.get("authorization_endpoint", "")
                token_url = token_url or meta.get("token_endpoint", "")
                reg_endpoint = meta.get("registration_endpoint", "")

        if not auth_url or not token_url:
            raise HTTPException(
                status_code=400,
                detail="Could not discover OAuth2 authorization/token endpoints. Enter them manually in server settings.",
            )

        redirect_uri = _callback_url(request)

        # Dynamic Client Registration (RFC 7591) if no client_id is configured
        if not client_id:
            if not reg_endpoint:
                raise HTTPException(
                    status_code=400,
                    detail="Server does not support Dynamic Client Registration. Please configure OAuth Client ID manually.",
                )
            reg = register_oauth_client(reg_endpoint, redirect_uri, client_name="AI Bridge")
            if not reg.get("ok"):
                raise HTTPException(status_code=400, detail=f"Dynamic client registration failed: {reg.get('error')}")
            client_id = reg["client_id"]
            client_secret = reg.get("client_secret") or client_secret

        now = time.time()
        conn.execute(
            "UPDATE mcp_servers SET auth_type='oauth2_pkce', oauth_auth_url=?, oauth_token_url=?, "
            "oauth_client_id=?, oauth_client_secret=?, updated_at=? WHERE id=?",
            (auth_url, token_url, client_id, client_secret, now, server_id),
        )

        state = secrets.token_urlsafe(24)
        verifier, challenge = generate_pkce_pair()
        # Prune expired states (> 15 minutes old)
        conn.execute("DELETE FROM mcp_oauth_states WHERE created_at < ?", (now - 900,))
        conn.execute(
            "INSERT INTO mcp_oauth_states (state, server_id, code_verifier, redirect_uri, created_at) VALUES (?,?,?,?,?)",
            (state, server_id, verifier, redirect_uri, now),
        )
        conn.commit()

        q_params: dict[str, str] = {
            "response_type": "code",
            "client_id": client_id,
            "redirect_uri": redirect_uri,
            "state": state,
            "code_challenge": challenge,
            "code_challenge_method": "S256",
        }
        scopes = str(s.get("oauth_scopes") or "").strip()
        if scopes:
            q_params["scope"] = scopes

        sep = "&" if "?" in auth_url else "?"
        authorize_url = f"{auth_url}{sep}{urllib.parse.urlencode(q_params)}"
        audit(actor, "", "start_mcp_oauth", {"server_id": server_id}, "allowed")
        return {"ok": True, "authorize_url": authorize_url, "redirect_uri": redirect_uri}

    @app.get("/api/mcp/oauth/callback")
    def mcp_oauth_callback(
        state: str = "",
        code: str = "",
        error: str = "",
        error_description: str = "",
    ):
        def _html(title: str, msg: str, ok_flag: bool, srv_id: str = "") -> HTMLResponse:
            payload = json.dumps({"type": "mcp_oauth_complete", "server_id": srv_id, "ok": ok_flag, "message": msg})
            color = "#10b981" if ok_flag else "#ef4444"
            return HTMLResponse(
                f"<!doctype html><html><head><title>{html.escape(title)}</title></head>"
                f"<body style='font-family:system-ui,sans-serif;background:#0f172a;color:#e2e8f0;display:flex;"
                f"align-items:center;justify-content:center;height:100vh;margin:0'>"
                f"<div style='max-width:420px;padding:28px;border:1px solid #334155;border-radius:12px;background:#1e293b;text-align:center'>"
                f"<h2 style='color:{color};margin-top:0'>{html.escape(title)}</h2>"
                f"<p style='font-size:14px;color:#cbd5e1'>{html.escape(msg)}</p>"
                f"<p style='font-size:12px;color:#94a3b8'>You can close this window.</p>"
                f"<script>if(window.opener){{window.opener.postMessage({payload},'*');}}"
                f"{'setTimeout(()=>window.close(),1200);' if ok_flag else ''}</script>"
                f"</div></body></html>",
                status_code=200 if ok_flag else 400,
            )

        if error:
            return _html("OAuth2 Authorization Denied", error_description or error, False)
        if not state or not code:
            return _html("Invalid OAuth2 Callback", "Missing state or authorization code.", False)

        st_row = conn.execute("SELECT * FROM mcp_oauth_states WHERE state=?", (state,)).fetchone()
        if not st_row:
            return _html("Expired OAuth2 Session", "Invalid or expired state parameter. Please try again.", False)
        st = dict(st_row)
        conn.execute("DELETE FROM mcp_oauth_states WHERE state=?", (state,))
        conn.commit()

        srv_row = conn.execute("SELECT * FROM mcp_servers WHERE id=?", (st["server_id"],)).fetchone()
        if not srv_row:
            return _html("Server Not Found", "The target MCP server no longer exists.", False)
        s = dict(srv_row)

        tok_res = exchange_authorization_code(
            token_url=s.get("oauth_token_url") or "",
            code=code,
            redirect_uri=st["redirect_uri"],
            client_id=s.get("oauth_client_id") or "",
            client_secret=s.get("oauth_client_secret") or "",
            code_verifier=st["code_verifier"],
        )
        if not tok_res.get("ok"):
            now = time.time()
            conn.execute(
                "UPDATE mcp_servers SET status='offline', last_error=?, updated_at=? WHERE id=?",
                (tok_res.get("error", "Token exchange failed"), now, s["id"]),
            )
            conn.commit()
            return _html("OAuth2 Token Exchange Failed", tok_res.get("error", "Unknown error"), False, s["id"])

        access_token = tok_res["access_token"]
        refresh_token = tok_res.get("refresh_token") or s.get("oauth_refresh_token") or ""
        expires_at = tok_res.get("expires_at")

        try:
            extra_h = json.loads(s.get("headers_json") or "{}")
        except Exception:
            extra_h = {}

        ok, tools, msg = fetch_mcp_tools(
            url=s["url"],
            auth_header=s.get("auth_header") or "Authorization",
            auth_token=access_token,
            extra_headers=extra_h,
        )

        now = time.time()
        conn.execute(
            "UPDATE mcp_servers SET auth_token=?, oauth_refresh_token=?, oauth_token_expires_at=?, "
            "status=?, tools_json=?, last_checked_at=?, last_error=?, updated_at=? WHERE id=?",
            (
                access_token,
                refresh_token,
                expires_at,
                "healthy" if ok else "offline",
                json.dumps(tools if ok else json.loads(s.get("tools_json") or "[]")),
                now,
                "" if ok else msg,
                now,
                s["id"],
            ),
        )
        conn.commit()
        audit("oauth_callback", "", "mcp_oauth_authorized", {"server_id": s["id"], "tools_found": len(tools)}, "allowed")
        return _html(
            "MCP Service Authorized",
            f"Connected to {s['name']} and discovered {len(tools)} tools.",
            True,
            s["id"],
        )

    @app.post("/api/mcp/servers/{server_id}/sync")
    def sync_mcp_server(
        server_id: str,
        x_admin_token: str | None = Header(default=None),
        x_session_token: str | None = Header(default=None),
    ):
        actor = require_role("admin", x_admin_token, x_session_token)
        row = conn.execute("SELECT * FROM mcp_servers WHERE id=?", (server_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="MCP Server not found.")
        s = ensure_valid_mcp_token(conn, dict(row))

        try:
            extra_h = json.loads(s.get("headers_json") or "{}")
        except Exception:
            extra_h = {}

        ok, tools, msg = fetch_mcp_tools(
            url=s["url"],
            auth_header=s.get("auth_header") or "",
            auth_token=s.get("auth_token") or "",
            extra_headers=extra_h,
        )

        now = time.time()
        status = "healthy" if ok else "offline"
        conn.execute(
            "UPDATE mcp_servers SET status=?, tools_json=?, last_checked_at=?, last_error=?, updated_at=? WHERE id=?",
            (status, json.dumps(tools if ok else json.loads(s.get("tools_json") or "[]")), now, "" if ok else msg, now, server_id),
        )
        conn.commit()
        audit(actor, "", "sync_mcp_server", {"server_id": server_id, "tools_found": len(tools)}, "allowed")

        updated = conn.execute("SELECT * FROM mcp_servers WHERE id=?", (server_id,)).fetchone()
        return {
            "ok": ok,
            "message": msg,
            "server": _serialize_mcp_server(dict(updated)),
            "tools_count": len(tools),
        }

    @app.patch("/api/mcp/servers/{server_id}")
    def update_mcp_server(
        server_id: str,
        body: MCPServerPatch,
        x_admin_token: str | None = Header(default=None),
        x_session_token: str | None = Header(default=None),
    ):
        actor = require_role("admin", x_admin_token, x_session_token)
        row = conn.execute("SELECT * FROM mcp_servers WHERE id=?", (server_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="MCP Server not found.")
        current = dict(row)

        name = (body.name if body.name is not None else current["name"]).strip()
        url = (body.url if body.url is not None else current["url"]).strip()
        transport = body.transport if body.transport is not None else current["transport"]
        auth_type = (body.auth_type if body.auth_type is not None else current.get("auth_type", "bearer")).strip().lower()
        auth_header = (body.auth_header if body.auth_header is not None else current.get("auth_header", "")).strip()
        auth_token = (body.auth_token if body.auth_token is not None else current.get("auth_token", "")).strip()
        oauth_client_id = (body.oauth_client_id if body.oauth_client_id is not None else current.get("oauth_client_id", "")).strip()
        oauth_client_secret = (body.oauth_client_secret if body.oauth_client_secret is not None else current.get("oauth_client_secret", "")).strip()
        oauth_auth_url = (body.oauth_auth_url if body.oauth_auth_url is not None else current.get("oauth_auth_url", "")).strip()
        oauth_token_url = (body.oauth_token_url if body.oauth_token_url is not None else current.get("oauth_token_url", "")).strip()
        oauth_scopes = (body.oauth_scopes if body.oauth_scopes is not None else current.get("oauth_scopes", "")).strip()
        headers_str = json.dumps(body.headers) if body.headers is not None else current.get("headers_json", "{}")
        enabled = (1 if body.enabled else 0) if body.enabled is not None else current["enabled"]

        now = time.time()
        conn.execute(
            "UPDATE mcp_servers SET name=?, url=?, transport=?, auth_type=?, auth_header=?, auth_token=?, "
            "oauth_client_id=?, oauth_client_secret=?, oauth_auth_url=?, oauth_token_url=?, oauth_scopes=?, "
            "headers_json=?, enabled=?, updated_at=? WHERE id=?",
            (
                name, url, transport, auth_type, auth_header, auth_token,
                oauth_client_id, oauth_client_secret, oauth_auth_url, oauth_token_url, oauth_scopes,
                headers_str, enabled, now, server_id,
            ),
        )
        conn.commit()
        audit(actor, "", "update_mcp_server", {"server_id": server_id}, "allowed")

        updated = conn.execute("SELECT * FROM mcp_servers WHERE id=?", (server_id,)).fetchone()
        return {"ok": True, "server": _serialize_mcp_server(dict(updated))}

    @app.delete("/api/mcp/servers/{server_id}")
    def delete_mcp_server(
        server_id: str,
        x_admin_token: str | None = Header(default=None),
        x_session_token: str | None = Header(default=None),
    ):
        actor = require_role("admin", x_admin_token, x_session_token)
        row = conn.execute("SELECT * FROM mcp_servers WHERE id=?", (server_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="MCP Server not found.")

        conn.execute("DELETE FROM mcp_oauth_states WHERE server_id=?", (server_id,))
        conn.execute("DELETE FROM mcp_servers WHERE id=?", (server_id,))
        conn.commit()
        audit(actor, "", "delete_mcp_server", {"server_id": server_id}, "allowed")
        return {"ok": True, "server_id": server_id, "status": "deleted"}

    @app.post("/api/mcp/servers/{server_id}/execute")
    def run_mcp_tool_test(
        server_id: str,
        body: MCPExecuteIn,
        x_admin_token: str | None = Header(default=None),
        x_session_token: str | None = Header(default=None),
    ):
        actor = require_role("admin", x_admin_token, x_session_token)
        row = conn.execute("SELECT * FROM mcp_servers WHERE id=?", (server_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="MCP Server not found.")
        s = ensure_valid_mcp_token(conn, dict(row))

        try:
            extra_h = json.loads(s.get("headers_json") or "{}")
        except Exception:
            extra_h = {}

        res = execute_mcp_tool(
            url=s["url"],
            tool_name=body.tool,
            arguments=body.arguments,
            auth_header=s.get("auth_header") or "",
            auth_token=s.get("auth_token") or "",
            extra_headers=extra_h,
        )
        audit(actor, "", f"execute_mcp_{body.tool}", {"server_id": server_id}, "allowed")
        return res
