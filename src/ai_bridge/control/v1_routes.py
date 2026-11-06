"""AI Bridge v1.0 Modular Backend Services & WebSocket Signaling (`/api/v1/*`).

Implements Sections 6, 10, 11, and 13 of the AI Bridge Windows Remote Desktop &
Autonomous Agent Architecture v1.0:
- Device Registry: /api/v1/devices, /api/v1/devices/{device_id}, /api/v1/devices/{device_id}/status
- Agent Gateway: /api/v1/agents/{device_id}/heartbeat
- Session Manager: /api/v1/sessions, /api/v1/sessions/{session_id}, /api/v1/sessions/{session_id}/terminate
- Signaling Server: /api/v1/sessions/{session_id}/offer, /answer, /ice + WebSocket /api/v1/ws/sessions/{session_id}
- Policy Engine & Human Takeover Arbiter: /api/v1/policies (derives session permissions server-side)
- Task Orchestrator: /api/v1/tasks, /api/v1/tasks/{task_id}
- Audit Service: /api/v1/audit
"""
from __future__ import annotations

import asyncio
import json
import threading
import time
import uuid
from typing import Any

try:
    from fastapi import Body, FastAPI, Header, HTTPException, Request, WebSocket, WebSocketDisconnect
    from pydantic import BaseModel, Field
except ImportError:
    Body = FastAPI = Header = HTTPException = Request = WebSocket = WebSocketDisconnect = Any  # type: ignore[misc,assignment]

    class BaseModel:  # type: ignore[no-redef]
        pass

    def Field(default: Any = None, **_kwargs: Any) -> Any:  # type: ignore[no-redef]
        return default

from .. import webrtc_stream
from ..policy import TOOL_TIERS
from . import db as dbmod

VALID_SESSION_MODES = {"view_only", "human_control", "ai_assisted"}
VALID_VIDEO_CODECS = {"H264", "VP8", "VP9", "AV1"}

# Global in-process registry of human takeover state by device_id so MCP tools and
# REST/WebSocket handlers share immediate human-takeover enforcement.
_HUMAN_TAKEOVER_BY_DEVICE: dict[str, dict[str, Any]] = {}


def set_device_human_takeover(device_id: str, active: bool, actor: str = "operator", session_id: str = "") -> dict[str, Any]:
    """Set or clear human takeover on a device. When active=True, AI input is immediately revoked."""
    state = {
        "device_id": device_id,
        "human_takeover_active": bool(active),
        "actor": actor,
        "session_id": session_id,
        "updated_at": time.time(),
    }
    _HUMAN_TAKEOVER_BY_DEVICE[device_id] = state
    if device_id in ("local", ""):
        _HUMAN_TAKEOVER_BY_DEVICE["local"] = state
    if active:
        webrtc_stream.release_all_held_keys()
    return state


def is_device_human_takeover_active(device_id: str | None = None) -> bool:
    """Return True if a human operator has taken over control and suppressed AI actions."""
    key = (device_id or "local").strip() or "local"
    entry = _HUMAN_TAKEOVER_BY_DEVICE.get(key) or _HUMAN_TAKEOVER_BY_DEVICE.get("local")
    return bool(entry and entry.get("human_takeover_active"))


def derive_session_permissions(mode: str, effective_policy: dict[str, Any]) -> dict[str, bool]:
    """Derive session permissions strictly server-side from the policy engine and session mode.

    Core security rule (Section 11 & 13):
    - Never trust browser-supplied permission booleans.
    - A user who grants screen access must not automatically grant command execution.
    """
    norm_mode = mode if mode in VALID_SESSION_MODES else "view_only"
    desktop_ok = bool(effective_policy.get("desktop_enabled", True))
    shell_ok = bool(effective_policy.get("allow_shell", False) or effective_policy.get("unrestricted", False))
    writes_ok = bool(effective_policy.get("allow_writes", False))

    if norm_mode == "view_only":
        return {
            "view_screen": True,
            "control_mouse": False,
            "control_keyboard": False,
            "clipboard_sync": False,
            "file_read": True,
            "file_write": False,
            "execute_commands": False,
        }

    # Both human_control and ai_assisted allow the authenticated operator to view and control
    # mouse/keyboard when desktop_enabled is permitted, while execute_commands remains separate.
    return {
        "view_screen": True,
        "control_mouse": desktop_ok,
        "control_keyboard": desktop_ok,
        "clipboard_sync": desktop_ok,
        "file_read": True,
        "file_write": writes_ok,
        "execute_commands": shell_ok,
    }


def save_webrtc_session_db(conn: Any, app_state: Any, sess: dict[str, Any]) -> dict[str, Any]:
    """Persist a WebRTC session in the shared database (`settings` table) so all Gunicorn workers share state."""
    sid = str(sess.get("session_id") or sess.get("id") or "")
    if not sid:
        return sess
    store = app_state.__dict__.setdefault("webrtc_sessions", {})
    store[sid] = sess
    try:
        key = f"webrtc_session:{sid}"
        val = json.dumps(sess)
        existing = conn.execute("SELECT key FROM settings WHERE key=?", (key,)).fetchone()
        if existing:
            conn.execute("UPDATE settings SET value=? WHERE key=?", (val, key))
        else:
            conn.execute("INSERT INTO settings (key, value) VALUES (?, ?)", (key, val))
        conn.commit()
    except Exception:
        pass
    return sess


def load_webrtc_session_db(conn: Any, app_state: Any, session_id: str) -> dict[str, Any] | None:
    """Load a WebRTC session from the shared database (`settings` table) across Gunicorn workers."""
    store = app_state.__dict__.setdefault("webrtc_sessions", {})
    try:
        key = f"webrtc_session:{session_id}"
        row = conn.execute("SELECT value FROM settings WHERE key=?", (key,)).fetchone()
        if row and row["value"]:
            data = json.loads(row["value"])
            if isinstance(data, dict):
                store[session_id] = data
                return data
    except Exception:
        pass
    return store.get(session_id)


def format_session_v1(sess: dict[str, Any]) -> dict[str, Any]:
    """Format a session record into the canonical Section 11 Session Data Model."""
    sid = str(sess.get("session_id") or sess.get("id") or "")
    telem = webrtc_stream.get_session_telemetry(sid)
    video = sess.get("video") or {
        "codec": "H264",
        "width": int(sess.get("width") or telem.get("width") or 1920),
        "height": int(sess.get("height") or telem.get("height") or 1080),
        "fps": int(sess.get("fps") or 30),
        "bitrate_kbps": int(sess.get("bitrate_kbps") or 4500),
    }
    offer_obj = sess.get("offer")
    offer_sdp = offer_obj.get("sdp") if isinstance(offer_obj, dict) else None
    offer_type = offer_obj.get("type", "offer") if isinstance(offer_obj, dict) else "offer"
    return {
        "session_id": sid,
        "device_id": str(sess.get("device_id") or "local"),
        "user_id": str(sess.get("user_id") or "admin"),
        "mode": str(sess.get("mode") or "ai_assisted"),
        "video": video,
        "permissions": sess.get("permissions") or {
            "view_screen": True,
            "control_mouse": True,
            "control_keyboard": True,
            "execute_commands": False,
        },
        "human_takeover_active": bool(sess.get("human_takeover_active", False)),
        "human_takeover": bool(sess.get("human_takeover_active", False)),
        "status": str(sess.get("status") or "connected"),
        "offer": offer_obj,
        "offer_sdp": offer_sdp,
        "offer_type": offer_type,
        "answer": sess.get("answer"),
        "agent_candidates": sess.get("agent_candidates", []),
        "viewer_candidates": sess.get("viewer_candidates", []),
        "ice_servers": webrtc_stream.get_configured_ice_servers(),
        "telemetry": telem,
        "created_at": sess.get("created_at"),
        "error": sess.get("error"),
    }


class CreateSessionV1In(BaseModel):
    device_id: str = "local"
    mode: str = "ai_assisted"
    codec: str = "H264"
    width: int = Field(default=1920, ge=120, le=7680)
    height: int = Field(default=1080, ge=120, le=4320)
    fps: int = Field(default=30, ge=1, le=120)
    bitrate_kbps: int = Field(default=4500, ge=250, le=50000)
    scale: float = Field(default=1.0, ge=0.2, le=1.0)
    monitor_index: int | None = 0


class UpdateSessionModeV1In(BaseModel):
    mode: str = "human_control"
    human_takeover_active: bool | None = None


def attach_v1_routes(
    app: FastAPI,
    conn,
    task_cond: threading.Condition,
    notify_tasks,
    auth_context,
    require_role,
    device_row,
    get_current_policy,
    get_effective_device_policy,
    audit,
) -> None:
    """Attach `/api/v1/*` REST and WebSocket routes to the FastAPI application."""
    ws_subscribers: dict[str, set[WebSocket]] = {}

    async def _broadcast_ws(session_id: str, event: dict[str, Any]) -> None:
        peers = list(ws_subscribers.get(session_id) or [])
        for ws in peers:
            try:
                await ws.send_json(event)
            except Exception:
                ws_subscribers.get(session_id, set()).discard(ws)

    def _sessions_store() -> dict[str, dict[str, Any]]:
        return app.state.__dict__.setdefault("webrtc_sessions", {})

    # ------------------------------------------------------------------
    # 1. Device Registry (/api/v1/devices)
    # ------------------------------------------------------------------
    @app.get("/api/v1/devices")
    def v1_list_devices(
        x_admin_token: str | None = Header(default=None),
        x_session_token: str | None = Header(default=None),
        authorization: str | None = Header(default=None),
    ):
        require_role("viewer", x_admin_token, x_session_token, authorization)
        rows = conn.execute(
            "SELECT id, name, hostname, os, status, last_seen, created_at, revoked FROM devices WHERE revoked=0 ORDER BY created_at DESC"
        ).fetchall()
        devices = []
        for r in rows:
            d = dict(r)
            meta = (getattr(app.state, "device_live_meta", {}) or {}).get(d["id"]) or {}
            d["ip_address"] = meta.get("ip_address", "")
            d["human_takeover_active"] = is_device_human_takeover_active(d["id"])
            devices.append(d)
        return {"devices": devices, "count": len(devices)}

    @app.get("/api/v1/devices/{device_id}")
    def v1_get_device(
        device_id: str,
        x_admin_token: str | None = Header(default=None),
        x_session_token: str | None = Header(default=None),
        authorization: str | None = Header(default=None),
    ):
        require_role("viewer", x_admin_token, x_session_token, authorization)
        if device_id == "local":
            from .. import diagnostics

            info = diagnostics.system_info()
            return {
                "id": "local",
                "name": info.get("hostname", "local"),
                "hostname": info.get("hostname", "local"),
                "os": f"{info.get('system', 'Windows')} {info.get('release', '')}".strip(),
                "status": "online",
                "agent_version": "1.0.0",
                "human_takeover_active": is_device_human_takeover_active("local"),
                "policy": get_effective_device_policy("local"),
            }
        row = conn.execute("SELECT * FROM devices WHERE id=? AND revoked=0", (device_id,)).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Device not found.")
        d = dict(row)
        d.pop("token_hash", None)
        d["human_takeover_active"] = is_device_human_takeover_active(device_id)
        d["effective_policy"] = get_effective_device_policy(row)
        return d

    @app.get("/api/v1/devices/{device_id}/status")
    def v1_get_device_status(
        device_id: str,
        x_admin_token: str | None = Header(default=None),
        x_session_token: str | None = Header(default=None),
        authorization: str | None = Header(default=None),
    ):
        require_role("viewer", x_admin_token, x_session_token, authorization)
        if device_id == "local":
            from .. import diagnostics
            from ..screen_capture import get_monitors

            res = diagnostics.resource_usage()
            sys_info = diagnostics.system_info()
            return {
                "device_id": "local",
                "status": "online",
                "hostname": sys_info.get("hostname", "local"),
                "windows_version": f"{sys_info.get('system', '')} {sys_info.get('release', '')}".strip(),
                "agent_version": "1.0.0",
                "cpu_percent": res.get("cpu_percent", 0.0),
                "memory_percent": res.get("memory_percent", 0.0),
                "disk_percent": res.get("disk_percent", 0.0),
                "monitors": get_monitors(),
                "human_takeover_active": is_device_human_takeover_active("local"),
            }

        row = conn.execute("SELECT * FROM devices WHERE id=? AND revoked=0", (device_id,)).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Device not found.")
        telem = conn.execute(
            "SELECT cpu_percent, memory_percent, disk_percent, recorded_at FROM telemetry WHERE device_id=? ORDER BY recorded_at DESC LIMIT 1",
            (device_id,),
        ).fetchone()
        meta = (getattr(app.state, "device_live_meta", {}) or {}).get(device_id) or {}
        return {
            "device_id": row["id"],
            "name": row["name"],
            "hostname": row["hostname"],
            "windows_version": row["os"],
            "status": row["status"],
            "last_seen": row["last_seen"],
            "agent_version": meta.get("agent_version", "2.0.0"),
            "active_user": meta.get("active_user", "Interactive User"),
            "ip_address": meta.get("ip_address", ""),
            "cpu_percent": telem["cpu_percent"] if telem else 0.0,
            "memory_percent": telem["memory_percent"] if telem else 0.0,
            "disk_percent": telem["disk_percent"] if telem else 0.0,
            "human_takeover_active": is_device_human_takeover_active(device_id),
        }

    @app.get("/api/v1/devices/{device_id}/monitors")
    def v1_get_device_monitors(
        device_id: str,
        x_admin_token: str | None = Header(default=None),
        x_session_token: str | None = Header(default=None),
        authorization: str | None = Header(default=None),
    ):
        require_role("viewer", x_admin_token, x_session_token, authorization)
        if device_id == "local":
            from ..screen_capture import get_monitors
            mons = get_monitors()
            return {"device_id": "local", "monitors": mons, "count": len(mons)}
        row = conn.execute("SELECT id FROM devices WHERE id=? AND revoked=0", (device_id,)).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Device not found.")
        meta = (getattr(app.state, "device_live_meta", {}) or {}).get(device_id) or {}
        mons = meta.get("monitors") or [{"index": 0, "name": "Display 1 (Primary)", "width": 1920, "height": 1080, "is_primary": True}]
        return {"device_id": device_id, "monitors": mons, "count": len(mons)}

    @app.get("/api/v1/devices/{device_id}/ui-elements")
    def v1_get_device_ui_elements(
        device_id: str,
        include_controls: bool = True,
        max_elements: int = 25,
        x_admin_token: str | None = Header(default=None),
        x_session_token: str | None = Header(default=None),
        authorization: str | None = Header(default=None),
    ):
        require_role("viewer", x_admin_token, x_session_token, authorization)
        from .. import tools
        return tools.desktop_get_ui_elements(include_controls=include_controls, max_elements=max_elements)

    @app.get("/api/v1/devices/{device_id}/files")
    def v1_list_device_files(
        device_id: str,
        x_admin_token: str | None = Header(default=None),
        x_session_token: str | None = Header(default=None),
        authorization: str | None = Header(default=None),
    ):
        require_role("viewer", x_admin_token, x_session_token, authorization)
        from .. import tools
        files = tools.desktop_list_transfers()
        return {"device_id": device_id, "files": files, "count": len(files)}

    @app.post("/api/v1/devices/{device_id}/files/upload")
    def v1_upload_device_file(
        device_id: str,
        body: dict = Body(...),
        x_admin_token: str | None = Header(default=None),
        x_session_token: str | None = Header(default=None),
        authorization: str | None = Header(default=None),
    ):
        require_role("operator", x_admin_token, x_session_token, authorization)
        filename = str(body.get("filename") or f"upload_{int(time.time())}.bin")
        content_b64 = str(body.get("content_b64") or "")
        expected_sha = str(body.get("sha256") or "")
        target_dir = str(body.get("target_dir") or "")

        from .. import tools
        tid = f"rest_{uuid.uuid4().hex[:8]}"
        try:
            raw_data = base64.b64decode(content_b64)
        except Exception as exc:
            raise HTTPException(status_code=400, detail=f"Invalid base64 payload: {exc}")

        init_res = tools.desktop_handle_file_start(tid, filename, len(raw_data), 1, target_dir)
        if not init_res.get("ok"):
            raise HTTPException(status_code=500, detail=init_res.get("error", "Init failed"))

        chunk_res = tools.desktop_handle_file_chunk(tid, 0, content_b64)
        if not chunk_res.get("ok"):
            raise HTTPException(status_code=500, detail=chunk_res.get("error", "Write failed"))

        fin_res = tools.desktop_handle_file_end(tid, expected_sha)
        if not fin_res.get("ok"):
            raise HTTPException(status_code=400, detail=fin_res.get("error", "Finalize failed"))
        return fin_res

    @app.get("/api/v1/devices/{device_id}/files/download")
    def v1_download_device_file(
        device_id: str,
        path: str,
        x_admin_token: str | None = Header(default=None),
        x_session_token: str | None = Header(default=None),
        authorization: str | None = Header(default=None),
    ):
        require_role("viewer", x_admin_token, x_session_token, authorization)
        from .. import tools
        meta = tools.desktop_prepare_file_download(path)
        if not meta.get("ok"):
            raise HTTPException(status_code=404, detail=meta.get("error", "File not found"))
        target_path = Path(meta["path"])
        raw = target_path.read_bytes()
        b64 = base64.b64encode(raw).decode("ascii")
        return {
            "name": meta["name"],
            "size": meta["size"],
            "sha256": meta["sha256"],
            "content_b64": b64,
        }


    # ------------------------------------------------------------------
    # 2. Agent Gateway (/api/v1/agents/{device_id}/heartbeat)
    # ------------------------------------------------------------------
    @app.post("/api/v1/agents/{device_id}/heartbeat")
    def v1_agent_heartbeat(
        device_id: str,
        request: Request,
        body: dict = Body(default={}),
        x_device_token: str | None = Header(default=None),
    ):
        row = device_row(x_device_token)
        if row["id"] != device_id:
            raise HTTPException(status_code=403, detail="Device token does not match device_id.")
        now_ts = dbmod.now()
        hostname = (body.get("hostname") or row["hostname"] or "").strip()
        os_val = (body.get("os") or row["os"] or "").strip()
        conn.execute(
            "UPDATE devices SET status='online', last_seen=?, hostname=?, os=? WHERE id=?",
            (now_ts, hostname, os_val, device_id),
        )
        metrics = body.get("metrics") if isinstance(body.get("metrics"), dict) else body
        if isinstance(metrics, dict) and any(k in metrics for k in ("cpu_percent", "memory_percent", "disk_percent")):
            conn.execute(
                "INSERT INTO telemetry (device_id, tenant, cpu_percent, memory_percent, disk_percent, recorded_at) VALUES (?, ?, ?, ?, ?, ?)",
                (
                    device_id,
                    row["tenant"],
                    metrics.get("cpu_percent"),
                    metrics.get("memory_percent"),
                    metrics.get("disk_percent"),
                    now_ts,
                ),
            )
        conn.commit()
        meta_store = getattr(app.state, "device_live_meta", None)
        if isinstance(meta_store, dict):
            entry = dict(meta_store.get(device_id) or {})
            for k in ("active_user", "agent_version", "memory_total_gb", "disk_total_gb", "uptime_hours"):
                if body.get(k) is not None:
                    entry[k] = body[k]
                elif isinstance(metrics, dict) and metrics.get(k) is not None:
                    entry[k] = metrics[k]
            meta_store[device_id] = entry
        return {
            "device_id": device_id,
            "status": "online",
            "emergency_stop": app.state.emergency_stop,
            "human_takeover_active": is_device_human_takeover_active(device_id),
            "token_expires_at": row["token_expires_at"],
        }

    # ------------------------------------------------------------------
    # 3. Session Manager & WebRTC Signaling (/api/v1/sessions)
    # ------------------------------------------------------------------
    @app.get("/api/v1/sessions")
    def v1_list_sessions(
        device_id: str | None = None,
        x_admin_token: str | None = Header(default=None),
        x_session_token: str | None = Header(default=None),
        authorization: str | None = Header(default=None),
    ):
        require_role("viewer", x_admin_token, x_session_token, authorization)
        out = []
        for sess in _sessions_store().values():
            if device_id and sess.get("device_id") != device_id:
                continue
            out.append(format_session_v1(sess))
        return {"sessions": out, "count": len(out)}

    @app.post("/api/v1/sessions")
    def v1_create_session(
        body: CreateSessionV1In,
        x_admin_token: str | None = Header(default=None),
        x_session_token: str | None = Header(default=None),
        authorization: str | None = Header(default=None),
    ):
        actor, _role = auth_context(x_admin_token, x_session_token, authorization)
        mode = body.mode if body.mode in VALID_SESSION_MODES else "ai_assisted"
        codec = body.codec.upper() if body.codec.upper() in VALID_VIDEO_CODECS else "H264"
        even_w = max(120, (int(body.width) // 2) * 2)
        even_h = max(120, (int(body.height) // 2) * 2)
        fps = max(1, min(60, int(body.fps)))
        bitrate_kbps = max(250, min(50000, int(body.bitrate_kbps)))

        eff_policy = get_effective_device_policy(body.device_id)
        if body.device_id == "local":
            eff_policy = {**eff_policy, "desktop_enabled": True}
        permissions = derive_session_permissions(mode, eff_policy)

        takeover = (mode == "human_control")
        set_device_human_takeover(body.device_id, takeover, actor=actor)

        session_id = f"session_{uuid.uuid4().hex[:10]}"
        sess = {
            "id": session_id,
            "session_id": session_id,
            "device_id": body.device_id,
            "user_id": actor,
            "mode": mode,
            "video": {
                "codec": codec,
                "width": even_w,
                "height": even_h,
                "fps": fps,
                "bitrate_kbps": bitrate_kbps,
            },
            "permissions": permissions,
            "human_takeover_active": takeover,
            "status": "waiting",
            "offer": None,
            "answer": None,
            "agent_candidates": [],
            "viewer_candidates": [],
            "created_at": time.time(),
            "scale": body.scale,
            "fps": fps,
            "bitrate_kbps": bitrate_kbps,
            "monitor_index": body.monitor_index,
            "error": None,
        }
        save_webrtc_session_db(conn, app.state, sess)
        audit(
            actor,
            body.device_id,
            "v1_create_session",
            {"session_id": session_id, "mode": mode, "codec": codec, "fps": fps},
            "allowed",
        )

        if body.device_id == "local":
            try:
                webrtc_stream.start_stream(
                    session_id,
                    webrtc_stream.DictSignaling(sess),
                    scale=body.scale,
                    fps=fps,
                    monitor_index=body.monitor_index,
                    bitrate_kbps=bitrate_kbps,
                )
            except Exception as exc:
                sess["status"] = "error"
                sess["error"] = str(exc)
            save_webrtc_session_db(conn, app.state, sess)
        else:
            dev_row = conn.execute("SELECT * FROM devices WHERE id=? AND revoked=0", (body.device_id,)).fetchone()
            if dev_row is None:
                raise HTTPException(status_code=404, detail="Device not found.")
            task_id = uuid.uuid4().hex[:12]
            now_ts = dbmod.now()
            args = {
                "session_id": session_id,
                "scale": body.scale,
                "fps": fps,
                "monitor_index": body.monitor_index,
                "bitrate_kbps": bitrate_kbps,
            }
            conn.execute(
                "INSERT INTO tasks (id, device_id, tenant, tool, args_json, tier, status, created_at, updated_at) VALUES (?,?,?,?,?,3,'queued',?,?)",
                (task_id, body.device_id, dev_row["tenant"], "start_webrtc_stream", json.dumps(args), now_ts, now_ts),
            )
            conn.commit()
            notify_tasks()

        return format_session_v1(sess)

    @app.get("/api/v1/sessions/{session_id}")
    def v1_get_session(
        session_id: str,
        x_admin_token: str | None = Header(default=None),
        x_session_token: str | None = Header(default=None),
        authorization: str | None = Header(default=None),
    ):
        require_role("viewer", x_admin_token, x_session_token, authorization)
        sess = load_webrtc_session_db(conn, app.state, session_id)
        if sess is None:
            raise HTTPException(status_code=404, detail="Session not found.")
        return format_session_v1(sess)

    @app.post("/api/v1/sessions/{session_id}/mode")
    @app.patch("/api/v1/sessions/{session_id}/mode")
    async def v1_update_session_mode(
        session_id: str,
        body: dict = Body(default={}),
        x_admin_token: str | None = Header(default=None),
        x_session_token: str | None = Header(default=None),
        authorization: str | None = Header(default=None),
    ):
        actor, _role = auth_context(x_admin_token, x_session_token, authorization)
        sess = load_webrtc_session_db(conn, app.state, session_id)
        if sess is None:
            raise HTTPException(status_code=404, detail="Session not found.")
        req_mode = str(body.get("mode") or "")
        if req_mode not in VALID_SESSION_MODES:
            raise HTTPException(status_code=400, detail=f"Invalid mode '{req_mode}'. Must be one of {sorted(VALID_SESSION_MODES)}.")

        device_id = str(sess.get("device_id") or "local")
        eff_policy = get_effective_device_policy(device_id)
        if device_id == "local":
            eff_policy = {**eff_policy, "desktop_enabled": True}

        sess["mode"] = req_mode
        sess["permissions"] = derive_session_permissions(req_mode, eff_policy)

        raw_takeover = body.get("human_takeover_active")
        if raw_takeover is None:
            raw_takeover = body.get("human_takeover")
        takeover = raw_takeover if raw_takeover is not None else (req_mode == "human_control")
        sess["human_takeover_active"] = bool(takeover)
        set_device_human_takeover(device_id, bool(takeover), actor=actor, session_id=session_id)
        save_webrtc_session_db(conn, app.state, sess)

        if req_mode == "view_only":
            webrtc_stream.release_all_held_keys()

        audit(
            actor,
            device_id,
            "v1_update_session_mode",
            {"session_id": session_id, "mode": req_mode, "human_takeover_active": bool(takeover)},
            "allowed",
        )
        formatted = format_session_v1(sess)
        await _broadcast_ws(session_id, {"type": "session_updated", "session": formatted})
        return formatted

    @app.patch("/api/v1/sessions/{session_id}/quality")
    async def v1_update_session_quality(
        session_id: str,
        body: dict = Body(default={}),
        x_admin_token: str | None = Header(default=None),
        x_session_token: str | None = Header(default=None),
        authorization: str | None = Header(default=None),
    ):
        require_role("viewer", x_admin_token, x_session_token, authorization)
        sess = load_webrtc_session_db(conn, app.state, session_id)
        if sess is None:
            raise HTTPException(status_code=404, detail="Session not found.")
        req_kbps = body.get("bitrate_kbps")
        req_fps = body.get("fps")
        req_mon = body.get("monitor_index")
        video = sess.setdefault("video", {})
        if req_kbps is not None:
            video["bitrate_kbps"] = max(500, min(20000, int(req_kbps)))
        if req_fps is not None:
            video["fps"] = max(10, min(60, int(req_fps)))
        if req_mon is not None:
            video["monitor_index"] = int(req_mon)
        save_webrtc_session_db(conn, app.state, sess)
        await _broadcast_ws(session_id, {"type": "quality_updated", "video": video})
        return {"ok": True, "session_id": session_id, "video": video}

    @app.post("/api/v1/sessions/{session_id}/clipboard")
    def v1_session_clipboard(
        session_id: str,
        body: dict = Body(default={}),
        x_admin_token: str | None = Header(default=None),
        x_session_token: str | None = Header(default=None),
        authorization: str | None = Header(default=None),
    ):
        actor, _role = auth_context(x_admin_token, x_session_token, authorization)
        sess = load_webrtc_session_db(conn, app.state, session_id)
        if sess is None:
            raise HTTPException(status_code=404, detail="Session not found.")
        perms = sess.get("permissions") or {}
        if not perms.get("clipboard_sync", True):
            raise HTTPException(status_code=403, detail="Clipboard synchronization is disabled for this session.")
        action = str(body.get("action") or "get").lower()
        from .. import tools

        if action == "get":
            res = tools.get_clipboard()
            return {"ok": True, "action": "get", "text": res.get("text", "")}
        text = str(body.get("text") or "")
        res = tools.set_clipboard(text=text, paste=bool(body.get("paste", False)), approval_granted=True)
        return {"ok": True, "action": "set", "length": len(text)}

    @app.post("/api/v1/sessions/{session_id}/terminate")
    async def v1_terminate_session(
        session_id: str,
        x_admin_token: str | None = Header(default=None),
        x_session_token: str | None = Header(default=None),
        authorization: str | None = Header(default=None),
    ):
        actor, _role = auth_context(x_admin_token, x_session_token, authorization)
        sess = load_webrtc_session_db(conn, app.state, session_id)
        if sess is None:
            raise HTTPException(status_code=404, detail="Session not found.")
        sess["status"] = "ended"
        save_webrtc_session_db(conn, app.state, sess)
        device_id = str(sess.get("device_id") or "local")
        set_device_human_takeover(device_id, False, actor=actor, session_id=session_id)
        webrtc_stream.stop_stream(session_id)
        audit(actor, device_id, "v1_terminate_session", {"session_id": session_id}, "allowed")
        await _broadcast_ws(session_id, {"type": "session_terminated", "session_id": session_id})
        return format_session_v1(sess)

    @app.post("/api/v1/sessions/{session_id}/offer")
    async def v1_post_offer(
        session_id: str,
        body: dict = Body(default={}),
        x_device_token: str | None = Header(default=None),
        x_admin_token: str | None = Header(default=None),
        x_session_token: str | None = Header(default=None),
        authorization: str | None = Header(default=None),
    ):
        if x_device_token:
            device_row(x_device_token)
        else:
            require_role("viewer", x_admin_token, x_session_token, authorization)
        sess = load_webrtc_session_db(conn, app.state, session_id)
        if sess is None:
            raise HTTPException(status_code=404, detail="Session not found.")
        sess["offer"] = {"sdp": body.get("sdp"), "type": body.get("type", "offer")}
        sess["status"] = "offered"
        save_webrtc_session_db(conn, app.state, sess)
        await _broadcast_ws(session_id, {"type": "offer", "offer": sess["offer"]})
        return {"ok": True, "session_id": session_id, "status": sess["status"]}

    @app.post("/api/v1/sessions/{session_id}/answer")
    async def v1_post_answer(
        session_id: str,
        body: dict = Body(default={}),
        x_admin_token: str | None = Header(default=None),
        x_session_token: str | None = Header(default=None),
        authorization: str | None = Header(default=None),
    ):
        require_role("viewer", x_admin_token, x_session_token, authorization)
        sess = load_webrtc_session_db(conn, app.state, session_id)
        if sess is None:
            raise HTTPException(status_code=404, detail="Session not found.")
        sess["answer"] = {"sdp": body.get("sdp"), "type": body.get("type", "answer")}
        sess["status"] = "answered"
        save_webrtc_session_db(conn, app.state, sess)
        await _broadcast_ws(session_id, {"type": "answer", "answer": sess["answer"]})
        return {"ok": True, "session_id": session_id, "status": sess["status"]}

    @app.post("/api/v1/sessions/{session_id}/ice")
    async def v1_post_ice(
        session_id: str,
        body: dict = Body(default={}),
        x_device_token: str | None = Header(default=None),
        x_admin_token: str | None = Header(default=None),
        x_session_token: str | None = Header(default=None),
        authorization: str | None = Header(default=None),
    ):
        from_side = str(body.get("from") or ("agent" if x_device_token else "viewer")).lower()
        if x_device_token:
            device_row(x_device_token)
        else:
            require_role("viewer", x_admin_token, x_session_token, authorization)
        sess = load_webrtc_session_db(conn, app.state, session_id)
        if sess is None:
            raise HTTPException(status_code=404, detail="Session not found.")
        cand = body.get("candidate")
        if cand:
            if from_side == "agent":
                sess.setdefault("agent_candidates", []).append(cand)
            else:
                sess.setdefault("viewer_candidates", []).append(cand)
            save_webrtc_session_db(conn, app.state, sess)
            await _broadcast_ws(session_id, {"type": "ice", "from": from_side, "candidate": cand})
        return {"ok": True, "session_id": session_id}

    @app.websocket("/api/v1/ws/sessions/{session_id}")
    async def v1_session_websocket(websocket: WebSocket, session_id: str):
        await websocket.accept()
        ws_subscribers.setdefault(session_id, set()).add(websocket)
        try:
            sess = _sessions_store().get(session_id)
            if sess is not None:
                await websocket.send_json({"type": "session_snapshot", "session": format_session_v1(sess)})
            while True:
                msg = await websocket.receive_json()
                mtype = str(msg.get("type") or "").lower()
                sess = _sessions_store().get(session_id)
                if sess is None:
                    await websocket.send_json({"type": "error", "detail": "Session not found."})
                    continue
                if mtype == "answer" and msg.get("answer"):
                    sess["answer"] = msg["answer"]
                    sess["status"] = "answered"
                    await _broadcast_ws(session_id, {"type": "answer", "answer": sess["answer"]})
                elif mtype == "offer" and msg.get("offer"):
                    sess["offer"] = msg["offer"]
                    sess["status"] = "offered"
                    await _broadcast_ws(session_id, {"type": "offer", "offer": sess["offer"]})
                elif mtype == "ice" and msg.get("candidate"):
                    side = str(msg.get("from") or "viewer")
                    if side == "agent":
                        sess.setdefault("agent_candidates", []).append(msg["candidate"])
                    else:
                        sess.setdefault("viewer_candidates", []).append(msg["candidate"])
                    await _broadcast_ws(session_id, {"type": "ice", "from": side, "candidate": msg["candidate"]})
                elif mtype == "ping":
                    await websocket.send_json({
                        "type": "pong",
                        "client_ts_ms": msg.get("client_ts_ms"),
                        "server_ts_ms": round(time.time() * 1000, 2),
                        "session": format_session_v1(sess),
                    })
        except WebSocketDisconnect:
            pass
        except Exception:
            pass
        finally:
            ws_subscribers.get(session_id, set()).discard(websocket)

    # ------------------------------------------------------------------
    # 4. Task Orchestrator (/api/v1/tasks)
    # ------------------------------------------------------------------
    @app.get("/api/v1/tasks")
    def v1_list_tasks(
        device_id: str | None = None,
        x_admin_token: str | None = Header(default=None),
        x_session_token: str | None = Header(default=None),
        authorization: str | None = Header(default=None),
    ):
        require_role("viewer", x_admin_token, x_session_token, authorization)
        if device_id:
            rows = conn.execute(
                "SELECT * FROM tasks WHERE device_id=? ORDER BY created_at DESC LIMIT 100",
                (device_id,),
            ).fetchall()
        else:
            rows = conn.execute("SELECT * FROM tasks ORDER BY created_at DESC LIMIT 100").fetchall()
        return {"tasks": [dict(r) for r in rows]}

    @app.post("/api/v1/tasks")
    def v1_create_task(
        body: dict = Body(default={}),
        x_admin_token: str | None = Header(default=None),
        x_session_token: str | None = Header(default=None),
        authorization: str | None = Header(default=None),
    ):
        actor = require_role("operator", x_admin_token, x_session_token, authorization)
        device_id = str(body.get("device_id") or "local")
        tool_name = str(body.get("tool") or "")
        args = body.get("args") if isinstance(body.get("args"), dict) else {}
        if not tool_name:
            raise HTTPException(status_code=400, detail="tool is required.")
        if is_device_human_takeover_active(device_id) and not bool(body.get("human_initiated", False)):
            raise HTTPException(
                status_code=409,
                detail="Human takeover is active on this device; autonomous AI tasks are paused until control is handed back.",
            )
        task_id = uuid.uuid4().hex[:12]
        now_ts = dbmod.now()
        tier = TOOL_TIERS.get(tool_name)
        t_val = tier.value if tier else 2
        conn.execute(
            "INSERT INTO tasks (id, device_id, tenant, tool, args_json, tier, status, created_at, updated_at) VALUES (?,?,?,?,?,?,'queued',?,?)",
            (task_id, device_id, "default", tool_name, json.dumps(args), t_val, now_ts, now_ts),
        )
        conn.commit()
        notify_tasks()
        audit(actor, device_id, tool_name, args, "queued")
        return {"task_id": task_id, "device_id": device_id, "tool": tool_name, "status": "queued"}

    @app.get("/api/v1/tasks/{task_id}")
    def v1_get_task(
        task_id: str,
        x_admin_token: str | None = Header(default=None),
        x_session_token: str | None = Header(default=None),
        authorization: str | None = Header(default=None),
    ):
        require_role("viewer", x_admin_token, x_session_token, authorization)
        row = conn.execute("SELECT * FROM tasks WHERE id=?", (task_id,)).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Task not found.")
        return dict(row)

    # ------------------------------------------------------------------
    # 5. Policy Engine & Audit Service (/api/v1/policies, /api/v1/audit)
    # ------------------------------------------------------------------
    @app.get("/api/v1/policies")
    def v1_get_policies(
        device_id: str | None = None,
        x_admin_token: str | None = Header(default=None),
        x_session_token: str | None = Header(default=None),
        authorization: str | None = Header(default=None),
    ):
        require_role("viewer", x_admin_token, x_session_token, authorization)
        if device_id:
            return {"device_id": device_id, "policy": get_effective_device_policy(device_id)}
        return {"policy": get_current_policy()}

    @app.get("/api/v1/audit")
    def v1_get_audit(
        limit: int = 100,
        x_admin_token: str | None = Header(default=None),
        x_session_token: str | None = Header(default=None),
        authorization: str | None = Header(default=None),
    ):
        require_role("viewer", x_admin_token, x_session_token, authorization)
        lim = max(1, min(500, int(limit)))
        rows = conn.execute("SELECT * FROM audit ORDER BY id DESC LIMIT ?", (lim,)).fetchall()
        return {"events": [dict(r) for r in rows], "count": len(rows)}
