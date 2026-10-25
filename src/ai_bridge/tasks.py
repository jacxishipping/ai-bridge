"""Backwards-compatible diagnostic task shim (starter API).

The starter's run_diagnostic() is preserved; new code should use
ai_bridge.execution.RUNNER / ai_bridge.diagnostics instead.
"""
from __future__ import annotations

from collections.abc import Callable

from . import diagnostics


def _uptime() -> str:
    import platform
    if platform.system() == "Windows":
        return "Uptime diagnostic: use system_info on Windows; Linux uptime command is unavailable."
    return diagnostics._run(["uptime"])

def _disk_usage() -> str:
    d = diagnostics.disk_usage("/")
    return f"Root disk usage: total={d['total_bytes']} bytes, used={d['used_bytes']} bytes, free={d['free_bytes']} bytes"

def _memory_summary() -> str:
    import platform
    if platform.system() == "Linux":
        return diagnostics._run(["free", "-h"])
    return "Memory summary is not implemented for this operating system."

TASKS: dict[str, Callable[[], str]] = {
    "uptime": _uptime, "disk_usage": _disk_usage, "memory_summary": _memory_summary,
}

def run_diagnostic(task_name: str) -> str:
    if task_name not in TASKS:
        raise ValueError(f"Task not allowed. Choose one of: {', '.join(sorted(TASKS))}")
    return TASKS[task_name]()
