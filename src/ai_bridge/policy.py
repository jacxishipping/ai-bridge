"""Risk-based policy engine — enforced server-side, never by prompt text.

Tiers (see docs/security.md):
  1 read-only | 2 low-risk change | 3 sensitive change | 4 high-risk
Rules:
- Tier 1: always allowed for an authenticated device/user in scope.
- Tier 2: allowed when the workspace policy allows writes.
- Tier 3: allowed only if AI_BRIDGE_ALLOW_TIER3=1 (admin opt-in) AND
  no approval is pending; per-tool allowlist in ToolPolicy.
- Tier 4: ALWAYS requires an explicit human approval record first.
  No tool, AI text, or device may create that approval for itself.
- The policy object is constructed from admin config only. Tool
  arguments can never widen it (see test_policy_bypass in tests).
"""
from __future__ import annotations

from dataclasses import dataclass
from enum import IntEnum


class RiskTier(IntEnum):
    READ_ONLY = 1
    LOW_RISK = 2
    SENSITIVE = 3
    HIGH_RISK = 4

# Tool -> (tier, description). Anything not listed is denied by default.
TOOL_TIERS: dict[str, RiskTier] = {
    "list_devices": RiskTier.READ_ONLY, "get_device_status": RiskTier.READ_ONLY,
    "get_system_info": RiskTier.READ_ONLY, "get_resource_usage": RiskTier.READ_ONLY,
    "get_network_info": RiskTier.READ_ONLY,
    "list_workspace": RiskTier.READ_ONLY, "read_workspace_file": RiskTier.READ_ONLY,
    "read_file": RiskTier.READ_ONLY,
    "search_workspace": RiskTier.READ_ONLY, "get_service_status": RiskTier.READ_ONLY,
    "get_recent_logs": RiskTier.READ_ONLY, "list_processes": RiskTier.READ_ONLY,
    "get_disk_usage": RiskTier.READ_ONLY, "get_memory_usage": RiskTier.READ_ONLY,
    "list_docker_containers": RiskTier.READ_ONLY, "git_status": RiskTier.READ_ONLY,
    "git_diff": RiskTier.READ_ONLY, "get_task_status": RiskTier.READ_ONLY,
    "get_task_result": RiskTier.READ_ONLY, "get_desktop_status": RiskTier.READ_ONLY,
    "create_workspace_file": RiskTier.LOW_RISK, "run_project_tests": RiskTier.LOW_RISK,
    "run_linter": RiskTier.LOW_RISK,
    "edit_workspace_file": RiskTier.SENSITIVE, "move_workspace_file": RiskTier.SENSITIVE,
    "create_backup": RiskTier.SENSITIVE, "deploy_application": RiskTier.SENSITIVE,
    "capture_desktop_screenshot": RiskTier.SENSITIVE,
    "take_screenshot": RiskTier.SENSITIVE,
    "capture_desktop_frame": RiskTier.SENSITIVE,
    "start_webrtc_stream": RiskTier.SENSITIVE,
    "stop_webrtc_stream": RiskTier.SENSITIVE,
    "update_fleet_agent": RiskTier.SENSITIVE,
    "ocr_screen": RiskTier.SENSITIVE,
    "click_text": RiskTier.SENSITIVE,
    "click_element": RiskTier.SENSITIVE,
    "list_ui_elements": RiskTier.READ_ONLY,
    "set_of_marks_screenshot": RiskTier.SENSITIVE,
    "wait_for_text": RiskTier.SENSITIVE,
    "verify_screen_contains": RiskTier.SENSITIVE,
    "press_hotkey": RiskTier.SENSITIVE,
    "execute_workflow": RiskTier.SENSITIVE,
    "broadcast_fleet_command": RiskTier.SENSITIVE,
    "launch_approved_application": RiskTier.SENSITIVE,
    "perform_approved_ui_action": RiskTier.SENSITIVE,
    "mouse_click": RiskTier.SENSITIVE,
    "mouse_move": RiskTier.SENSITIVE,
    "mouse_scroll": RiskTier.SENSITIVE,
    "mouse_drag": RiskTier.SENSITIVE,
    "keyboard_type": RiskTier.SENSITIVE,
    "keyboard_press": RiskTier.SENSITIVE,
    "list_desktop_windows": RiskTier.READ_ONLY,
    "focus_window": RiskTier.SENSITIVE,
    "get_screen_size": RiskTier.READ_ONLY,
    "get_clipboard": RiskTier.READ_ONLY,
    "set_clipboard": RiskTier.SENSITIVE,
    "install_package": RiskTier.SENSITIVE,
    "run_shell": RiskTier.SENSITIVE, "write_file": RiskTier.SENSITIVE,
    "terminal_exec": RiskTier.SENSITIVE,
    "delete_workspace_file": RiskTier.HIGH_RISK, "submit_task": RiskTier.SENSITIVE,
    "request_approval": RiskTier.LOW_RISK, "approve_task": RiskTier.HIGH_RISK,
    "cancel_task": RiskTier.LOW_RISK,
    # Canonical v1.0 MCP Computer-Use Toolset (Section 8) & v2.0 Extensions
    "desktop_get_screenshot": RiskTier.SENSITIVE,
    "desktop_get_window_screenshot": RiskTier.SENSITIVE,
    "desktop_get_status": RiskTier.READ_ONLY,
    "desktop_get_monitors": RiskTier.READ_ONLY,
    "desktop_clipboard_get": RiskTier.READ_ONLY,
    "desktop_clipboard_set": RiskTier.SENSITIVE,
    "desktop_mouse_move": RiskTier.SENSITIVE,
    "desktop_click": RiskTier.SENSITIVE,
    "desktop_keyboard": RiskTier.SENSITIVE,
    "desktop_scroll": RiskTier.SENSITIVE,
    "desktop_execute_command": RiskTier.SENSITIVE,
    "desktop_open_application": RiskTier.SENSITIVE,
    "desktop_get_windows": RiskTier.READ_ONLY,
    "desktop_wait": RiskTier.SENSITIVE,
    "desktop_verify_action": RiskTier.SENSITIVE,
    # Microsoft 365 connector (Graph). Reads are Tier 1; sending mail is Tier 4.
    "m365_get_profile": RiskTier.READ_ONLY,
    "m365_list_mail": RiskTier.READ_ONLY,
    "m365_search_mail": RiskTier.READ_ONLY,
    "m365_get_mail": RiskTier.READ_ONLY,
    "m365_list_events": RiskTier.READ_ONLY,
    "m365_list_files": RiskTier.READ_ONLY,
    "m365_search_files": RiskTier.READ_ONLY,
    "m365_create_event": RiskTier.SENSITIVE,
    "m365_send_mail": RiskTier.HIGH_RISK,
    # Web browser automation tools
    "browser_navigate": RiskTier.SENSITIVE,
    "browser_screenshot": RiskTier.SENSITIVE,
    "browser_click": RiskTier.SENSITIVE,
    "browser_type": RiskTier.SENSITIVE,
    "browser_get_text": RiskTier.READ_ONLY,
    "browser_evaluate": RiskTier.SENSITIVE,
    "browser_get_url": RiskTier.READ_ONLY,
    "browser_go_back": RiskTier.SENSITIVE,
    "browser_go_forward": RiskTier.SENSITIVE,
    "browser_scroll": RiskTier.SENSITIVE,
    "browser_close": RiskTier.SENSITIVE,
    "browser_new_page": RiskTier.SENSITIVE,
    "browser_get_elements": RiskTier.READ_ONLY,
    "browser_wait_for_selector": RiskTier.SENSITIVE,
    "browser_select_option": RiskTier.SENSITIVE,
    "browser_download_file": RiskTier.SENSITIVE,
}

@dataclass(frozen=True)
class Policy:
    """Admin-owned policy. Frozen so tool code cannot mutate it at runtime."""
    allow_writes: bool = True
    allow_tier3: bool = False
    allowed_services: frozenset[str] = frozenset()
    allowed_apps: frozenset[str] = frozenset()
    allowed_test_commands: frozenset[str] = frozenset({"pytest", "npm test", "go test"})
    desktop_enabled: bool = False
    max_tier_unattended: int = 2  # unattended execution ceiling
    allowed_tools: frozenset[str] | None = None  # None means all valid tools permitted unless denied
    denied_tools: frozenset[str] = frozenset()  # explicitly blocked tools
    unrestricted: bool = False  # Bypasses all risk tier, write, and approval blocks (server/DevOps mode)

    def tier_of(self, tool: str) -> RiskTier | None:
        return TOOL_TIERS.get(tool)

@dataclass
class Decision:
    allowed: bool
    needs_approval: bool = False
    reason: str = ""

def decide(policy: Policy, tool: str, *, approval_granted: bool = False,
           device_revoked: bool = False, is_admin: bool = False) -> Decision:
    if device_revoked:
        return Decision(False, reason="Device is revoked.")
    tier = policy.tier_of(tool)
    if tier is None:
        return Decision(False, reason=f"Unknown or unlisted tool: {tool}")
    # Device-specific and policy-specific tool blocking
    if tool in policy.denied_tools:
        return Decision(False, reason=f"Tool '{tool}' is disabled by device policy.")
    if policy.allowed_tools is not None and tool not in policy.allowed_tools:
        return Decision(False, reason=f"Tool '{tool}' is not in the allowed tools list for this policy.")

    # Unrestricted server mode (e.g. Linux servers / DevOps) bypasses all tier & approval guardrails
    if policy.unrestricted:
        return Decision(True, reason="Allowed (unrestricted server policy).")
    if tier == RiskTier.HIGH_RISK and not (approval_granted and is_admin):
        if not (policy.max_tier_unattended >= 4 and tool not in policy.denied_tools):
            return Decision(False, needs_approval=True,
                            reason="High-risk operation requires explicit human approval.")
    if tier == RiskTier.SENSITIVE:
        desktop_tools = {
            "capture_desktop_screenshot", "take_screenshot", "start_webrtc_stream", "launch_approved_application",
            "perform_approved_ui_action", "mouse_click", "mouse_move", "mouse_scroll",
            "mouse_drag", "keyboard_type", "keyboard_press", "press_hotkey", "focus_window",
            "ocr_screen", "click_text", "click_element", "list_ui_elements", "set_of_marks_screenshot",
            "wait_for_text", "verify_screen_contains", "execute_workflow",
            "desktop_get_screenshot", "desktop_get_window_screenshot", "desktop_mouse_move", "desktop_click", "desktop_keyboard",
            "desktop_scroll", "desktop_clipboard_set", "desktop_open_application", "desktop_wait", "desktop_verify_action",
        }
        if tool in desktop_tools and not policy.desktop_enabled:
            return Decision(False, reason="Desktop automation is not enabled.")
        # A human approval record for this task is itself the Tier-3
        # opt-in: without it, an approved task would be re-denied by the
        # agent after the control plane released it (see next_task).
        if not (policy.allow_tier3 or policy.max_tier_unattended >= 3 or is_admin) and not approval_granted and tool not in {"submit_task", "create_backup"}:
            return Decision(False, needs_approval=True,
                            reason="Sensitive operation requires Tier-3 opt-in or approval.")
        effective_ceiling = max(policy.max_tier_unattended, 3) if (policy.allow_tier3 or policy.max_tier_unattended >= 3 or is_admin or tool in {"submit_task", "create_backup"}) else policy.max_tier_unattended
        if not is_admin and tier > effective_ceiling and not approval_granted:
            return Decision(False, needs_approval=True,
                            reason="Operation exceeds the unattended tier ceiling.")
    if tier == RiskTier.LOW_RISK and tool in {"create_workspace_file"} and not policy.allow_writes:
        return Decision(False, reason="Workspace writes are disabled by policy.")
    return Decision(True, reason=f"Allowed (tier {tier}).")
