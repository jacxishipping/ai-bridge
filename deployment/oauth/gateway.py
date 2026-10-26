"""Minimal OAuth 2.1 authorization server for the AI Bridge MCP endpoint.

Serves MCP-spec discovery, dynamic client registration, authorization-code
flow with PKCE (S256), refresh-token rotation, revocation, and an internal
token-verification endpoint used by nginx auth_request for /mcp.

Secrets are never logged. Only SHA-256 hashes of codes/tokens are stored.
Both the admin token (from the environment) and a valid enrolled device token
are required on the approval page: every OAuth MCP client is bound to a
specific enrolled device so MCP sessions always execute on that device.
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
from urllib.parse import urlencode, urlparse

from fastapi import FastAPI, Form, Header, Request
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse

ISSUER = os.environ.get("AI_BRIDGE_OAUTH_ISSUER", "https://jxiptvplayer.app")
RESOURCE = ISSUER + "/mcp"
DB_PATH = Path(os.environ.get("AI_BRIDGE_OAUTH_DB", "/etc/ai-bridge-oauth/oauth.db"))
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
    # Migration: clients approved before device binding existed have no
    # device_id column; add it idempotently (fails silently if present).
    try:
        conn.execute("ALTER TABLE clients ADD COLUMN device_id TEXT DEFAULT ''")
    except sqlite3.OperationalError:
        pass
    try:
        conn.execute("ALTER TABLE codes ADD COLUMN device_id TEXT DEFAULT ''")
    except sqlite3.OperationalError:
        pass
    try:
        conn.execute("ALTER TABLE tokens ADD COLUMN device_id TEXT DEFAULT ''")
    except sqlite3.OperationalError:
        pass
    conn.commit()
    conn.close()


init_db()


def digest(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def admin_ok(token: str | None) -> bool:
    expected = os.environ.get("AI_BRIDGE_ADMIN_TOKEN", "")
    return bool(expected) and bool(token) and hmac.compare_digest(token, expected)


def valid_redirect_uri(uri: str) -> bool:
    try:
        p = urlparse(uri)
    except Exception:
        return False
    if p.fragment or not p.netloc or not p.hostname:
        return False
    if p.scheme == "https":
        return True
    if p.scheme == "http" and p.hostname in ("localhost", "127.0.0.1"):
        return True
    return False


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

_FLUENT2_STYLE = """
:root, [data-theme="light"] {
  --fontFamilyBase: "Segoe UI Variable", "Segoe UI", -apple-system, BlinkMacSystemFont, Roboto, "Helvetica Neue", sans-serif;
  --fontFamilyMonospace: "Cascadia Code", "Consolas", "SFMono-Regular", Menlo, monospace;
  --colorBrandBackground: #0f6cbd;
  --colorBrandBackgroundHover: #115ea3;
  --colorBrandBackgroundPressed: #0c3b5e;
  --colorBrandBackground2: #ebf3fc;
  --colorBrandForeground1: #0f6cbd;
  --colorBrandStroke2: #b4d6fa;
  --colorCompoundBrandStroke: #0f6cbd;
  --colorNeutralBackground1: #ffffff;
  --colorNeutralBackground1Hover: #f5f5f5;
  --colorNeutralBackground2: #fafafa;
  --colorNeutralBackground3: #f5f5f5;
  --colorNeutralForeground1: #242424;
  --colorNeutralForeground2: #424242;
  --colorNeutralForeground3: #616161;
  --colorNeutralStroke1: #d1d1d1;
  --colorNeutralStroke2: #e0e0e0;
  --colorNeutralStrokeAccessible: #616161;
  --colorStatusDangerBackground1: #fdf3f4;
  --colorStatusDangerForeground1: #b10e1c;
  --colorStatusDangerStroke1: #eeacb2;
  --colorStatusSuccessBackground1: #f1faf1;
  --colorStatusSuccessForeground1: #0e700e;
  --colorStatusSuccessStroke1: #9fd89f;
  --shadow4: 0 2px 4px rgba(0,0,0,0.14), 0 0 2px rgba(0,0,0,0.12);
  --shadow16: 0 8px 16px rgba(0,0,0,0.14), 0 0 2px rgba(0,0,0,0.12);
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --colorBrandBackground: #115ea3;
    --colorBrandBackgroundHover: #0f6cbd;
    --colorBrandBackgroundPressed: #0c3b5e;
    --colorBrandBackground2: #0c3b5e;
    --colorBrandForeground1: #479ef5;
    --colorBrandStroke2: #0f548c;
    --colorCompoundBrandStroke: #479ef5;
    --colorNeutralBackground1: #292929;
    --colorNeutralBackground1Hover: #383838;
    --colorNeutralBackground2: #1f1f1f;
    --colorNeutralBackground3: #141414;
    --colorNeutralForeground1: #ffffff;
    --colorNeutralForeground2: #d6d6d6;
    --colorNeutralForeground3: #adadad;
    --colorNeutralStroke1: #525252;
    --colorNeutralStroke2: #3d3d3d;
    --colorNeutralStrokeAccessible: #adadad;
    --colorStatusDangerBackground1: #3b0509;
    --colorStatusDangerForeground1: #eeacb2;
    --colorStatusDangerStroke1: #860b16;
    --colorStatusSuccessBackground1: #052505;
    --colorStatusSuccessForeground1: #54b054;
    --colorStatusSuccessStroke1: #107c10;
    --shadow4: 0 2px 4px rgba(0,0,0,0.32), 0 0 2px rgba(0,0,0,0.24);
    --shadow16: 0 8px 16px rgba(0,0,0,0.42), 0 0 2px rgba(0,0,0,0.32);
  }
}
[data-theme="dark"] {
  --colorBrandBackground: #115ea3;
  --colorBrandBackgroundHover: #0f6cbd;
  --colorBrandBackgroundPressed: #0c3b5e;
  --colorBrandBackground2: #0c3b5e;
  --colorBrandForeground1: #479ef5;
  --colorBrandStroke2: #0f548c;
  --colorCompoundBrandStroke: #479ef5;
  --colorNeutralBackground1: #292929;
  --colorNeutralBackground1Hover: #383838;
  --colorNeutralBackground2: #1f1f1f;
  --colorNeutralBackground3: #141414;
  --colorNeutralForeground1: #ffffff;
  --colorNeutralForeground2: #d6d6d6;
  --colorNeutralForeground3: #adadad;
  --colorNeutralStroke1: #525252;
  --colorNeutralStroke2: #3d3d3d;
  --colorNeutralStrokeAccessible: #adadad;
  --colorStatusDangerBackground1: #3b0509;
  --colorStatusDangerForeground1: #eeacb2;
  --colorStatusDangerStroke1: #860b16;
  --colorStatusSuccessBackground1: #052505;
  --colorStatusSuccessForeground1: #54b054;
  --colorStatusSuccessStroke1: #107c10;
  --shadow4: 0 2px 4px rgba(0,0,0,0.32), 0 0 2px rgba(0,0,0,0.24);
  --shadow16: 0 8px 16px rgba(0,0,0,0.42), 0 0 2px rgba(0,0,0,0.32);
}
*, *::before, *::after { box-sizing: border-box; }
body {
  margin: 0;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  font-family: var(--fontFamilyBase);
  font-size: 14px;
  line-height: 20px;
  color: var(--colorNeutralForeground1);
  background-color: var(--colorNeutralBackground3);
  background-image: radial-gradient(circle at 50% 0%, rgba(15, 108, 189, 0.14), transparent 65%);
  -webkit-font-smoothing: antialiased;
}
.f2-card {
  position: relative;
  width: 100%;
  max-width: 480px;
  background-color: var(--colorNeutralBackground1);
  border: 1px solid var(--colorNeutralStroke2);
  border-top: 3px solid var(--colorBrandBackground);
  border-radius: 12px;
  box-shadow: var(--shadow16);
  padding: 28px;
}
.f2-steps {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
  margin-bottom: 16px;
}
.f2-step {
  padding: 6px 8px;
  border-radius: 6px;
  border: 1px solid var(--colorNeutralStroke2);
  background-color: var(--colorNeutralBackground2);
  font-size: 11px;
  font-weight: 600;
  color: var(--colorNeutralForeground3);
  text-align: center;
}
.f2-step[data-done="true"] {
  border-color: var(--colorBrandStroke2);
  background-color: var(--colorBrandBackground2);
  color: var(--colorBrandForeground1);
}
.f2-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 18px;
}
.f2-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 15px;
  font-weight: 600;
}
.f2-logo {
  width: 30px;
  height: 30px;
  border-radius: 7px;
  background: linear-gradient(135deg, #0f6cbd 0%, #2886de 55%, #479ef5 100%);
  color: #fff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-shadow: var(--shadow4);
}
.f2-title {
  margin: 0 0 6px;
  font-size: 22px;
  line-height: 28px;
  font-weight: 600;
}
.f2-subtitle {
  margin: 0 0 18px;
  font-size: 13px;
  color: var(--colorNeutralForeground3);
}
.f2-meta-box {
  background-color: var(--colorNeutralBackground2);
  border: 1px solid var(--colorNeutralStroke2);
  border-radius: 8px;
  padding: 12px 14px;
  margin-bottom: 18px;
  display: grid;
  gap: 8px;
  font-size: 13px;
}
.f2-meta-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.f2-meta-label {
  color: var(--colorNeutralForeground3);
  font-size: 12px;
  font-weight: 600;
}
.f2-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
  background-color: var(--colorBrandBackground2);
  color: var(--colorBrandForeground1);
  border: 1px solid var(--colorBrandStroke2);
}
.f2-badge-success {
  background-color: var(--colorStatusSuccessBackground1);
  color: var(--colorStatusSuccessForeground1);
  border-color: var(--colorStatusSuccessStroke1);
}
.f2-alert {
  padding: 10px 12px;
  border-radius: 6px;
  background-color: var(--colorStatusDangerBackground1);
  border: 1px solid var(--colorStatusDangerStroke1);
  color: var(--colorStatusDangerForeground1);
  font-size: 13px;
  font-weight: 500;
  margin-bottom: 16px;
}
.f2-field {
  margin-bottom: 16px;
}
.f2-label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 13px;
  font-weight: 600;
  color: var(--colorNeutralForeground1);
  margin-bottom: 5px;
}
.f2-req {
  color: var(--colorStatusDangerForeground1);
  font-size: 11px;
  font-weight: 600;
}
.f2-input-wrap {
  position: relative;
  display: flex;
  align-items: center;
}
.f2-input {
  width: 100%;
  height: 38px;
  padding: 0 112px 0 12px;
  border-radius: 4px;
  border: 1px solid var(--colorNeutralStroke1);
  border-bottom: 1px solid var(--colorNeutralStrokeAccessible);
  background-color: var(--colorNeutralBackground1);
  color: var(--colorNeutralForeground1);
  font-family: var(--fontFamilyMonospace);
  font-size: 13px;
  outline: none;
  transition: border-color 120ms cubic-bezier(0.33, 0, 0.67, 1);
}
.f2-input:focus {
  border-bottom: 2px solid var(--colorCompoundBrandStroke);
}
.f2-input-actions {
  position: absolute;
  right: 6px;
  display: inline-flex;
  align-items: center;
  gap: 2px;
}
.f2-toggle-vis {
  height: 24px;
  padding: 0 7px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--colorNeutralForeground3);
  font-family: var(--fontFamilyBase);
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
}
.f2-toggle-vis:hover {
  background: var(--colorNeutralBackground1Hover);
  color: var(--colorNeutralForeground1);
}
.f2-hint {
  margin-top: 5px;
  font-size: 12px;
  line-height: 16px;
  color: var(--colorNeutralForeground3);
}
.f2-actions {
  display: flex;
  gap: 10px;
  margin-top: 22px;
}
.f2-btn {
  flex: 1;
  height: 38px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border-radius: 4px;
  border: 1px solid var(--colorNeutralStroke1);
  background-color: var(--colorNeutralBackground1);
  color: var(--colorNeutralForeground1);
  font-family: var(--fontFamilyBase);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background-color 120ms cubic-bezier(0.33, 0, 0.67, 1);
}
.f2-btn:hover {
  background-color: var(--colorNeutralBackground1Hover);
}
.f2-btn-primary {
  flex: 2;
  background-color: var(--colorBrandBackground);
  border-color: transparent;
  color: #ffffff;
}
.f2-btn-primary:hover {
  background-color: var(--colorBrandBackgroundHover);
}
.f2-btn-primary:active {
  background-color: var(--colorBrandBackgroundPressed);
}
.f2-theme-btn {
  height: 28px;
  padding: 0 10px;
  border-radius: 4px;
  border: 1px solid var(--colorNeutralStroke2);
  background: transparent;
  color: var(--colorNeutralForeground2);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}
.f2-theme-btn:hover {
  background: var(--colorNeutralBackground1Hover);
}
code {
  font-family: var(--fontFamilyMonospace);
  font-size: 12px;
}
"""


def _error_page(title: str, detail: str) -> str:
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>{html.escape(title)} — AI Bridge OAuth</title>
  <style>{_FLUENT2_STYLE}</style>
</head>
<body>
  <main class="f2-card">
    <div class="f2-header">
      <div class="f2-brand">
        <span class="f2-logo">
          <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor">
            <path d="M10 2a.75.75 0 0 1 .33.08l6 3A.75.75 0 0 1 16.75 6v3.5c0 4.08-2.74 7.57-6.53
              8.46a.98.98 0 0 1-.44 0C5.99 17.07 3.25 13.58 3.25 9.5V6a.75.75 0 0 1 .42-.67l6-3A.75.75
              0 0 1 10 2Z"/>
          </svg>
        </span>
        <span>AI Bridge OAuth Gateway</span>
      </div>
    </div>
    <h1 class="f2-title">{html.escape(title)}</h1>
    <div class="f2-alert" style="margin-top:12px">{html.escape(detail)}</div>
  </main>
</body>
</html>"""


def approval_form(params: dict, error: str = "", current_binding: str = "") -> str:
    hidden = "".join(
        f'<input type="hidden" name="{html.escape(k)}" value="{html.escape(v)}">'
        for k, v in params.items()
    )
    client_display = params.get("client_name") or params.get("client_id") or "MCP Client"
    redirect_uri = params.get("redirect_uri") or ""
    redirect_host = urlparse(redirect_uri).netloc or redirect_uri
    err_html = f'<div class="f2-alert">{html.escape(error)}</div>' if error else ""
    binding_row = (
        f'<div class="f2-meta-row">'
        f'<span class="f2-meta-label">EXISTING BINDING</span>'
        f'<span class="f2-badge f2-badge-success">Device {html.escape(current_binding)}</span>'
        f'</div>'
        if current_binding
        else ""
    )
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>Authorize MCP Connection — AI Bridge</title>
  <style>{_FLUENT2_STYLE}</style>
</head>
<body>
  <main class="f2-card">
    <div class="f2-header">
      <div class="f2-brand">
        <span class="f2-logo">
          <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor">
            <path d="M10 2a.75.75 0 0 1 .33.08l6 3A.75.75 0 0 1 16.75 6v3.5c0 4.08-2.74 7.57-6.53
              8.46a.98.98 0 0 1-.44 0C5.99 17.07 3.25 13.58 3.25 9.5V6a.75.75 0 0 1 .42-.67l6-3A.75.75
              0 0 1 10 2Zm3.35 6.35a.5.5 0 0 0-.7-.7L9 11.29 7.35 9.65a.5.5 0 0 0-.7.7l2 2a.5.5 0 0 0
              .7 0l4-4Z"/>
          </svg>
        </span>
        <span>AI Bridge MCP Security</span>
      </div>
      <button type="button" class="f2-theme-btn" onclick="toggleTheme()">Theme</button>
    </div>

    <h1 class="f2-title">Authorize MCP Client</h1>
    <p class="f2-subtitle">
      Grant <b>{html.escape(client_display)}</b> access to your policy-governed AI Bridge device.
    </p>

    <div class="f2-steps">
      <div id="step-admin" class="f2-step" data-done="false">1. Admin Auth</div>
      <div id="step-device" class="f2-step" data-done="false">2. Bind Device</div>
      <div id="step-pkce" class="f2-step" data-done="true">3. PKCE S256</div>
    </div>

    <div class="f2-meta-box">
      <div class="f2-meta-row">
        <span class="f2-meta-label">CLIENT APPLICATION</span>
        <span class="f2-badge">{html.escape(client_display)}</span>
      </div>
      <div class="f2-meta-row">
        <span class="f2-meta-label">MCP ENDPOINT</span>
        <code>{html.escape(RESOURCE)}</code>
      </div>
      <div class="f2-meta-row">
        <span class="f2-meta-label">CALLBACK HOST</span>
        <code>{html.escape(redirect_host)}</code>
      </div>
      {binding_row}
    </div>

    {err_html}

    <form method="post" action="/oauth/authorize" novalidate onsubmit="onSubmitForm()">
      {hidden}

      <div class="f2-field">
        <label class="f2-label" for="admin_token">
          <span>Administrator Token</span>
          <span class="f2-req">Required</span>
        </label>
        <div class="f2-input-wrap">
          <input id="admin_token" class="f2-input" type="password" name="admin_token"
            placeholder="Enter AI_BRIDGE_ADMIN_TOKEN…" autocomplete="off"
            oninput="syncSteps()" required />
          <div class="f2-input-actions">
            <button type="button" class="f2-toggle-vis"
              onclick="pasteField('admin_token')">Paste</button>
            <button type="button" class="f2-toggle-vis"
              onclick="toggleVis('admin_token', this)">Show</button>
          </div>
        </div>
        <div class="f2-hint">
          Verified once to authorize this OAuth client and never stored in the session.
        </div>
      </div>

      <div class="f2-field">
        <label class="f2-label" for="device_token">
          <span>Target Device Token</span>
          <span class="f2-req">Required</span>
        </label>
        <div class="f2-input-wrap">
          <input id="device_token" class="f2-input" type="password" name="device_token"
            placeholder="Enter enrolled device token…" autocomplete="off"
            oninput="syncSteps()" required />
          <div class="f2-input-actions">
            <button type="button" class="f2-toggle-vis"
              onclick="pasteField('device_token')">Paste</button>
            <button type="button" class="f2-toggle-vis"
              onclick="toggleVis('device_token', this)">Show</button>
          </div>
        </div>
        <div class="f2-hint">
          Binds this MCP connection to your enrolled machine so all tools execute on that device.
          Issue a token in <b>Dashboard → Devices → Enroll Device</b>.
        </div>
      </div>

      <div class="f2-actions">
        <button type="submit" name="action" value="deny" class="f2-btn" formnovalidate>
          Deny
        </button>
        <button id="approveBtn" type="submit" name="action" value="approve"
          class="f2-btn f2-btn-primary">
          Approve &amp; Bind Device
        </button>
      </div>
    </form>
  </main>

  <script>
    (function() {{
      var saved = localStorage.getItem("ai_bridge_theme");
      if (saved === "light" || saved === "dark") {{
        document.documentElement.setAttribute("data-theme", saved);
      }}
    }})();
    function toggleVis(id, btn) {{
      var el = document.getElementById(id);
      if (!el) return;
      if (el.type === "password") {{ el.type = "text"; btn.textContent = "Hide"; }}
      else {{ el.type = "password"; btn.textContent = "Show"; }}
    }}
    function pasteField(id) {{
      if (!navigator.clipboard) return;
      navigator.clipboard.readText().then(function(t) {{
        var el = document.getElementById(id);
        if (el && t) {{ el.value = t.trim(); syncSteps(); }}
      }}).catch(function() {{}});
    }}
    function syncSteps() {{
      var a = document.getElementById("admin_token");
      var d = document.getElementById("device_token");
      var sa = document.getElementById("step-admin");
      var sd = document.getElementById("step-device");
      if (sa && a) sa.setAttribute("data-done", a.value.trim().length > 0 ? "true" : "false");
      if (sd && d) sd.setAttribute("data-done", d.value.trim().length > 0 ? "true" : "false");
    }}
    function onSubmitForm() {{
      var btn = document.getElementById("approveBtn");
      if (btn) btn.textContent = "Verifying & Binding…";
    }}
    function toggleTheme() {{
      var cur = document.documentElement.getAttribute("data-theme");
      var next = cur === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      localStorage.setItem("ai_bridge_theme", next);
    }}
  </script>
</body>
</html>"""


def resolve_device_token(token: str) -> str | None:
    """Validate a device token against the control plane's read-only
    whoami endpoint. Returns the device_id, or None if invalid.
    The endpoint touches no device state (unlike heartbeat)."""
    import json
    import urllib.error
    import urllib.request

    url = os.environ.get("AI_BRIDGE_CONTROL_URL", "http://127.0.0.1:8000").rstrip("/") + "/api/agent/whoami"
    req = urllib.request.Request(url, headers={"X-Device-Token": token})
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return json.loads(resp.read() or b"{}").get("device_id")
    except Exception:
        return None


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
        return HTMLResponse(_error_page("Unknown OAuth Client", "The client_id provided is not registered with this AI Bridge gateway."), status_code=400)
    registered_uris = row["redirect_uris"].split("\n")
    if not redirect_uri or redirect_uri not in registered_uris or not valid_redirect_uri(redirect_uri):
        return HTMLResponse(_error_page("Redirect URI Not Registered", "The redirect_uri in this request does not match the client registration."), status_code=400)
    if response_type != "code":
        return redirect_with(
            redirect_uri, {"error": "unsupported_response_type", "state": state}
        )
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
    try:
        current_binding = row["device_id"] or ""
    except (IndexError, KeyError):
        current_binding = ""
    return HTMLResponse(approval_form(params, current_binding=current_binding))


@app.post("/oauth/authorize")
def authorize_post(
    client_id: str = Form(""),
    redirect_uri: str = Form(""),
    scope: str = Form(""),
    state: str = Form(""),
    code_challenge: str = Form(""),
    code_challenge_method: str = Form(""),
    client_name: str = Form(""),
    admin_token: str = Form(""),
    device_token: str = Form(""),
    action: str = Form(""),
):
    conn = connect()
    row = conn.execute(
        "SELECT * FROM clients WHERE client_id=?", (client_id,)
    ).fetchone()
    conn.close()
    if row is None:
        return HTMLResponse(_error_page("Unknown OAuth Client", "The client_id provided is not registered with this AI Bridge gateway."), status_code=400)
    registered_uris = row["redirect_uris"].split("\n")
    if not redirect_uri or redirect_uri not in registered_uris or not valid_redirect_uri(redirect_uri):
        return HTMLResponse(_error_page("Redirect URI Not Registered", "The redirect_uri in this request does not match the client registration."), status_code=400)

    if action == "deny":
        return redirect_with(
            redirect_uri, {"error": "access_denied", "state": state}
        )
    params = {
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "scope": scope,
        "state": state,
        "code_challenge": code_challenge,
        "code_challenge_method": code_challenge_method,
        "client_name": client_name or row["client_name"] or client_id,
    }
    if not admin_ok(admin_token):
        return HTMLResponse(approval_form(params, "Invalid admin token."), status_code=401)
    # Device token is required on MCP OAuth approval so every OAuth session
    # is bound to a specific enrolled device.
    cleaned_device_token = (device_token or "").strip()
    if not cleaned_device_token:
        return HTMLResponse(
            approval_form(params, "Device token is required to bind this MCP connection to an enrolled device."),
            status_code=401,
        )
    binding = resolve_device_token(cleaned_device_token)
    if binding is None:
        return HTMLResponse(approval_form(params, "Invalid device token."), status_code=401)
    code = secrets.token_urlsafe(32)
    conn = connect()
    conn.execute("UPDATE clients SET device_id=? WHERE client_id=?", (binding, client_id))
    conn.execute(
        "INSERT INTO codes (code_hash, client_id, redirect_uri, challenge,"
        " challenge_method, scope, created_at, device_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (
            digest(code),
            client_id,
            redirect_uri,
            code_challenge,
            code_challenge_method,
            scope,
            int(time.time()),
            binding,
        ),
    )
    conn.commit()
    conn.close()
    return redirect_with(redirect_uri, {"code": code, "state": state})


# ---------------------------------------------------------------- tokens

def issue_pair(client_id: str, scope: str, device_id: str = "") -> dict:
    now = int(time.time())
    access = secrets.token_urlsafe(32)
    refresh = secrets.token_urlsafe(32)
    conn = connect()
    conn.execute(
        "INSERT INTO tokens (token_hash, kind, client_id, scope, created_at,"
        " expires_at, device_id) VALUES (?, 'access', ?, ?, ?, ?, ?)",
        (digest(access), client_id, scope, now, now + ACCESS_TTL, device_id),
    )
    conn.execute(
        "INSERT INTO tokens (token_hash, kind, client_id, scope, created_at,"
        " expires_at, device_id) VALUES (?, 'refresh', ?, ?, ?, ?, ?)",
        (digest(refresh), client_id, scope, now, now + REFRESH_TTL, device_id),
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
        row_keys = row.keys() if hasattr(row, "keys") else []
        dev_id = row["device_id"] if "device_id" in row_keys and row["device_id"] else ""
        conn.close()
        return issue_pair(client_id, scope, device_id=dev_id)
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
        row_keys = row.keys() if hasattr(row, "keys") else []
        dev_id = row["device_id"] if "device_id" in row_keys and row["device_id"] else ""
        conn.close()
        return issue_pair(client_id, scope, device_id=dev_id)
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
            # Raw admin token: unbound (droplet tools, as before).
            return {"ok": True, "device_id": None}
        conn = connect()
        row = conn.execute(
            "SELECT * FROM tokens WHERE token_hash=? AND kind='access'",
            (digest(presented),),
        ).fetchone()
        if row and not row["revoked"] and row["expires_at"] >= int(time.time()):
            crow = conn.execute(
                "SELECT device_id FROM clients WHERE client_id=?", (row["client_id"],)
            ).fetchone()
            conn.close()
            if crow is None:
                return JSONResponse({"ok": False}, status_code=401)
            row_keys = row.keys() if hasattr(row, "keys") else []
            tok_dev = row["device_id"] if "device_id" in row_keys and row["device_id"] else None
            device_id = tok_dev or crow["device_id"] or None
            if not device_id:
                return JSONResponse({"ok": False}, status_code=401)
            return {"ok": True, "device_id": device_id, "client_id": row["client_id"]}
        conn.close()
    return JSONResponse({"ok": False}, status_code=401)
