"""Agent-local mirrors of durable control-plane flags (emergency stop)."""
from __future__ import annotations

import threading

_LOCK = threading.Lock()
_EMERGENCY_STOP = False


def set_emergency_stop(active: bool) -> None:
    global _EMERGENCY_STOP
    with _LOCK:
        _EMERGENCY_STOP = bool(active)


def is_emergency_stop() -> bool:
    with _LOCK:
        return _EMERGENCY_STOP