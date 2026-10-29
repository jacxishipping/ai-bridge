"""Control-plane API (FastAPI, modular monolith).

Auth:
- Admin/dashboard: header X-Admin-Token == AI_BRIDGE_ADMIN_TOKEN (or the
  token passed to create_app() in tests). No admin token configured ->
  admin endpoints refuse (fail closed), except /health.
- Device/agent: header X-Device-Token, compared by SHA-256 hash.
  Devices connect OUTBOUND to this API; the plane never opens an
  inbound shell to a device, and no device port is exposed.
- Tenant isolation: every query is filtered by tenant; a device token
  only matches devices in its own tenant.

Endpoints: /health, /api/devices, /api/tasks, /api/approvals,
/api/audit, /api/emergency-stop, /api/settings/webhook, /api/agent/* (polling).
Rate limiting: 120 requests/minute per token/IP (in-memory, per process).
"""
from __future__ import annotations

import asyncio
import hashlib
import hmac
import ipaddress
import json
import os
import secrets
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from pathlib import Path

from fastapi import Body, FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse, StreamingResponse
from pydantic import BaseModel, Field
from starlette.datastructures import Headers

from .. import tools
from ..policy import Policy, TOOL_TIERS
from ..security import redact, redact_obj
from . import auth as authmod
from . import db as dbmod
from .dispatch import dispatch

_RATE: dict[str, list[float]] = {}
_RATE_LOCK = threading.Lock()
MAX_RESULT_CHARS = 512_000
_DUMMY_SALT = "0" * 32
_DUMMY_HASH = "0" * 64


def _validate_webhook_url(url: str) -> None:
    if not url:
        return
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme not in ("http", "https") or not parsed.netloc or not parsed.hostname:
        raise HTTPException(status_code=400, detail="webhook_url must be an http(s) URL.")
    host = parsed.hostname.lower()
    if host in ("localhost", "127.0.0.1", "::1", "metadata.google.internal") or host.endswith(".localhost"):
        raise HTTPException(status_code=400, detail="Loopback and metadata webhooks are not allowed.")
    try:
        ip = ipaddress.ip_address(host)
        if ip.is_loopback or ip.is_private or ip.is_link_local or ip.is_multicast or ip.is_reserved or ip.is_unspecified:
            raise HTTPException(status_code=400, detail="Private/loopback IP webhooks are not allowed.")
    except ValueError:
        pass


def _valid_oauth_redirect_uri(uri: str) -> bool:
    try:
        p = urllib.parse.urlparse(uri)
    except Exception:
        return False
    if p.fragment or not p.netloc or not p.hostname:
        return False
    if p.scheme == "https":
        return True
    if p.scheme == "http" and p.hostname in ("localhost", "127.0.0.1"):
        return True
    return False


def _rate_limit(key: str, limit: int = 120, window: int = 60) -> None:
    now = time.time()
    with _RATE_LOCK:
        bucket = [t for t in _RATE.get(key, []) if now - t < window]
        bucket.append(now); _RATE[key] = bucket
        if len(bucket) > limit:
            raise HTTPException(status_code=429, detail="Rate limit exceeded.")


def make_quick_sig(admin_token: str | None, approval_id: str, decision: str) -> str:
    secret = (admin_token or "ai-bridge-secret").encode("utf-8")
    msg = f"{approval_id}:{decision}".encode("utf-8")
    return hmac.new(secret, msg, hashlib.sha256).hexdigest()[:32]


def send_webhook_notification(
    webhook_url: str,
    event: dict,
    admin_token: str | None = None,
    public_base_url: str | None = None,
    timeout: int = 10,
) -> dict:
    """Send a formatted notification to Slack, Discord, Telegram Bot, or generic webhook URL with 1-click mobile approval links."""
    url = (webhook_url or "").strip()
    if not url:
        return {"ok": False, "error": "No webhook URL configured."}
    try:
        _validate_webhook_url(url)
    except HTTPException as exc:
        return {"ok": False, "error": exc.detail}

    safe_args = redact_obj(event.get("args") or {})
    args_json = json.dumps(safe_args, indent=2)
    tool = event.get("tool", "unknown_tool")
    tier = event.get("tier", "unknown")
    dev_name = event.get("device_name") or event.get("device_id") or "Device"
    app_id = event.get("approval_id") or ""
    task_id = event.get("task_id") or ""
    evt_type = event.get("event", "approval_requested")

    base_url = (public_base_url or os.environ.get("AI_BRIDGE_PUBLIC_URL") or "https://jxiptvplayer.app").rstrip("/")

    approve_url = ""
    deny_url = ""
    if app_id:
        app_sig = make_quick_sig(admin_token, app_id, "approved")
        den_sig = make_quick_sig(admin_token, app_id, "denied")
        approve_url = f"{base_url}/api/approvals/quick/{app_id}?decision=approved&sig={app_sig}"
        deny_url = f"{base_url}/api/approvals/quick/{app_id}?decision=denied&sig={den_sig}"

    text = (
        f"[AI Bridge Approval Required]\n"
        f"Tool: {tool} (Tier {tier})\n"
        f"Device: {dev_name}\n"
        f"Task ID: {task_id}\n"
        f"Approval ID: {app_id}\n"
        f"Args: {json.dumps(safe_args)[:300]}"
    )
    payload = {
        "text": text,
        "content": text,
        "event": evt_type,
        "approval_id": app_id,
        "task_id": task_id,
        "device_id": event.get("device_id"),
        "device_name": dev_name,
        "tool": tool,
        "tier": tier,
        "args": safe_args,
        "quick_approve_url": approve_url,
        "quick_deny_url": deny_url,
    }

    parsed = urllib.parse.urlparse(url)
    netloc = (parsed.netloc or "").lower()

    if "discord.com" in netloc:
        if evt_type == "approval_requested" and approve_url:
            payload["content"] = f"🚨 **[AI Bridge] Approval Required: `{tool}`**"
            payload["embeds"] = [
                {
                    "title": f"Tier-{tier} Operation Requested",
                    "description": f"**Device:** `{dev_name}`\n**Tool:** `{tool}`\n**Task ID:** `{task_id}`\n**Approval ID:** `{app_id}`\n\n**Arguments:**\n```{args_json[:500]}```",
                    "color": 15158332,
                    "fields": [
                        {"name": "Quick Approve (1-Click)", "value": f"[✅ Approve via Mobile]({approve_url})", "inline": True},
                        {"name": "Quick Deny (1-Click)", "value": f"[❌ Deny via Mobile]({deny_url})", "inline": True},
                    ],
                    "footer": {"text": "AI Bridge Security Control Plane • HMAC Signed"},
                }
            ]
        else:
            payload["content"] = f"ℹ️ **[AI Bridge Notification]** `{evt_type}` on `{dev_name}`\nTool: `{tool}`\nTask: `{task_id}`"
    elif "api.telegram.org" in netloc:
        qs = urllib.parse.parse_qs(parsed.query)
        chat_id = qs.get("chat_id", [""])[0]
        if chat_id:
            payload["chat_id"] = chat_id
        text_lines = [
            f"🚨 *[AI Bridge] Approval Required*",
            f"*Tool:* `{tool}` (Tier {tier})",
            f"*Device:* `{dev_name}`",
            f"*Task ID:* `{task_id}`",
            f"*Approval ID:* `{app_id}`",
            f"*Args:*\n`{args_json[:300]}`",
        ]
        payload["text"] = "\n".join(text_lines)
        payload["parse_mode"] = "Markdown"
        if approve_url and deny_url:
            payload["reply_markup"] = {
                "inline_keyboard": [
                    [
                        {"text": "✅ Approve (1-Click)", "url": approve_url},
                        {"text": "❌ Deny (1-Click)", "url": deny_url},
                    ]
                ]
            }
    elif "hooks.slack.com" in netloc:
        blocks = [
            {
                "type": "header",
                "text": {"type": "plain_text", "text": "🚨 AI Bridge: Approval Required"},
            },
            {
                "type": "section",
                "fields": [
                    {"type": "mrkdwn", "text": f"*Tool:*\n{tool} (Tier {tier})"},
                    {"type": "mrkdwn", "text": f"*Device:*\n{dev_name}"},
                    {"type": "mrkdwn", "text": f"*Task ID:*\n{task_id}"},
                    {"type": "mrkdwn", "text": f"*Approval ID:*\n{app_id}"},
                ],
            },
            {
                "type": "section",
                "text": {"type": "mrkdwn", "text": f"*Arguments:*\n```{args_json[:400]}```"},
            },
        ]
        if approve_url and deny_url:
            blocks.append({
                "type": "actions",
                "elements": [
                    {"type": "button", "text": {"type": "plain_text", "text": "✅ Approve"}, "style": "primary", "url": approve_url},
                    {"type": "button", "text": {"type": "plain_text", "text": "❌ Deny"}, "style": "danger", "url": deny_url},
                ],
            })
        payload["blocks"] = blocks

    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        method="POST",
        headers={"Content-Type": "application/json", "User-Agent": "AI-Bridge-Control/0.3"},
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            status = getattr(resp, "status", 200)
            return {"ok": 200 <= status < 300, "status": status}
    except urllib.error.HTTPError as exc:
        return {"ok": False, "status": exc.code, "error": f"HTTP {exc.code}"}
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "error": str(exc)}


class EnrollIn(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    hostname: str = ""
    os: str = ""
    tenant: str = "default"
    unrestricted: bool | None = None
    policy: dict | None = None

class TaskIn(BaseModel):
    device_id: str
    tool: str
    args: dict = {}
    tenant: str = "default"

class ApprovalDecision(BaseModel):
    decision: str  # approved | denied
    reason: str = ""

class TaskResultIn(BaseModel):
    status: str
    result: str = ""

class LoginIn(BaseModel):
    username: str
    password: str

class UserIn(BaseModel):
    username: str = Field(min_length=1, max_length=100)
    password: str = Field(min_length=8, max_length=200)
    role: str = "viewer"

class PolicyIn(BaseModel):
    allow_tier3: bool = False
    desktop_enabled: bool = False
    allowed_apps: list[str] = []
    allowed_services: list[str] = []
    note: str = ""

class WebhookIn(BaseModel):
    webhook_url: str = ""


class DevicePolicyIn(BaseModel):
    inherit_global: bool = True
    unrestricted: bool | None = None
    restricted: bool | None = None
    allow_writes: bool | None = None
    allow_tier3: bool | None = None
    desktop_enabled: bool | None = None
    allow_shell: bool | None = None
    allow_package_install: bool | None = None
    allow_file_deletion: bool | None = None
    max_tier_unattended: int | None = None
    allowed_apps: list[str] | None = None
    allowed_services: list[str] | None = None
    allowed_tools: list[str] | None = None
    denied_tools: list[str] | None = None
    note: str = ""


class DeviceUpdateIn(BaseModel):
    name: str | None = None
    hostname: str | None = None
    os: str | None = None
    revoked: bool | None = None
    policy: dict | None = None


class DeviceRefreshIn(BaseModel):
    tools: list[str] | None = None


class TaskUpdateIn(BaseModel):
    tool: str | None = None
    args: dict | None = None
    status: str | None = None


class ApprovalUpdateIn(BaseModel):
    reason: str | None = None
    status: str | None = None


class OAuthClientUpdateIn(BaseModel):
    client_name: str | None = None
    redirect_uris: str | None = None


class WorkflowIn(BaseModel):
    name: str = "Autonomous Workflow"
    device_id: str | None = None
    steps: list[dict] = []
    stop_on_failure: bool = True
    max_retries: int = 1
    tenant: str = "default"


class TriggerIn(BaseModel):
    name: str
    device_id: str | None = None
    metric: str = "memory_percent"
    operator: str = ">"
    threshold: float = 85.0
    action_type: str = "tool"
    action_target: str = "get_system_info"
    action_args: dict = Field(default_factory=dict)
    cooldown_seconds: int = 300
    enabled: bool = True
    tenant: str = "default"


class ScheduleIn(BaseModel):
    name: str
    device_id: str | None = "local"
    interval_seconds: int = 300
    tool: str = "get_system_info"
    args: dict = Field(default_factory=dict)
    enabled: bool = True
    tenant: str = "default"


class FleetBroadcastIn(BaseModel):
    tool: str
    args: dict = Field(default_factory=dict)
    target_os: str | None = None
    target_device_ids: list[str] | None = None
    tenant: str = "default"


class DesktopInputIn(BaseModel):
    action: str = "click"
    x: float | None = None
    y: float | None = None
    normalized: bool = True
    button: str = "left"
    clicks: int = 1
    text: str | None = None
    key: str | None = None
    delta: int = -120
    screen_width: int = 1920
    screen_height: int = 1080


WORKFLOW_TEMPLATES = [
    {
        "id": "web_navigation_search",
        "name": "🌐 Web Navigation & OCR Verification",
        "description": "Opens browser, waits for load, navigates to target URL, and verifies header text.",
        "steps": [
            {"name": "Launch Browser", "action": "launch_approved_application", "args": {"app_name": "chrome"}},
            {"name": "Wait for Browser", "action": "wait_for_text", "args": {"text": "Google", "timeout_seconds": 10}},
            {"name": "Press Shortcut to Address Bar", "action": "press_hotkey", "args": {"combo": "ctrl+l"}},
            {"name": "Type Destination URL", "action": "keyboard_type", "args": {"text": "https://news.ycombinator.com\n"}},
            {"name": "Verify Site Loaded", "action": "wait_for_text", "args": {"text": "Hacker News", "timeout_seconds": 12}},
            {"name": "Capture Final Screenshot", "action": "take_screenshot", "args": {"quality": 80}},
        ],
    },
    {
        "id": "app_automation_doc",
        "name": "📝 App Launch & Document Generation",
        "description": "Opens Notepad, types formatted notes, triggers save shortcut, and verifies save dialog.",
        "steps": [
            {"name": "Open Notepad", "action": "launch_approved_application", "args": {"app_name": "notepad"}},
            {"name": "Wait for Notepad", "action": "wait_for_text", "args": {"text": "File", "timeout_seconds": 8}},
            {"name": "Type Document Content", "action": "keyboard_type", "args": {"text": "AI Bridge Autonomous Workflow Execution Report\nAll steps verified successfully.\n"}},
            {"name": "Trigger Save Hotkey", "action": "press_hotkey", "args": {"combo": "ctrl+s"}},
            {"name": "Verify Save Dialog", "action": "wait_for_text", "args": {"text": "Save", "timeout_seconds": 5}},
        ],
    },
    {
        "id": "fleet_health_diagnostics",
        "name": "🩺 Fleet Health & Telemetry Verification",
        "description": "Gathers system telemetry, lists open windows, checks desktop status, and confirms fleet health.",
        "steps": [
            {"name": "Check System Info", "action": "get_system_info", "args": {}},
            {"name": "Check Resource Usage", "action": "get_resource_usage", "args": {}},
            {"name": "List Active Desktop Windows", "action": "list_desktop_windows", "args": {}},
            {"name": "Enumerate UI Elements", "action": "list_ui_elements", "args": {}},
        ],
    },
]


def _render_quick_decision_html(
    title: str,
    badge_class: str,
    badge_icon: str,
    badge_text: str,
    heading: str,
    message: str,
    details: dict | None = None,
) -> str:
    details_rows = ""
    if details:
        for k, v in details.items():
            details_rows += f'<div class="row"><span class="label">{k}</span><span class="value">{v}</span></div>'
        details_html = f'<div class="details-card">{details_rows}</div>'
    else:
        details_html = ""

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>{title} • AI Bridge</title>
  <style>
    :root {{
      --bg: #0f141c;
      --card-bg: rgba(26, 34, 46, 0.94);
      --card-border: rgba(255, 255, 255, 0.12);
      --text: #f3f6fa;
      --text-muted: #94a3b8;
      --accent: #0078d4;
      --success: #107c41;
      --success-bg: rgba(16, 124, 65, 0.18);
      --danger: #d83b01;
      --danger-bg: rgba(216, 59, 1, 0.18);
      --font: -apple-system, BlinkMacSystemFont, "Segoe UI Variable Text", "Segoe UI", Roboto, sans-serif;
    }}
    @media (prefers-color-scheme: light) {{
      :root {{
        --bg: #f5f7fa;
        --card-bg: rgba(255, 255, 255, 0.96);
        --card-border: rgba(0, 0, 0, 0.1);
        --text: #1e293b;
        --text-muted: #64748b;
        --accent: #0067b8;
        --success: #107c41;
        --success-bg: #dff6dd;
        --danger: #c42b1c;
        --danger-bg: #fde7e9;
      }}
    }}
    * {{ box-sizing: border-box; margin: 0; padding: 0; }}
    body {{
      font-family: var(--font);
      background: var(--bg);
      color: var(--text);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px 16px;
      -webkit-font-smoothing: antialiased;
    }}
    .container {{
      max-width: 440px;
      width: 100%;
      background: var(--card-bg);
      backdrop-filter: blur(24px);
      -webkit-backdrop-filter: blur(24px);
      border: 1px solid var(--card-border);
      border-radius: 20px;
      padding: 32px 24px;
      box-shadow: 0 16px 40px rgba(0,0,0,0.3);
      text-align: center;
      animation: popIn 0.25s cubic-bezier(0.16, 1, 0.3, 1);
    }}
    @keyframes popIn {{
      from {{ opacity: 0; transform: scale(0.96); }}
      to {{ opacity: 1; transform: scale(1); }}
    }}
    .badge {{
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 6px 14px;
      border-radius: 999px;
      font-weight: 700;
      font-size: 13px;
      letter-spacing: 0.04em;
      margin-bottom: 20px;
    }}
    .badge.approved {{ background: var(--success-bg); color: var(--success); border: 1px solid var(--success); }}
    .badge.denied {{ background: var(--danger-bg); color: var(--danger); border: 1px solid var(--danger); }}
    .badge.info {{ background: rgba(0, 120, 212, 0.15); color: var(--accent); border: 1px solid var(--accent); }}
    h1 {{ font-size: 22px; font-weight: 700; margin-bottom: 10px; letter-spacing: -0.02em; }}
    p.subtitle {{ color: var(--text-muted); font-size: 14px; line-height: 1.5; margin-bottom: 24px; }}
    p.subtitle b {{ color: var(--text); }}
    p.subtitle code {{ background: rgba(125,125,125,0.2); padding: 2px 6px; border-radius: 4px; font-size: 13px; }}
    .details-card {{
      background: rgba(125, 125, 125, 0.08);
      border: 1px solid var(--card-border);
      border-radius: 12px;
      padding: 16px;
      margin-bottom: 24px;
      text-align: left;
      font-size: 13px;
    }}
    .row {{ display: flex; justify-content: space-between; align-items: center; padding: 7px 0; border-bottom: 1px solid var(--card-border); }}
    .row:last-child {{ border-bottom: none; }}
    .label {{ color: var(--text-muted); font-weight: 500; }}
    .value {{ font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-weight: 600; word-break: break-all; }}
    .actions {{ display: flex; flex-direction: column; gap: 10px; }}
    .btn {{
      display: block;
      width: 100%;
      padding: 12px;
      border-radius: 10px;
      text-decoration: none;
      font-weight: 600;
      font-size: 14px;
      text-align: center;
      transition: filter 0.15s ease;
    }}
    .btn-primary {{ background: var(--accent); color: #fff; }}
    .btn-primary:hover {{ filter: brightness(1.1); }}
    .footer-note {{ font-size: 11px; color: var(--text-muted); margin-top: 20px; }}
  </style>
</head>
<body>
  <div class="container">
    <div class="badge {badge_class}">
      <span>{badge_icon}</span>
      <span>{badge_text}</span>
    </div>
    <h1>{heading}</h1>
    <p class="subtitle">{message}</p>
    {details_html}
    <div class="actions">
      <a href="/" class="btn btn-primary">Open AI Bridge Dashboard</a>
    </div>
    <div class="footer-note">
      Cryptographically signed via HMAC-SHA256 • AI Bridge Control Plane
    </div>
  </div>
</body>
</html>
"""


def create_app(*, admin_token: str | None = None, db_path: Path | None = None) -> FastAPI:
    token = admin_token or os.environ.get("AI_BRIDGE_ADMIN_TOKEN")
    data_dir = Path(os.environ.get("AI_BRIDGE_DATA_DIR", str(Path.home() / ".ai-bridge")))
    db_path = db_path or (data_dir / "control.db")
    conn = dbmod.connect(db_path)
    app = FastAPI(title="AI Bridge Control Plane", version="0.3.0")
    app.add_middleware(CORSMiddleware, allow_origins=["http://127.0.0.1:5173", "http://localhost:5173", "http://201.79.36.129", "https://jxiptvplayer.app"],
                       allow_credentials=True, allow_methods=["*"], allow_headers=["*"])
    app.state.conn = conn
    app.state.admin_token = token
    app.state.emergency_stop = False
    task_cond = threading.Condition()
    app.state.task_cond = task_cond

    def notify_tasks() -> None:
        with task_cond:
            task_cond.notify_all()

    def get_webhook_url() -> str:
        row = conn.execute("SELECT value FROM settings WHERE key='webhook_url'").fetchone()
        if row is not None and row["value"] is not None:
            return str(row["value"]).strip()
        return os.environ.get("AI_BRIDGE_WEBHOOK_URL", "").strip()

    def get_public_base_url(req: Request | None = None) -> str:
        row = conn.execute("SELECT value FROM settings WHERE key='public_url'").fetchone()
        if row is not None and row["value"]:
            return str(row["value"]).strip().rstrip("/")
        env_url = os.environ.get("AI_BRIDGE_PUBLIC_URL")
        if env_url:
            return env_url.strip().rstrip("/")
        if req is not None:
            host = req.headers.get("x-forwarded-host") or req.headers.get("host")
            proto = req.headers.get("x-forwarded-proto") or req.url.scheme
            if host:
                return f"{proto}://{host}".rstrip("/")
        return "https://jxiptvplayer.app"

    def auth_context(x_admin_token: str | None = None, x_session_token: str | None = None, authorization: str | None = None):
        """Return (actor, role). Session tokens outrank the legacy admin token."""
        bearer = None
        if authorization and authorization.strip().lower().startswith("bearer "):
            bearer = authorization.strip()[7:].strip()
        eff_session = x_session_token or bearer
        eff_admin = x_admin_token or bearer

        if eff_session:
            row = conn.execute("SELECT * FROM sessions WHERE token_hash=?", (dbmod.hash_token(eff_session),)).fetchone()
            if row is not None and row["expires_at"] >= dbmod.now():
                user = conn.execute("SELECT * FROM users WHERE username=? AND disabled=0", (row["username"],)).fetchone()
                if user is not None:
                    return user["username"], user["role"]
        if token and authmod.legacy_admin_enabled() and eff_admin and hmac.compare_digest(eff_admin, token):
            return "admin-token", "admin"
        raise HTTPException(status_code=401, detail="Authentication required.")

    def require_role(min_role: str, x_admin_token: str | None = None, x_session_token: str | None = None, authorization: str | None = None):
        actor, role = auth_context(x_admin_token, x_session_token, authorization)
        if authmod.ROLES.get(role, 0) < authmod.ROLES[min_role]:
            raise HTTPException(status_code=403, detail=f"Role '{role}' cannot perform this action (requires {min_role}).")
        return actor

    def require_admin(x_admin_token: str | None = None, x_session_token: str | None = None, authorization: str | None = None):
        return require_role("admin", x_admin_token, x_session_token, authorization)

    def get_current_policy() -> dict:
        row = conn.execute("SELECT policy_json FROM policies ORDER BY version DESC LIMIT 1").fetchone()
        if row is not None:
            import json as _json
            return _json.loads(row["policy_json"])
        return {"allow_tier3": os.environ.get("AI_BRIDGE_ALLOW_TIER3", "0") == "1",
                "desktop_enabled": os.environ.get("AI_BRIDGE_DESKTOP_ENABLED", "0") == "1",
                "allowed_apps": [], "allowed_services": []}

    def get_effective_device_policy(device_row_or_id) -> dict:
        global_p = get_current_policy()
        row = device_row_or_id if not isinstance(device_row_or_id, str) else conn.execute("SELECT * FROM devices WHERE id=?", (device_row_or_id,)).fetchone()
        if row is None:
            return {**global_p, "has_custom_policy": False, "_source": "global", "denied_tools": []}
        raw_p = ""
        try:
            raw_p = row["policy_json"]
        except Exception:
            pass
        custom: dict = {}
        if raw_p:
            try:
                custom = json.loads(raw_p) if isinstance(raw_p, str) else raw_p
            except Exception:
                custom = {}

        is_unrestricted = bool(custom.get("unrestricted", False))
        if is_unrestricted:
            return {
                "inherit_global": False,
                "unrestricted": True,
                "allow_writes": True,
                "allow_tier3": True,
                "desktop_enabled": True,
                "allow_shell": True,
                "allow_package_install": True,
                "allow_file_deletion": True,
                "max_tier_unattended": 4,
                "allowed_apps": custom.get("allowed_apps") or ["*"],
                "allowed_services": custom.get("allowed_services") or ["*"],
                "allowed_test_commands": ["*"],
                "denied_tools": custom.get("denied_tools") or [],
                "allowed_tools": custom.get("allowed_tools") or None,
                "has_custom_policy": True,
                "_source": "linux_unrestricted_server",
                "device_policy": custom,
                "note": custom.get("note") or "Unrestricted Linux Server Policy (No Policy Restrictions)",
            }

        if not custom:
            return {**global_p, "has_custom_policy": False, "_source": "global", "denied_tools": []}

        inherit = bool(custom.get("inherit_global", True))
        merged = dict(global_p) if inherit else {
            "allow_writes": True,
            "allow_tier3": False,
            "desktop_enabled": False,
            "allowed_apps": [],
            "allowed_services": [],
            "allowed_test_commands": ["pytest", "npm test", "go test"],
            "max_tier_unattended": 2,
        }
        for k in ["allow_writes", "allow_tier3", "desktop_enabled", "max_tier_unattended", "allow_file_deletion", "allow_shell", "allow_package_install"]:
            if k in custom and custom[k] is not None:
                merged[k] = custom[k]

        if custom.get("allowed_apps") is not None:
            merged["allowed_apps"] = custom["allowed_apps"]
        if custom.get("allowed_services") is not None:
            merged["allowed_services"] = custom["allowed_services"]

        denied = set(custom.get("denied_tools") or [])
        if custom.get("allow_shell") is False:
            denied.add("run_shell")
        if custom.get("allow_package_install") is False:
            denied.add("install_package")
        if custom.get("allow_file_deletion") is False:
            denied.add("delete_workspace_file")
        if custom.get("desktop_enabled") is False:
            denied.update([
                "capture_desktop_screenshot", "take_screenshot", "launch_approved_application",
                "perform_approved_ui_action", "mouse_click", "mouse_move", "mouse_scroll",
                "mouse_drag", "keyboard_type", "keyboard_press", "list_desktop_windows",
                "focus_window", "get_screen_size",
            ])
        if custom.get("allow_writes") is False:
            denied.update(["create_workspace_file", "edit_workspace_file", "move_workspace_file", "delete_workspace_file"])

        merged["denied_tools"] = sorted(list(denied))
        if custom.get("allowed_tools") is not None:
            merged["allowed_tools"] = custom["allowed_tools"]

        merged["has_custom_policy"] = True
        merged["_source"] = "device"
        merged["device_policy"] = custom
        return merged

    device_ttl_days = int(os.environ.get("AI_BRIDGE_DEVICE_TOKEN_TTL_DAYS", "7"))

    def device_row(x_device_token: str | None):
        if not x_device_token:
            raise HTTPException(status_code=401, detail="Device token required.")
        h = dbmod.hash_token(x_device_token)
        row = conn.execute("SELECT * FROM devices WHERE token_hash=? AND revoked=0", (h,)).fetchone()
        if row is None:
            raise HTTPException(status_code=401, detail="Unknown or revoked device token.")
        if row["token_expires_at"] is not None and row["token_expires_at"] < dbmod.now():
            raise HTTPException(status_code=401, detail="Device token expired; rotate it via /api/agent/rotate before it expires, or re-enroll.")
        return row

    def audit(actor: str, device_id: str, tool: str, args: dict, decision: str, result: str = "", tenant: str = "default"):
        dbmod.audit(conn, tenant=tenant, actor=actor, device_id=device_id, tool=tool, args=args, decision=decision, result=result)

    @app.get("/health")
    def health():
        return {"status": "ok", "version": "0.3.0", "emergency_stop": app.state.emergency_stop}

    @app.post("/api/devices/enroll")
    def enroll(body: EnrollIn, x_admin_token: str | None = Header(default=None), x_session_token: str | None = Header(default=None)):
        actor = require_admin(x_admin_token, x_session_token)
        device_id = uuid.uuid4().hex[:12]
        device_token = secrets.token_urlsafe(32)
        issued = dbmod.now(); expires = issued + device_ttl_days * 86400
        initial_policy = "{}"
        if body.unrestricted is True or (isinstance(body.policy, dict) and body.policy.get("unrestricted")):
            initial_policy = json.dumps({
                "inherit_global": False,
                "unrestricted": True,
                "allow_writes": True,
                "allow_tier3": True,
                "desktop_enabled": True,
                "allow_shell": True,
                "allow_package_install": True,
                "allow_file_deletion": True,
                "max_tier_unattended": 4,
                "allowed_apps": ["*"],
                "allowed_services": ["*"],
                "note": "Unrestricted Linux Server Policy (Auto-configured on enrollment)",
            })
        elif isinstance(body.policy, dict) and body.policy:
            initial_policy = json.dumps(body.policy)
        conn.execute("INSERT INTO devices (id, name, hostname, os, tenant, token_hash, created_at, token_issued_at, token_expires_at, policy_json) VALUES (?,?,?,?,?,?,?,?,?,?)",
                     (device_id, body.name, body.hostname, body.os, body.tenant, dbmod.hash_token(device_token), issued, issued, expires, initial_policy))
        conn.commit()
        audit(actor, device_id, "enroll_device", body.model_dump(), "allowed", tenant=body.tenant)
        # Token is shown exactly once here; only its hash is stored.
        return {"device_id": device_id, "device_token": device_token, "token_expires_at": expires,
                "token_ttl_days": device_ttl_days,
                "note": "Store the device token securely; it will not be shown again. It expires and must be rotated."}

    @app.get("/api/devices")
    def list_devices(x_admin_token: str | None = Header(default=None), x_session_token: str | None = Header(default=None), tenant: str = "default"):
        require_role("viewer", x_admin_token, x_session_token)
        rows = conn.execute("SELECT id, name, hostname, os, tenant, status, last_seen, revoked, created_at, token_expires_at, policy_json FROM devices WHERE tenant=?", (tenant,)).fetchall()
        result = []
        for r in rows:
            d = dict(r)
            raw_p = d.get("policy_json") or "{}"
            try:
                parsed_p = json.loads(raw_p) if isinstance(raw_p, str) else (raw_p or {})
            except Exception:
                parsed_p = {}
            d["has_custom_policy"] = bool(parsed_p)
            d["policy"] = parsed_p
            result.append(d)
        return result

    @app.post("/api/devices/{device_id}/revoke")
    def revoke(device_id: str, x_admin_token: str | None = Header(default=None), x_session_token: str | None = Header(default=None)):
        require_admin(x_admin_token, x_session_token)
        cur = conn.execute("UPDATE devices SET revoked=1, status='revoked' WHERE id=?", (device_id,))
        conn.commit()
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Device not found.")
        audit("admin", device_id, "revoke_device", {}, "allowed")
        return {"device_id": device_id, "revoked": True}

    @app.put("/api/devices/{device_id}")
    def update_device(device_id: str, body: DeviceUpdateIn, x_admin_token: str | None = Header(default=None), x_session_token: str | None = Header(default=None)):
        actor = require_role("admin", x_admin_token, x_session_token)
        row = conn.execute("SELECT * FROM devices WHERE id=?", (device_id,)).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Device not found.")
        name = body.name.strip() if body.name is not None and body.name.strip() else row["name"]
        hostname = body.hostname.strip() if body.hostname is not None else (row["hostname"] or "")
        os_val = body.os.strip() if body.os is not None else (row["os"] or "")
        revoked = int(bool(body.revoked)) if body.revoked is not None else int(row["revoked"] or 0)
        status = "revoked" if revoked else ("offline" if row["status"] == "revoked" else row["status"])
        policy_json = json.dumps(body.policy) if body.policy is not None else (row["policy_json"] if "policy_json" in row.keys() else "{}")
        conn.execute(
            "UPDATE devices SET name=?, hostname=?, os=?, revoked=?, status=?, policy_json=? WHERE id=?",
            (name, hostname, os_val, revoked, status, policy_json, device_id),
        )
        conn.commit()
        audit(actor, device_id, "update_device", {"name": name, "hostname": hostname, "os": os_val, "revoked": bool(revoked), "policy_updated": body.policy is not None}, "allowed")
        updated = conn.execute(
            "SELECT id, name, hostname, os, tenant, status, last_seen, revoked, created_at, token_expires_at, policy_json FROM devices WHERE id=?",
            (device_id,),
        ).fetchone()
        d = dict(updated)
        try:
            d["policy"] = json.loads(d.get("policy_json") or "{}")
        except Exception:
            d["policy"] = {}
        d["has_custom_policy"] = bool(d["policy"])
        return d

    @app.delete("/api/devices/{device_id}")
    def delete_device(device_id: str, x_admin_token: str | None = Header(default=None), x_session_token: str | None = Header(default=None)):
        actor = require_role("admin", x_admin_token, x_session_token)
        cur = conn.execute("DELETE FROM devices WHERE id=?", (device_id,))
        conn.commit()
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Device not found.")
        audit(actor, device_id, "delete_device", {}, "allowed")
        return {"device_id": device_id, "deleted": True}

    @app.get("/api/devices/{device_id}/policy")
    def get_device_policy_api(device_id: str, x_admin_token: str | None = Header(default=None), x_session_token: str | None = Header(default=None)):
        require_role("viewer", x_admin_token, x_session_token)
        row = conn.execute("SELECT * FROM devices WHERE id=?", (device_id,)).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Device not found.")
        effective = get_effective_device_policy(row)
        raw_p = ""
        try:
            raw_p = row["policy_json"]
        except Exception:
            pass
        try:
            custom = json.loads(raw_p) if isinstance(raw_p, str) else (raw_p or {})
        except Exception:
            custom = {}
        all_tools = []
        for tool_name, tier_enum in sorted(TOOL_TIERS.items()):
            is_allowed = (
                tool_name not in effective.get("denied_tools", [])
                and (effective.get("allowed_tools") is None or tool_name in effective["allowed_tools"])
            )
            all_tools.append({
                "tool": tool_name,
                "tier": tier_enum.value,
                "tier_name": tier_enum.name,
                "allowed": is_allowed,
            })
        return {
            "device_id": device_id,
            "device_name": row["name"],
            "hostname": row["hostname"] or "",
            "os": row["os"] or "",
            "has_custom_policy": bool(custom),
            "custom_policy": custom,
            "effective_policy": effective,
            "global_policy": get_current_policy(),
            "tools": all_tools,
        }

    @app.put("/api/devices/{device_id}/policy")
    def set_device_policy_api(device_id: str, body: DevicePolicyIn, x_admin_token: str | None = Header(default=None), x_session_token: str | None = Header(default=None), x_device_token: str | None = Header(default=None)):
        if x_device_token:
            dev_row = device_row(x_device_token)
            if dev_row["id"] != device_id:
                raise HTTPException(status_code=403, detail="Device token not authorized for this device_id.")
            actor = f"device:{device_id}"
        else:
            actor = require_role("admin", x_admin_token, x_session_token)
        row = conn.execute("SELECT * FROM devices WHERE id=?", (device_id,)).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Device not found.")
        policy_data = body.model_dump()
        conn.execute("UPDATE devices SET policy_json=? WHERE id=?", (json.dumps(policy_data), device_id))
        conn.commit()
        audit(actor, device_id, "set_device_policy", policy_data, "allowed")
        return get_device_policy_api(device_id, x_admin_token, x_session_token)

    @app.delete("/api/devices/{device_id}/policy")
    def reset_device_policy_api(device_id: str, x_admin_token: str | None = Header(default=None), x_session_token: str | None = Header(default=None), x_device_token: str | None = Header(default=None)):
        if x_device_token:
            dev_row = device_row(x_device_token)
            if dev_row["id"] != device_id:
                raise HTTPException(status_code=403, detail="Device token not authorized for this device_id.")
            actor = f"device:{device_id}"
        else:
            actor = require_role("admin", x_admin_token, x_session_token)
        row = conn.execute("SELECT * FROM devices WHERE id=?", (device_id,)).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Device not found.")
        conn.execute("UPDATE devices SET policy_json='{}' WHERE id=?", (device_id,))
        conn.commit()
        audit(actor, device_id, "reset_device_policy", {}, "allowed")
        return {"device_id": device_id, "reset": True, "message": "Device policy reset to inherit global server policy."}

    @app.get("/api/devices/{device_id}/overview")
    def get_device_overview(device_id: str, x_admin_token: str | None = Header(default=None), x_session_token: str | None = Header(default=None)):
        require_role("viewer", x_admin_token, x_session_token)
        row = conn.execute("SELECT * FROM devices WHERE id=?", (device_id,)).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Device not found.")

        eff_policy = get_effective_device_policy(row)
        device_data = dict(row)
        try:
            device_data["policy"] = json.loads(device_data.get("policy_json") or "{}")
        except Exception:
            device_data["policy"] = {}
        device_data["has_custom_policy"] = bool(device_data["policy"])
        device_data["effective_policy"] = eff_policy

        # Find latest completed diagnostic tasks for this device
        diag_rows = conn.execute(
            "SELECT tool, result, updated_at FROM tasks WHERE device_id=? AND status='completed' ORDER BY updated_at DESC",
            (device_id,),
        ).fetchall()

        latest_results: dict[str, dict] = {}
        for r in diag_rows:
            tool_name = r["tool"]
            if tool_name not in latest_results:
                raw_res = r["result"] or ""
                parsed = None
                if raw_res:
                    try:
                        parsed = json.loads(raw_res)
                    except Exception:
                        parsed = raw_res
                latest_results[tool_name] = {
                    "data": parsed,
                    "updated_at": r["updated_at"],
                }

        # System info parsing
        sys_entry = latest_results.get("get_system_info", {})
        sys_info = sys_entry.get("data")
        if not isinstance(sys_info, dict):
            sys_info = {
                "system": row["os"] or "Unknown OS",
                "release": "",
                "version": "",
                "machine": "",
                "python": "",
                "processor": "",
            }

        # Resource usage parsing
        res_entry = latest_results.get("get_resource_usage", {})
        res_usage = res_entry.get("data")
        if not isinstance(res_usage, dict):
            res_usage = {
                "cpu_percent": None,
                "memory_percent": None,
                "memory_total_bytes": None,
                "memory_available_bytes": None,
                "disk_total_bytes": None,
                "disk_used_bytes": None,
                "disk_free_bytes": None,
            }

        # Processes parsing
        proc_entry = latest_results.get("list_processes", {})
        proc_data = proc_entry.get("data")
        processes = proc_data if isinstance(proc_data, list) else []

        # Docker containers parsing
        docker_entry = latest_results.get("list_docker_containers", {})
        docker_data = docker_entry.get("data")

        # Network info parsing (interfaces & listening ports)
        net_entry = latest_results.get("get_network_info", {})
        net_data = net_entry.get("data")

        # Desktop / Screenshot / Windows UI
        desktop_entry = latest_results.get("get_desktop_status", {})
        screenshot_entry = latest_results.get("capture_desktop_screenshot", {})
        windows_entry = latest_results.get("perform_approved_ui_action", {})
        win_data = windows_entry.get("data")
        windows_list = win_data.get("windows") if isinstance(win_data, dict) else None

        # Packages installed via tasks
        pkg_rows = conn.execute(
            "SELECT args_json, result, updated_at FROM tasks WHERE device_id=? AND tool='install_package' AND status='completed' ORDER BY updated_at DESC",
            (device_id,),
        ).fetchall()
        packages_installed = []
        for pr in pkg_rows:
            try:
                p_args = json.loads(pr["args_json"] or "{}")
                p_res = json.loads(pr["result"] or "{}") if pr["result"] else {}
                packages_installed.append({
                    "package_id": p_args.get("package_id"),
                    "version": p_args.get("version") or p_res.get("version"),
                    "manager": p_res.get("manager", "package"),
                    "updated_at": pr["updated_at"],
                })
            except Exception:
                pass

        # Recent 20 tasks
        recent_tasks_rows = conn.execute(
            "SELECT id, tool, args_json, tier, status, result, created_at, updated_at FROM tasks WHERE device_id=? ORDER BY created_at DESC LIMIT 20",
            (device_id,),
        ).fetchall()
        recent_tasks = []
        for tr in recent_tasks_rows:
            td = dict(tr)
            try:
                td["args"] = json.loads(td.get("args_json") or "{}")
            except Exception:
                td["args"] = {}
            recent_tasks.append(td)

        pending_approval_rows = conn.execute(
            "SELECT a.id, a.task_id, a.tool, a.reason, a.created_at, a.expires_at, a.policy_version, "
            "t.tier, t.args_json FROM approvals a JOIN tasks t ON a.task_id = t.id "
            "WHERE t.device_id=? AND a.status='pending' ORDER BY a.created_at DESC",
            (device_id,),
        ).fetchall()
        pending_approvals = []
        for ar in pending_approval_rows:
            ad = dict(ar)
            try:
                ad["args"] = json.loads(ad.get("args_json") or "{}")
            except Exception:
                ad["args"] = {}
            pending_approvals.append(ad)

        now_ts = dbmod.now()
        last_seen = row["last_seen"] or 0
        latency = max(0.0, now_ts - last_seen) if last_seen else None
        is_online = (row["status"] == "online") and (latency is not None and latency < 90)

        # Service statuses probe results (if any service queried)
        service_statuses = {}
        for r in diag_rows:
            if r["tool"] == "get_service_status":
                try:
                    s_res = json.loads(r["result"] or "{}")
                    s_name = s_res.get("service")
                    if s_name and s_name not in service_statuses:
                        service_statuses[s_name] = {
                            "output": s_res.get("output", ""),
                            "system": s_res.get("system", ""),
                            "updated_at": r["updated_at"],
                        }
                except Exception:
                    pass

        # Telemetry trend history (up to 25 historical points for sparklines)
        res_history_rows = conn.execute(
            "SELECT result, updated_at FROM tasks WHERE device_id=? AND tool='get_resource_usage' AND status='completed' ORDER BY updated_at ASC LIMIT 25",
            (device_id,),
        ).fetchall()
        res_history = []
        for rhr in res_history_rows:
            try:
                rp = json.loads(rhr["result"] or "{}")
                if "cpu_percent" in rp and rp["cpu_percent"] is not None:
                    res_history.append({
                        "cpu_percent": rp.get("cpu_percent"),
                        "memory_percent": rp.get("memory_percent"),
                        "updated_at": rhr["updated_at"],
                    })
            except Exception:
                pass

        return {
            "device": device_data,
            "health": {
                "is_online": is_online,
                "status": "revoked" if row["revoked"] else ("online" if is_online else "offline"),
                "latency_seconds": round(latency, 1) if latency is not None else None,
                "last_seen_ts": last_seen,
            },
            "system_info": {
                **sys_info,
                "updated_at": sys_entry.get("updated_at"),
            },
            "resource_usage": {
                **res_usage,
                "updated_at": res_entry.get("updated_at"),
            },
            "resource_history": res_history,
            "processes": processes,
            "processes_updated_at": proc_entry.get("updated_at"),
            "docker": docker_data,
            "docker_updated_at": docker_entry.get("updated_at"),
            "network": net_data,
            "network_updated_at": net_entry.get("updated_at"),
            "desktop": {
                "status": desktop_entry.get("data"),
                "screenshot": screenshot_entry.get("data"),
                "screenshot_updated_at": screenshot_entry.get("updated_at"),
                "windows": windows_list,
                "windows_updated_at": windows_entry.get("updated_at"),
            },
            "apps": {
                "allowed_apps": list(eff_policy.get("allowed_apps", [])),
                "installed_packages": packages_installed,
                "allowed_services": list(eff_policy.get("allowed_services", [])),
                "service_statuses": service_statuses,
            },
            "recent_tasks": recent_tasks,
            "pending_approvals": pending_approvals,
        }

    @app.post("/api/devices/{device_id}/refresh")
    def refresh_device_telemetry(device_id: str, body: DeviceRefreshIn | None = None, x_admin_token: str | None = Header(default=None), x_session_token: str | None = Header(default=None)):
        actor = require_role("operator", x_admin_token, x_session_token)
        if app.state.emergency_stop:
            raise HTTPException(status_code=403, detail="Emergency stop is active; cannot queue tasks.")
        row = conn.execute("SELECT * FROM devices WHERE id=? AND revoked=0", (device_id,)).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Device not found or revoked.")

        tools_to_run = (body.tools if body and body.tools else None) or ["get_system_info", "get_resource_usage", "get_network_info"]
        eff_policy = get_effective_device_policy(row)
        queued = []
        for tool_name in tools_to_run:
            tier = TOOL_TIERS.get(tool_name)
            # Only allow Tier 1 or Tier 2 safe read-only diagnostics to be automatically dispatched
            if tier is None or tier.value > 2:
                continue
            if tool_name in eff_policy.get("denied_tools", []):
                continue
            if eff_policy.get("allowed_tools") is not None and tool_name not in eff_policy["allowed_tools"]:
                continue

            task_id = uuid.uuid4().hex[:12]
            now_ts = dbmod.now()
            conn.execute(
                "INSERT INTO tasks (id, device_id, tenant, tool, args_json, tier, status, approval_id, created_at, updated_at)"
                " VALUES (?,?,?,?,?,?,?,?,?,?)",
                (task_id, device_id, row["tenant"], tool_name, "{}", tier.value, "queued", None, now_ts, now_ts),
            )
            queued.append({"task_id": task_id, "tool": tool_name})

        conn.commit()
        if queued:
            notify_tasks()
        audit(actor, device_id, "refresh_device_telemetry", {"tools": tools_to_run, "queued": [q["tool"] for q in queued]}, "allowed", tenant=row["tenant"])
        return {"device_id": device_id, "queued_tasks": queued}

    @app.post("/api/tasks")
    def submit_task(body: TaskIn, request: Request, x_admin_token: str | None = Header(default=None), x_session_token: str | None = Header(default=None)):
        actor = require_role("operator", x_admin_token, x_session_token)
        if app.state.emergency_stop:
            raise HTTPException(status_code=403, detail="Emergency stop is active; no new tasks accepted.")
        row = conn.execute("SELECT * FROM devices WHERE id=? AND tenant=? AND revoked=0", (body.device_id, body.tenant)).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Device not found or revoked.")
        tier = TOOL_TIERS.get(body.tool)
        if tier is None:
            raise HTTPException(status_code=400, detail=f"Unknown tool: {body.tool}")
        eff_policy = get_effective_device_policy(row)
        if body.tool in eff_policy.get("denied_tools", []):
            raise HTTPException(status_code=403, detail=f"Tool '{body.tool}' is disabled by device policy for '{row['name']}'.")
        if eff_policy.get("allowed_tools") is not None and body.tool not in eff_policy["allowed_tools"]:
            raise HTTPException(status_code=403, detail=f"Tool '{body.tool}' is not in the allowed tools list for device '{row['name']}'.")
        task_id = uuid.uuid4().hex[:12]
        status = "queued"
        approval_id = None
        max_unattended = int(eff_policy.get("max_tier_unattended", 2))
        allow_t3 = bool(eff_policy.get("allow_tier3", False))
        allow_file_del = bool(eff_policy.get("allow_file_deletion", False))

        is_unrestricted = bool(eff_policy.get("unrestricted", False))
        needs_approval = False
        if not is_unrestricted:
            if tier.value >= 4:
                if max_unattended < 4:
                    needs_approval = True
                elif body.tool == "delete_workspace_file" and not allow_file_del:
                    needs_approval = True
            elif tier.value == 3:
                if not (allow_t3 or max_unattended >= 3):
                    needs_approval = True
            elif tier.value > max_unattended:
                needs_approval = True

        if needs_approval:
            approval_id = uuid.uuid4().hex[:12]
            approval_ttl = max(60, int(os.environ.get("AI_BRIDGE_APPROVAL_TTL_SECONDS", "3600")))
            policy_row = conn.execute("SELECT MAX(version) AS version FROM policies").fetchone()
            policy_version = policy_row["version"] or 0
            conn.execute("INSERT INTO approvals (id, task_id, tool, reason, created_at, expires_at, policy_version) VALUES (?,?,?,?,?,?,?)",
                         (approval_id, task_id, body.tool, f"Tier-{tier.value} operation requires human approval.", dbmod.now(), dbmod.now() + approval_ttl, policy_version))
            status = "needs_approval"
        conn.execute("INSERT INTO tasks (id, device_id, tenant, tool, args_json, tier, status, approval_id, created_at, updated_at)"
                     " VALUES (?,?,?,?,?,?,?,?,?,?)",
                     (task_id, body.device_id, body.tenant, body.tool, json.dumps(body.args), tier.value, status, approval_id, dbmod.now(), dbmod.now()))
        conn.commit()
        audit(actor, body.device_id, body.tool, body.args, status, tenant=body.tenant)
        if status == "queued":
            notify_tasks()
        elif status == "needs_approval":
            wh_url = get_webhook_url()
            if wh_url:
                evt = {
                    "event": "approval_requested",
                    "approval_id": approval_id,
                    "task_id": task_id,
                    "device_id": body.device_id,
                    "device_name": row["name"],
                    "tool": body.tool,
                    "tier": tier.value,
                    "args": body.args,
                    "policy_version": policy_version,
                }
                pub_url = get_public_base_url(request)
                threading.Thread(target=send_webhook_notification, args=(wh_url, evt, token, pub_url), daemon=True).start()
        return {"task_id": task_id, "status": status, "tier": tier.value, "approval_id": approval_id}

    @app.get("/api/tasks")
    def list_tasks(x_admin_token: str | None = Header(default=None), x_session_token: str | None = Header(default=None), tenant: str = "default", device_id: str | None = None):
        require_role("viewer", x_admin_token, x_session_token)
        if device_id:
            rows = conn.execute("SELECT * FROM tasks WHERE tenant=? AND device_id=? ORDER BY created_at DESC LIMIT 200", (tenant, device_id)).fetchall()
        else:
            rows = conn.execute("SELECT * FROM tasks WHERE tenant=? ORDER BY created_at DESC LIMIT 200", (tenant,)).fetchall()
        return [dict(r) for r in rows]

    @app.get("/api/tasks/{task_id}")
    async def get_task(task_id: str, wait: float = 0.0, x_admin_token: str | None = Header(default=None), x_session_token: str | None = Header(default=None)):
        require_role("viewer", x_admin_token, x_session_token)
        wait_sec = max(0.0, min(float(wait or 0.0), 25.0))
        deadline = time.time() + wait_sec
        while True:
            row = conn.execute("SELECT * FROM tasks WHERE id=?", (task_id,)).fetchone()
            if row is None:
                raise HTTPException(status_code=404, detail="Task not found.")
            if wait_sec <= 0 or row["status"] in {"completed", "failed", "cancelled", "timed_out", "needs_approval"}:
                return dict(row)
            rem = deadline - time.time()
            if rem <= 0:
                return dict(row)
            await asyncio.sleep(min(0.15, rem))

    @app.post("/api/tasks/{task_id}/cancel")
    def cancel_task(task_id: str, x_admin_token: str | None = Header(default=None), x_session_token: str | None = Header(default=None)):
        require_role("operator", x_admin_token, x_session_token)
        row = conn.execute("SELECT * FROM tasks WHERE id=?", (task_id,)).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Task not found.")
        if row["status"] in {"completed", "failed", "cancelled"}:
            return {"task_id": task_id, "status": row["status"]}
        conn.execute("UPDATE tasks SET status='cancelled', updated_at=? WHERE id=?", (dbmod.now(), task_id))
        conn.commit()
        notify_tasks()
        audit("admin", row["device_id"], "cancel_task", {"task_id": task_id}, "allowed")
        return {"task_id": task_id, "status": "cancelled"}

    @app.put("/api/tasks/{task_id}")
    def update_task(task_id: str, body: TaskUpdateIn, x_admin_token: str | None = Header(default=None), x_session_token: str | None = Header(default=None)):
        actor = require_role("admin", x_admin_token, x_session_token)
        row = conn.execute("SELECT * FROM tasks WHERE id=?", (task_id,)).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Task not found.")
        tool = body.tool.strip() if body.tool is not None and body.tool.strip() else row["tool"]
        tier_enum = TOOL_TIERS.get(tool)
        if tier_enum is None:
            raise HTTPException(status_code=400, detail=f"Unknown tool: {tool}")
        args_json = json.dumps(body.args) if body.args is not None else row["args_json"]
        status = body.status.strip() if body.status is not None and body.status.strip() else row["status"]
        valid_statuses = {"queued", "running", "needs_approval", "completed", "failed", "cancelled", "timed_out"}
        if status not in valid_statuses:
            raise HTTPException(status_code=400, detail=f"Invalid status: {status}")
        if status == "queued" and app.state.emergency_stop:
            raise HTTPException(status_code=403, detail="Emergency stop is active; cannot queue tasks.")

        dev_row = conn.execute("SELECT * FROM devices WHERE id=?", (row["device_id"],)).fetchone()
        eff_policy = get_effective_device_policy(dev_row) if dev_row else get_current_policy()
        if tool in eff_policy.get("denied_tools", []):
            raise HTTPException(status_code=403, detail=f"Tool '{tool}' is disabled by device policy.")
        if eff_policy.get("allowed_tools") is not None and tool not in eff_policy["allowed_tools"]:
            raise HTTPException(status_code=403, detail=f"Tool '{tool}' is not in the allowed tools list for this device.")

        needs_approval = tier_enum.value >= 4 or (tier_enum.value == 3 and not eff_policy.get("allow_tier3", False))
        payload_changed = (tool != row["tool"]) or (args_json != row["args_json"])
        already_ran = row["status"] in {"running", "completed", "failed", "timed_out"}
        approval_id = row["approval_id"]

        if payload_changed or (status == "queued" and already_ran):
            if approval_id:
                approval_id = None

        if status == "queued" and needs_approval:
            if not approval_id:
                raise HTTPException(status_code=409, detail="Task requires approval before queuing.")
            ap = conn.execute("SELECT status, expires_at, tool FROM approvals WHERE id=?", (approval_id,)).fetchone()
            if ap is None or ap["status"] != "approved":
                raise HTTPException(status_code=409, detail="Task approval is not approved; create a new task to request approval again.")
            if ap["expires_at"] is not None and ap["expires_at"] <= dbmod.now():
                raise HTTPException(status_code=409, detail="Task approval has expired.")
            if ap["tool"] and ap["tool"] != tool:
                raise HTTPException(status_code=409, detail="Task approval tool mismatch.")

        conn.execute(
            "UPDATE tasks SET tool=?, args_json=?, tier=?, status=?, approval_id=?, updated_at=? WHERE id=?",
            (tool, args_json, tier_enum.value, status, approval_id, dbmod.now(), task_id),
        )
        conn.commit()
        if status == "queued":
            notify_tasks()
        audit(actor, row["device_id"], "update_task", {"task_id": task_id, "tool": tool, "status": status}, "allowed")
        updated = conn.execute("SELECT * FROM tasks WHERE id=?", (task_id,)).fetchone()
        return dict(updated)

    @app.delete("/api/tasks/{task_id}")
    def delete_task(task_id: str, x_admin_token: str | None = Header(default=None), x_session_token: str | None = Header(default=None)):
        actor = require_role("admin", x_admin_token, x_session_token)
        row = conn.execute("SELECT * FROM tasks WHERE id=?", (task_id,)).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Task not found.")
        conn.execute("DELETE FROM approvals WHERE task_id=?", (task_id,))
        conn.execute("DELETE FROM tasks WHERE id=?", (task_id,))
        conn.commit()
        audit(actor, row["device_id"], "delete_task", {"task_id": task_id}, "allowed")
        return {"task_id": task_id, "deleted": True}

    @app.delete("/api/tasks")
    def clear_tasks(status: str | None = None, x_admin_token: str | None = Header(default=None), x_session_token: str | None = Header(default=None)):
        actor = require_role("admin", x_admin_token, x_session_token)
        if status and status != "all":
            cur = conn.execute("DELETE FROM tasks WHERE status=?", (status,))
        else:
            cur = conn.execute("DELETE FROM tasks WHERE status IN ('completed', 'failed', 'cancelled', 'timed_out')")
        conn.commit()
        audit(actor, "", "clear_tasks", {"status": status or "finished", "deleted_count": cur.rowcount}, "allowed")
        return {"deleted_count": cur.rowcount}

    @app.get("/api/approvals")
    def list_approvals(x_admin_token: str | None = Header(default=None), x_session_token: str | None = Header(default=None)):
        require_role("viewer", x_admin_token, x_session_token)
        expire_pending_approvals()
        rows = conn.execute("SELECT * FROM approvals ORDER BY created_at DESC LIMIT 200").fetchall()
        return [approval_detail(r) for r in rows]

    def expire_pending_approvals() -> None:
        now = dbmod.now()
        rows = conn.execute("SELECT id, task_id FROM approvals WHERE status='pending' AND expires_at IS NOT NULL AND expires_at<=?", (now,)).fetchall()
        for row in rows:
            conn.execute("UPDATE approvals SET status='expired', decided_by='system', decided_at=? WHERE id=? AND status='pending'", (now, row["id"]))
            if row["task_id"]:
                conn.execute("UPDATE tasks SET status='cancelled', updated_at=? WHERE id=? AND status='needs_approval'", (now, row["task_id"]))
            audit("system", "", "expire_approval", {"approval_id": row["id"]}, "expired")
        if rows:
            conn.commit()

    def approval_detail(row) -> dict:
        data = dict(row)
        if data.get("task_id"):
            task = conn.execute("SELECT device_id, tenant, tool, args_json, tier FROM tasks WHERE id=?", (data["task_id"],)).fetchone()
            if task:
                data.update({"device_id": task["device_id"], "tenant": task["tenant"], "tool": task["tool"],
                             "args": json.loads(task["args_json"] or "{}"), "tier": task["tier"]})
                device = conn.execute("SELECT name FROM devices WHERE id=?", (task["device_id"],)).fetchone()
                data["device_name"] = device["name"] if device else None
        return data

    @app.post("/api/approvals/{approval_id}/decide")
    def decide_approval(approval_id: str, body: ApprovalDecision, x_admin_token: str | None = Header(default=None), x_session_token: str | None = Header(default=None)):
        actor = require_admin(x_admin_token, x_session_token)
        expire_pending_approvals()
        if body.decision not in {"approved", "denied"}:
            raise HTTPException(status_code=400, detail="decision must be approved or denied.")
        row = conn.execute("SELECT * FROM approvals WHERE id=?", (approval_id,)).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Approval not found.")
        if row["status"] != "pending":
            raise HTTPException(status_code=409, detail=f"Approval is already {row['status']}.")
        if row["expires_at"] is not None and row["expires_at"] <= dbmod.now():
            expire_pending_approvals()
            raise HTTPException(status_code=409, detail="Approval has expired.")
        now = dbmod.now()
        conn.execute("UPDATE approvals SET status=?, decided_by=?, decided_at=? WHERE id=? AND status='pending'", (body.decision, actor, now, approval_id))
        if row["task_id"]:
            new_status = "queued" if body.decision == "approved" else "cancelled"
            conn.execute("UPDATE tasks SET status=?, updated_at=? WHERE id=?", (new_status, now, row["task_id"]))
        conn.commit()
        notify_tasks()
        audit(actor, "", "decide_approval", {"approval_id": approval_id, "decision": body.decision, "reason": body.reason}, "allowed")
        return {"approval_id": approval_id, "status": body.decision, "decided_by": actor, "decided_at": now}

    @app.get("/api/approvals/quick/{approval_id}", response_class=HTMLResponse)
    def quick_approval(approval_id: str, decision: str = "approved", sig: str = ""):
        expire_pending_approvals()
        decision = (decision or "").strip().lower()
        if decision not in {"approved", "denied"}:
            return HTMLResponse(
                content=_render_quick_decision_html(
                    title="Invalid Request",
                    badge_class="denied",
                    badge_icon="❌",
                    badge_text="INVALID DECISION",
                    heading="Invalid Action",
                    message="Decision parameter must be either 'approved' or 'denied'.",
                ),
                status_code=400,
            )

        expected_sig = make_quick_sig(token, approval_id, decision)
        if not sig or not hmac.compare_digest(sig.strip(), expected_sig):
            return HTMLResponse(
                content=_render_quick_decision_html(
                    title="Verification Failed",
                    badge_class="denied",
                    badge_icon="🛡️",
                    badge_text="ACCESS DENIED",
                    heading="Signature Verification Failed",
                    message="The HMAC signature for this quick approval action is invalid or has expired. Please sign into the dashboard to review and authorize.",
                ),
                status_code=403,
            )

        row = conn.execute("SELECT * FROM approvals WHERE id=?", (approval_id,)).fetchone()
        if row is None:
            return HTMLResponse(
                content=_render_quick_decision_html(
                    title="Not Found",
                    badge_class="info",
                    badge_icon="❓",
                    badge_text="NOT FOUND",
                    heading="Approval Request Not Found",
                    message=f"Approval '{approval_id}' was not found or may have already been cleared.",
                ),
                status_code=404,
            )

        task = conn.execute("SELECT * FROM tasks WHERE id=?", (row["task_id"],)).fetchone() if row["task_id"] else None
        dev_name = "Workstation"
        tool_name = row["tool"] or "Operation"
        tier_num = "3"
        if task:
            dev_row = conn.execute("SELECT name FROM devices WHERE id=?", (task["device_id"],)).fetchone()
            if dev_row:
                dev_name = dev_row["name"]
            tool_name = task["tool"]
            tier_num = str(task["tier"])

        now = dbmod.now()
        now_str = time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime(now))

        if row["status"] != "pending":
            status_text = row["status"].upper()
            badge_cls = "approved" if row["status"] == "approved" else "denied"
            icon = "✅" if row["status"] == "approved" else "❌"
            return HTMLResponse(
                content=_render_quick_decision_html(
                    title=f"Already {status_text}",
                    badge_class=badge_cls,
                    badge_icon=icon,
                    badge_text=f"ALREADY {status_text}",
                    heading="Request Already Decided",
                    message=f"This approval request was previously decided as <b>{row['status']}</b> by <code>{row['decided_by']}</code>.",
                    details={
                        "Tool": f"{tool_name} (Tier {tier_num})",
                        "Device": dev_name,
                        "Task ID": row["task_id"] or "N/A",
                        "Approval ID": approval_id,
                        "Decided At": now_str,
                    },
                ),
                status_code=200,
            )

        if row["expires_at"] is not None and row["expires_at"] <= now:
            return HTMLResponse(
                content=_render_quick_decision_html(
                    title="Expired Request",
                    badge_class="denied",
                    badge_icon="⏰",
                    badge_text="EXPIRED",
                    heading="Approval Expired",
                    message="This approval request has exceeded its time-to-live deadline and was automatically cancelled for safety.",
                    details={
                        "Tool": f"{tool_name} (Tier {tier_num})",
                        "Device": dev_name,
                        "Task ID": row["task_id"] or "N/A",
                        "Approval ID": approval_id,
                    },
                ),
                status_code=410,
            )

        conn.execute("UPDATE approvals SET status=?, decided_by=?, decided_at=? WHERE id=? AND status='pending'", (decision, "mobile_quick_approval", now, approval_id))
        if row["task_id"]:
            new_status = "queued" if decision == "approved" else "cancelled"
            conn.execute("UPDATE tasks SET status=?, updated_at=? WHERE id=?", (new_status, now, row["task_id"]))
        conn.commit()
        notify_tasks()
        audit("mobile_quick_approval", "", "decide_approval", {"approval_id": approval_id, "decision": decision, "channel": "mobile_hmac"}, "allowed")

        if decision == "approved":
            return HTMLResponse(
                content=_render_quick_decision_html(
                    title="Action Approved",
                    badge_class="approved",
                    badge_icon="✅",
                    badge_text="OPERATION APPROVED",
                    heading="Execution Authorized",
                    message=f"Task <code>{row['task_id']}</code> has been authorized and queued for execution on <b>{dev_name}</b>.",
                    details={
                        "Tool": f"{tool_name} (Tier {tier_num})",
                        "Device": dev_name,
                        "Task ID": row["task_id"] or "N/A",
                        "Approval ID": approval_id,
                        "Time": now_str,
                    },
                ),
                status_code=200,
            )
        else:
            return HTMLResponse(
                content=_render_quick_decision_html(
                    title="Action Denied",
                    badge_class="denied",
                    badge_icon="❌",
                    badge_text="OPERATION DENIED",
                    heading="Execution Blocked",
                    message=f"Task <code>{row['task_id']}</code> has been rejected and cancelled. The target device will not execute this action.",
                    details={
                        "Tool": f"{tool_name} (Tier {tier_num})",
                        "Device": dev_name,
                        "Task ID": row["task_id"] or "N/A",
                        "Approval ID": approval_id,
                        "Time": now_str,
                    },
                ),
                status_code=200,
            )

    @app.put("/api/approvals/{approval_id}")
    def update_approval(approval_id: str, body: ApprovalUpdateIn, x_admin_token: str | None = Header(default=None), x_session_token: str | None = Header(default=None)):
        actor = require_role("admin", x_admin_token, x_session_token)
        row = conn.execute("SELECT * FROM approvals WHERE id=?", (approval_id,)).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Approval not found.")
        reason = body.reason if body.reason is not None else row["reason"]
        if body.status is not None:
            raise HTTPException(status_code=400, detail="Use POST /api/approvals/{id}/decide to decide an approval.")
        if row["status"] != "pending":
            raise HTTPException(status_code=409, detail=f"Approval is already {row['status']}.")
        conn.execute("UPDATE approvals SET reason=? WHERE id=? AND status='pending'", (reason, approval_id))
        conn.commit()
        audit(actor, "", "update_approval", {"approval_id": approval_id, "reason_updated": body.reason is not None}, "allowed")
        return approval_detail(conn.execute("SELECT * FROM approvals WHERE id=?", (approval_id,)).fetchone())

    @app.delete("/api/approvals/{approval_id}")
    def delete_approval(approval_id: str, x_admin_token: str | None = Header(default=None), x_session_token: str | None = Header(default=None)):
        actor = require_role("admin", x_admin_token, x_session_token)
        row = conn.execute("SELECT task_id, status FROM approvals WHERE id=?", (approval_id,)).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Approval not found.")
        if row["task_id"] and row["status"] == "pending":
            conn.execute("UPDATE tasks SET status='cancelled', updated_at=? WHERE id=? AND status='needs_approval'", (dbmod.now(), row["task_id"]))
        cur = conn.execute("DELETE FROM approvals WHERE id=?", (approval_id,))
        conn.commit()
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Approval not found.")
        audit(actor, "", "delete_approval", {"approval_id": approval_id}, "allowed")
        return {"approval_id": approval_id, "deleted": True}

    @app.get("/api/audit")
    def list_audit(x_admin_token: str | None = Header(default=None), x_session_token: str | None = Header(default=None), tenant: str = "default", tool: str | None = None):
        require_role("viewer", x_admin_token, x_session_token)
        if tool:
            rows = conn.execute("SELECT * FROM audit WHERE tenant=? AND tool=? ORDER BY ts DESC LIMIT 500", (tenant, tool)).fetchall()
        else:
            rows = conn.execute("SELECT * FROM audit WHERE tenant=? ORDER BY ts DESC LIMIT 500", (tenant,)).fetchall()
        return [dict(r) for r in rows]

    @app.api_route("/api/audit/{audit_id}", methods=["PUT", "DELETE"])
    def immutable_audit(audit_id: int):
        raise HTTPException(status_code=405, detail="Audit records are immutable and cannot be modified or deleted.")

    @app.get("/api/audit/export")
    def export_audit(tenant: str = "default", since: float | None = None, until: float | None = None,
                     x_admin_token: str | None = Header(default=None), x_session_token: str | None = Header(default=None)):
        require_role("admin", x_admin_token, x_session_token)
        clauses, params = ["tenant=?"], [tenant]
        if since is not None:
            clauses.append("ts>=?"); params.append(since)
        if until is not None:
            clauses.append("ts<=?"); params.append(until)
        rows = conn.execute("SELECT * FROM audit WHERE " + " AND ".join(clauses) + " ORDER BY ts ASC LIMIT 10000", tuple(params)).fetchall()
        return {"format": "jsonl", "count": len(rows), "events": [dict(r) for r in rows]}

    @app.post("/api/audit/retention")
    def apply_audit_retention(days: int = 365, x_admin_token: str | None = Header(default=None), x_session_token: str | None = Header(default=None)):
        actor = require_admin(x_admin_token, x_session_token)
        days = max(30, min(int(days), 3650))
        cutoff = dbmod.now() - days * 86400
        cur = conn.execute("DELETE FROM audit WHERE ts<?", (cutoff,))
        conn.commit()
        audit(actor, "", "audit_retention", {"days": days, "deleted_count": cur.rowcount}, "allowed")
        return {"retention_days": days, "deleted_count": cur.rowcount}

    @app.post("/api/emergency-stop")
    def emergency_stop(x_admin_token: str | None = Header(default=None), x_session_token: str | None = Header(default=None)):
        require_admin(x_admin_token, x_session_token)
        app.state.emergency_stop = True
        notify_tasks()
        audit("admin", "", "emergency_stop", {}, "allowed")
        return {"emergency_stop": True}

    @app.post("/api/emergency-stop/clear")
    def emergency_clear(x_admin_token: str | None = Header(default=None), x_session_token: str | None = Header(default=None)):
        require_admin(x_admin_token, x_session_token)
        app.state.emergency_stop = False
        notify_tasks()
        audit("admin", "", "emergency_stop_clear", {}, "allowed")
        return {"emergency_stop": False}

    # --- Autonomous Workflows & Multi-Turn Plan Execution -----------------
    @app.get("/api/workflows/templates")
    def get_workflow_templates(x_admin_token: str | None = Header(default=None), x_session_token: str | None = Header(default=None)):
        require_role("viewer", x_admin_token, x_session_token)
        return {"templates": WORKFLOW_TEMPLATES}

    @app.get("/api/workflows")
    def list_workflows(
        tenant: str = "default",
        status: str | None = None,
        x_admin_token: str | None = Header(default=None),
        x_session_token: str | None = Header(default=None),
    ):
        require_role("viewer", x_admin_token, x_session_token)
        if status:
            rows = conn.execute("SELECT * FROM workflows WHERE tenant=? AND status=? ORDER BY created_at DESC LIMIT 100", (tenant, status)).fetchall()
        else:
            rows = conn.execute("SELECT * FROM workflows WHERE tenant=? ORDER BY created_at DESC LIMIT 100", (tenant,)).fetchall()
        out = []
        for r in rows:
            d = dict(r)
            d["steps"] = json.loads(d.get("steps_json") or "[]")
            d["results"] = json.loads(d.get("results_json") or "[]")
            out.append(d)
        return out

    @app.get("/api/workflows/{workflow_id}")
    def get_workflow(
        workflow_id: str,
        x_admin_token: str | None = Header(default=None),
        x_session_token: str | None = Header(default=None),
    ):
        require_role("viewer", x_admin_token, x_session_token)
        row = conn.execute("SELECT * FROM workflows WHERE id=?", (workflow_id,)).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Workflow not found.")
        d = dict(row)
        d["steps"] = json.loads(d.get("steps_json") or "[]")
        d["results"] = json.loads(d.get("results_json") or "[]")
        return d

    @app.post("/api/workflows/{workflow_id}/cancel")
    def cancel_workflow(
        workflow_id: str,
        x_admin_token: str | None = Header(default=None),
        x_session_token: str | None = Header(default=None),
    ):
        actor = require_role("operator", x_admin_token, x_session_token)
        row = conn.execute("SELECT * FROM workflows WHERE id=?", (workflow_id,)).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Workflow not found.")
        now_ts = dbmod.now()
        conn.execute("UPDATE workflows SET status='cancelled', updated_at=?, completed_at=? WHERE id=? AND status IN ('pending', 'running')", (now_ts, now_ts, workflow_id))
        conn.commit()
        audit(actor, row["device_id"] or "", "cancel_workflow", {"workflow_id": workflow_id}, "allowed", tenant=row["tenant"])
        return {"workflow_id": workflow_id, "status": "cancelled"}

    def _execute_workflow_step_sync(action: str, args: dict, target_device_id: str | None, tenant: str, actor: str) -> dict:
        if target_device_id and target_device_id != "local":
            dev_row = conn.execute("SELECT * FROM devices WHERE id=? AND revoked=0", (target_device_id,)).fetchone()
            if dev_row:
                tier = TOOL_TIERS.get(action)
                t_val = tier.value if tier else 2
                task_id = uuid.uuid4().hex[:12]
                now_ts = dbmod.now()
                conn.execute(
                    "INSERT INTO tasks (id, device_id, tenant, tool, args_json, tier, status, created_at, updated_at) VALUES (?,?,?,?,?,?,'queued',?,?)",
                    (task_id, target_device_id, tenant, action, json.dumps(args), t_val, now_ts, now_ts),
                )
                conn.commit()
                notify_tasks()
                deadline = time.time() + 45.0
                while time.time() < deadline:
                    time.sleep(0.3)
                    t_row = conn.execute("SELECT status, result FROM tasks WHERE id=?", (task_id,)).fetchone()
                    if t_row and t_row["status"] in ("completed", "failed", "cancelled"):
                        if t_row["status"] == "failed":
                            raise RuntimeError(f"Remote device task failed: {t_row['result']}")
                        try:
                            return json.loads(t_row["result"])
                        except Exception:
                            return {"raw": t_row["result"]}
                raise TimeoutError(f"Timed out waiting for device {target_device_id} to execute {action}.")
        raw_p = get_current_policy()
        eff_p = Policy(
            allow_writes=True,
            allow_tier3=True,
            desktop_enabled=True,
            max_tier_unattended=4,
            allowed_services=frozenset(raw_p.get("allowed_services") or []),
            allowed_apps=frozenset(raw_p.get("allowed_apps") or []),
            unrestricted=bool(raw_p.get("unrestricted", False)),
        )
        return dispatch(action, args, policy=eff_p, approval_granted=True, is_admin=True)

    def _run_workflow_worker(wf_id: str, target_dev: str | None, tenant: str, steps: list[dict], stop_on_failure: bool, max_retries: int, actor: str):
        results = []
        overall_ok = True
        err_msg = ""

        for idx, step in enumerate(steps):
            check = conn.execute("SELECT status FROM workflows WHERE id=?", (wf_id,)).fetchone()
            if check and check["status"] == "cancelled":
                return

            step_name = step.get("name") or f"Step {idx + 1}"
            action = step.get("action", "")
            args = dict(step.get("args") or {})
            verify_cfg = step.get("verify")
            retries_left = max(0, int(step.get("retries", max_retries)))

            step_entry = {
                "index": idx + 1,
                "name": step_name,
                "action": action,
                "args": args,
                "status": "running",
                "duration_seconds": 0.0,
                "result": None,
                "error": None,
            }

            conn.execute("UPDATE workflows SET current_step=?, updated_at=? WHERE id=?", (idx + 1, dbmod.now(), wf_id))
            conn.commit()

            t0 = time.time()
            success = False

            while retries_left >= 0 and not success:
                try:
                    res = _execute_workflow_step_sync(action, args, target_dev, tenant, actor)
                    step_entry["result"] = res

                    if verify_cfg and isinstance(verify_cfg, dict):
                        v_text = verify_cfg.get("text")
                        v_timeout = float(verify_cfg.get("timeout_seconds", 8.0))
                        if v_text:
                            v_res = _execute_workflow_step_sync("wait_for_text", {"text": v_text, "timeout_seconds": v_timeout}, target_dev, tenant, actor)
                            step_entry["verification"] = v_res
                            if not v_res.get("found"):
                                raise RuntimeError(f"Step verification failed: text '{v_text}' not found after {v_timeout}s.")

                    step_entry["status"] = "completed"
                    success = True
                except Exception as exc:
                    retries_left -= 1
                    if retries_left < 0:
                        step_entry["status"] = "failed"
                        step_entry["error"] = str(exc)
                        overall_ok = False
                        err_msg = str(exc)
                    else:
                        time.sleep(1.0)

            step_entry["duration_seconds"] = round(time.time() - t0, 2)
            results.append(step_entry)

            conn.execute("UPDATE workflows SET results_json=?, updated_at=? WHERE id=?", (json.dumps(results), dbmod.now(), wf_id))
            conn.commit()

            if not success and stop_on_failure:
                break

        final_status = "completed" if overall_ok else "failed"
        conn.execute("UPDATE workflows SET status=?, error=?, results_json=?, completed_at=?, updated_at=? WHERE id=?",
                     (final_status, err_msg, json.dumps(results), dbmod.now(), dbmod.now(), wf_id))
        conn.commit()
        audit(actor, target_dev or "local", "execute_workflow", {"workflow_id": wf_id, "status": final_status, "steps_count": len(steps)}, "allowed", tenant=tenant)

    @app.post("/api/workflows")
    def submit_workflow(
        body: WorkflowIn,
        x_admin_token: str | None = Header(default=None),
        x_session_token: str | None = Header(default=None),
    ):
        actor = require_role("operator", x_admin_token, x_session_token)
        if app.state.emergency_stop:
            raise HTTPException(status_code=403, detail="Emergency stop is active; workflows rejected.")
        if not body.steps:
            raise HTTPException(status_code=400, detail="Workflow must contain at least one step.")

        wf_id = uuid.uuid4().hex[:12]
        now_ts = dbmod.now()
        conn.execute(
            "INSERT INTO workflows (id, name, tenant, device_id, steps_json, status, current_step, total_steps, results_json, created_at, updated_at) "
            "VALUES (?, ?, ?, ?, ?, 'running', 0, ?, '[]', ?, ?)",
            (wf_id, body.name, body.tenant, body.device_id, json.dumps(body.steps), len(body.steps), now_ts, now_ts),
        )
        conn.commit()
        audit(actor, body.device_id or "local", "create_workflow", {"workflow_id": wf_id, "name": body.name, "steps": len(body.steps)}, "allowed", tenant=body.tenant)

        threading.Thread(
            target=_run_workflow_worker,
            args=(wf_id, body.device_id, body.tenant, body.steps, body.stop_on_failure, body.max_retries, actor),
            daemon=True,
        ).start()

        return {
            "workflow_id": wf_id,
            "name": body.name,
            "status": "running",
            "total_steps": len(body.steps),
            "device_id": body.device_id,
        }

    @app.get("/api/workflows/{workflow_id}/stream")
    async def stream_workflow_progress(
        workflow_id: str,
        x_admin_token: str | None = Header(default=None),
        x_session_token: str | None = Header(default=None),
    ):
        require_role("viewer", x_admin_token, x_session_token)
        row = conn.execute("SELECT * FROM workflows WHERE id=?", (workflow_id,)).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Workflow not found.")

        async def event_generator():
            last_step = -1
            last_status = ""
            while True:
                curr = conn.execute("SELECT * FROM workflows WHERE id=?", (workflow_id,)).fetchone()
                if curr is None:
                    break
                payload = {
                    "workflow_id": workflow_id,
                    "status": curr["status"],
                    "current_step": curr["current_step"],
                    "total_steps": curr["total_steps"],
                    "results": json.loads(curr["results_json"] or "[]"),
                    "error": curr["error"],
                }
                if curr["current_step"] != last_step or curr["status"] != last_status:
                    last_step = curr["current_step"]
                    last_status = curr["status"]
                    yield f"data: {json.dumps(payload)}\n\n"

                if curr["status"] in ("completed", "failed", "cancelled"):
                    break
                await asyncio.sleep(0.5)

        return StreamingResponse(event_generator(), media_type="text/event-stream")

    # --- Phase 3: Fleet Telemetry, Broadcast, Triggers & Schedules ---
    app.state._running = True

    def _evaluate_device_triggers(dev_row: dict, metrics: dict, now_ts: float):
        try:
            triggers = conn.execute(
                "SELECT * FROM triggers WHERE enabled=1 AND tenant=? AND (device_id=? OR device_id IS NULL OR device_id='' OR device_id='*')",
                (dev_row["tenant"], dev_row["id"]),
            ).fetchall()
            for trig in triggers:
                metric_key = trig["metric"]
                val = metrics.get(metric_key)
                if val is None or not isinstance(val, (int, float)):
                    continue
                thresh = float(trig["threshold"])
                op = trig["operator"]
                triggered = False
                if op == ">" and val > thresh:
                    triggered = True
                elif op == ">=" and val >= thresh:
                    triggered = True
                elif op == "<" and val < thresh:
                    triggered = True
                elif op == "<=" and val <= thresh:
                    triggered = True
                elif op == "==" and abs(val - thresh) < 0.01:
                    triggered = True

                if triggered:
                    cooldown = max(10, int(trig["cooldown_seconds"]))
                    last_trig = trig["last_triggered_at"] or 0
                    if (now_ts - last_trig) >= cooldown:
                        conn.execute("UPDATE triggers SET last_triggered_at=? WHERE id=?", (now_ts, trig["id"]))
                        conn.commit()
                        act_type = trig["action_type"]
                        act_target = trig["action_target"]
                        act_args = {}
                        try:
                            act_args = json.loads(trig["action_args_json"] or "{}")
                        except Exception:
                            pass
                        if act_type == "tool":
                            task_id = uuid.uuid4().hex[:12]
                            tier = TOOL_TIERS.get(act_target)
                            t_val = tier.value if tier else 2
                            conn.execute(
                                "INSERT INTO tasks (id, device_id, tenant, tool, args_json, tier, status, created_at, updated_at) VALUES (?,?,?,?,?,?,'queued',?,?)",
                                (task_id, dev_row["id"], dev_row["tenant"], act_target, json.dumps(act_args), t_val, now_ts, now_ts),
                            )
                            conn.commit()
                            notify_tasks()
                            audit("trigger", dev_row["id"], f"trigger:{trig['name']}", {"metric": metric_key, "value": val, "task_id": task_id, "tool": act_target}, "executed", tenant=dev_row["tenant"])
                        elif act_type == "webhook":
                            wh_url = act_target if act_target.startswith("http") else get_webhook_url()
                            if wh_url:
                                evt = {
                                    "event": "trigger_fired",
                                    "trigger_name": trig["name"],
                                    "device_id": dev_row["id"],
                                    "device_name": dev_row["name"],
                                    "metric": metric_key,
                                    "value": val,
                                    "threshold": thresh,
                                    "timestamp": now_ts,
                                    "content": f"🚨 Alert: Trigger '{trig['name']}' fired on {dev_row['name']}: {metric_key}={val} (threshold {op} {thresh})"
                                }
                                threading.Thread(target=send_webhook_notification, args=(wh_url, evt, admin_token, get_public_base_url()), daemon=True).start()
                                audit("trigger", dev_row["id"], f"trigger:{trig['name']}", {"metric": metric_key, "value": val, "webhook": bool(wh_url)}, "executed", tenant=dev_row["tenant"])
        except Exception:
            pass

    def _scheduler_loop():
        while getattr(app.state, "_running", True):
            try:
                time.sleep(10)
                if not getattr(app.state, "_running", True):
                    break
                now_ts = dbmod.now()
                due_jobs = conn.execute(
                    "SELECT * FROM schedules WHERE enabled=1 AND next_run_at <= ?", (now_ts,)
                ).fetchall()
                for job in due_jobs:
                    interval = max(10, int(job["interval_seconds"]))
                    next_run = now_ts + interval
                    conn.execute("UPDATE schedules SET last_run_at=?, next_run_at=? WHERE id=?", (now_ts, next_run, job["id"]))
                    conn.commit()
                    tool_name = job["tool"]
                    try:
                        args = json.loads(job["args_json"] or "{}")
                    except Exception:
                        args = {}
                    target = job["device_id"]
                    try:
                        _execute_workflow_step_sync(tool_name, args, target, job["tenant"], f"scheduler:{job['name']}")
                    except Exception:
                        pass
            except Exception:
                time.sleep(5)

    threading.Thread(target=_scheduler_loop, daemon=True).start()

    @app.get("/api/devices/{device_id}/telemetry")
    def get_device_telemetry(
        device_id: str,
        limit: int = 50,
        x_admin_token: str | None = Header(default=None),
        x_session_token: str | None = Header(default=None),
    ):
        require_role("viewer", x_admin_token, x_session_token)
        limit = min(200, max(1, limit))
        rows = conn.execute(
            "SELECT cpu_percent, memory_percent, disk_percent, recorded_at FROM telemetry WHERE device_id=? ORDER BY recorded_at DESC LIMIT ?",
            (device_id, limit),
        ).fetchall()
        items = [dict(r) for r in reversed(rows)]
        return {"device_id": device_id, "telemetry": items}

    @app.get("/api/fleet/telemetry")
    def get_fleet_telemetry(
        tenant: str = "default",
        x_admin_token: str | None = Header(default=None),
        x_session_token: str | None = Header(default=None),
    ):
        require_role("viewer", x_admin_token, x_session_token)
        now_ts = dbmod.now()
        dev_rows = conn.execute("SELECT id, name, os, status, last_seen FROM devices WHERE tenant=? AND revoked=0", (tenant,)).fetchall()
        online_count = 0
        total_devices = len(dev_rows)
        device_summaries = []
        cpu_vals, mem_vals, disk_vals = [], [], []

        for d in dev_rows:
            latency = (now_ts - (d["last_seen"] or 0)) if d["last_seen"] else 9999
            is_online = (d["status"] == "online") and (latency < 90)
            if is_online:
                online_count += 1
            latest_tel = conn.execute(
                "SELECT cpu_percent, memory_percent, disk_percent, recorded_at FROM telemetry WHERE device_id=? ORDER BY recorded_at DESC LIMIT 1",
                (d["id"],),
            ).fetchone()
            tel_data = dict(latest_tel) if latest_tel else None
            if tel_data:
                if tel_data.get("cpu_percent") is not None:
                    cpu_vals.append(tel_data["cpu_percent"])
                if tel_data.get("memory_percent") is not None:
                    mem_vals.append(tel_data["memory_percent"])
                if tel_data.get("disk_percent") is not None:
                    disk_vals.append(tel_data["disk_percent"])

            device_summaries.append({
                "id": d["id"],
                "name": d["name"],
                "os": d["os"],
                "is_online": is_online,
                "last_seen": d["last_seen"],
                "telemetry": tel_data,
            })

        avg_cpu = round(sum(cpu_vals) / len(cpu_vals), 1) if cpu_vals else None
        avg_mem = round(sum(mem_vals) / len(mem_vals), 1) if mem_vals else None
        avg_disk = round(sum(disk_vals) / len(disk_vals), 1) if disk_vals else None
        trig_row = conn.execute("SELECT COUNT(*) AS c FROM triggers WHERE enabled=1 AND tenant=?", (tenant,)).fetchone()
        sched_row = conn.execute("SELECT COUNT(*) AS c FROM schedules WHERE enabled=1 AND tenant=?", (tenant,)).fetchone()

        return {
            "total_devices": total_devices,
            "online_devices": online_count,
            "avg_cpu_percent": avg_cpu,
            "avg_memory_percent": avg_mem,
            "avg_disk_percent": avg_disk,
            "active_triggers": trig_row["c"] if trig_row else 0,
            "active_schedules": sched_row["c"] if sched_row else 0,
            "devices": device_summaries,
        }

    @app.post("/api/fleet/broadcast")
    def broadcast_fleet_command(
        body: FleetBroadcastIn,
        x_admin_token: str | None = Header(default=None),
        x_session_token: str | None = Header(default=None),
    ):
        actor = require_role("operator", x_admin_token, x_session_token)
        query = "SELECT * FROM devices WHERE revoked=0 AND tenant=?"
        params = [body.tenant]
        if body.target_os:
            query += " AND LOWER(os) LIKE ?"
            params.append(f"%{body.target_os.lower()}%")
        devs = conn.execute(query, tuple(params)).fetchall()

        target_devs = []
        if body.target_device_ids:
            target_set = set(body.target_device_ids)
            target_devs = [d for d in devs if d["id"] in target_set]
        else:
            target_devs = list(devs)

        if not target_devs:
            raise HTTPException(status_code=400, detail="No matching online devices found for broadcast.")

        batch_id = uuid.uuid4().hex[:12]
        now_ts = dbmod.now()
        tier = TOOL_TIERS.get(body.tool)
        t_val = tier.value if tier else 2

        tasks_out = []
        for dev in target_devs:
            task_id = f"bcast-{batch_id}-{dev['id'][:6]}"
            conn.execute(
                "INSERT INTO tasks (id, device_id, tenant, tool, args_json, tier, status, created_at, updated_at) VALUES (?,?,?,?,?,?,'queued',?,?)",
                (task_id, dev["id"], dev["tenant"], body.tool, json.dumps(body.args), t_val, now_ts, now_ts),
            )
            tasks_out.append({
                "device_id": dev["id"],
                "device_name": dev["name"],
                "os": dev["os"],
                "task_id": task_id,
                "status": "queued",
            })

        conn.commit()
        notify_tasks()
        audit(actor, "fleet", "broadcast_command", {"batch_id": batch_id, "tool": body.tool, "device_count": len(tasks_out)}, "allowed", tenant=body.tenant)
        return {
            "batch_id": batch_id,
            "tool": body.tool,
            "device_count": len(tasks_out),
            "tasks": tasks_out,
        }

    @app.get("/api/fleet/broadcast/{batch_id}")
    def get_broadcast_status(
        batch_id: str,
        x_admin_token: str | None = Header(default=None),
        x_session_token: str | None = Header(default=None),
    ):
        require_role("viewer", x_admin_token, x_session_token)
        task_rows = conn.execute("SELECT * FROM tasks WHERE id LIKE ?", (f"bcast-{batch_id}-%",)).fetchall()
        if not task_rows:
            raise HTTPException(status_code=404, detail="Broadcast batch not found.")

        results = []
        completed_count = 0
        failed_count = 0
        for r in task_rows:
            dev = conn.execute("SELECT name, os FROM devices WHERE id=?", (r["device_id"],)).fetchone()
            d_name = dev["name"] if dev else r["device_id"]
            d_os = dev["os"] if dev else ""
            status = r["status"]
            if status == "completed":
                completed_count += 1
            elif status == "failed":
                failed_count += 1
            res_val = None
            if r["result"]:
                try:
                    res_val = json.loads(r["result"])
                except Exception:
                    res_val = {"raw": r["result"]}
            results.append({
                "task_id": r["id"],
                "device_id": r["device_id"],
                "device_name": d_name,
                "os": d_os,
                "status": status,
                "result": res_val,
                "created_at": r["created_at"],
                "updated_at": r["updated_at"],
            })

        overall = "completed" if (completed_count + failed_count == len(task_rows)) else "running"
        return {
            "batch_id": batch_id,
            "status": overall,
            "total_tasks": len(task_rows),
            "completed": completed_count,
            "failed": failed_count,
            "tasks": results,
        }

    @app.get("/api/triggers")
    def list_triggers(
        tenant: str = "default",
        x_admin_token: str | None = Header(default=None),
        x_session_token: str | None = Header(default=None),
    ):
        require_role("viewer", x_admin_token, x_session_token)
        rows = conn.execute("SELECT * FROM triggers WHERE tenant=? ORDER BY created_at DESC", (tenant,)).fetchall()
        out = []
        for r in rows:
            d = dict(r)
            try:
                d["action_args"] = json.loads(d.get("action_args_json") or "{}")
            except Exception:
                d["action_args"] = {}
            out.append(d)
        return out

    @app.post("/api/triggers")
    def create_trigger(
        body: TriggerIn,
        x_admin_token: str | None = Header(default=None),
        x_session_token: str | None = Header(default=None),
    ):
        actor = require_role("admin", x_admin_token, x_session_token)
        tid = uuid.uuid4().hex[:12]
        now_ts = dbmod.now()
        conn.execute(
            "INSERT INTO triggers (id, name, tenant, device_id, metric, operator, threshold, action_type, action_target, action_args_json, cooldown_seconds, enabled, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (
                tid,
                body.name,
                body.tenant,
                body.device_id,
                body.metric,
                body.operator,
                body.threshold,
                body.action_type,
                body.action_target,
                json.dumps(body.action_args),
                body.cooldown_seconds,
                1 if body.enabled else 0,
                now_ts,
            ),
        )
        conn.commit()
        audit(actor, body.device_id or "", "create_trigger", {"trigger_id": tid, "name": body.name, "metric": body.metric}, "allowed", tenant=body.tenant)
        return {"trigger_id": tid, "status": "created"}

    @app.delete("/api/triggers/{trigger_id}")
    def delete_trigger(
        trigger_id: str,
        x_admin_token: str | None = Header(default=None),
        x_session_token: str | None = Header(default=None),
    ):
        actor = require_role("admin", x_admin_token, x_session_token)
        row = conn.execute("SELECT * FROM triggers WHERE id=?", (trigger_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Trigger not found.")
        conn.execute("DELETE FROM triggers WHERE id=?", (trigger_id,))
        conn.commit()
        audit(actor, row["device_id"] or "", "delete_trigger", {"trigger_id": trigger_id}, "allowed", tenant=row["tenant"])
        return {"trigger_id": trigger_id, "status": "deleted"}

    @app.post("/api/triggers/{trigger_id}/toggle")
    def toggle_trigger(
        trigger_id: str,
        x_admin_token: str | None = Header(default=None),
        x_session_token: str | None = Header(default=None),
    ):
        actor = require_role("admin", x_admin_token, x_session_token)
        row = conn.execute("SELECT * FROM triggers WHERE id=?", (trigger_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Trigger not found.")
        new_state = 0 if row["enabled"] else 1
        conn.execute("UPDATE triggers SET enabled=? WHERE id=?", (new_state, trigger_id))
        conn.commit()
        audit(actor, row["device_id"] or "", "toggle_trigger", {"trigger_id": trigger_id, "enabled": bool(new_state)}, "allowed", tenant=row["tenant"])
        return {"trigger_id": trigger_id, "enabled": bool(new_state)}

    @app.post("/api/triggers/{trigger_id}/test")
    def test_trigger(
        trigger_id: str,
        x_admin_token: str | None = Header(default=None),
        x_session_token: str | None = Header(default=None),
    ):
        actor = require_role("admin", x_admin_token, x_session_token)
        row = conn.execute("SELECT * FROM triggers WHERE id=?", (trigger_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Trigger not found.")
        now_ts = dbmod.now()
        conn.execute("UPDATE triggers SET last_triggered_at=? WHERE id=?", (now_ts, trigger_id))
        conn.commit()
        act_type = row["action_type"]
        target = row["action_target"]
        args = json.loads(row["action_args_json"] or "{}")
        if act_type == "tool":
            res = _execute_workflow_step_sync(target, args, row["device_id"], row["tenant"], f"test_trigger:{row['name']}")
            return {"trigger_id": trigger_id, "status": "executed", "result": res}
        elif act_type == "webhook":
            wh_url = target if str(target).startswith("http") else get_webhook_url()
            evt = {
                "event": "trigger_test",
                "trigger_name": row["name"],
                "device_id": row["device_id"] or "fleet",
                "metric": row["metric"],
                "content": f"🧪 Test Trigger '{row['name']}' simulated by {actor}."
            }
            send_webhook_notification(wh_url, evt, admin_token, get_public_base_url())
            return {"trigger_id": trigger_id, "status": "webhook_sent"}
        return {"trigger_id": trigger_id, "status": "ok"}

    @app.get("/api/schedules")
    def list_schedules(
        tenant: str = "default",
        x_admin_token: str | None = Header(default=None),
        x_session_token: str | None = Header(default=None),
    ):
        require_role("viewer", x_admin_token, x_session_token)
        rows = conn.execute("SELECT * FROM schedules WHERE tenant=? ORDER BY created_at DESC", (tenant,)).fetchall()
        out = []
        for r in rows:
            d = dict(r)
            try:
                d["args"] = json.loads(d.get("args_json") or "{}")
            except Exception:
                d["args"] = {}
            out.append(d)
        return out

    @app.post("/api/schedules")
    def create_schedule(
        body: ScheduleIn,
        x_admin_token: str | None = Header(default=None),
        x_session_token: str | None = Header(default=None),
    ):
        actor = require_role("admin", x_admin_token, x_session_token)
        sid = uuid.uuid4().hex[:12]
        now_ts = dbmod.now()
        interval = max(10, int(body.interval_seconds))
        next_run = now_ts + interval
        conn.execute(
            "INSERT INTO schedules (id, name, tenant, device_id, interval_seconds, tool, args_json, last_run_at, next_run_at, enabled, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
            (
                sid,
                body.name,
                body.tenant,
                body.device_id,
                interval,
                body.tool,
                json.dumps(body.args),
                None,
                next_run,
                1 if body.enabled else 0,
                now_ts,
            ),
        )
        conn.commit()
        audit(actor, body.device_id or "", "create_schedule", {"schedule_id": sid, "name": body.name, "interval_seconds": interval}, "allowed", tenant=body.tenant)
        return {"schedule_id": sid, "status": "created", "next_run_at": next_run}

    @app.delete("/api/schedules/{schedule_id}")
    def delete_schedule(
        schedule_id: str,
        x_admin_token: str | None = Header(default=None),
        x_session_token: str | None = Header(default=None),
    ):
        actor = require_role("admin", x_admin_token, x_session_token)
        row = conn.execute("SELECT * FROM schedules WHERE id=?", (schedule_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Schedule not found.")
        conn.execute("DELETE FROM schedules WHERE id=?", (schedule_id,))
        conn.commit()
        audit(actor, row["device_id"] or "", "delete_schedule", {"schedule_id": schedule_id}, "allowed", tenant=row["tenant"])
        return {"schedule_id": schedule_id, "status": "deleted"}

    @app.post("/api/schedules/{schedule_id}/run-now")
    def run_schedule_now(
        schedule_id: str,
        x_admin_token: str | None = Header(default=None),
        x_session_token: str | None = Header(default=None),
    ):
        actor = require_role("operator", x_admin_token, x_session_token)
        row = conn.execute("SELECT * FROM schedules WHERE id=?", (schedule_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Schedule not found.")
        now_ts = dbmod.now()
        next_run = now_ts + max(10, int(row["interval_seconds"]))
        conn.execute("UPDATE schedules SET last_run_at=?, next_run_at=? WHERE id=?", (now_ts, next_run, schedule_id))
        conn.commit()
        args = json.loads(row["args_json"] or "{}")
        res = _execute_workflow_step_sync(row["tool"], args, row["device_id"], row["tenant"], f"schedule_manual:{row['name']}")
        audit(actor, row["device_id"] or "", "run_schedule_now", {"schedule_id": schedule_id}, "executed", tenant=row["tenant"])
        return {"schedule_id": schedule_id, "status": "executed", "result": res}

    # --- Phase 4: Visual Streaming, Dual Control & Fleet Auto-Updater ---
    app.state.latest_frames = {}
    app.state.webrtc_sessions = {}

    @app.get("/api/devices/{device_id}/desktop/frame")
    def get_desktop_frame(
        device_id: str,
        scale: float = 0.75,
        quality: int = 70,
        x_admin_token: str | None = Header(default=None),
        x_session_token: str | None = Header(default=None),
    ):
        require_role("viewer", x_admin_token, x_session_token)
        eff_p = Policy(allow_tier3=True, desktop_enabled=True, max_tier_unattended=4)

        if device_id == "local":
            try:
                frame = tools.capture_desktop_frame(scale=scale, quality=quality, approval_granted=True, policy=eff_p)
                app.state.latest_frames["local"] = frame
                return frame
            except Exception as exc:
                return {
                    "available": False,
                    "error": str(exc),
                    "note": "Desktop session not currently active or requires graphical display.",
                }

        cached = app.state.latest_frames.get(device_id)
        now_ts = time.time()
        if cached and (now_ts - cached.get("timestamp", 0)) < 2.5:
            return cached

        try:
            res = _execute_workflow_step_sync(
                "capture_desktop_frame",
                {"scale": scale, "quality": quality},
                device_id,
                "default",
                "desktop_stream",
            )
            if isinstance(res, dict) and res.get("base64_data"):
                app.state.latest_frames[device_id] = res
            return res
        except Exception as exc:
            if cached:
                return cached
            return {"available": False, "error": str(exc)}

    @app.post("/api/devices/{device_id}/desktop/input")
    def send_desktop_input(
        device_id: str,
        body: DesktopInputIn,
        x_admin_token: str | None = Header(default=None),
        x_session_token: str | None = Header(default=None),
    ):
        actor = require_role("operator", x_admin_token, x_session_token)
        abs_x, abs_y = None, None
        if body.x is not None and body.y is not None:
            if body.normalized and 0.0 <= body.x <= 1.0 and 0.0 <= body.y <= 1.0:
                abs_x = int(body.x * body.screen_width)
                abs_y = int(body.y * body.screen_height)
            else:
                abs_x = int(body.x)
                abs_y = int(body.y)

        action = body.action.lower()
        if action in ("click", "double_click", "triple_click", "right_click", "middle_click"):
            btn = "right" if action == "right_click" else ("middle" if action == "middle_click" else body.button)
            clicks = 2 if action == "double_click" else (3 if action == "triple_click" else body.clicks)
            res = _execute_workflow_step_sync(
                "mouse_click",
                {"x": abs_x, "y": abs_y, "button": btn, "clicks": clicks},
                device_id,
                "default",
                f"dual_control:{actor}",
            )
        elif action == "move":
            res = _execute_workflow_step_sync(
                "mouse_move",
                {"x": abs_x, "y": abs_y},
                device_id,
                "default",
                f"dual_control:{actor}",
            )
        elif action == "scroll":
            res = _execute_workflow_step_sync(
                "mouse_scroll",
                {"delta": body.delta, "x": abs_x, "y": abs_y},
                device_id,
                "default",
                f"dual_control:{actor}",
            )
        elif action == "type":
            res = _execute_workflow_step_sync(
                "keyboard_type",
                {"text": body.text or ""},
                device_id,
                "default",
                f"dual_control:{actor}",
            )
        elif action in ("press", "hotkey"):
            res = _execute_workflow_step_sync(
                "press_hotkey",
                {"combo": body.key or ""},
                device_id,
                "default",
                f"dual_control:{actor}",
            )
        else:
            raise HTTPException(status_code=400, detail=f"Unsupported input action: {action}")

        audit(actor, device_id, f"dual_control_{action}", {"x": abs_x, "y": abs_y, "key": body.key, "text": bool(body.text)}, "executed")
        return {"ok": True, "action": action, "x": abs_x, "y": abs_y, "result": res}

    # --- WebRTC desktop streaming (signaling only; media is peer-to-peer) ---
    def _webrtc_sessions() -> dict:
        return app.state.__dict__.setdefault("webrtc_sessions", {})

    def _get_webrtc_session(device_id: str, session_id: str) -> dict:
        sess = _webrtc_sessions().get(session_id)
        if sess is None or sess.get("device_id") != device_id:
            raise HTTPException(status_code=404, detail="WebRTC session not found.")
        if time.time() - float(sess.get("created_at", 0)) > 600:
            sess["status"] = "ended"
            raise HTTPException(status_code=410, detail="WebRTC session expired.")
        return sess

    def _queue_webrtc_task(device_id: str, session_id: str, scale: float, fps: int, tool: str = "start_webrtc_stream") -> None:
        dev_row = conn.execute("SELECT * FROM devices WHERE id=? AND revoked=0", (device_id,)).fetchone()
        if dev_row is None:
            raise HTTPException(status_code=404, detail="Device not found.")
        tier = TOOL_TIERS.get(tool)
        t_val = tier.value if tier else 3
        task_id = uuid.uuid4().hex[:12]
        now_ts = dbmod.now()
        conn.execute(
            "INSERT INTO tasks (id, device_id, tenant, tool, args_json, tier, status, created_at, updated_at) VALUES (?,?,?,?,?,?,'queued',?,?)",
            (task_id, device_id, "default", tool,
             json.dumps({"session_id": session_id, "scale": scale, "fps": fps}), t_val, now_ts, now_ts),
        )
        conn.commit()
        notify_tasks()

    @app.post("/api/devices/{device_id}/desktop/webrtc/session")
    def create_webrtc_session(
        device_id: str,
        body: dict = Body(default={}),
        x_admin_token: str | None = Header(default=None),
        x_session_token: str | None = Header(default=None),
    ):
        actor = require_role("viewer", x_admin_token, x_session_token)
        scale = max(0.2, min(1.0, float(body.get("scale", 0.75))))
        fps = max(1, min(30, int(body.get("fps", 10))))
        session_id = uuid.uuid4().hex[:12]
        sess = {
            "id": session_id, "device_id": device_id, "status": "waiting",
            "offer": None, "answer": None, "agent_candidates": [], "viewer_candidates": [],
            "created_at": time.time(), "scale": scale, "fps": fps, "error": None,
        }
        _webrtc_sessions()[session_id] = sess
        audit(actor, device_id, "start_webrtc_stream", {"session_id": session_id}, "allowed")
        if device_id == "local":
            try:
                from ai_bridge import webrtc_stream

                webrtc_stream.start_stream(session_id, webrtc_stream.DictSignaling(sess), scale=scale, fps=fps)
            except Exception as exc:
                sess["status"] = "error"
                sess["error"] = str(exc)
        else:
            _queue_webrtc_task(device_id, session_id, scale, fps)
        return {"session_id": session_id, "status": sess["status"], "scale": scale, "fps": fps}

    @app.get("/api/devices/{device_id}/desktop/webrtc/{session_id}")
    def get_webrtc_session(
        device_id: str, session_id: str,
        x_admin_token: str | None = Header(default=None),
        x_session_token: str | None = Header(default=None),
    ):
        require_role("viewer", x_admin_token, x_session_token)
        sess = _get_webrtc_session(device_id, session_id)
        return {k: sess.get(k) for k in ("id", "device_id", "status", "offer", "answer", "agent_candidates", "viewer_candidates", "error", "scale", "fps")}

    @app.post("/api/devices/{device_id}/desktop/webrtc/{session_id}/answer")
    def post_webrtc_answer(
        device_id: str, session_id: str, body: dict = Body(default={}),
        x_admin_token: str | None = Header(default=None),
        x_session_token: str | None = Header(default=None),
    ):
        require_role("viewer", x_admin_token, x_session_token)
        sess = _get_webrtc_session(device_id, session_id)
        sess["answer"] = {"sdp": body.get("sdp"), "type": body.get("type", "answer")}
        sess["status"] = "answered"
        return {"ok": True}

    @app.post("/api/devices/{device_id}/desktop/webrtc/{session_id}/candidates")
    def post_webrtc_viewer_candidate(
        device_id: str, session_id: str, body: dict = Body(default={}),
        x_admin_token: str | None = Header(default=None),
        x_session_token: str | None = Header(default=None),
    ):
        require_role("viewer", x_admin_token, x_session_token)
        sess = _get_webrtc_session(device_id, session_id)
        if body.get("candidate"):
            sess.setdefault("viewer_candidates", []).append(body["candidate"])
        return {"ok": True}

    @app.delete("/api/devices/{device_id}/desktop/webrtc/{session_id}")
    def end_webrtc_session(
        device_id: str, session_id: str,
        x_admin_token: str | None = Header(default=None),
        x_session_token: str | None = Header(default=None),
    ):
        require_role("viewer", x_admin_token, x_session_token)
        sess = _get_webrtc_session(device_id, session_id)
        sess["status"] = "ended"
        if device_id != "local":
            try:
                _queue_webrtc_task(device_id, session_id, 0.75, 10, tool="stop_webrtc_stream")
            except Exception:
                pass
        else:
            try:
                from ai_bridge import webrtc_stream

                webrtc_stream.stop_stream(session_id)
            except Exception:
                pass
        return {"ok": True, "status": "ended"}

    @app.get("/api/agent/webrtc/{session_id}")
    def agent_get_webrtc_session(session_id: str, x_device_token: str | None = Header(default=None)):
        row = device_row(x_device_token)
        sess = _webrtc_sessions().get(session_id)
        if sess is None or sess.get("device_id") != row["id"]:
            raise HTTPException(status_code=404, detail="WebRTC session not found.")
        return {k: sess.get(k) for k in ("id", "device_id", "status", "offer", "answer", "agent_candidates", "viewer_candidates", "error", "scale", "fps", "created_at")}

    @app.post("/api/agent/webrtc/{session_id}/offer")
    def agent_post_webrtc_offer(session_id: str, body: dict = Body(default={}), x_device_token: str | None = Header(default=None)):
        row = device_row(x_device_token)
        sess = _webrtc_sessions().get(session_id)
        if sess is None or sess.get("device_id") != row["id"]:
            raise HTTPException(status_code=404, detail="WebRTC session not found.")
        sess["offer"] = {"sdp": body.get("sdp"), "type": body.get("type", "offer")}
        sess["status"] = "offered"
        return {"ok": True}

    @app.post("/api/agent/webrtc/{session_id}/candidates")
    def agent_post_webrtc_candidate(session_id: str, body: dict = Body(default={}), x_device_token: str | None = Header(default=None)):
        row = device_row(x_device_token)
        sess = _webrtc_sessions().get(session_id)
        if sess is None or sess.get("device_id") != row["id"]:
            raise HTTPException(status_code=404, detail="WebRTC session not found.")
        if body.get("candidate"):
            sess.setdefault("agent_candidates", []).append(body["candidate"])
        return {"ok": True}

    @app.post("/api/agent/webrtc/{session_id}/error")
    def agent_post_webrtc_error(session_id: str, body: dict = Body(default={}), x_device_token: str | None = Header(default=None)):
        row = device_row(x_device_token)
        sess = _webrtc_sessions().get(session_id)
        if sess is None or sess.get("device_id") != row["id"]:
            raise HTTPException(status_code=404, detail="WebRTC session not found.")
        sess["status"] = "error"
        sess["error"] = body.get("error", "Stream failed.")
        return {"ok": True}

    @app.get("/api/fleet/version")
    def get_fleet_version(
        x_admin_token: str | None = Header(default=None),
        x_session_token: str | None = Header(default=None),
    ):
        require_role("viewer", x_admin_token, x_session_token)
        import subprocess
        git_commit = "unknown"
        git_branch = "main"
        try:
            c_proc = subprocess.run(["git", "rev-parse", "--short", "HEAD"], capture_output=True, text=True, timeout=5)
            if c_proc.returncode == 0:
                git_commit = c_proc.stdout.strip()
            b_proc = subprocess.run(["git", "rev-parse", "--abbrev-ref", "HEAD"], capture_output=True, text=True, timeout=5)
            if b_proc.returncode == 0:
                git_branch = b_proc.stdout.strip()
        except Exception:
            pass

        return {
            "control_plane_version": "1.30.0",
            "git_commit": git_commit,
            "git_branch": git_branch,
            "system_time": time.time(),
        }

    @app.post("/api/fleet/update")
    def update_fleet(
        target_os: str | None = None,
        x_admin_token: str | None = Header(default=None),
        x_session_token: str | None = Header(default=None),
    ):
        actor = require_role("admin", x_admin_token, x_session_token)
        b_res = broadcast_fleet_command(
            FleetBroadcastIn(tool="update_fleet_agent", args={}, target_os=target_os),
            x_admin_token=x_admin_token,
            x_session_token=x_session_token,
        )
        audit(actor, "fleet", "update_fleet", {"batch_id": b_res.get("batch_id"), "target_os": target_os}, "executed")
        return b_res

    @app.post("/api/devices/{device_id}/update")
    def update_device(
        device_id: str,
        x_admin_token: str | None = Header(default=None),
        x_session_token: str | None = Header(default=None),
    ):
        actor = require_role("admin", x_admin_token, x_session_token)
        if device_id == "local":
            res = _execute_workflow_step_sync("update_fleet_agent", {}, "local", "default", f"manual_update:{actor}")
            audit(actor, "local", "update_device_agent", {"result": res}, "executed")
            return {"device_id": "local", "status": "updated", "result": res}

        dev_row = conn.execute("SELECT * FROM devices WHERE id=? AND revoked=0", (device_id,)).fetchone()
        if not dev_row:
            raise HTTPException(status_code=404, detail="Device not found.")

        task_id = f"upd-{uuid.uuid4().hex[:8]}"
        now_ts = dbmod.now()
        tier = TOOL_TIERS.get("update_fleet_agent")
        t_val = tier.value if tier else 3
        conn.execute(
            "INSERT INTO tasks (id, device_id, tenant, tool, args_json, tier, status, created_at, updated_at) VALUES (?,?,?,?,?,?,'queued',?,?)",
            (task_id, device_id, dev_row["tenant"], "update_fleet_agent", "{}", t_val, now_ts, now_ts),
        )
        conn.commit()
        notify_tasks()
        audit(actor, device_id, "update_device_agent", {"task_id": task_id}, "queued", tenant=dev_row["tenant"])
        return {"device_id": device_id, "status": "queued", "task_id": task_id}

    # --- Settings: Webhook notifications ----------------------------------
    @app.get("/api/settings/webhook")
    def get_webhook_setting(x_admin_token: str | None = Header(default=None), x_session_token: str | None = Header(default=None)):
        require_admin(x_admin_token, x_session_token)
        url = get_webhook_url()
        return {"webhook_url": url, "configured": bool(url)}

    @app.post("/api/settings/webhook")
    def set_webhook_setting(body: WebhookIn, x_admin_token: str | None = Header(default=None), x_session_token: str | None = Header(default=None)):
        actor = require_role("admin", x_admin_token, x_session_token)
        url = (body.webhook_url or "").strip()
        if url:
            _validate_webhook_url(url)
        conn.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('webhook_url', ?)", (url,))
        conn.commit()
        audit(actor, "", "set_webhook", {"configured": bool(url)}, "allowed")
        return {"webhook_url": url, "configured": bool(url)}

    @app.post("/api/settings/webhook/test")
    def test_webhook_setting(x_admin_token: str | None = Header(default=None), x_session_token: str | None = Header(default=None)):
        require_role("admin", x_admin_token, x_session_token)
        url = get_webhook_url()
        if not url:
            raise HTTPException(status_code=400, detail="No webhook URL configured.")
        _validate_webhook_url(url)
        res = send_webhook_notification(
            url,
            {
                "event": "webhook_test",
                "approval_id": "test-approval",
                "task_id": "test-task",
                "device_id": "test-device",
                "device_name": "test-device",
                "tool": "test_webhook",
                "tier": 3,
                "args": {"test": True},
            },
            admin_token=token,
            public_base_url=get_public_base_url(),
        )
        return res

    # --- Auth: local users / sessions ------------------------------------
    @app.post("/api/auth/login")
    def login(body: LoginIn):
        user = conn.execute("SELECT * FROM users WHERE username=? AND disabled=0", (body.username,)).fetchone()
        if user is None:
            authmod.verify_password(body.password, _DUMMY_SALT, _DUMMY_HASH)
            raise HTTPException(status_code=401, detail="Invalid username or password.")
        if not authmod.verify_password(body.password, user["salt"], user["password_hash"]):
            raise HTTPException(status_code=401, detail="Invalid username or password.")
        session_token = secrets.token_urlsafe(32)
        expires = dbmod.now() + 8 * 3600
        conn.execute("INSERT INTO sessions (token_hash, username, role, expires_at, created_at) VALUES (?,?,?,?,?)",
                     (dbmod.hash_token(session_token), user["username"], user["role"], expires, dbmod.now()))
        conn.commit()
        audit(user["username"], "", "login", {}, "allowed")
        return {"session_token": session_token, "username": user["username"], "role": user["role"], "expires_at": expires}

    @app.get("/api/auth/me")
    def me(x_admin_token: str | None = Header(default=None), x_session_token: str | None = Header(default=None)):
        actor, role = auth_context(x_admin_token, x_session_token)
        return {"username": actor, "role": role}

    @app.post("/api/auth/logout")
    def logout(x_session_token: str | None = Header(default=None)):
        if not x_session_token:
            raise HTTPException(status_code=401, detail="Session token required.")
        cur = conn.execute("DELETE FROM sessions WHERE token_hash=?", (dbmod.hash_token(x_session_token),))
        conn.commit()
        if not cur.rowcount:
            raise HTTPException(status_code=401, detail="Invalid or expired session.")
        return {"logged_out": True}

    # --- Auth: OIDC (dormant unless AI_BRIDGE_OIDC_* are set) ------------
    @app.get("/api/auth/oidc/configured")
    def oidc_configured():
        from . import oidc as oidcmod

        return {"enabled": oidcmod.oidc_config() is not None}

    @app.get("/api/auth/oidc/login")
    def oidc_login():
        from fastapi.responses import RedirectResponse

        from . import oidc as oidcmod

        if oidcmod.oidc_config() is None:
            raise HTTPException(status_code=400, detail="OIDC is not configured.")
        url, _, _ = oidcmod.new_login()
        return RedirectResponse(url, status_code=302)

    @app.get("/api/auth/oidc/callback")
    def oidc_callback(code: str = "", state: str = ""):
        from urllib.parse import urlencode

        import httpx
        from fastapi.responses import RedirectResponse

        from . import oidc as oidcmod

        cfg = oidcmod.oidc_config()
        if cfg is None:
            raise HTTPException(status_code=400, detail="OIDC is not configured.")
        pending = oidcmod.pop_pending(state)
        if pending is None or not code:
            raise HTTPException(status_code=400, detail="Invalid or expired login attempt.")
        try:
            doc = oidcmod.discovery()
            resp = httpx.post(
                doc["token_endpoint"],
                data={
                    "grant_type": "authorization_code",
                    "code": code,
                    "redirect_uri": cfg["redirect_uri"],
                    "client_id": cfg["client_id"],
                    "client_secret": cfg["client_secret"],
                },
                timeout=15,
            )
            if resp.status_code != 200:
                raise HTTPException(status_code=401, detail="OIDC code exchange failed.")
            tokens = resp.json()
            claims = oidcmod.verify_id_token(tokens["id_token"], pending["nonce"])
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(status_code=401, detail=f"OIDC token verification failed: {exc}") from exc

        email_verified = bool(claims.get("email_verified"))
        email = claims.get("email")
        if email and email_verified:
            username = str(email)[:200]
        else:
            sub = claims.get("sub") or claims.get("preferred_username")
            if not sub:
                raise HTTPException(status_code=400, detail="No usable identity in ID token.")
            username = f"oidc:{sub}"[:200]

        with conn.transaction():
            user = conn.execute("SELECT * FROM users WHERE username=?", (username,)).fetchone()
            if user is not None and user["disabled"]:
                raise HTTPException(status_code=403, detail="User account is disabled.")
            if user is None:
                conn.execute(
                    "INSERT INTO users (id, username, password_hash, salt, role, created_at) VALUES (?,?,?,?,?,?)",
                    (uuid.uuid4().hex[:12], username, "oidc-only-" + secrets.token_hex(16), authmod.new_salt(), "viewer", dbmod.now()),
                )
                user = conn.execute("SELECT * FROM users WHERE username=?", (username,)).fetchone()
            session_token = secrets.token_urlsafe(32)
            expires = dbmod.now() + 8 * 3600
            conn.execute(
                "INSERT INTO sessions (token_hash, username, role, expires_at, created_at) VALUES (?,?,?,?,?)",
                (dbmod.hash_token(session_token), user["username"], user["role"], expires, dbmod.now()),
            )
            audit(user["username"], "", "oidc_login", {}, "allowed")

        dashboard = cfg["dashboard_url"].rstrip("/") + "/"
        return RedirectResponse(dashboard + "#" + urlencode({"session_token": session_token}), status_code=302)

    @app.post("/api/auth/users")
    def create_user(body: UserIn, x_admin_token: str | None = Header(default=None), x_session_token: str | None = Header(default=None)):
        with conn.transaction():
            existing = conn.execute("SELECT COUNT(*) AS n FROM users").fetchone()["n"]
            allow_bootstrap = bool(os.environ.get("AI_BRIDGE_ALLOW_BOOTSTRAP"))
            if (token and not allow_bootstrap) or existing > 0:
                actor = require_admin(x_admin_token, x_session_token)
            else:
                actor = "bootstrap"
            if body.role not in authmod.ROLES:
                raise HTTPException(status_code=400, detail=f"Unknown role: {body.role}")
            salt = authmod.new_salt()
            try:
                conn.execute("INSERT INTO users (id, username, password_hash, salt, role, created_at) VALUES (?,?,?,?,?,?)",
                             (uuid.uuid4().hex[:12], body.username, authmod.hash_password(body.password, salt), salt, body.role, dbmod.now()))
            except Exception:
                raise HTTPException(status_code=400, detail="Username already exists.")
            audit(actor, "", "create_user", {"username": body.username, "role": body.role}, "allowed")
        return {"username": body.username, "role": body.role}

    @app.get("/api/auth/users")
    def list_users(x_admin_token: str | None = Header(default=None), x_session_token: str | None = Header(default=None)):
        require_admin(x_admin_token, x_session_token)
        rows = conn.execute("SELECT username, role, created_at, disabled FROM users").fetchall()
        return [dict(r) for r in rows]

    # --- Policy versioning -------------------------------------------------
    @app.post("/api/policies")
    def create_policy(body: PolicyIn, x_admin_token: str | None = Header(default=None), x_session_token: str | None = Header(default=None)):
        actor = require_role("admin", x_admin_token, x_session_token)
        row = conn.execute("SELECT MAX(version) AS v FROM policies").fetchone()
        version = (row["v"] or 0) + 1
        policy = body.model_dump()
        conn.execute("INSERT INTO policies (version, policy_json, created_by, created_at, note) VALUES (?,?,?,?,?)",
                     (version, json.dumps(policy), actor, dbmod.now(), body.note))
        conn.commit()
        audit(actor, "", "create_policy", {"version": version}, "allowed")
        return {"version": version, "policy": policy}

    @app.get("/api/policies")
    def get_policy(x_admin_token: str | None = Header(default=None), x_session_token: str | None = Header(default=None)):
        require_role("viewer", x_admin_token, x_session_token)
        row = conn.execute("SELECT version, policy_json FROM policies ORDER BY version DESC LIMIT 1").fetchone()
        if row is None:
            return {"version": 0, "policy": get_current_policy(), "note": "No versioned policy yet; environment defaults apply."}
        return {"version": row["version"], "policy": json.loads(row["policy_json"])}

    @app.get("/api/policies/history")
    def policy_history(x_admin_token: str | None = Header(default=None), x_session_token: str | None = Header(default=None)):
        require_role("viewer", x_admin_token, x_session_token)
        rows = conn.execute("SELECT version, policy_json, created_by, created_at, note FROM policies ORDER BY version DESC LIMIT 100").fetchall()
        return [dict(r) for r in rows]

    @app.post("/api/policies/simulate")
    def simulate_policy(body: PolicyIn, x_admin_token: str | None = Header(default=None), x_session_token: str | None = Header(default=None)):
        require_role("admin", x_admin_token, x_session_token)
        current = get_current_policy()
        scenarios = []
        for tool, tier in sorted(TOOL_TIERS.items()):
            requires_approval = tier.value >= 4 or (tier.value == 3 and not body.allow_tier3)
            scenarios.append({"tool": tool, "tier": tier.value, "allowed_unattended": not requires_approval,
                              "requires_approval": requires_approval})
        return {"current_policy": current, "proposed_policy": body.model_dump(), "tools": scenarios}

    @app.put("/api/policies/{version}")
    def update_policy_version(version: int, body: PolicyIn, x_admin_token: str | None = Header(default=None), x_session_token: str | None = Header(default=None)):
        actor = require_role("admin", x_admin_token, x_session_token)
        row = conn.execute("SELECT * FROM policies WHERE version=?", (version,)).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Policy version not found.")
        policy = body.model_dump()
        conn.execute(
            "UPDATE policies SET policy_json=?, note=? WHERE version=?",
            (json.dumps(policy), body.note, version),
        )
        conn.commit()
        audit(actor, "", "update_policy", {"version": version}, "allowed")
        return {"version": version, "policy": policy, "note": body.note}

    @app.delete("/api/policies/{version}")
    def delete_policy_version(version: int, x_admin_token: str | None = Header(default=None), x_session_token: str | None = Header(default=None)):
        actor = require_role("admin", x_admin_token, x_session_token)
        cur = conn.execute("DELETE FROM policies WHERE version=?", (version,))
        conn.commit()
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Policy version not found.")
        audit(actor, "", "delete_policy", {"version": version}, "allowed")
        return {"version": version, "deleted": True}

    # --- Connections + logs (dashboard insight views) ---------------------
    @app.get("/api/connections")
    def connections(x_admin_token: str | None = Header(default=None), x_session_token: str | None = Header(default=None)):
        """Live connection status: MCP service, OAuth gateway, and the
        ChatGPT OAuth clients/tokens registered with the gateway.
        Token hashes are never returned, only counts and client metadata."""
        import socket
        import sqlite3

        require_role("viewer", x_admin_token, x_session_token)

        def tcp_up(port: int) -> bool:
            try:
                sock = socket.create_connection(("127.0.0.1", port), timeout=2)
                sock.close()
                return True
            except OSError:
                return False

        clients: list[dict] = []
        active_access = 0
        active_refresh = 0
        total_tokens = 0
        last_token_at = None
        db_path = os.environ.get("AI_BRIDGE_OAUTH_DB", "/etc/ai-bridge-oauth/oauth.db")
        try:
            odb = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
            odb.row_factory = sqlite3.Row
            for row in odb.execute("SELECT client_id, client_name, redirect_uris, created_at FROM clients ORDER BY created_at DESC"):
                clients.append({
                    "client_id": row["client_id"],
                    "client_id_prefix": row["client_id"][:16],
                    "client_name": row["client_name"],
                    "redirect_uris": row["redirect_uris"],
                    "created_at": row["created_at"],
                })
            now = dbmod.now()
            for row in odb.execute("SELECT kind, created_at, expires_at, revoked FROM tokens"):
                total_tokens += 1
                if row["revoked"] or row["expires_at"] < now:
                    continue
                if row["kind"] == "access":
                    active_access += 1
                elif row["kind"] == "refresh":
                    active_refresh += 1
                if last_token_at is None or row["created_at"] > last_token_at:
                    last_token_at = row["created_at"]
            odb.close()
        except Exception:
            pass
        return {
            "mcp": {"up": tcp_up(8001), "port": 8001},
            "oauth_gateway": {"up": tcp_up(8002), "port": 8002},
            "chatgpt": {
                "clients": clients,
                "active_access_tokens": active_access,
                "active_refresh_tokens": active_refresh,
                "total_tokens": total_tokens,
                "last_token_at": last_token_at,
            },
        }

    @app.put("/api/connections/clients/{client_id}")
    def update_oauth_client(client_id: str, body: OAuthClientUpdateIn, x_admin_token: str | None = Header(default=None), x_session_token: str | None = Header(default=None)):
        import sqlite3

        actor = require_role("admin", x_admin_token, x_session_token)
        oauth_db = os.environ.get("AI_BRIDGE_OAUTH_DB", "/etc/ai-bridge-oauth/oauth.db")
        try:
            odb = sqlite3.connect(oauth_db, timeout=10.0)
            odb.row_factory = sqlite3.Row
            row = odb.execute("SELECT * FROM clients WHERE client_id=?", (client_id,)).fetchone()
            if row is None:
                odb.close()
                raise HTTPException(status_code=404, detail="OAuth client not found.")
            cname = body.client_name.strip() if body.client_name is not None and body.client_name.strip() else row["client_name"]
            ruris = body.redirect_uris.strip() if body.redirect_uris is not None and body.redirect_uris.strip() else row["redirect_uris"]
            if body.redirect_uris is not None:
                uris = [u.strip() for u in ruris.splitlines() if u.strip()]
                if not uris or not all(_valid_oauth_redirect_uri(u) for u in uris):
                    odb.close()
                    raise HTTPException(status_code=400, detail="Invalid redirect_uris: all URIs must be https:// or http://localhost/127.0.0.1.")
                ruris = "\n".join(uris)
            odb.execute("UPDATE clients SET client_name=?, redirect_uris=? WHERE client_id=?", (cname, ruris, client_id))
            odb.commit()
            odb.close()
        except HTTPException:
            raise
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(status_code=500, detail=f"Failed to update OAuth client: {exc}") from exc
        audit(actor, "", "update_oauth_client", {"client_id": client_id[:16], "client_name": cname}, "allowed")
        return {"client_id": client_id, "client_name": cname, "redirect_uris": ruris}

    @app.delete("/api/connections/clients/{client_id}")
    def delete_oauth_client(client_id: str, x_admin_token: str | None = Header(default=None), x_session_token: str | None = Header(default=None)):
        import sqlite3

        actor = require_role("admin", x_admin_token, x_session_token)
        oauth_db = os.environ.get("AI_BRIDGE_OAUTH_DB", "/etc/ai-bridge-oauth/oauth.db")
        try:
            odb = sqlite3.connect(oauth_db, timeout=10.0)
            odb.execute("DELETE FROM tokens WHERE client_id=?", (client_id,))
            cur = odb.execute("DELETE FROM clients WHERE client_id=?", (client_id,))
            odb.commit()
            odb.close()
            if cur.rowcount == 0:
                raise HTTPException(status_code=404, detail="OAuth client not found.")
        except HTTPException:
            raise
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(status_code=500, detail=f"Failed to delete OAuth client: {exc}") from exc
        audit(actor, "", "delete_oauth_client", {"client_id": client_id[:16]}, "allowed")
        return {"client_id": client_id, "deleted": True}

    @app.get("/api/logs")
    def service_logs(service: str = "control", lines: int = 100, x_admin_token: str | None = Header(default=None), x_session_token: str | None = Header(default=None)):
        """Recent log tail for one service. Admin/operator viewers only in
        practice (viewer role + dashboard auth); lines are capped."""
        import collections
        import shutil
        import subprocess

        require_role("admin", x_admin_token, x_session_token)
        lines = max(10, min(int(lines), 200))
        units = {"control": "ai-bridge-control", "mcp": "ai-bridge-mcp", "oauth": "ai-bridge-oauth"}
        if service in units:
            journal = shutil.which("journalctl")
            if journal is None:
                return {"service": service, "lines": ["journalctl not available on this host."]}
            proc = subprocess.run([journal, "-u", units[service], "-n", str(lines), "--no-pager"],
                                  capture_output=True, text=True, timeout=15)
            return {"service": service, "lines": [redact(line) for line in (proc.stdout or "").splitlines()[-lines:]]}
        if service == "nginx":
            try:
                with open("/var/log/nginx/access.log", errors="replace") as handle:
                    tail = collections.deque(handle, maxlen=2000)
                wanted = [redact(line.rstrip("\n")) for line in tail if "/mcp" in line or "/api/" in line]
                return {"service": service, "lines": wanted[-lines:]}
            except OSError as exc:
                return {"service": service, "lines": [f"nginx access log unavailable: {exc}"]}
        raise HTTPException(status_code=400, detail="Unknown log service.")

    # --- Agent polling (outbound only) -----------------------------------
    @app.post("/api/agent/heartbeat")
    def heartbeat(body: dict = Body(default={}), x_device_token: str | None = Header(default=None)):
        row = device_row(x_device_token)
        now_ts = dbmod.now()
        hostname = (body.get("hostname") or "").strip() if isinstance(body, dict) else ""
        os_val = (body.get("os") or "").strip() if isinstance(body, dict) else ""
        if hostname or os_val:
            cur_h = hostname if hostname else (row["hostname"] or "")
            cur_os = os_val if os_val else (row["os"] or "")
            conn.execute("UPDATE devices SET status='online', last_seen=?, hostname=?, os=? WHERE id=?", (now_ts, cur_h, cur_os, row["id"]))
        else:
            conn.execute("UPDATE devices SET status='online', last_seen=? WHERE id=?", (now_ts, row["id"]))
        conn.commit()

        metrics = body.get("metrics") if isinstance(body, dict) else None
        if metrics and isinstance(metrics, dict):
            cpu_p = metrics.get("cpu_percent")
            mem_p = metrics.get("memory_percent")
            disk_p = metrics.get("disk_percent")
            conn.execute(
                "INSERT INTO telemetry (device_id, tenant, cpu_percent, memory_percent, disk_percent, recorded_at) VALUES (?, ?, ?, ?, ?, ?)",
                (row["id"], row["tenant"], cpu_p, mem_p, disk_p, now_ts),
            )
            conn.execute(
                "DELETE FROM telemetry WHERE device_id=? AND id NOT IN (SELECT id FROM telemetry WHERE device_id=? ORDER BY recorded_at DESC LIMIT 500)",
                (row["id"], row["id"]),
            )
            conn.commit()
            _evaluate_device_triggers(row, metrics, now_ts)

        return {
            "device_id": row["id"],
            "emergency_stop": app.state.emergency_stop,
            "token_expires_at": row["token_expires_at"],
        }

    @app.get("/api/agent/whoami")
    def whoami(x_device_token: str | None = Header(default=None)):
        # Read-only device-token check, for the OAuth gateway's device
        # binding step. Unlike heartbeat it touches no device state, so
        # validating a token never makes a device look freshly seen.
        row = device_row(x_device_token)
        return {"device_id": row["id"]}

    @app.get("/api/agent/policy")
    def get_agent_policy(x_device_token: str | None = Header(default=None)):
        row = device_row(x_device_token)
        custom_p = {}
        try:
            custom_p = json.loads(row["policy_json"]) if row["policy_json"] else {}
        except Exception:
            custom_p = {}
        eff = get_effective_device_policy(row)
        return {
            "device_id": row["id"],
            "custom_policy": custom_p,
            "effective_policy": eff,
            "has_custom_policy": bool(custom_p),
        }

    @app.put("/api/agent/policy")
    def update_agent_policy(body: DevicePolicyIn, x_device_token: str | None = Header(default=None)):
        row = device_row(x_device_token)
        policy_data = body.model_dump()
        conn.execute("UPDATE devices SET policy_json=? WHERE id=?", (json.dumps(policy_data), row["id"]))
        conn.commit()
        audit("device", row["id"], "agent_update_policy", policy_data, "allowed")
        eff = get_effective_device_policy(row)
        return {
            "device_id": row["id"],
            "custom_policy": policy_data,
            "effective_policy": eff,
            "saved": True,
        }

    @app.post("/api/agent/rotate")
    def rotate_token(x_device_token: str | None = Header(default=None)):
        row = device_row(x_device_token)
        new_token = secrets.token_urlsafe(32)
        issued = dbmod.now(); expires = issued + device_ttl_days * 86400
        conn.execute("UPDATE devices SET token_hash=?, token_issued_at=?, token_expires_at=? WHERE id=?",
                     (dbmod.hash_token(new_token), issued, expires, row["id"]))
        conn.commit()
        audit("device", row["id"], "rotate_token", {}, "allowed")
        return {"device_id": row["id"], "device_token": new_token, "token_expires_at": expires,
                "note": "Old token is invalid immediately. Store the new token securely."}

    @app.get("/api/agent/tasks/next")
    async def next_task(wait: float = 0.0, x_device_token: str | None = Header(default=None)):
        row = device_row(x_device_token)
        wait_sec = max(0.0, min(float(wait or 0.0), 25.0))
        deadline = time.time() + wait_sec
        task = None
        while True:
            if app.state.emergency_stop:
                return {"task": None, "emergency_stop": True}
            with conn.transaction():
                candidate = conn.execute(
                    "SELECT * FROM tasks WHERE device_id=? AND status='queued' ORDER BY created_at ASC LIMIT 1",
                    (row["id"],),
                ).fetchone()
                if candidate is not None:
                    cur = conn.execute(
                        "UPDATE tasks SET status='running', updated_at=? WHERE id=? AND status='queued'",
                        (dbmod.now(), candidate["id"]),
                    )
                    if cur.rowcount == 1:
                        task = candidate
                        break
            rem = deadline - time.time()
            if wait_sec <= 0 or rem <= 0:
                return {"task": None}
            await asyncio.sleep(min(0.15, rem))
        out = dict(task)
        # Tell the agent whether a human approved this task. Only approved records
        # that match the tool and have not expired grant approval.
        ap = out.get("approval_id")
        if ap:
            ap_row = conn.execute("SELECT status, expires_at, tool FROM approvals WHERE id=?", (ap,)).fetchone()
            now_ts = dbmod.now()
            out["approval_granted"] = bool(
                ap_row
                and ap_row["status"] == "approved"
                and (ap_row["expires_at"] is None or ap_row["expires_at"] > now_ts)
                and ap_row["tool"] == out["tool"]
            )
        else:
            out["approval_granted"] = False
        out["policy"] = get_effective_device_policy(row)
        return {"task": out}

    @app.post("/api/agent/tasks/{task_id}/result")
    def task_result(task_id: str, body: TaskResultIn, x_device_token: str | None = Header(default=None)):
        row = device_row(x_device_token)
        task = conn.execute("SELECT * FROM tasks WHERE id=? AND device_id=?", (task_id, row["id"])).fetchone()
        if task is None:
            raise HTTPException(status_code=404, detail="Task not found for this device.")
        if body.status not in {"completed", "failed", "cancelled", "timed_out"}:
            raise HTTPException(status_code=400, detail="Invalid result status.")
        conn.execute("UPDATE tasks SET status=?, result=?, updated_at=? WHERE id=?",
                     (body.status, body.result[:MAX_RESULT_CHARS], dbmod.now(), task_id))
        conn.commit()
        notify_tasks()
        audit("device", row["id"], task["tool"], json.loads(task["args_json"] or "{}"), body.status, body.result[:500], tenant=task["tenant"])
        return {"task_id": task_id, "status": body.status}

    @app.middleware("http")
    async def bearer_auth_normalization(request: Request, call_next):
        auth = request.headers.get("authorization")
        if auth and auth.strip().lower().startswith("bearer "):
            token_str = auth.strip()[7:].strip()
            raw_headers = list(request.scope.get("headers", []))
            hdr_keys = {h[0].lower() for h in raw_headers}
            if b"x-admin-token" not in hdr_keys and b"x-session-token" not in hdr_keys:
                raw_headers.append((b"x-admin-token", token_str.encode("utf-8")))
                raw_headers.append((b"x-session-token", token_str.encode("utf-8")))
                request.scope["headers"] = raw_headers
                request._headers = Headers(scope=request.scope)
        return await call_next(request)

    @app.middleware("http")
    async def rate_limit_middleware(request: Request, call_next):
        client_ip = request.client.host if request.client else "anon"
        path = request.url.path
        if path in ("/api/auth/login", "/api/auth/oidc/login", "/api/auth/oidc/callback"):
            key = f"auth:{client_ip}"
            limit = 30
        else:
            admin_hdr = request.headers.get("x-admin-token")
            dev_hdr = request.headers.get("x-device-token")
            sess_hdr = request.headers.get("x-session-token")
            auth_hdr = request.headers.get("authorization")
            token_val = admin_hdr or dev_hdr or sess_hdr or auth_hdr
            key = f"tok:{dbmod.hash_token(token_val)[:16]}" if token_val else f"ip:{client_ip}"
            limit = 120
        with _RATE_LOCK:
            if len(_RATE) > 4096:
                _RATE.clear()
        try:
            _rate_limit(key, limit=limit)
        except HTTPException as exc:
            return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})
        return await call_next(request)

    from . import ai_api
    ai_api.attach_ai_routes(
        app,
        conn,
        task_cond,
        notify_tasks,
        auth_context,
        require_role,
        get_effective_device_policy,
        audit,
    )

    return app
