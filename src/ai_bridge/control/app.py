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
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from ..policy import TOOL_TIERS
from ..security import redact, redact_obj
from . import auth as authmod
from . import db as dbmod

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


def send_webhook_notification(webhook_url: str, event: dict, timeout: int = 10) -> dict:
    """Send a JSON notification to a Slack, Discord, Telegram Bot, or generic webhook URL."""
    url = (webhook_url or "").strip()
    if not url:
        return {"ok": False, "error": "No webhook URL configured."}
    try:
        _validate_webhook_url(url)
    except HTTPException as exc:
        return {"ok": False, "error": exc.detail}
    safe_args = redact_obj(event.get("args") or {})
    text = (
        f"[AI Bridge Approval Required]\n"
        f"Tool: {event.get('tool')} (Tier {event.get('tier')})\n"
        f"Device: {event.get('device_name') or event.get('device_id')}\n"
        f"Task ID: {event.get('task_id')}\n"
        f"Approval ID: {event.get('approval_id')}\n"
        f"Args: {json.dumps(safe_args)[:300]}"
    )
    payload: dict = {
        "text": text,
        "content": text,
        "event": event.get("event", "approval_requested"),
        "approval_id": event.get("approval_id"),
        "task_id": event.get("task_id"),
        "device_id": event.get("device_id"),
        "device_name": event.get("device_name"),
        "tool": event.get("tool"),
        "tier": event.get("tier"),
        "args": safe_args,
    }
    parsed = urllib.parse.urlparse(url)
    if "api.telegram.org" in (parsed.netloc or ""):
        qs = urllib.parse.parse_qs(parsed.query)
        if "chat_id" in qs and qs["chat_id"]:
            payload["chat_id"] = qs["chat_id"][0]
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

    def auth_context(x_admin_token: str | None, x_session_token: str | None = None):
        """Return (actor, role). Session tokens outrank the legacy admin token."""
        if x_session_token:
            row = conn.execute("SELECT * FROM sessions WHERE token_hash=?", (dbmod.hash_token(x_session_token),)).fetchone()
            if row is None or row["expires_at"] < dbmod.now():
                raise HTTPException(status_code=401, detail="Invalid or expired session.")
            user = conn.execute("SELECT * FROM users WHERE username=? AND disabled=0", (row["username"],)).fetchone()
            if user is None:
                raise HTTPException(status_code=401, detail="User disabled or deleted.")
            return user["username"], user["role"]
        if token and authmod.legacy_admin_enabled() and x_admin_token and hmac.compare_digest(x_admin_token, token):
            return "admin-token", "admin"
        raise HTTPException(status_code=401, detail="Authentication required.")

    def require_role(min_role: str, x_admin_token: str | None, x_session_token: str | None = None):
        actor, role = auth_context(x_admin_token, x_session_token)
        if authmod.ROLES.get(role, 0) < authmod.ROLES[min_role]:
            raise HTTPException(status_code=403, detail=f"Role '{role}' cannot perform this action (requires {min_role}).")
        return actor

    def require_admin(x_admin_token: str | None, x_session_token: str | None = None):
        return require_role("admin", x_admin_token, x_session_token)

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
            denied.update(["capture_desktop_screenshot", "launch_approved_application", "perform_approved_ui_action"])
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
        conn.execute("INSERT INTO devices (id, name, hostname, os, tenant, token_hash, created_at, token_issued_at, token_expires_at) VALUES (?,?,?,?,?,?,?,?,?)",
                     (device_id, body.name, body.hostname, body.os, body.tenant, dbmod.hash_token(device_token), issued, issued, expires))
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
    def set_device_policy_api(device_id: str, body: DevicePolicyIn, x_admin_token: str | None = Header(default=None), x_session_token: str | None = Header(default=None)):
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
    def reset_device_policy_api(device_id: str, x_admin_token: str | None = Header(default=None), x_session_token: str | None = Header(default=None)):
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
    def submit_task(body: TaskIn, x_admin_token: str | None = Header(default=None), x_session_token: str | None = Header(default=None)):
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

        needs_approval = False
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
                threading.Thread(target=send_webhook_notification, args=(wh_url, evt), daemon=True).start()
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
        res = send_webhook_notification(url, {
            "event": "webhook_test",
            "approval_id": "test-approval",
            "task_id": "test-task",
            "device_id": "test-device",
            "device_name": "test-device",
            "tool": "test_webhook",
            "tier": 3,
            "args": {"test": True},
        })
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
            token_val = admin_hdr or dev_hdr or sess_hdr
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

    return app
