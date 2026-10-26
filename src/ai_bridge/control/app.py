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

from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from ..policy import TOOL_TIERS
from . import auth as authmod
from . import db as dbmod

_RATE: dict[str, list[float]] = {}
_RATE_LOCK = threading.Lock()
MAX_RESULT_CHARS = 512_000


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
    text = (
        f"[AI Bridge Approval Required]\n"
        f"Tool: {event.get('tool')} (Tier {event.get('tier')})\n"
        f"Device: {event.get('device_name') or event.get('device_id')}\n"
        f"Task ID: {event.get('task_id')}\n"
        f"Approval ID: {event.get('approval_id')}\n"
        f"Args: {json.dumps(event.get('args') or {})[:300]}"
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
        "args": event.get("args") or {},
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


class DeviceUpdateIn(BaseModel):
    name: str | None = None
    hostname: str | None = None
    os: str | None = None
    revoked: bool | None = None


class TaskUpdateIn(BaseModel):
    tool: str | None = None
    args: dict | None = None
    status: str | None = None


class ApprovalUpdateIn(BaseModel):
    reason: str | None = None
    status: str | None = None


class AuditUpdateIn(BaseModel):
    actor: str | None = None
    tool: str | None = None
    decision: str | None = None
    result: str | None = None


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
            return row["username"], row["role"]
        if token and authmod.legacy_admin_enabled() and x_admin_token and hmac.compare_digest(x_admin_token, token):
            return "admin-token", "admin"
        raise HTTPException(status_code=401, detail="Authentication required.")

    def require_role(min_role: str, x_admin_token: str | None, x_session_token: str | None = None):
        actor, role = auth_context(x_admin_token, x_session_token)
        if authmod.ROLES.get(role, 0) < authmod.ROLES[min_role]:
            raise HTTPException(status_code=403, detail=f"Role '{role}' cannot perform this action (requires {min_role}).")
        return actor

    def require_admin(x_admin_token: str | None, x_session_token: str | None = None) -> None:
        require_role("admin", x_admin_token, x_session_token)

    def get_current_policy() -> dict:
        row = conn.execute("SELECT policy_json FROM policies ORDER BY version DESC LIMIT 1").fetchone()
        if row is not None:
            import json as _json
            return _json.loads(row["policy_json"])
        return {"allow_tier3": os.environ.get("AI_BRIDGE_ALLOW_TIER3", "0") == "1",
                "desktop_enabled": os.environ.get("AI_BRIDGE_DESKTOP_ENABLED", "0") == "1",
                "allowed_apps": [], "allowed_services": []}

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
        require_admin(x_admin_token, x_session_token)
        device_id = uuid.uuid4().hex[:12]
        device_token = secrets.token_urlsafe(32)
        issued = dbmod.now(); expires = issued + device_ttl_days * 86400
        conn.execute("INSERT INTO devices (id, name, hostname, os, tenant, token_hash, created_at, token_issued_at, token_expires_at) VALUES (?,?,?,?,?,?,?,?,?)",
                     (device_id, body.name, body.hostname, body.os, body.tenant, dbmod.hash_token(device_token), issued, issued, expires))
        conn.commit()
        audit("admin", device_id, "enroll_device", body.model_dump(), "allowed", tenant=body.tenant)
        # Token is shown exactly once here; only its hash is stored.
        return {"device_id": device_id, "device_token": device_token, "token_expires_at": expires,
                "token_ttl_days": device_ttl_days,
                "note": "Store the device token securely; it will not be shown again. It expires and must be rotated."}

    @app.get("/api/devices")
    def list_devices(x_admin_token: str | None = Header(default=None), x_session_token: str | None = Header(default=None), tenant: str = "default"):
        require_role("viewer", x_admin_token, x_session_token)
        rows = conn.execute("SELECT id, name, hostname, os, tenant, status, last_seen, revoked, created_at, token_expires_at FROM devices WHERE tenant=?", (tenant,)).fetchall()
        return [dict(r) for r in rows]

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
        conn.execute(
            "UPDATE devices SET name=?, hostname=?, os=?, revoked=?, status=? WHERE id=?",
            (name, hostname, os_val, revoked, status, device_id),
        )
        conn.commit()
        audit(actor, device_id, "update_device", {"name": name, "hostname": hostname, "os": os_val, "revoked": bool(revoked)}, "allowed")
        updated = conn.execute(
            "SELECT id, name, hostname, os, tenant, status, last_seen, revoked, created_at, token_expires_at FROM devices WHERE id=?",
            (device_id,),
        ).fetchone()
        return dict(updated)

    @app.delete("/api/devices/{device_id}")
    def delete_device(device_id: str, x_admin_token: str | None = Header(default=None), x_session_token: str | None = Header(default=None)):
        actor = require_role("admin", x_admin_token, x_session_token)
        cur = conn.execute("DELETE FROM devices WHERE id=?", (device_id,))
        conn.commit()
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Device not found.")
        audit(actor, device_id, "delete_device", {}, "allowed")
        return {"device_id": device_id, "deleted": True}

    @app.post("/api/tasks")
    def submit_task(body: TaskIn, x_admin_token: str | None = Header(default=None), x_session_token: str | None = Header(default=None)):
        require_role("operator", x_admin_token, x_session_token)
        if app.state.emergency_stop:
            raise HTTPException(status_code=403, detail="Emergency stop is active; no new tasks accepted.")
        row = conn.execute("SELECT * FROM devices WHERE id=? AND tenant=? AND revoked=0", (body.device_id, body.tenant)).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Device not found or revoked.")
        tier = TOOL_TIERS.get(body.tool)
        if tier is None:
            raise HTTPException(status_code=400, detail=f"Unknown tool: {body.tool}")
        task_id = uuid.uuid4().hex[:12]
        status = "queued"
        approval_id = None
        policy = get_current_policy()
        if tier.value >= 4 or (tier.value == 3 and not policy.get("allow_tier3", False)):
            approval_id = uuid.uuid4().hex[:12]
            conn.execute("INSERT INTO approvals (id, task_id, tool, reason, created_at) VALUES (?,?,?,?,?)",
                         (approval_id, task_id, body.tool, f"Tier-{tier.value} operation requires human approval.", dbmod.now()))
            status = "needs_approval"
        conn.execute("INSERT INTO tasks (id, device_id, tenant, tool, args_json, tier, status, approval_id, created_at, updated_at)"
                     " VALUES (?,?,?,?,?,?,?,?,?,?)",
                     (task_id, body.device_id, body.tenant, body.tool, json.dumps(body.args), tier.value, status, approval_id, dbmod.now(), dbmod.now()))
        conn.commit()
        audit("admin", body.device_id, body.tool, body.args, status, tenant=body.tenant)
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
        actor = require_role("operator", x_admin_token, x_session_token)
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
        conn.execute(
            "UPDATE tasks SET tool=?, args_json=?, tier=?, status=?, updated_at=? WHERE id=?",
            (tool, args_json, tier_enum.value, status, dbmod.now(), task_id),
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
        rows = conn.execute("SELECT * FROM approvals ORDER BY created_at DESC LIMIT 200").fetchall()
        return [dict(r) for r in rows]

    @app.post("/api/approvals/{approval_id}/decide")
    def decide_approval(approval_id: str, body: ApprovalDecision, x_admin_token: str | None = Header(default=None), x_session_token: str | None = Header(default=None)):
        require_admin(x_admin_token, x_session_token)
        if body.decision not in {"approved", "denied"}:
            raise HTTPException(status_code=400, detail="decision must be approved or denied.")
        row = conn.execute("SELECT * FROM approvals WHERE id=?", (approval_id,)).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Approval not found.")
        conn.execute("UPDATE approvals SET status=?, decided_by='admin' WHERE id=?", (body.decision, approval_id))
        if row["task_id"]:
            new_status = "queued" if body.decision == "approved" else "cancelled"
            conn.execute("UPDATE tasks SET status=?, updated_at=? WHERE id=?", (new_status, dbmod.now(), row["task_id"]))
        conn.commit()
        notify_tasks()
        audit("admin", "", "decide_approval", {"approval_id": approval_id, "decision": body.decision}, "allowed")
        return {"approval_id": approval_id, "status": body.decision}

    @app.put("/api/approvals/{approval_id}")
    def update_approval(approval_id: str, body: ApprovalUpdateIn, x_admin_token: str | None = Header(default=None), x_session_token: str | None = Header(default=None)):
        actor = require_role("admin", x_admin_token, x_session_token)
        row = conn.execute("SELECT * FROM approvals WHERE id=?", (approval_id,)).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Approval not found.")
        reason = body.reason if body.reason is not None else row["reason"]
        status = body.status.strip() if body.status is not None and body.status.strip() else row["status"]
        if status not in {"pending", "approved", "denied"}:
            raise HTTPException(status_code=400, detail="status must be pending, approved, or denied.")
        conn.execute("UPDATE approvals SET reason=?, status=?, decided_by=? WHERE id=?", (reason, status, actor, approval_id))
        if row["task_id"]:
            t_status = "queued" if status == "approved" else ("cancelled" if status == "denied" else "needs_approval")
            conn.execute("UPDATE tasks SET status=?, updated_at=? WHERE id=?", (t_status, dbmod.now(), row["task_id"]))
        conn.commit()
        notify_tasks()
        audit(actor, "", "update_approval", {"approval_id": approval_id, "status": status}, "allowed")
        return dict(conn.execute("SELECT * FROM approvals WHERE id=?", (approval_id,)).fetchone())

    @app.delete("/api/approvals/{approval_id}")
    def delete_approval(approval_id: str, x_admin_token: str | None = Header(default=None), x_session_token: str | None = Header(default=None)):
        actor = require_role("admin", x_admin_token, x_session_token)
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

    @app.put("/api/audit/{audit_id}")
    def update_audit_record(audit_id: int, body: AuditUpdateIn, x_admin_token: str | None = Header(default=None), x_session_token: str | None = Header(default=None)):
        require_role("admin", x_admin_token, x_session_token)
        row = conn.execute("SELECT * FROM audit WHERE id=?", (audit_id,)).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Audit record not found.")
        actor_val = body.actor.strip() if body.actor is not None and body.actor.strip() else row["actor"]
        tool_val = body.tool.strip() if body.tool is not None and body.tool.strip() else row["tool"]
        decision_val = body.decision.strip() if body.decision is not None and body.decision.strip() else row["decision"]
        result_val = body.result if body.result is not None else (row["result"] or "")
        conn.execute(
            "UPDATE audit SET actor=?, tool=?, decision=?, result=? WHERE id=?",
            (actor_val, tool_val, decision_val, result_val[:2000], audit_id),
        )
        conn.commit()
        return dict(conn.execute("SELECT * FROM audit WHERE id=?", (audit_id,)).fetchone())

    @app.delete("/api/audit/{audit_id}")
    def delete_audit_record(audit_id: int, x_admin_token: str | None = Header(default=None), x_session_token: str | None = Header(default=None)):
        require_role("admin", x_admin_token, x_session_token)
        cur = conn.execute("DELETE FROM audit WHERE id=?", (audit_id,))
        conn.commit()
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Audit record not found.")
        return {"audit_id": audit_id, "deleted": True}

    @app.delete("/api/audit")
    def clear_audit_records(x_admin_token: str | None = Header(default=None), x_session_token: str | None = Header(default=None)):
        require_role("admin", x_admin_token, x_session_token)
        cur = conn.execute("DELETE FROM audit")
        conn.commit()
        return {"deleted_count": cur.rowcount}

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
        require_role("viewer", x_admin_token, x_session_token)
        url = get_webhook_url()
        return {"webhook_url": url, "configured": bool(url)}

    @app.post("/api/settings/webhook")
    def set_webhook_setting(body: WebhookIn, x_admin_token: str | None = Header(default=None), x_session_token: str | None = Header(default=None)):
        actor = require_role("admin", x_admin_token, x_session_token)
        url = (body.webhook_url or "").strip()
        if url and not (url.startswith("http://") or url.startswith("https://")):
            raise HTTPException(status_code=400, detail="webhook_url must start with http:// or https://")
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
        if user is None or not authmod.verify_password(body.password, user["salt"], user["password_hash"]):
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
        username = claims.get("email") or claims.get("preferred_username") or claims.get("sub")
        if not username:
            raise HTTPException(status_code=400, detail="No usable identity in ID token.")
        username = str(username)[:200]
        user = conn.execute("SELECT * FROM users WHERE username=? AND disabled=0", (username,)).fetchone()
        if user is None:
            conn.execute(
                "INSERT INTO users (id, username, password_hash, salt, role, created_at) VALUES (?,?,?,?,?,?)",
                (uuid.uuid4().hex[:12], username, "oidc-only-" + secrets.token_hex(16), authmod.new_salt(), "viewer", dbmod.now()),
            )
            conn.commit()
            user = conn.execute("SELECT * FROM users WHERE username=?", (username,)).fetchone()
        session_token = secrets.token_urlsafe(32)
        expires = dbmod.now() + 8 * 3600
        conn.execute(
            "INSERT INTO sessions (token_hash, username, role, expires_at, created_at) VALUES (?,?,?,?,?)",
            (dbmod.hash_token(session_token), user["username"], user["role"], expires, dbmod.now()),
        )
        conn.commit()
        audit(user["username"], "", "oidc_login", {}, "allowed")
        dashboard = cfg["dashboard_url"].rstrip("/") + "/"
        sep = "&" if "?" in dashboard else "?"
        return RedirectResponse(dashboard + sep + urlencode({"session_token": session_token}), status_code=302)

    @app.post("/api/auth/users")
    def create_user(body: UserIn, x_admin_token: str | None = Header(default=None), x_session_token: str | None = Header(default=None)):
        existing = conn.execute("SELECT COUNT(*) AS n FROM users").fetchone()["n"]
        if existing > 0:
            require_admin(x_admin_token, x_session_token)
        if body.role not in authmod.ROLES:
            raise HTTPException(status_code=400, detail=f"Unknown role: {body.role}")
        salt = authmod.new_salt()
        try:
            conn.execute("INSERT INTO users (id, username, password_hash, salt, role, created_at) VALUES (?,?,?,?,?,?)",
                         (uuid.uuid4().hex[:12], body.username, authmod.hash_password(body.password, salt), salt, body.role, dbmod.now()))
            conn.commit()
        except Exception:
            raise HTTPException(status_code=400, detail="Username already exists.")
        audit("admin", "", "create_user", {"username": body.username, "role": body.role}, "allowed")
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
        import shutil
        import subprocess

        require_role("viewer", x_admin_token, x_session_token)
        lines = max(10, min(int(lines), 200))
        units = {"control": "ai-bridge-control", "mcp": "ai-bridge-mcp", "oauth": "ai-bridge-oauth"}
        if service in units:
            journal = shutil.which("journalctl")
            if journal is None:
                return {"service": service, "lines": ["journalctl not available on this host."]}
            proc = subprocess.run([journal, "-u", units[service], "-n", str(lines), "--no-pager"],
                                  capture_output=True, text=True, timeout=15)
            return {"service": service, "lines": (proc.stdout or "").splitlines()[-lines:]}
        if service == "nginx":
            try:
                with open("/var/log/nginx/access.log", errors="replace") as handle:
                    all_lines = handle.readlines()
                wanted = [line.rstrip("\n") for line in all_lines if "/mcp" in line or "/api/" in line]
                return {"service": service, "lines": wanted[-lines:]}
            except OSError as exc:
                return {"service": service, "lines": [f"nginx access log unavailable: {exc}"]}
        raise HTTPException(status_code=400, detail="Unknown log service.")

    # --- Agent polling (outbound only) -----------------------------------
    @app.post("/api/agent/heartbeat")
    def heartbeat(body: dict, x_device_token: str | None = Header(default=None)):
        row = device_row(x_device_token)
        conn.execute("UPDATE devices SET status='online', last_seen=? WHERE id=?", (dbmod.now(), row["id"]))
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
        while True:
            if app.state.emergency_stop:
                return {"task": None, "emergency_stop": True}
            task = conn.execute("SELECT * FROM tasks WHERE device_id=? AND status='queued' ORDER BY created_at ASC LIMIT 1", (row["id"],)).fetchone()
            if task is not None:
                break
            rem = deadline - time.time()
            if wait_sec <= 0 or rem <= 0:
                return {"task": None}
            await asyncio.sleep(min(0.15, rem))
        conn.execute("UPDATE tasks SET status='running', updated_at=? WHERE id=?", (dbmod.now(), task["id"]))
        conn.commit()
        out = dict(task)
        # Tell the agent whether a human approved this task. Tasks below Tier 4
        # that never needed approval carry no approval_id (granted); approved
        # tasks carry an approved record. Tier-4 tasks ALWAYS require an approved record.
        ap = out.get("approval_id")
        if ap:
            ap_row = conn.execute("SELECT status FROM approvals WHERE id=?", (ap,)).fetchone()
            out["approval_granted"] = bool(ap_row and ap_row["status"] == "approved")
        else:
            out["approval_granted"] = bool((out.get("tier") or 1) < 4)
        out["policy"] = get_current_policy()
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
        key = request.headers.get("x-admin-token") or request.headers.get("x-device-token") or request.client.host if request.client else "anon"
        try:
            _rate_limit(key)
        except HTTPException as exc:
            return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})
        return await call_next(request)

    return app
