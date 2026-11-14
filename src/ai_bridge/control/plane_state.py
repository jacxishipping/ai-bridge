"""Durable control-plane flags shared across workers (emergency stop, human takeover)."""
from __future__ import annotations

import json
import threading
import time
from typing import Any

_EMERGENCY_REFRESH_AT = 0.0
_EMERGENCY_REFRESH_LOCK = threading.Lock()


def _get_setting(conn: Any, key: str) -> str | None:
    row = conn.execute("SELECT value FROM settings WHERE key=?", (key,)).fetchone()
    if row is None:
        return None
    val = row["value"] if hasattr(row, "keys") else row[0]
    return str(val) if val is not None else None


def _set_setting(conn: Any, key: str, value: str) -> None:
    conn.execute(
        "INSERT INTO settings (key, value) VALUES (?, ?) "
        "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        (key, value),
    )
    conn.commit()


def load_emergency_stop(conn: Any) -> bool:
    raw = _get_setting(conn, "plane.emergency_stop")
    return raw in ("1", "true", "True", "yes")


def set_emergency_stop(conn: Any, active: bool) -> None:
    _set_setting(conn, "plane.emergency_stop", "1" if active else "0")


def sync_emergency_stop_to_app(conn: Any, app_state: Any) -> bool:
    active = load_emergency_stop(conn)
    app_state.emergency_stop = active
    return active


def refresh_emergency_stop(conn: Any, app_state: Any, *, ttl_sec: float = 1.0) -> bool:
    """Re-read durable emergency stop so all uvicorn workers converge quickly."""
    global _EMERGENCY_REFRESH_AT
    now = time.monotonic()
    with _EMERGENCY_REFRESH_LOCK:
        if now - _EMERGENCY_REFRESH_AT >= ttl_sec:
            sync_emergency_stop_to_app(conn, app_state)
            _EMERGENCY_REFRESH_AT = now
    return bool(app_state.emergency_stop)


def is_emergency_stop(conn: Any, app_state: Any | None = None) -> bool:
    if conn is not None and app_state is not None:
        refresh_emergency_stop(conn, app_state, ttl_sec=0.75)
        return bool(app_state.emergency_stop)
    if app_state is not None and getattr(app_state, "emergency_stop", False):
        return True
    return load_emergency_stop(conn)


def is_human_takeover_active(conn: Any, device_id: str | None) -> bool:
    dev = (device_id or "local").strip() or "local"
    for key in (dev, "local"):
        loaded = load_human_takeover(conn, key)
        if loaded and loaded.get("human_takeover_active"):
            return True
    return False


def save_human_takeover(conn: Any, device_id: str, state: dict[str, Any]) -> None:
    key = f"plane.human_takeover.{device_id}"
    _set_setting(conn, key, json.dumps(state))


def load_human_takeover(conn: Any, device_id: str) -> dict[str, Any] | None:
    raw = _get_setting(conn, f"plane.human_takeover.{device_id}")
    if not raw:
        return None
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return None


def load_all_human_takeovers(conn: Any) -> dict[str, dict[str, Any]]:
    rows = conn.execute(
        "SELECT key, value FROM settings WHERE key LIKE 'plane.human_takeover.%'"
    ).fetchall()
    out: dict[str, dict[str, Any]] = {}
    for row in rows:
        key = row["key"] if hasattr(row, "keys") else row[0]
        val = row["value"] if hasattr(row, "keys") else row[1]
        dev_id = key.split("plane.human_takeover.", 1)[-1]
        try:
            out[dev_id] = json.loads(val)
        except json.JSONDecodeError:
            continue
    return out


def clear_human_takeover(conn: Any, device_id: str) -> None:
    conn.execute("DELETE FROM settings WHERE key=?", (f"plane.human_takeover.{device_id}",))
    conn.commit()


def now_payload() -> float:
    return time.time()