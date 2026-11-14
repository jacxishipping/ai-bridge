"""Optional dispatch-time audit for connector, supervisor, and sensitive tools."""
from __future__ import annotations

from collections.abc import Callable
from typing import Any

DispatchAuditCallback = Callable[[str, dict, Any, str], None]

_CALLBACK: DispatchAuditCallback | None = None

_AUDIT_TOOL_PREFIXES = ("firecrawl_", "browserbase_", "you_", "supervisor_", "desktop_", "mouse_", "keyboard_")
_AUDIT_TOOL_NAMES = frozenset(
    {
        "supervisor_delegate_role",
        "supervisor_enqueue_handoff",
        "supervisor_recover_role_tasks",
        "agent_run_role",
        "run_shell",
        "terminal_exec",
        "perform_approved_ui_action",
        "launch_approved_application",
        "capture_desktop_screenshot",
        "capture_desktop_frame",
        "set_of_marks_screenshot",
        "click_element",
        "click_text",
    }
)


def set_dispatch_audit_callback(cb: DispatchAuditCallback | None) -> None:
    global _CALLBACK
    _CALLBACK = cb


def should_audit_tool(tool: str) -> bool:
    tool = (tool or "").strip()
    if not tool:
        return False
    if tool in _AUDIT_TOOL_NAMES:
        return True
    if any(tool.startswith(p) for p in _AUDIT_TOOL_PREFIXES):
        return True
    try:
        from ..policy import TOOL_TIERS, RiskTier

        tier = TOOL_TIERS.get(tool)
        if tier is not None and int(tier) >= int(RiskTier.SENSITIVE):
            return True
    except Exception:
        pass
    return False


def record_dispatch_tool(tool: str, args: dict | None, result: Any, *, device_id: str = "") -> None:
    if _CALLBACK is None or not should_audit_tool(tool):
        return
    try:
        _CALLBACK(tool, dict(args or {}), result, device_id or "")
    except Exception:
        pass
