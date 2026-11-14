"""Tool dispatch for agent-executed tasks.

The agent (or a test harness acting as one) calls dispatch() with a tool
name and validated arguments. Unknown tools, Tier-4 tools without an
approved approval record, and desktop tools when disabled are rejected
here — this is the server-side enforcement point, not the prompt.
"""
from __future__ import annotations

from .. import browser_tools, dev_tools, diagnostics, git_ops, tools, workspace, webrtc_stream
from ..policy import TOOL_TIERS, Policy, RiskTier, decide
from . import dispatch_audit, supervisor
from .task_runtime import TaskCancelled, current_device_id, raise_if_cancelled


def _start_webrtc_from_task(a: dict) -> dict:
    """Start an agent-side WebRTC stream. The poller registers the
    control URL + device token as agent context at startup; without it
    the task cannot signal and fails with a clear message."""
    ctx = webrtc_stream._AGENT_CONTEXT
    if not ctx.get("control_url") or not ctx.get("device_token"):
        raise RuntimeError("Agent context (control URL / device token) is not set; cannot start WebRTC stream.")
    session_id = a["session_id"]
    signaling = webrtc_stream.HttpSignaling(ctx["control_url"], ctx["device_token"], session_id)
    monitor_index = a.get("monitor_index")
    if monitor_index is not None:
        try:
            monitor_index = int(monitor_index)
        except (TypeError, ValueError):
            monitor_index = None
    bitrate_kbps = a.get("bitrate_kbps")
    if bitrate_kbps is not None:
        try:
            bitrate_kbps = int(bitrate_kbps)
        except (TypeError, ValueError):
            bitrate_kbps = None
    return webrtc_stream.start_stream(
        session_id,
        signaling,
        scale=float(a.get("scale", 0.75)),
        fps=int(a.get("fps", 30)),
        monitor_index=monitor_index,
        bitrate_kbps=int(bitrate_kbps) if bitrate_kbps is not None else 4500,
    )


def _supervisor_enqueue_handoff(a: dict) -> dict:
    raise RuntimeError(
        "supervisor_enqueue_handoff must be queued via the control plane API (/api/supervisor/handoff); "
        "it requires a database connection."
    )


def _dispatch_browser(tool: str, a: dict, *, approval_granted: bool, policy: Policy | None) -> dict:
    """Map fleet task args to Playwright browser_tools entrypoints."""
    raise_if_cancelled()
    a = a or {}
    common = {"approval_granted": approval_granted, "policy": policy}
    if tool == "browser_navigate":
        timeout_raw = a.get("timeout")
        timeout = int(timeout_raw) if timeout_raw is not None else None
        return browser_tools.browser_navigate(
            a["url"],
            wait_until=str(a.get("wait_until", "networkidle")),
            timeout=timeout,
            screenshot_after_nav=bool(a.get("screenshot_after_nav", False)),
            **common,
        )
    if tool == "browser_screenshot":
        return browser_tools.browser_screenshot(full_page=bool(a.get("full_page", False)), **common)
    if tool == "browser_click":
        return browser_tools.browser_click(
            a["selector"],
            button=str(a.get("button", "left")),
            clicks=int(a.get("clicks", 1)),
            **common,
        )
    if tool == "browser_type":
        return browser_tools.browser_type(
            a["selector"],
            a["text"],
            clear_first=bool(a.get("clear_first", True)),
            submit=bool(a.get("submit", False)),
            **common,
        )
    if tool == "browser_get_text":
        return browser_tools.browser_get_text(str(a.get("selector", "body")), **common)
    if tool == "browser_evaluate":
        return browser_tools.browser_evaluate(a["script"], **common)
    if tool == "browser_get_url":
        return browser_tools.browser_get_url(**common)
    if tool == "browser_go_back":
        return browser_tools.browser_go_back(**common)
    if tool == "browser_go_forward":
        return browser_tools.browser_go_forward(**common)
    if tool == "browser_scroll":
        return browser_tools.browser_scroll(
            delta_y=int(a.get("delta_y", a.get("delta", 0))),
            delta_x=int(a.get("delta_x", 0)),
            **common,
        )
    if tool == "browser_close":
        return browser_tools.browser_close(**common)
    if tool == "browser_new_page":
        return browser_tools.browser_new_page(a.get("url"), **common)
    if tool == "browser_get_elements":
        return browser_tools.browser_get_elements(
            a["selector"],
            include_text=bool(a.get("include_text", True)),
            **common,
        )
    if tool == "browser_wait_for_selector":
        return browser_tools.browser_wait_for_selector(
            a["selector"],
            timeout=int(a.get("timeout", 10)),
            state=str(a.get("state", "visible")),
            **common,
        )
    if tool == "browser_select_option":
        return browser_tools.browser_select_option(
            a["selector"],
            value=a.get("value"),
            label=a.get("label"),
            **common,
        )
    if tool == "browser_download_file":
        return browser_tools.browser_download_file(
            a["url"],
            filename=a.get("filename"),
            **common,
        )
    raise ValueError(f"Browser tool not implemented: {tool}")


def dispatch(tool: str, args: dict, *, policy: Policy | None = None,
             approval_granted: bool = False, is_admin: bool = False):
    explicit_policy = policy
    policy = policy or tools.default_policy()
    # Approval records in the control plane can only be decided by an admin,
    # so an approved task released to an agent carries admin authorization.
    d = decide(policy, tool, approval_granted=approval_granted, is_admin=is_admin or approval_granted)
    if not d.allowed:
        raise PermissionError(d.reason)
    raise_if_cancelled()
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
        "git_create_branch": lambda a: git_ops.git_create_branch(
            a.get("relative_directory", "."),
            a["branch_name"],
        ),
        "git_checkpoint": lambda a: git_ops.git_checkpoint(
            a.get("relative_directory", "."),
            str(a.get("message", "ai-bridge checkpoint")),
        ),
        "git_apply_patch": lambda a: git_ops.git_apply_patch(
            a.get("relative_directory", "."),
            a["patch_text"],
            check_only=bool(a.get("check_only", False)),
        ),
        "workspace_project_structure": lambda a: workspace.project_structure(
            a.get("relative_directory", "."),
            max_depth=int(a.get("max_depth", 3)),
        ),
        "dev_workspace_plan": lambda a: dev_tools.dev_workspace_plan(
            a.get("relative_directory", "."),
            max_depth=int(a.get("max_depth", 3)),
        ),
        "run_project_tests": lambda a: tools.run_project_tests(a.get("test_command", "pytest"), a.get("timeout", 120), policy=policy),
        "run_project_tests_structured": lambda a: dev_tools.run_project_tests_structured(
            a.get("test_command", "pytest -q"),
            int(a.get("timeout", 120)),
            policy=policy,
        ),
        "browser_session_info": lambda a: browser_tools.browser_session_info(),
        "supervisor_delegate_role": lambda a: supervisor.delegate_role_target(str(a.get("role") or a["role"])),
        "supervisor_enqueue_handoff": lambda a: _supervisor_enqueue_handoff(a),
        "run_linter": lambda a: tools.run_linter(a.get("timeout", 60)),
        "create_backup": lambda a: tools.create_backup(a.get("relative_directory", "."), approval_granted=approval_granted, policy=policy),
        "deploy_application": lambda a: tools.deploy_application(a.get("project_directory", "."), a.get("target_directory", "deploy-staging"), approval_granted=approval_granted, policy=policy),
        "get_desktop_status": lambda a: tools.get_desktop_status(),
        "get_native_encode_status": lambda a: __import__(
            "ai_bridge.native_encode", fromlist=["describe_native_encode"]
        ).describe_native_encode(),
        "capture_desktop_screenshot": lambda a: tools.capture_desktop_screenshot(approval_granted=approval_granted, policy=policy),
        "take_screenshot": lambda a: tools.capture_desktop_screenshot(approval_granted=approval_granted, policy=policy),
        "capture_desktop_frame": lambda a: tools.capture_desktop_frame(
            scale=float(a.get("scale", 0.75)),
            quality=int(a.get("quality", 70)),
            approval_granted=approval_granted,
            policy=policy,
        ),
        "update_fleet_agent": lambda a: tools.update_fleet_agent(approval_granted=approval_granted, policy=policy),
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
            intent_id=a.get("intent_id"),
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
            intent_id=a.get("intent_id"),
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
        "get_clipboard": lambda a: tools.get_clipboard(
            policy=policy,
        ),
        "set_clipboard": lambda a: tools.set_clipboard(
            str(a.get("text", "")),
            paste=bool(a.get("paste", False)),
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
        "broadcast_fleet_command": lambda a: tools.broadcast_fleet_command(
            a["tool"],
            args=a.get("args", {}),
            target_os=a.get("target_os"),
            target_device_ids=a.get("target_device_ids"),
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
        "terminal_exec": lambda a: tools.terminal_exec(
            a["command"],
            working_directory=a.get("working_directory", ""),
            timeout=int(a.get("timeout", 0)),
            approval_granted=approval_granted,
            is_admin=is_admin,
            policy=policy,
        ),
        "start_webrtc_stream": lambda a: _start_webrtc_from_task(a),
        "get_system_monitors": lambda a: {"monitors": tools.get_system_monitors()},
        "stop_webrtc_stream": lambda a: webrtc_stream.stop_stream(a["session_id"]),
        "read_file": lambda a: tools.read_file(a["path"], int(a.get("max_chars", 100000)), is_admin=is_admin, policy=policy),
        "write_file": lambda a: tools.write_file(
            a["path"],
            a["content"],
            bool(a.get("overwrite", False)),
            approval_granted=approval_granted,
            is_admin=is_admin,
            policy=policy,
        ),
        # Canonical v1.0 MCP Computer-Use Toolset (Section 8)
        "desktop_get_screenshot": lambda a: tools.desktop_get_screenshot(approval_granted=approval_granted, policy=policy),
        "desktop_get_status": lambda a: tools.desktop_get_status(),
        "desktop_mouse_move": lambda a: tools.desktop_mouse_move(
            int(a.get("x", 0)),
            int(a.get("y", 0)),
            approval_granted=approval_granted,
            policy=policy,
        ),
        "desktop_click": lambda a: tools.desktop_click(
            int(a.get("x", 0)),
            int(a.get("y", 0)),
            button=str(a.get("button", "left")),
            clicks=int(a.get("clicks", 1)),
            approval_granted=approval_granted,
            policy=policy,
            intent_id=a.get("intent_id"),
        ),
        "desktop_keyboard": lambda a: tools.desktop_keyboard(
            text=str(a.get("text", "")),
            key=str(a.get("key", "")),
            action=str(a.get("action", "type")),
            approval_granted=approval_granted,
            policy=policy,
        ),
        "desktop_scroll": lambda a: tools.desktop_scroll(
            delta=int(a.get("delta", -120)),
            x=a.get("x"),
            y=a.get("y"),
            approval_granted=approval_granted,
            policy=policy,
        ),
        "desktop_execute_command": lambda a: tools.desktop_execute_command(
            str(a.get("command", "")),
            working_directory=str(a.get("working_directory", "")),
            timeout=int(a.get("timeout", 60)),
            approval_granted=approval_granted,
            is_admin=is_admin,
            policy=policy,
        ),
        "desktop_open_application": lambda a: tools.desktop_open_application(
            str(a.get("app_name", "")),
            url=a.get("url"),
            approval_granted=approval_granted,
            policy=policy,
        ),
        "desktop_get_windows": lambda a: tools.desktop_get_windows(
            approval_granted=approval_granted,
            policy=policy,
        ),
        "desktop_wait": lambda a: tools.desktop_wait(
            condition=str(a.get("condition", "sleep")),
            text=str(a.get("text", "")),
            window_title=str(a.get("window_title", "")),
            seconds=float(a.get("seconds", 1.0)),
            timeout_seconds=float(a.get("timeout_seconds", 10.0)),
            approval_granted=approval_granted,
            policy=policy,
        ),
        "desktop_verify_action": lambda a: tools.desktop_verify_action(
            expected_text=str(a.get("expected_text", "")),
            expected_window=str(a.get("expected_window", "")),
            wait_seconds=float(a.get("wait_seconds", 0.35)),
            capture_after=bool(a.get("capture_after", True)),
            intent_id=a.get("intent_id"),
            approval_granted=approval_granted,
            policy=policy,
        ),
        "desktop_veto_action": lambda a: tools.desktop_veto_action(
            str(a.get("intent_id", "")),
            str(a.get("reason", "Operator override")),
        ),
    }
    from ..connectors import browserbase, firecrawl, microsoft365, you_search

    _browser_names = {
        "browser_navigate",
        "browser_screenshot",
        "browser_click",
        "browser_type",
        "browser_get_text",
        "browser_evaluate",
        "browser_get_url",
        "browser_go_back",
        "browser_go_forward",
        "browser_scroll",
        "browser_close",
        "browser_new_page",
        "browser_get_elements",
        "browser_wait_for_selector",
        "browser_select_option",
        "browser_download_file",
    }
    for btool in _browser_names:
        handlers[btool] = (
            lambda a, _t=btool, _ag=approval_granted, _pol=policy: _dispatch_browser(
                _t, a or {}, approval_granted=_ag, policy=_pol
            )
        )

    handlers.update({name: (lambda a, _fn=fn: _fn(a)) for name, fn in microsoft365.TOOLS.items()})
    handlers.update({name: (lambda a, _fn=fn: _fn(a)) for name, fn in browserbase.TOOLS.items()})
    handlers.update({name: (lambda a, _fn=fn: _fn(a)) for name, fn in you_search.TOOLS.items()})
    handlers.update({name: (lambda a, _fn=fn: _fn(a)) for name, fn in firecrawl.TOOLS.items()})
    handler = handlers.get(tool)
    if handler is None:
        raise ValueError(f"Tool not executable via the control plane: {tool}")
    result = handler(args or {})
    dispatch_audit.record_dispatch_tool(
        tool,
        args or {},
        result,
        device_id=current_device_id() or "",
    )
    return result
