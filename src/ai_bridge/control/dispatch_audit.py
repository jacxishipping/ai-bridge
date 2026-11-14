"""Optional dispatch-time audit for connector and supervisor tools."""
from __future__ import annotations

from collections.abc import Callable
from typing import Any

DispatchAuditCallback = Callable[[str, dict, Any, str], None]

_CALLBACK: DispatchAuditCallback | None = None

_AUDIT_TOOL_PREFIXES = ("firecrawl_", "browserbase_", "you_")
_AUDIT_TOOL_NAMES = frozenset(
    {
        "supervisor_delegate_role",
        "supervisor_enqueue_handoff",
        "supervisor_recover_role_tasks",
        "agent_run_role",
    }
)


def set_dispatch_audit_callback(cb: DispatchAuditCallback | None) -> None:
    global _CALLBACK
    _CALLBACK = cb


def should_audit_tool(tool: str) -> bool:
    tool = (tool or "").strip()
    if tool in _AUDIT_TOOL_NAMES:
        return True
    return any(tool.startswith(p) for p in _AUDIT_TOOL_PREFIXES)


def record_dispatch_tool(tool: str, args: dict | None, result: Any, *, device_id: str = "") -> None:
    if _CALLBACK is None or not should_audit_tool(tool):
        return
    try:
        _CALLBACK(tool, dict(args or {}), result, device_id or "")
    except Exception:
        pass