"""Cooperative cancellation hooks for in-flight agent task execution."""
from __future__ import annotations

import threading
from typing import Callable

_cancel_check: Callable[[], bool] | None = None
_lock = threading.Lock()
_current_task_id: str | None = None


class TaskCancelled(RuntimeError):
    """Raised when the control plane marks the active task cancelled or timed out."""


def set_execution_context(
    task_id: str | None,
    cancel_check: Callable[[], bool] | None,
) -> None:
    """Bind the active fleet task and optional cancel predicate (called from the poller)."""
    global _current_task_id, _cancel_check
    with _lock:
        _current_task_id = task_id
        _cancel_check = cancel_check


def clear_execution_context() -> None:
    set_execution_context(None, None)


def current_task_id() -> str | None:
    with _lock:
        return _current_task_id


def is_cancelled() -> bool:
    with _lock:
        fn = _cancel_check
    if fn is None:
        return False
    try:
        return bool(fn())
    except Exception:
        return False


def raise_if_cancelled() -> None:
    if is_cancelled():
        raise TaskCancelled("Task was cancelled or timed out by the control plane.")


def cooperative_sleep(seconds: float, *, interval: float = 0.25) -> None:
    """Sleep in small slices so cancellation can interrupt long waits."""
    import time

    deadline = time.time() + max(0.0, float(seconds))
    while time.time() < deadline:
        raise_if_cancelled()
        time.sleep(min(interval, max(0.0, deadline - time.time())))