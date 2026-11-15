"""Tool dispatch for agent-executed tasks.

The agent (or a test harness acting as one) calls dispatch() with a tool
name and validated arguments. Unknown tools, Tier-4 tools without an
approved approval record, and desktop tools when disabled are rejected
here — this is the server-side enforcement point, not the prompt.
"""
from __future__ import annotations

import json
import os
from dataclasses import asdict
from pathlib import Path

from .. import audit as audit_mod
from .. import browser_tools, dev_tools, diagnostics, execution, git_ops, tasks, tools, workspace, webrtc_stream
from ..policy import TOOL_TIERS, Policy, RiskTier, decide, normalize_tool_name
from . import dispatch_audit, supervisor
from .task_runtime import current_device_id, raise_if_cancelled


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
    return supervisor.dispatch_supervisor_enqueue_handoff(a or {})


def _supervisor_recover_role_tasks(a: dict) -> dict:
    return supervisor.dispatch_supervisor_recover(a or {})


def _agent_run_role(a: dict) -> dict:
    """Device pollers cannot run role agents; AgentRunner claims these tasks on the plane."""
    raise RuntimeError(
        "agent_run_role is claimed by the control-plane AgentRunner; "
        "do not execute it on a device poller."
    )


def _dispatch_list_devices() -> dict:
    sys_info = tools.get_system_info()
    out: list[dict] = [
        {
            "id": "local",
            "device_id": "local",
            "name": "local",
            "hostname": sys_info.get("machine"),
            "os": sys_info.get("system"),
            "status": "online",
            "workspace": sys_info.get("workspace"),
        }
    ]
    conn = supervisor.get_plane_conn()
    if conn is None:
        return {"devices": out}
    rows = conn.execute(
        "SELECT d.id, d.name, d.hostname, d.os, d.tenant, d.status, d.last_seen, m.group_name, m.tags_json "
        "FROM devices d "
        "LEFT JOIN device_metadata m ON m.device_id = d.id "
        "WHERE d.revoked = 0 "
        "ORDER BY d.last_seen DESC"
    ).fetchall()
    for r in rows:
        item = dict(r)
        item["device_id"] = item.get("id")
        item["group"] = item.pop("group_name", None) or ""
        try:
            item["tags"] = json.loads(item.pop("tags_json", None) or "[]")
        except Exception:
            item["tags"] = []
        out.append(item)
    return {"devices": out}


def _dispatch_device_status(a: dict) -> dict:
    dev_id = str(a.get("device_id") or a.get("id") or "local").strip()
    conn = supervisor.get_plane_conn()
    if not dev_id or dev_id.lower() in ("local", "host", "droplet") or conn is None:
        return {"device_id": "local", "status": "online", **tools.get_resource_usage()}
    row = conn.execute(
        "SELECT id, name, hostname, os, status, last_seen FROM devices WHERE (id=? OR LOWER(name)=LOWER(?)) AND revoked=0 LIMIT 1",
        (dev_id, dev_id),
    ).fetchone()
    if row is None:
        raise ValueError(f"Device '{dev_id}' not found.")
    return {"device_id": row["id"], "name": row["name"], "hostname": row["hostname"], "os": row["os"], "status": row["status"], "last_seen": row["last_seen"]}


def _dispatch_browser_snapshot(a: dict, *, approval_granted: bool, policy: Policy | None) -> dict:
    url_info = browser_tools.browser_get_url(approval_granted=approval_granted, policy=policy)
    text_info = browser_tools.browser_get_text(str(a.get("selector", "body")), approval_granted=approval_granted, policy=policy)
    el_info = browser_tools.browser_get_elements("a,button,input,textarea,select,[role='button']", include_text=True, approval_granted=approval_granted, policy=policy)
    return {"ok": True, "url": url_info, "text": text_info, "elements": el_info}


def _dispatch_agent_notify(a: dict) -> dict:
    from . import alerts

    title = str(a.get("title") or "AI Bridge Notification").strip()
    message = str(a.get("message") or "").strip()
    sev = str(a.get("severity") or "info").strip().lower()
    if sev not in ("info", "warning", "critical"):
        sev = "info"
    return {"ok": True, "dispatched": alerts.dispatch_alert("agent_alert", sev, title, {"message": message}, async_dispatch=False)}


def _dispatch_agent_remember(a: dict) -> dict:
    conn = supervisor.get_plane_conn()
    if conn is None:
        raise RuntimeError("agent_remember requires control-plane database context.")
    from . import agent_memory

    fact = str(a.get("fact") or "").strip()
    if not fact:
        raise ValueError("fact is required.")
    agent_id = str(a.get("agent_id") or "supervisor").strip()
    chunk = agent_memory.append_memory_chunk(
        conn,
        agent_id,
        fact,
        tenant=str(a.get("tenant") or "default"),
        project_tag=str(a.get("project") or "").strip() or None,
        task_tag=str(a.get("task") or "").strip() or None,
    )
    conn.commit()
    return {"ok": True, "remembered": fact, "chunk": chunk}


def _dispatch_agent_delegate(a: dict) -> dict:
    conn = supervisor.get_plane_conn()
    if conn is None:
        raise RuntimeError("agent_delegate requires control-plane database context.")
    role = str(a.get("role") or "").strip().lower()
    if not role and str(a.get("target_agent") or "").startswith("agent-role-"):
        role = str(a["target_agent"]).removeprefix("agent-role-").lower()
    if not role:
        return supervisor.delegate_role_target(str(a.get("target_agent") or "planner"))
    return supervisor.enqueue_agent_run_role(
        conn,
        device_id=str(a.get("device") or "local"),
        tenant=str(a.get("tenant") or "default"),
        role=role,
        prompt=str(a.get("prompt") or a.get("message") or ""),
        parent_task_id=a.get("parent_task_id"),
        goal=str(a.get("goal") or "")[:200] or None,
    )


def _dispatch_agent_run_workflow(a: dict) -> dict:
    steps = a.get("steps") or []
    return tools.execute_workflow(steps, stop_on_failure=bool(a.get("stop_on_failure", True)))


def _dispatch_browser(tool: str, a: dict, *, approval_granted: bool, policy: Policy | None) -> dict:
    """Map fleet task args to Playwright browser_tools entrypoints."""
    raise_if_cancelled()
    a = a or {}
    common = {"approval_granted": approval_granted, "policy": policy}
    if tool == "browser_navigate":
        raise_if_cancelled()
        timeout_raw = a.get("timeout")
        timeout = int(timeout_raw) if timeout_raw is not None else None
        result = browser_tools.browser_navigate(
            a["url"],
            wait_until=str(a.get("wait_until", "networkidle")),
            timeout=timeout,
            screenshot_after_nav=bool(a.get("screenshot_after_nav", False)),
            **common,
        )
        raise_if_cancelled()
        return result
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
    if tool == "browser_set_viewport":
        return browser_tools.browser_set_viewport(
            str(a.get("device", "desktop")),
            width=a.get("width"),
            height=a.get("height"),
            is_mobile=a.get("is_mobile"),
            has_touch=a.get("has_touch"),
            recreate_context=bool(a.get("recreate_context", True)),
            **common,
        )
    if tool == "browser_expect":
        return browser_tools.browser_expect(
            text=a.get("text"),
            url_contains=a.get("url_contains"),
            title_contains=a.get("title_contains"),
            selector=a.get("selector"),
            visible=bool(a.get("visible", True)),
            screenshot_on_fail=bool(a.get("screenshot_on_fail", False)),
            **common,
        )
    if tool == "browser_wait_for_url":
        return browser_tools.browser_wait_for_url(
            str(a.get("url_contains") or a.get("url") or ""),
            timeout=int(a.get("timeout", 15)),
            **common,
        )
    if tool == "browser_diagnostics":
        return browser_tools.browser_diagnostics(**common)
    if tool == "browser_compare_screenshot":
        return browser_tools.browser_compare_screenshot(
            str(a.get("baseline") or a.get("name") or ""),
            threshold=float(a.get("threshold", 0.08)),
            full_page=bool(a.get("full_page", False)),
            update_baseline=bool(a.get("update_baseline", False)),
            **common,
        )
    raise ValueError(f"Browser tool not implemented: {tool}")


def dispatch(tool: str, args: dict, *, policy: Policy | None = None,
             approval_granted: bool = False, is_admin: bool = False):
    raw_tool = tool
    tool = normalize_tool_name(tool)
    explicit_policy = policy
    policy = policy or tools.default_policy()
    # Approval records in the control plane can only be decided by an admin,
    # so an approved task released to an agent carries admin authorization.
    d = decide(policy, tool, approval_granted=approval_granted, is_admin=is_admin or approval_granted)
    if not d.allowed:
        raise PermissionError(d.reason)
    raise_if_cancelled()
    tier = TOOL_TIERS.get(tool)
    if (
        tier == RiskTier.HIGH_RISK
        and not approval_granted
        and not getattr(policy, "unrestricted", False)
        and getattr(policy, "max_tier_unattended", 2) < 4
    ):
        raise PermissionError("High-risk tool requires an approved approval record.")
    normalized_args = dict(args or {})
    if raw_tool == "desktop.launch_app" and "app" in normalized_args and "app_name" not in normalized_args:
        normalized_args["app_name"] = normalized_args["app"]
    elif raw_tool == "desktop.type" and "action" not in normalized_args:
        normalized_args["action"] = "type"
    handlers = {
        "list_devices": lambda a: _dispatch_list_devices(),
        "get_device_status": lambda a: _dispatch_device_status(a),
        "select_device": lambda a: _dispatch_device_status(a),
        "get_system_info": lambda a: tools.get_system_info(),
        "get_resource_usage": lambda a: tools.get_resource_usage(),
        "get_network_info": lambda a: diagnostics.network_info(),
        "get_disk_usage": lambda a: diagnostics.disk_usage("/"),
        "get_memory_usage": lambda a: diagnostics.memory_usage(),
        "run_diagnostic_task": lambda a: tasks.run_diagnostic(str(a.get("task_name") or a.get("name") or "uptime")),
        "submit_task": lambda a: asdict(execution.RUNNER.submit(str(a.get("task_name") or a.get("name") or "uptime"), timeout=int(a.get("timeout", 30)), test_command=str(a.get("test_command", "pytest")))),
        "get_task_status": lambda a: asdict(execution.RUNNER.get(str(a["task_id"]))),
        "get_task_result": lambda a: asdict(execution.RUNNER.get(str(a["task_id"]))),
        "cancel_task": lambda a: asdict(execution.RUNNER.cancel(str(a["task_id"]))),
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
        "git_log": lambda a: git_ops.git_log(a.get("relative_directory", "."), int(a.get("limit", 20))),
        "git_commit": lambda a: git_ops.git_commit(a.get("relative_directory", "."), str(a.get("message", ""))),
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
        "supervisor_recover_role_tasks": lambda a: _supervisor_recover_role_tasks(a),
        "agent_run_role": lambda a: _agent_run_role(a),
        "agent_remember": lambda a: _dispatch_agent_remember(a),
        "agent_notify": lambda a: _dispatch_agent_notify(a),
        "agent_delegate": lambda a: _dispatch_agent_delegate(a),
        "agent_run_workflow": lambda a: _dispatch_agent_run_workflow(a),
        "browser_snapshot": lambda a: _dispatch_browser_snapshot(a, approval_granted=approval_granted, policy=policy),
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
        "desktop_get_window_screenshot": lambda a: tools.desktop_get_window_screenshot(
            hwnd=a.get("hwnd"),
            title=str(a.get("title", "")),
            scale=float(a.get("scale", 1.0)),
            approval_granted=approval_granted,
            policy=policy,
        ),
        "desktop_get_monitors": lambda a: tools.desktop_get_monitors(policy=policy),
        "desktop_clipboard_get": lambda a: tools.desktop_clipboard_get(policy=policy),
        "desktop_clipboard_set": lambda a: tools.desktop_clipboard_set(
            str(a.get("text", "")),
            paste=bool(a.get("paste", False)),
            approval_granted=approval_granted,
            policy=policy,
        ),
        "desktop_get_ui_elements": lambda a: tools.desktop_get_ui_elements(
            include_controls=bool(a.get("include_controls", True)),
            max_elements=int(a.get("max_elements", 25)),
            monitor_index=a.get("monitor_index"),
            approval_granted=approval_granted,
            policy=policy,
        ),
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
        "desktop_anticipate_action": lambda a: tools.desktop_anticipate_action(
            action=str(a.get("action", "")),
            x=float(a.get("x", 0.0)),
            y=float(a.get("y", 0.0)),
            label=str(a.get("label", "")),
            risk_tier=str(a.get("risk_tier", "tier2_workspace")),
            countdown_ms=int(a.get("countdown_ms", 2000)),
            approval_granted=True,
            policy=policy,
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
        "browser_set_viewport",
        "browser_expect",
        "browser_wait_for_url",
        "browser_diagnostics",
        "browser_compare_screenshot",
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
    result = handler(normalized_args)
    dev_id = current_device_id() or ""
    dispatch_audit.record_dispatch_tool(
        tool,
        normalized_args,
        result,
        device_id=dev_id,
    )
    audit_log_path = os.environ.get("AI_BRIDGE_AUDIT_LOG", "").strip()
    if audit_log_path:
        try:
            audit_mod.audit_event(
                Path(audit_log_path),
                actor="dispatch",
                device_id=dev_id or "local",
                tool=tool,
                arguments=normalized_args,
                decision="allowed",
                result=str(result)[:500],
            )
        except Exception:
            pass
    return result
