"""Tool dispatch for agent-executed tasks.

The agent (or a test harness acting as one) calls dispatch() with a tool
name and validated arguments. Unknown tools, Tier-4 tools without an
approved approval record, and desktop tools when disabled are rejected
here — this is the server-side enforcement point, not the prompt.
"""
from __future__ import annotations

from .. import diagnostics, git_ops, tools, workspace
from ..policy import TOOL_TIERS, Policy, RiskTier, decide


def dispatch(tool: str, args: dict, *, policy: Policy | None = None,
             approval_granted: bool = False, is_admin: bool = False):
    explicit_policy = policy
    policy = policy or tools.default_policy()
    # Approval records in the control plane can only be decided by an admin,
    # so an approved task released to an agent carries admin authorization.
    d = decide(policy, tool, approval_granted=approval_granted, is_admin=is_admin or approval_granted)
    if not d.allowed:
        raise PermissionError(d.reason)
    tier = TOOL_TIERS.get(tool)
    if tier == RiskTier.HIGH_RISK and not approval_granted and getattr(policy, "max_tier_unattended", 2) < 4:
        raise PermissionError("High-risk tool requires an approved approval record.")
    handlers = {
        "get_system_info": lambda a: tools.get_system_info(),
        "get_resource_usage": lambda a: tools.get_resource_usage(),
        "get_disk_usage": lambda a: diagnostics.disk_usage("/"),
        "get_memory_usage": lambda a: diagnostics.memory_usage(),
        "list_workspace": lambda a: workspace.list_workspace(a.get("relative_directory", ".")),
        "read_workspace_file": lambda a: workspace.read_workspace_text(a["relative_path"]),
        "search_workspace": lambda a: workspace.search_workspace(a["query"], a.get("relative_directory", ".")),
        "create_workspace_file": lambda a: workspace.create_workspace_file(a["relative_path"], a["content"], a.get("overwrite", False)),
        "edit_workspace_file": lambda a: workspace.edit_workspace_file(a["relative_path"], a["old_text"], a["new_text"]),
        "move_workspace_file": lambda a: workspace.move_workspace_file(a["source"], a["destination"]),
        "delete_workspace_file": lambda a: workspace.delete_workspace_file(a["relative_path"]),
        "get_service_status": lambda a: tools.get_service_status(a["service"], policy=policy),
        "get_recent_logs": lambda a: diagnostics.recent_logs(a.get("source", "system"), a.get("lines", 50)),
        "list_processes": lambda a: diagnostics.list_processes(a.get("limit", 50)),
        "list_docker_containers": lambda a: diagnostics.list_docker_containers(),
        "git_status": lambda a: git_ops.git_status(a.get("relative_directory", ".")),
        "git_diff": lambda a: git_ops.git_diff(a.get("relative_directory", ".")),
        "run_project_tests": lambda a: tools.run_project_tests(a.get("test_command", "pytest"), a.get("timeout", 120), policy=policy),
        "run_linter": lambda a: tools.run_linter(a.get("timeout", 60)),
        "create_backup": lambda a: tools.create_backup(a.get("relative_directory", "."), approval_granted=approval_granted, policy=policy),
        "deploy_application": lambda a: tools.deploy_application(a.get("project_directory", "."), a.get("target_directory", "deploy-staging"), approval_granted=approval_granted, policy=policy),
        "get_desktop_status": lambda a: tools.get_desktop_status(),
        "capture_desktop_screenshot": lambda a: tools.capture_desktop_screenshot(approval_granted=approval_granted, policy=policy),
        "take_screenshot": lambda a: tools.capture_desktop_screenshot(approval_granted=approval_granted, policy=policy),
        "launch_approved_application": lambda a: tools.launch_approved_application(a["app_name"], approval_granted=approval_granted, url=a.get("url"), policy=policy),
        "perform_approved_ui_action": lambda a: tools.perform_approved_ui_action(
            a["action"],
            x=a.get("x"),
            y=a.get("y"),
            text=a.get("text"),
            key=a.get("key"),
            title=a.get("title"),
            delta=int(a.get("delta", -120)),
            start_x=a.get("start_x"),
            start_y=a.get("start_y"),
            approval_granted=approval_granted,
            policy=policy,
        ),
        "mouse_click": lambda a: tools.mouse_click(
            int(a.get("x", 0)),
            int(a.get("y", 0)),
            button=str(a.get("button", "left")),
            clicks=int(a.get("clicks", 1)),
            approval_granted=approval_granted,
            policy=policy,
        ),
        "mouse_move": lambda a: tools.mouse_move(
            int(a.get("x", 0)),
            int(a.get("y", 0)),
            approval_granted=approval_granted,
            policy=policy,
        ),
        "mouse_scroll": lambda a: tools.mouse_scroll(
            delta=int(a.get("delta", -120)),
            x=a.get("x"),
            y=a.get("y"),
            approval_granted=approval_granted,
            policy=policy,
        ),
        "mouse_drag": lambda a: tools.mouse_drag(
            int(a.get("start_x", 0)),
            int(a.get("start_y", 0)),
            int(a.get("end_x", a.get("x", 0))),
            int(a.get("end_y", a.get("y", 0))),
            approval_granted=approval_granted,
            policy=policy,
        ),
        "keyboard_type": lambda a: tools.keyboard_type(
            str(a.get("text", "")),
            approval_granted=approval_granted,
            policy=policy,
        ),
        "keyboard_press": lambda a: tools.keyboard_press(
            str(a.get("key", "")),
            approval_granted=approval_granted,
            policy=policy,
        ),
        "list_desktop_windows": lambda a: tools.list_desktop_windows(
            approval_granted=approval_granted,
            policy=policy,
        ),
        "focus_window": lambda a: tools.focus_window(
            str(a.get("title", "")),
            approval_granted=approval_granted,
            policy=policy,
        ),
        "get_screen_size": lambda a: tools.get_screen_size(
            policy=policy,
        ),
        "ocr_screen": lambda a: tools.ocr_screen(
            approval_granted=approval_granted,
            policy=policy,
        ),
        "click_text": lambda a: tools.click_text(
            a["text"],
            occurrence=int(a.get("occurrence", 1)),
            button=str(a.get("button", "left")),
            clicks=int(a.get("clicks", 1)),
            approval_granted=approval_granted,
            policy=policy,
        ),
        "click_element": lambda a: tools.click_element(
            mark_id=a.get("mark_id"),
            name=a.get("name"),
            button=str(a.get("button", "left")),
            clicks=int(a.get("clicks", 1)),
            approval_granted=approval_granted,
            policy=policy,
        ),
        "list_ui_elements": lambda a: tools.list_ui_elements(
            approval_granted=approval_granted,
            policy=policy,
        ),
        "set_of_marks_screenshot": lambda a: tools.set_of_marks_screenshot(
            max_marks=int(a.get("max_marks", 40)),
            approval_granted=approval_granted,
            policy=policy,
        ),
        "wait_for_text": lambda a: tools.wait_for_text(
            a["text"],
            timeout_seconds=float(a.get("timeout_seconds", 15.0)),
            poll_interval=float(a.get("poll_interval", 1.0)),
            occurrence=int(a.get("occurrence", 1)),
            approval_granted=approval_granted,
            policy=policy,
        ),
        "verify_screen_contains": lambda a: tools.verify_screen_contains(
            a["text"],
            occurrence=int(a.get("occurrence", 1)),
            approval_granted=approval_granted,
            policy=policy,
        ),
        "press_hotkey": lambda a: tools.press_hotkey(
            a["combo"],
            approval_granted=approval_granted,
            policy=policy,
        ),
        "execute_workflow": lambda a: tools.execute_workflow(
            a.get("steps", []),
            stop_on_failure=bool(a.get("stop_on_failure", True)),
            max_retries=int(a.get("max_retries", 1)),
            approval_granted=approval_granted,
            policy=policy,
        ),
        "install_package": lambda a: tools.install_package(
            a["package_id"],
            a.get("version"),
            approval_granted=approval_granted,
            **({"policy": explicit_policy} if explicit_policy is not None else {}),
        ),
        "run_shell": lambda a: tools.run_shell(
            a["command"],
            working_directory=a.get("working_directory", ""),
            timeout=int(a.get("timeout", 0)),
            approval_granted=approval_granted,
            policy=policy,
        ),
        "read_file": lambda a: tools.read_file(a["path"], int(a.get("max_chars", 100000)), policy=policy),
        "write_file": lambda a: tools.write_file(
            a["path"],
            a["content"],
            bool(a.get("overwrite", False)),
            approval_granted=approval_granted,
            is_admin=is_admin,
            policy=policy,
        ),
    }
    handler = handlers.get(tool)
    if handler is None:
        raise ValueError(f"Tool not executable via the control plane: {tool}")
    return handler(args or {})
