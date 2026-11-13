"""Automated OAuth 2.0 / 2.1 client support for outbound MCP servers.

Supports:
- RFC 9728 / RFC 8414 OAuth metadata discovery from any MCP server URL
- RFC 7591 Dynamic Client Registration
- OAuth 2.0 Client Credentials flow (automated M2M)
- OAuth 2.1 Authorization Code + PKCE (S256) flow with Refresh Token rotation
- Transparent pre-request token refresh for agents and sync operations
"""
from __future__ import annotations

import base64
import hashlib
import json
import logging
import secrets
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from typing import Any

logger = logging.getLogger("ai_bridge.mcp_oauth")


def _http_json(
    url: str,
    method: str = "GET",
    data: bytes | None = None,
    headers: dict[str, str] | None = None,
    timeout: float = 12.0,
) -> tuple[int, dict[str, Any]]:
    req_headers = {"Accept": "application/json", "User-Agent": "AI-Bridge-OAuth-Client/0.3"}
    if headers:
        req_headers.update(headers)
    req = urllib.request.Request(url, data=data, method=method, headers=req_headers)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
            return resp.status, (json.loads(raw) if raw.strip() else {})
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="replace") if exc.fp else ""
        try:
            body = json.loads(raw) if raw.strip() else {"error": f"HTTP {exc.code}"}
        except Exception:
            body = {"error": raw or f"HTTP {exc.code}"}
        return exc.code, body


def _post_form(url: str, form: dict[str, str], client_id: str = "", client_secret: str = "", timeout: float = 15.0) -> tuple[int, dict[str, Any]]:
    payload = {k: v for k, v in form.items() if v != ""}
    encoded = urllib.parse.urlencode(payload).encode("utf-8")
    headers = {"Content-Type": "application/x-www-form-urlencoded"}
    # Send client credentials in form body (widely supported); also support Basic auth if secret present
    if client_id and client_secret:
        creds = base64.b64encode(f"{client_id}:{client_secret}".encode("utf-8")).decode("ascii")
        headers["Authorization"] = f"Basic {creds}"
    return _http_json(url, method="POST", data=encoded, headers=headers, timeout=timeout)


def generate_pkce_pair() -> tuple[str, str]:
    """Return (code_verifier, code_challenge) using PKCE S256."""
    verifier = secrets.token_urlsafe(48)
    digest = hashlib.sha256(verifier.encode("ascii")).digest()
    challenge = base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")
    return verifier, challenge


def discover_oauth_metadata(mcp_url: str, timeout: float = 10.0) -> dict[str, Any]:
    """Discover OAuth 2.0 / 2.1 authorization_endpoint, token_endpoint, and registration_endpoint."""
    parsed = urllib.parse.urlparse(mcp_url.strip())
    if not parsed.scheme or not parsed.netloc:
        return {"ok": False, "error": "Invalid MCP URL."}

    origin = f"{parsed.scheme}://{parsed.netloc}"
    path = parsed.path.rstrip("/")

    issuer = origin
    # 1. Try RFC 9728 protected-resource metadata
    pr_candidates = []
    if path:
        pr_candidates.append(f"{origin}/.well-known/oauth-protected-resource{path}")
    pr_candidates.append(f"{origin}/.well-known/oauth-protected-resource")

    for pr_url in pr_candidates:
        status, data = _http_json(pr_url, timeout=timeout)
        if 200 <= status < 300 and isinstance(data, dict):
            auth_servers = data.get("authorization_servers") or []
            if isinstance(auth_servers, list) and auth_servers:
                issuer = str(auth_servers[0]).rstrip("/")
                break

    # 2. Try RFC 8414 / OIDC authorization server metadata
    as_candidates = [
        f"{issuer}/.well-known/oauth-authorization-server",
        f"{issuer}/.well-known/openid-configuration",
    ]
    if issuer != origin:
        as_candidates.extend([
            f"{origin}/.well-known/oauth-authorization-server",
            f"{origin}/.well-known/openid-configuration",
        ])

    for as_url in as_candidates:
        status, data = _http_json(as_url, timeout=timeout)
        if 200 <= status < 300 and isinstance(data, dict) and data.get("token_endpoint"):
            return {
                "ok": True,
                "issuer": data.get("issuer") or issuer,
                "authorization_endpoint": data.get("authorization_endpoint") or "",
                "token_endpoint": data.get("token_endpoint") or "",
                "registration_endpoint": data.get("registration_endpoint") or "",
                "scopes_supported": data.get("scopes_supported") or [],
            }

    return {"ok": False, "error": f"No OAuth metadata found at {origin}."}


def register_oauth_client(
    registration_endpoint: str,
    redirect_uri: str,
    client_name: str = "AI Bridge MCP Client",
) -> dict[str, Any]:
    """Perform RFC 7591 Dynamic Client Registration."""
    body = json.dumps({
        "client_name": client_name,
        "redirect_uris": [redirect_uri],
        "grant_types": ["authorization_code", "refresh_token"],
        "response_types": ["code"],
        "token_endpoint_auth_method": "none",
    }).encode("utf-8")
    status, data = _http_json(
        registration_endpoint,
        method="POST",
        data=body,
        headers={"Content-Type": "application/json"},
    )
    if 200 <= status < 300 and data.get("client_id"):
        return {
            "ok": True,
            "client_id": str(data["client_id"]),
            "client_secret": str(data.get("client_secret") or ""),
        }
    return {"ok": False, "error": str(data.get("error_description") or data.get("error") or f"HTTP {status}")}


def _parse_token_response(status: int, data: dict[str, Any]) -> dict[str, Any]:
    if not (200 <= status < 300) or not data.get("access_token"):
        err = data.get("error_description") or data.get("error") or f"HTTP {status}"
        return {"ok": False, "error": str(err)}
    expires_in = data.get("expires_in")
    try:
        expires_at = time.time() + max(60, int(expires_in)) if expires_in is not None else time.time() + 3600
    except (TypeError, ValueError):
        expires_at = time.time() + 3600
    return {
        "ok": True,
        "access_token": str(data["access_token"]),
        "refresh_token": str(data.get("refresh_token") or ""),
        "expires_at": expires_at,
        "token_type": str(data.get("token_type") or "Bearer"),
    }


def fetch_client_credentials_token(
    token_url: str,
    client_id: str,
    client_secret: str,
    scopes: str = "",
) -> dict[str, Any]:
    """Acquire an access token using OAuth 2.0 client_credentials grant."""
    form: dict[str, str] = {
        "grant_type": "client_credentials",
        "client_id": client_id,
        "client_secret": client_secret,
    }
    if scopes.strip():
        form["scope"] = scopes.strip()
    status, data = _post_form(token_url, form, client_id=client_id, client_secret=client_secret)
    return _parse_token_response(status, data)


def exchange_authorization_code(
    token_url: str,
    code: str,
    redirect_uri: str,
    client_id: str,
    client_secret: str = "",
    code_verifier: str = "",
) -> dict[str, Any]:
    """Exchange an authorization code (+ PKCE verifier) for access + refresh tokens."""
    form: dict[str, str] = {
        "grant_type": "authorization_code",
        "code": code,
        "redirect_uri": redirect_uri,
        "client_id": client_id,
    }
    if client_secret:
        form["client_secret"] = client_secret
    if code_verifier:
        form["code_verifier"] = code_verifier
    status, data = _post_form(token_url, form, client_id=client_id, client_secret=client_secret)
    return _parse_token_response(status, data)


def refresh_oauth_token(
    token_url: str,
    refresh_token: str,
    client_id: str = "",
    client_secret: str = "",
) -> dict[str, Any]:
    """Refresh an expired OAuth2 access token using a refresh_token."""
    form: dict[str, str] = {
        "grant_type": "refresh_token",
        "refresh_token": refresh_token,
    }
    if client_id:
        form["client_id"] = client_id
    if client_secret:
        form["client_secret"] = client_secret
    status, data = _post_form(token_url, form, client_id=client_id, client_secret=client_secret)
    return _parse_token_response(status, data)


def ensure_valid_mcp_token(conn: Any, srv: dict[str, Any]) -> dict[str, Any]:
    """Ensure an OAuth2-authenticated MCP server dict has a non-expired access token.

    Refreshes transparently via client_credentials or refresh_token when within 60s of expiry
    and persists the new token to the `mcp_servers` table.
    """
    auth_type = str(srv.get("auth_type") or "bearer").strip().lower()
    if auth_type not in ("oauth2_client_credentials", "oauth2_pkce"):
        return srv

    token_url = str(srv.get("oauth_token_url") or "").strip()
    if not token_url:
        return srv

    now = time.time()
    current_token = str(srv.get("auth_token") or "").strip()
    expires_at = srv.get("oauth_token_expires_at")
    try:
        needs_refresh = (not current_token) or (expires_at is not None and now >= float(expires_at) - 60)
    except (TypeError, ValueError):
        needs_refresh = not current_token

    if not needs_refresh:
        return srv

    client_id = str(srv.get("oauth_client_id") or "").strip()
    client_secret = str(srv.get("oauth_client_secret") or "").strip()
    scopes = str(srv.get("oauth_scopes") or "").strip()
    refresh_tok = str(srv.get("oauth_refresh_token") or "").strip()

    result: dict[str, Any] | None = None
    if auth_type == "oauth2_client_credentials" and client_id and client_secret:
        result = fetch_client_credentials_token(token_url, client_id, client_secret, scopes)
    elif auth_type == "oauth2_pkce" and refresh_tok:
        result = refresh_oauth_token(token_url, refresh_tok, client_id, client_secret)

    if not result or not result.get("ok"):
        if result and result.get("error"):
            logger.warning("OAuth2 token refresh failed for MCP server %s: %s", srv.get("id"), result["error"])
        return srv

    updated = dict(srv)
    updated["auth_token"] = result["access_token"]
    updated["oauth_token_expires_at"] = result["expires_at"]
    if result.get("refresh_token"):
        updated["oauth_refresh_token"] = result["refresh_token"]

    if conn is not None and srv.get("id"):
        try:
            conn.execute(
                "UPDATE mcp_servers SET auth_token=?, oauth_refresh_token=?, oauth_token_expires_at=?, updated_at=? WHERE id=?",
                (
                    updated["auth_token"],
                    updated.get("oauth_refresh_token") or "",
                    updated["oauth_token_expires_at"],
                    now,
                    srv["id"],
                ),
            )
            conn.commit()
        except Exception as exc:
            logger.warning("Failed to persist refreshed OAuth2 token for %s: %s", srv.get("id"), exc)

    return updated


VALID_MCP_TOOL_POLICIES = {"allow", "require_approval", "deny"}


def get_mcp_tool_policies(conn: Any) -> dict[str, str]:
    """Load per-tool MCP guardrail policies from settings."""
    try:
        row = conn.execute("SELECT value FROM settings WHERE key='mcp_tool_policies'").fetchone()
        if row and row["value"]:
            parsed = json.loads(row["value"])
            if isinstance(parsed, dict):
                return {
                    str(k): str(v)
                    for k, v in parsed.items()
                    if str(v) in VALID_MCP_TOOL_POLICIES
                }
    except Exception:
        pass
    return {}


def save_mcp_tool_policies(conn: Any, policies: dict[str, str]) -> dict[str, str]:
    """Persist normalized MCP tool guardrail policies to settings."""
    cleaned = {
        str(k).strip(): str(v).strip().lower()
        for k, v in (policies or {}).items()
        if str(k).strip() and str(v).strip().lower() in VALID_MCP_TOOL_POLICIES
    }
    conn.execute(
        "INSERT INTO settings (key, value) VALUES ('mcp_tool_policies', ?) "
        "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        (json.dumps(cleaned),),
    )
    conn.commit()
    return cleaned


def enforce_mcp_tool_policy(
    conn: Any,
    srv: dict[str, Any],
    orig_tool: str,
    arguments: dict[str, Any] | None = None,
    actor: str = "agent",
) -> dict[str, Any]:
    """Check whether an MCP tool call is allowed, denied, or requires human approval."""
    policies = get_mcp_tool_policies(conn)
    srv_id = str(srv.get("id") or "")
    srv_name = str(srv.get("name") or srv_id)
    decision = (
        policies.get(f"{srv_id}:{orig_tool}")
        or policies.get(f"{srv_name}:{orig_tool}")
        or policies.get(orig_tool)
        or policies.get(f"{srv_id}:*")
        or "allow"
    )
    if decision == "deny":
        return {
            "allowed": False,
            "decision": "deny",
            "error": f"MCP tool '{orig_tool}' on '{srv_name}' is denied by MCP tool policy.",
        }
    if decision == "require_approval":
        appr_id = uuid.uuid4().hex[:12]
        now_ts = time.time()
        reason = f"{actor} requested MCP tool '{orig_tool}' on '{srv_name}' with args={json.dumps(arguments or {}, default=str)[:300]}"
        conn.execute(
            "INSERT INTO approvals (id, task_id, tool, reason, status, created_at, expires_at) "
            "VALUES (?, NULL, ?, ?, 'pending', ?, ?)",
            (appr_id, f"mcp:{srv_name}:{orig_tool}", reason, now_ts, now_ts + 3600),
        )
        conn.commit()
        return {
            "allowed": False,
            "decision": "require_approval",
            "status": "needs_approval",
            "approval_id": appr_id,
            "error": f"MCP tool '{orig_tool}' on '{srv_name}' requires human approval (approval_id={appr_id}).",
        }
    return {"allowed": True, "decision": "allow"}

