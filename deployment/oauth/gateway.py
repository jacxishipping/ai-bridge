"""Minimal OAuth 2.1 authorization server for the AI Bridge MCP endpoint.

Serves MCP-spec discovery, dynamic client registration, authorization-code
flow with PKCE (S256), refresh-token rotation, revocation, and an internal
token-verification endpoint used by nginx auth_request for /mcp.

Secrets are never logged. Only SHA-256 hashes of codes/tokens are stored.
The admin token (from the environment) is the only approval credential:
entering it on the approval page authorizes a client. No user accounts.
"""

import base64
import hashlib
import hmac
import html
import os
import secrets
import sqlite3
import time
from pathlib import Path
from urllib.parse import urlencode

from fastapi import FastAPI, Form, Header, Request
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse

ISSUER = os.environ.get("AI_BRIDGE_OAUTH_ISSUER", "https://jxiptvplayer.app")
RESOURCE = ISSUER + "/mcp"
DB_PATH = Path("/etc/ai-bridge-oauth/oauth.db")
CODE_TTL = 600
ACCESS_TTL = 3600
REFRESH_TTL = 30 * 24 * 3600

app = FastAPI(title="AI Bridge OAuth gateway")


def connect():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    os.chmod(DB_PATH.parent, 0o700)
    conn = connect()
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS clients (
            client_id TEXT PRIMARY KEY,
            redirect_uris TEXT NOT NULL,
            client_name TEXT DEFAULT '',
            created_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS codes (
            code_hash TEXT PRIMARY KEY,
            client_id TEXT NOT NULL,
            redirect_uri TEXT NOT NULL,
            challenge TEXT DEFAULT '',
            challenge_method TEXT DEFAULT '',
            scope TEXT DEFAULT '',
            created_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS tokens (
            token_hash TEXT PRIMARY KEY,
            kind TEXT NOT NULL,
            client_id TEXT NOT NULL,
            scope TEXT DEFAULT '',
            created_at INTEGER NOT NULL,
            expires_at INTEGER NOT NULL,
            revoked INTEGER NOT NULL DEFAULT 0
        );
        """
    )
    conn.commit()
    conn.close()


init_db()


def digest(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def admin_ok(token: str | None) -> bool:
    expected = os.environ.get("AI_BRIDGE_ADMIN_TOKEN", "")
    return bool(expected) and bool(token) and hmac.compare_digest(token, expected)


def valid_redirect_uri(uri: str) -> bool:
    return uri.startswith("https://") or uri.startswith(
        ("http://localhost", "http://127.0.0.1")
    )


def err(error: str, status: int = 400):
    return JSONResponse({"error": error}, status_code=status)


# ---------------------------------------------------------------- discovery

@app.get("/.well-known/oauth-protected-resource")
@app.get("/.well-known/oauth-protected-resource/mcp")
def protected_resource():
    return {
        "resource": RESOURCE,
        "authorization_servers": [ISSUER],
        "bearer_methods_supported": ["header"],
    }


@app.get("/.well-known/oauth-authorization-server")
def authorization_server():
    return {
        "issuer": ISSUER,
        "authorization_endpoint": ISSUER + "/oauth/authorize",
        "token_endpoint": ISSUER + "/oauth/token",
        "registration_endpoint": ISSUER + "/oauth/register",
        "revocation_endpoint": ISSUER + "/oauth/revoke",
        "response_types_supported": ["code"],
        "grant_types_supported": ["authorization_code", "refresh_token"],
        "code_challenge_methods_supported": ["S256"],
        "token_endpoint_auth_methods_supported": [
            "none",
            "client_secret_post",
            "client_secret_basic",
        ],
        "revocation_endpoint_auth_methods_supported": ["none"],
    }


# ---------------------------------------------------------------- registration

@app.post("/oauth/register")
async def register(request: Request):
    try:
        body = await request.json()
    except Exception:
        return err("invalid_client_metadata")
    uris = body.get("redirect_uris") or []
    if (
        not isinstance(uris, list)
        or not uris
        or not all(isinstance(u, str) and valid_redirect_uri(u) for u in uris)
    ):
        return err("invalid_redirect_uri")
    client_id = secrets.token_hex(16)
    conn = connect()
    conn.execute(
        "INSERT INTO clients (client_id, redirect_uris, client_name, created_at)"
        " VALUES (?, ?, ?, ?)",
        (
            client_id,
            "\n".join(uris),
            str(body.get("client_name", ""))[:200],
            int(time.time()),
        ),
    )
    conn.commit()
    conn.close()
    return {
        "client_id": client_id,
        "client_id_issued_at": int(time.time()),
        "redirect_uris": uris,
        "grant_types": ["authorization_code", "refresh_token"],
        "response_types": ["code"],
        "token_endpoint_auth_method": "none",
    }


# ---------------------------------------------------------------- authorization

def approval_form(params: dict, error: str = "") -> str:
    hidden = "".join(
        f'<input type="hidden" name="{html.escape(k)}" value="{html.escape(v)}">'
        for k, v in params.items()
    )
    err_html = f'<p style="color:red">{html.escape(error)}</p>' if error else ""
    return f"""<!doctype html><html><body>
<h2>Authorize AI Bridge MCP access</h2>
<p>Client <b>{html.escape(params.get("client_name", params.get("client_id", "")))}</b>
wants access to the AI Bridge MCP server ({html.escape(RESOURCE)}).</p>
<p>Enter the admin token to approve. It is checked once and never stored.</p>
{err_html}
<form method="post" action="/oauth/authorize">
{hidden}
<label>Admin token: <input type="password" name="admin_token" required></label><br><br>
<button type="submit" name="action" value="approve">Approve</button>
<button type="submit" name="action" value="deny">Deny</button>
</form></body></html>"""


def redirect_with(uri: str, params: dict) -> RedirectResponse:
    sep = "&" if "?" in uri else "?"
    return RedirectResponse(uri + sep + urlencode(params), status_code=302)


@app.get("/oauth/authorize")
def authorize_get(
    client_id: str = "",
    redirect_uri: str = "",
    response_type: str = "",
    scope: str = "",
    state: str = "",
    code_challenge: str = "",
    code_challenge_method: str = "",
):
    conn = connect()
    row = conn.execute(
        "SELECT * FROM clients WHERE client_id=?", (client_id,)
    ).fetchone()
    conn.close()
    if row is None:
        return HTMLResponse("<h2>Unknown client</h2>", status_code=400)
    if response_type != "code":
        return redirect_with(
            redirect_uri, {"error": "unsupported_response_type", "state": state}
        )
    if redirect_uri not in row["redirect_uris"].split("\n"):
        return HTMLResponse("<h2>Redirect URI not registered</h2>", status_code=400)
    if code_challenge and code_challenge_method not in ("S256",):
        return redirect_with(
            redirect_uri, {"error": "invalid_request", "state": state}
        )
    params = {
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "scope": scope,
        "state": state,
        "code_challenge": code_challenge,
        "code_challenge_method": code_challenge_method,
        "client_name": row["client_name"] or client_id,
    }
    return HTMLResponse(approval_form(params))


@app.post("/oauth/authorize")
def authorize_post(
    client_id: str = Form(""),
    redirect_uri: str = Form(""),
    scope: str = Form(""),
    state: str = Form(""),
    code_challenge: str = Form(""),
    code_challenge_method: str = Form(""),
    admin_token: str = Form(""),
    action: str = Form(""),
):
    if action == "deny":
        return redirect_with(
            redirect_uri, {"error": "access_denied", "state": state}
        )
    if not admin_ok(admin_token):
        params = {
            "client_id": client_id,
            "redirect_uri": redirect_uri,
            "scope": scope,
            "state": state,
            "code_challenge": code_challenge,
            "code_challenge_method": code_challenge_method,
        }
        return HTMLResponse(approval_form(params, "Invalid admin token."), status_code=401)
    code = secrets.token_urlsafe(32)
    conn = connect()
    conn.execute(
        "INSERT INTO codes (code_hash, client_id, redirect_uri, challenge,"
        " challenge_method, scope, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        (
            digest(code),
            client_id,
            redirect_uri,
            code_challenge,
            code_challenge_method,
            scope,
            int(time.time()),
        ),
    )
    conn.commit()
    conn.close()
    return redirect_with(redirect_uri, {"code": code, "state": state})


# ---------------------------------------------------------------- tokens

def issue_pair(client_id: str, scope: str) -> dict:
    now = int(time.time())
    access = secrets.token_urlsafe(32)
    refresh = secrets.token_urlsafe(32)
    conn = connect()
    conn.execute(
        "INSERT INTO tokens (token_hash, kind, client_id, scope, created_at,"
        " expires_at) VALUES (?, 'access', ?, ?, ?, ?)",
        (digest(access), client_id, scope, now, now + ACCESS_TTL),
    )
    conn.execute(
        "INSERT INTO tokens (token_hash, kind, client_id, scope, created_at,"
        " expires_at) VALUES (?, 'refresh', ?, ?, ?, ?)",
        (digest(refresh), client_id, scope, now, now + REFRESH_TTL),
    )
    conn.commit()
    conn.close()
    return {
        "access_token": access,
        "token_type": "Bearer",
        "expires_in": ACCESS_TTL,
        "refresh_token": refresh,
        "scope": scope,
    }


def pkce_ok(verifier: str, challenge: str, method: str) -> bool:
    if not challenge:
        return True
    if method != "S256":
        return False
    calc = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest())
    calc = calc.rstrip(b"=").decode()
    return hmac.compare_digest(calc, challenge)


@app.post("/oauth/token")
def token(
    grant_type: str = Form(""),
    code: str = Form(""),
    redirect_uri: str = Form(""),
    client_id: str = Form(""),
    code_verifier: str = Form(""),
    refresh_token: str = Form(""),
):
    now = int(time.time())
    conn = connect()
    if grant_type == "authorization_code":
        row = conn.execute(
            "SELECT * FROM codes WHERE code_hash=?", (digest(code),)
        ).fetchone()
        if row is None:
            conn.close()
            return err("invalid_grant")
        conn.execute("DELETE FROM codes WHERE code_hash=?", (digest(code),))
        conn.commit()
        if row["created_at"] + CODE_TTL < now:
            conn.close()
            return err("invalid_grant")
        if row["client_id"] != client_id or row["redirect_uri"] != redirect_uri:
            conn.close()
            return err("invalid_grant")
        if not pkce_ok(code_verifier, row["challenge"], row["challenge_method"]):
            conn.close()
            return err("invalid_grant")
        scope = row["scope"]
        conn.close()
        return issue_pair(client_id, scope)
    if grant_type == "refresh_token":
        row = conn.execute(
            "SELECT * FROM tokens WHERE token_hash=? AND kind='refresh'",
            (digest(refresh_token),),
        ).fetchone()
        if row is None or row["revoked"] or row["expires_at"] < now:
            conn.close()
            return err("invalid_grant")
        if row["client_id"] != client_id:
            conn.close()
            return err("invalid_grant")
        conn.execute(
            "UPDATE tokens SET revoked=1 WHERE token_hash=?",
            (digest(refresh_token),),
        )
        conn.commit()
        scope = row["scope"]
        conn.close()
        return issue_pair(client_id, scope)
    conn.close()
    return err("unsupported_grant_type")


@app.post("/oauth/revoke")
def revoke(token: str = Form("")):
    conn = connect()
    conn.execute(
        "UPDATE tokens SET revoked=1 WHERE token_hash=?", (digest(token),)
    )
    conn.commit()
    conn.close()
    return JSONResponse({}, status_code=200)


# ---------------------------------------------------------------- verification

@app.get("/internal/verify")
def verify(authorization: str | None = Header(default=None)):
    if authorization and authorization.startswith("Bearer "):
        presented = authorization[7:].strip()
        if admin_ok(presented):
            return {"ok": True}
        conn = connect()
        row = conn.execute(
            "SELECT * FROM tokens WHERE token_hash=? AND kind='access'",
            (digest(presented),),
        ).fetchone()
        conn.close()
        if row and not row["revoked"] and row["expires_at"] >= int(time.time()):
            return {"ok": True}
    return JSONResponse({"ok": False}, status_code=401)
