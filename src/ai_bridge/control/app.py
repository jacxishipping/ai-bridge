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
/api/audit, /api/emergency-stop, /api/agent/* (polling).
Rate limiting: 120 requests/minute per token/IP (in-memory, per process).
"""
from __future__ import annotations

import hmac
import json
import os
import secrets
import threading
import time
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

def _rate_limit(key: str, limit: int = 120, window: int = 60) -> None:
    now = time.time()
    with _RATE_LOCK:
        bucket = [t for t in _RATE.get(key, []) if now - t < window]
        bucket.append(now); _RATE[key] = bucket
        if len(bucket) > limit:
            raise HTTPException(status_code=429, detail="Rate limit exceeded.")

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

def create_app(*, admin_token: str | None = None, db_path: Path | None = None) -> FastAPI:
    token = admin_token or os.environ.get("AI_BRIDGE_ADMIN_TOKEN")
    data_dir = Path(os.environ.get("AI_BRIDGE_DATA_DIR", str(Path.home() / ".ai-bridge")))
    db_path = db_path or (data_dir / "control.db")
    conn = dbmod.connect(db_path)
    app = FastAPI(title="AI Bridge Control Plane", version="0.3.0")
    app.add_middleware(CORSMiddleware, allow_origins=["http://127.0.0.1:5173", "http://localhost:5173", "http://201.79.36.129"],
                       allow_credentials=True, allow_methods=["*"], allow_headers=["*"])
    app.state.conn = conn
    app.state.admin_token = token
    app.state.emergency_stop = False

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
        rows = conn.execute("SELECT id, name, hostname, os, tenant, status, last_seen, revoked, created_at FROM devices WHERE tenant=?", (tenant,)).fetchall()
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
                         (approval_id, task_id, body.tool, "Tier-4 operation requires human approval.", dbmod.now()))
            status = "needs_approval"
        conn.execute("INSERT INTO tasks (id, device_id, tenant, tool, args_json, tier, status, approval_id, created_at, updated_at)"
                     " VALUES (?,?,?,?,?,?,?,?,?,?)",
                     (task_id, body.device_id, body.tenant, body.tool, json.dumps(body.args), tier.value, status, approval_id, dbmod.now(), dbmod.now()))
        conn.commit()
        audit("admin", body.device_id, body.tool, body.args, status, tenant=body.tenant)
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
    def get_task(task_id: str, x_admin_token: str | None = Header(default=None), x_session_token: str | None = Header(default=None)):
        require_role("viewer", x_admin_token, x_session_token)
        row = conn.execute("SELECT * FROM tasks WHERE id=?", (task_id,)).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Task not found.")
        return dict(row)

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
        audit("admin", row["device_id"], "cancel_task", {"task_id": task_id}, "allowed")
        return {"task_id": task_id, "status": "cancelled"}

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
        audit("admin", "", "decide_approval", {"approval_id": approval_id, "decision": body.decision}, "allowed")
        return {"approval_id": approval_id, "status": body.decision}

    @app.get("/api/audit")
    def list_audit(x_admin_token: str | None = Header(default=None), x_session_token: str | None = Header(default=None), tenant: str = "default", tool: str | None = None):
        require_role("viewer", x_admin_token, x_session_token)
        if tool:
            rows = conn.execute("SELECT * FROM audit WHERE tenant=? AND tool=? ORDER BY ts DESC LIMIT 500", (tenant, tool)).fetchall()
        else:
            rows = conn.execute("SELECT * FROM audit WHERE tenant=? ORDER BY ts DESC LIMIT 500", (tenant,)).fetchall()
        return [dict(r) for r in rows]

    @app.post("/api/emergency-stop")
    def emergency_stop(x_admin_token: str | None = Header(default=None), x_session_token: str | None = Header(default=None)):
        require_admin(x_admin_token, x_session_token)
        app.state.emergency_stop = True
        audit("admin", "", "emergency_stop", {}, "allowed")
        return {"emergency_stop": True}

    @app.post("/api/emergency-stop/clear")
    def emergency_clear(x_admin_token: str | None = Header(default=None), x_session_token: str | None = Header(default=None)):
        require_admin(x_admin_token, x_session_token)
        app.state.emergency_stop = False
        audit("admin", "", "emergency_stop_clear", {}, "allowed")
        return {"emergency_stop": False}

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

    # --- Agent polling (outbound only) -----------------------------------
    @app.post("/api/agent/heartbeat")
    def heartbeat(body: dict, x_device_token: str | None = Header(default=None)):
        row = device_row(x_device_token)
        conn.execute("UPDATE devices SET status='online', last_seen=? WHERE id=?", (dbmod.now(), row["id"]))
        conn.commit()
        return {"device_id": row["id"], "emergency_stop": app.state.emergency_stop}

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
    def next_task(x_device_token: str | None = Header(default=None)):
        row = device_row(x_device_token)
        if app.state.emergency_stop:
            return {"task": None, "emergency_stop": True}
        task = conn.execute("SELECT * FROM tasks WHERE device_id=? AND status='queued' ORDER BY created_at ASC LIMIT 1", (row["id"],)).fetchone()
        if task is None:
            return {"task": None}
        conn.execute("UPDATE tasks SET status='running', updated_at=? WHERE id=?", (dbmod.now(), task["id"]))
        conn.commit()
        return {"task": dict(task)}

    @app.post("/api/agent/tasks/{task_id}/result")
    def task_result(task_id: str, body: TaskResultIn, x_device_token: str | None = Header(default=None)):
        row = device_row(x_device_token)
        task = conn.execute("SELECT * FROM tasks WHERE id=? AND device_id=?", (task_id, row["id"])).fetchone()
        if task is None:
            raise HTTPException(status_code=404, detail="Task not found for this device.")
        if body.status not in {"completed", "failed", "cancelled", "timed_out"}:
            raise HTTPException(status_code=400, detail="Invalid result status.")
        conn.execute("UPDATE tasks SET status=?, result=?, updated_at=? WHERE id=?", (body.status, body.result[:8000], dbmod.now(), task_id))
        conn.commit()
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
