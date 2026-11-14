"""Persistent agent wake/cancel side-channel (WebSocket).

HTTP claim (`GET /api/agent/tasks/next`) remains the source of truth for leases.
Connected agents receive push hints so they can claim or abort sooner.
"""
from __future__ import annotations

import asyncio
import json
import logging
import threading
from typing import Any

from fastapi import WebSocket

log = logging.getLogger("ai_bridge.agent_channel")

_lock = threading.Lock()
# device_id -> set of WebSocket
_subscribers: dict[str, set[WebSocket]] = {}
_loop: asyncio.AbstractEventLoop | None = None


def bind_event_loop(loop: asyncio.AbstractEventLoop | None) -> None:
    """Remember the ASGI loop so sync notify_* can schedule coroutines."""
    global _loop
    _loop = loop


def register(device_id: str, websocket: WebSocket) -> None:
    with _lock:
        _subscribers.setdefault(device_id, set()).add(websocket)


def unregister(device_id: str, websocket: WebSocket) -> None:
    with _lock:
        bucket = _subscribers.get(device_id)
        if not bucket:
            return
        bucket.discard(websocket)
        if not bucket:
            _subscribers.pop(device_id, None)


def connected_device_ids() -> list[str]:
    with _lock:
        return list(_subscribers.keys())


def subscriber_count(device_id: str | None = None) -> int:
    with _lock:
        if device_id is None:
            return sum(len(s) for s in _subscribers.values())
        return len(_subscribers.get(device_id) or ())


async def _send_json(ws: WebSocket, payload: dict[str, Any]) -> bool:
    try:
        await ws.send_json(payload)
        return True
    except Exception:
        return False


async def push_to_device(device_id: str, payload: dict[str, Any]) -> int:
    """Send payload to all sockets for device_id. Returns successful send count."""
    with _lock:
        sockets = list(_subscribers.get(device_id) or ())
    if not sockets:
        return 0
    dead: list[WebSocket] = []
    ok = 0
    for ws in sockets:
        if await _send_json(ws, payload):
            ok += 1
        else:
            dead.append(ws)
    for ws in dead:
        unregister(device_id, ws)
    return ok


def _schedule(coro) -> None:
    loop = _loop
    try:
        running = asyncio.get_running_loop()
    except RuntimeError:
        running = None
    if running is not None:
        running.create_task(coro)
        return
    if loop is not None and loop.is_running():
        asyncio.run_coroutine_threadsafe(coro, loop)
        return
    # Best-effort: drop if no loop (tests may call notify without ASGI).
    log.debug("agent_channel: no event loop; drop push")
    try:
        coro.close()
    except Exception:
        pass


def notify_task_available(device_id: str, task_id: str | None = None) -> None:
    payload: dict[str, Any] = {"type": "task_available"}
    if task_id:
        payload["task_id"] = task_id
    _schedule(push_to_device(device_id, payload))


def notify_cancel(device_id: str, task_id: str, *, emergency_stop: bool = False) -> None:
    payload: dict[str, Any] = {"type": "cancel", "task_id": task_id}
    if emergency_stop:
        payload["emergency_stop"] = True
    _schedule(push_to_device(device_id, payload))


def notify_emergency_stop(active: bool) -> None:
    payload = {"type": "emergency_stop", "active": bool(active)}
    with _lock:
        device_ids = list(_subscribers.keys())
    for device_id in device_ids:
        _schedule(push_to_device(device_id, payload))


def reset_for_tests() -> None:
    with _lock:
        _subscribers.clear()
