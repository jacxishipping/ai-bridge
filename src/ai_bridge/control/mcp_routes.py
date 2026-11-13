"""FastAPI route handlers for managing external MCP services and connectors."""
from __future__ import annotations

import json
import logging
import time
import uuid
from typing import Any

from fastapi import Header, HTTPException
from pydantic import BaseModel, Field

from .mcp_client import execute_mcp_tool, fetch_mcp_tools

logger = logging.getLogger("ai_bridge.mcp_routes")


class MCPServerIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    url: str = Field(min_length=3, max_length=1000)
    transport: str = "http"
    auth_header: str = ""
    auth_token: str = ""
    headers: dict[str, str] = Field(default_factory=dict)
    enabled: bool = True


class MCPServerPatch(BaseModel):
    name: str | None = None
    url: str | None = None
    transport: str | None = None
    auth_header: str | None = None
    auth_token: str | None = None
    headers: dict[str, str] | None = None
    enabled: bool | None = None


class MCPExecuteIn(BaseModel):
    tool: str
    arguments: dict[str, Any] = Field(default_factory=dict)


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

    # Mask auth token for security
    token = str(out.get("auth_token") or "").strip()
    if token:
        out["token_masked"] = f"{token[:4]}...{token[-4:]}" if len(token) > 8 else "****"
    else:
        out["token_masked"] = ""
    out.pop("auth_token", None)
    return out


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
    """Attach MCP Server management routes."""

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

        # Probe the MCP server to verify connection and discover tools
        ok, tools, msg = fetch_mcp_tools(
            url=url,
            auth_header=body.auth_header,
            auth_token=body.auth_token,
            extra_headers=body.headers,
        )

        server_id = f"mcp-{uuid.uuid4().hex[:8]}"
        now = time.time()
        status = "healthy" if ok else "offline"

        conn.execute(
            "INSERT INTO mcp_servers (id, name, url, transport, auth_header, auth_token, "
            "headers_json, tools_json, enabled, status, last_checked_at, last_error, tenant, created_at, updated_at) "
            "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (
                server_id,
                name,
                url,
                body.transport,
                body.auth_header.strip(),
                body.auth_token.strip(),
                json.dumps(body.headers or {}),
                json.dumps(tools),
                1 if body.enabled else 0,
                status,
                now,
                "" if ok else msg,
                "default",
                now,
                now,
            ),
        )
        conn.commit()
        audit(actor, "", "create_mcp_server", {"server_id": server_id, "name": name, "url": url}, "allowed")

        row = conn.execute("SELECT * FROM mcp_servers WHERE id=?", (server_id,)).fetchone()
        return {
            "ok": True,
            "message": msg,
            "server": _serialize_mcp_server(dict(row)),
            "tools_count": len(tools),
        }

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
        s = dict(row)

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
        auth_header = (body.auth_header if body.auth_header is not None else current.get("auth_header", "")).strip()
        auth_token = (body.auth_token if body.auth_token is not None else current.get("auth_token", "")).strip()
        headers_str = json.dumps(body.headers) if body.headers is not None else current.get("headers_json", "{}")
        enabled = (1 if body.enabled else 0) if body.enabled is not None else current["enabled"]

        now = time.time()
        conn.execute(
            "UPDATE mcp_servers SET name=?, url=?, transport=?, auth_header=?, auth_token=?, "
            "headers_json=?, enabled=?, updated_at=? WHERE id=?",
            (name, url, transport, auth_header, auth_token, headers_str, enabled, now, server_id),
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
        s = dict(row)

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

