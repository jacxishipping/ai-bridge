"""MCP server: stdio (local clients) and Streamable HTTP (remote clients).

Usage:
  python -m ai_bridge.server                # stdio (default)
  python -m ai_bridge.server --http --port 8001   # Streamable HTTP
  AI_BRIDGE_HTTP=1 python -m ai_bridge.server

HTTP mode requires AI_BRIDGE_ADMIN_TOKEN (bearer) unless
AI_BRIDGE_HTTP_ALLOW_ANON=1 is set for local development only.

Device-bound sessions: when the caller's bearer token belongs to an
OAuth client bound to a device (see the OAuth gateway's device token
field), or when the caller selects a target device via select_device(),
tools marked with @device_aware run on that device via control-plane
tasks instead of on the droplet. Unbound sessions keep the droplet-local
behavior.
"""
from __future__ import annotations

import argparse
import functools
import hashlib
import hmac
import inspect
import json
import os
import platform

from mcp.server.fastmcp import FastMCP

from . import diagnostics, git_ops, tools, workspace
from .device_routing import (
    BindingError,
    cancel_device_task,
    get_device,
    get_device_task,
    list_all_devices,
    resolve_binding,
    run_device_tool,
)
from .execution import RUNNER
from .policy import TOOL_TIERS
from .security import is_secret_name, read_workspace_text, redact

# Local approval store: approvals are created via request_approval and
# granted only by approve_task with the admin token (hmac compare) or by
# the control-plane dashboard. AI text alone never grants approval.
_APPROVALS: dict[str, dict] = {}

# Per-session active device override set via select_device().
# Maps session key -> device_id (or "local" to force local execution).
_SELECTED_DEVICE: dict[str, str | None] = {}


def _consume_local_approval(tool_name: str) -> bool:
    """Consume one approved local approval record for tool_name, if any."""
    for rec in _APPROVALS.values():
        if rec.get("tool") == tool_name and rec.get("status") == "approved":
            rec["status"] = "used"
            return True
    return False


def _require_host_tools_enabled() -> None:
    if os.environ.get("AI_BRIDGE_DISABLE_HOST_TOOLS", "1") != "0":
        raise PermissionError("Unconfined host tools are disabled by default (set AI_BRIDGE_DISABLE_HOST_TOOLS=0 to enable).")


mcp = FastMCP("ai-bridge")

VERIFY_URL = os.environ.get("AI_BRIDGE_GATEWAY_VERIFY_URL", "http://127.0.0.1:8002/internal/verify")
CONTROL_URL = os.environ.get("AI_BRIDGE_CONTROL_URL", "http://127.0.0.1:8000")


def _bearer_token() -> str | None:
    try:
        ctx = mcp.get_context()
        req = getattr(getattr(ctx, "request_context", None), "request", None)
    except Exception:
        return None
    if req is None:
        return None
    auth = (req.headers.get("authorization") or "")
    if not auth.startswith("Bearer "):
        return None
    return auth[7:].strip() or None


def _session_key() -> str:
    tok = _bearer_token()
    if not tok:
        return "default"
    return hashlib.sha256(tok.encode()).hexdigest()[:16]


def _oauth_bound_device() -> str | None:
    """Validate HTTP bearer token on every call; return locked device_id if OAuth-bound."""
    tok = _bearer_token()
    if not tok:
        return None
    admin_tok = os.environ.get("AI_BRIDGE_ADMIN_TOKEN", "")
    if admin_tok and hmac.compare_digest(tok, admin_tok):
        return None
    try:
        return resolve_binding(VERIFY_URL, tok)
    except Exception:
        return None


def _session_device() -> str | None:
    """Device_id active for this MCP call, or None for unbound/local calls.

    OAuth gateway bindings are always enforced first if present.
    Unbound sessions check _SELECTED_DEVICE."""
    bound = _oauth_bound_device()
    if bound is not None:
        return bound
    key = _session_key()
    if key in _SELECTED_DEVICE:
        chosen = _SELECTED_DEVICE[key]
        return None if chosen in (None, "", "local") else chosen
    return None


def _admin_token() -> str:
    token = os.environ.get("AI_BRIDGE_ADMIN_TOKEN", "")
    if not token:
        raise RuntimeError("AI_BRIDGE_ADMIN_TOKEN is not set; device-bound routing needs it.")
    return token


def _resolve_device_record(target: str | None) -> dict | None:
    """Resolve a target device identifier (id, friendly name, hostname)
    to the device record dict, or None if target is empty/'local'."""
    if not target:
        return None
    target_str = str(target).strip()
    if target_str.lower() in ("local", "host", "droplet"):
        return None
    admin = _admin_token()
    try:
        devices = list_all_devices(CONTROL_URL, admin)
    except Exception as exc:
        raise RuntimeError(f"Could not retrieve device fleet from control plane: {exc}")
    # 1. Exact ID match
    for d in devices:
        if d.get("id") == target_str:
            return d
    # 2. Case-insensitive exact name or hostname match
    low = target_str.lower()
    for d in devices:
        if (d.get("name") or "").lower() == low or (d.get("hostname") or "").lower() == low:
            return d
    # 3. ID prefix match
    matches = [d for d in devices if (d.get("id") or "").startswith(target_str)]
    if len(matches) == 1:
        return matches[0]

    available = [f"'{d.get('name') or 'unnamed'}' (id: {d.get('id')})" for d in devices]
    avail_str = ", ".join(available) if available else "No enrolled devices online"
    raise ValueError(f"Unknown device '{target_str}'. Enrolled devices: [{avail_str}], or use 'local'. Call list_devices() for full list.")


DESKTOP_ROUTING_TOOLS = {
    "get_desktop_status",
    "capture_desktop_screenshot",
    "take_screenshot",
    "launch_approved_application",
    "perform_approved_ui_action",
    "mouse_click",
    "mouse_move",
    "mouse_scroll",
    "mouse_drag",
    "keyboard_type",
    "keyboard_press",
    "list_desktop_windows",
    "focus_window",
    "get_screen_size",
}


def _find_default_windows_device() -> str | None:
    """Find the primary active Windows desktop machine in the enrolled fleet."""
    try:
        admin = os.environ.get("AI_BRIDGE_ADMIN_TOKEN", "")
        if not admin:
            return None
        devices = list_all_devices(CONTROL_URL, admin)
        # 1. Prefer online Windows workstation
        for d in devices:
            os_str = str(d.get("os") or "").lower()
            if "win" in os_str and d.get("status") == "online":
                return d.get("id")
        # 2. Any online device with desktop automation enabled in policy
        for d in devices:
            if d.get("status") == "online":
                raw_p = d.get("policy_json") or "{}"
                try:
                    p = json.loads(raw_p) if isinstance(raw_p, str) else raw_p
                    if p.get("desktop_enabled"):
                        return d.get("id")
                except Exception:
                    pass
        # 3. Any enrolled Windows device
        for d in devices:
            os_str = str(d.get("os") or "").lower()
            if "win" in os_str:
                return d.get("id")
    except Exception:
        return None
    return None


def _resolve_target_device(target: str | None) -> str | None:
    rec = _resolve_device_record(target)
    return rec["id"] if rec else None


def device_aware(dispatch_name: str | None = None, *, bound: str = "route"):
    """Route a tool call to a target device (specified via device=... or session default).

    When a target device is active (or specified), tools with bound="route"
    run on that device via control-plane tasks and wait for the result.
    When targeting 'local' or when no device is selected, tools run
    locally on the MCP host / droplet.
    """
    def deco(fn):
        @functools.wraps(fn)
        def wrapper(*args, **kwargs):
            try:
                sig = inspect.signature(fn)
                bound_args = sig.bind(*args, **kwargs)
                bound_args.apply_defaults()
                call_args = dict(bound_args.arguments)
            except Exception:
                call_args = dict(kwargs)

            explicit_dev = call_args.pop("device", None)
            if explicit_dev is None:
                explicit_dev = call_args.pop("device_id", None)

            if explicit_dev is not None:
                device = _resolve_target_device(explicit_dev)
            else:
                device = _session_device()

            # Auto-route desktop GUI automation tools to active Windows device on headless hosts
            if device is None and (fn.__name__ in DESKTOP_ROUTING_TOOLS) and (platform.system() != "Windows"):
                win_dev = _find_default_windows_device()
                if win_dev is not None:
                    device = win_dev

            if device is None:
                kwargs.pop("device", None)
                kwargs.pop("device_id", None)
                return fn(*args, **kwargs)

            admin = _admin_token()
            if bound == "unavailable":
                raise ValueError(
                    f"Tool '{fn.__name__}' is only available on the local MCP host/droplet. "
                    f"To run on the local host, pass device='local' or call select_device('local')."
                )
            if bound == "route":
                return run_device_tool(
                    CONTROL_URL, admin, device,
                    dispatch_name or fn.__name__, call_args
                )
            if bound == "control":
                name = fn.__name__
                if name in {"get_task_status", "get_task_result", "cancel_task"}:
                    tid = args[0] if args else kwargs["task_id"]
                    t_check = get_device_task(CONTROL_URL, admin, tid)
                    if name == "get_task_status":
                        return {"task_id": t_check.get("id") or tid, "status": t_check.get("status")}
                    if name == "get_task_result":
                        try:
                            out = json.loads(t_check.get("result") or "")
                        except Exception:
                            out = t_check.get("result") or ""
                        return {"task_id": t_check.get("id") or tid, "status": t_check.get("status"), "output": out}
                    t = cancel_device_task(CONTROL_URL, admin, tid)
                    return {"task_id": t.get("task_id") or t.get("id") or tid, "cancelled": t.get("status") == "cancelled"}
                if name == "list_devices":
                    return fn(*args, **kwargs)
                if name == "get_device_status":
                    d = _resolve_device_record(device)
                    if d is None:
                        raise ValueError(f"Unknown device: {device}")
                    return {
                        "device_id": d.get("id"), "name": d.get("name"),
                        "hostname": d.get("hostname"), "os": d.get("os"),
                        "status": d.get("status"), "last_seen": d.get("last_seen"),
                    }
            return fn(*args, **kwargs)
        return wrapper
    return deco

@mcp.tool()
@device_aware("get_system_info")
def system_info(device: str | None = None) -> dict:
    """Return basic operating-system information for this machine or a fleet device.
    device (optional): Target device name, hostname, ID, or 'local'."""
    return tools.get_system_info()

@mcp.tool()
@device_aware()
def get_resource_usage(device: str | None = None) -> dict:
    """CPU, memory and disk usage for this machine or a fleet device.
    device (optional): Target device name, hostname, ID, or 'local'."""
    return tools.get_resource_usage()

@mcp.tool()
@device_aware()
def get_disk_usage(device: str | None = None) -> dict:
    """Disk usage for the root filesystem.
    device (optional): Target device name, hostname, ID, or 'local'."""
    return diagnostics.disk_usage("/")

@mcp.tool()
@device_aware()
def get_memory_usage(device: str | None = None) -> dict:
    """Memory usage for this machine or a fleet device.
    device (optional): Target device name, hostname, ID, or 'local'."""
    return diagnostics.memory_usage()

@mcp.tool()
@device_aware()
def list_workspace(relative_directory: str = ".", device: str | None = None) -> list[dict]:
    """List entries inside the configured workspace. No arbitrary filesystem access.
    device (optional): Target device name, hostname, ID, or 'local'."""
    return workspace.list_workspace(relative_directory)

@mcp.tool()
@device_aware()
def read_workspace_file(relative_path: str, device: str | None = None) -> str:
    """Read a UTF-8 text file inside the configured workspace (size-limited).
    device (optional): Target device name, hostname, ID, or 'local'."""
    return read_workspace_text(relative_path)

@mcp.tool()
@device_aware()
def search_workspace(query: str, relative_directory: str = ".", device: str | None = None) -> list[dict]:
    """Search file contents inside the workspace (secret-named files excluded).
    device (optional): Target device name, hostname, ID, or 'local'."""
    return workspace.search_workspace(query, relative_directory)

@mcp.tool()
@device_aware()
def create_workspace_file(relative_path: str, content: str, overwrite: bool = False, device: str | None = None) -> dict:
    """Create a file inside the workspace (Tier 2). Atomic write.
    device (optional): Target device name, hostname, ID, or 'local'."""
    tools._check("create_workspace_file")
    return workspace.create_workspace_file(relative_path, content, overwrite)

@mcp.tool()
@device_aware()
def edit_workspace_file(relative_path: str, old_text: str, new_text: str, device: str | None = None) -> dict:
    """Edit a workspace file; a backup is taken first (Tier 3, opt-in).
    device (optional): Target device name, hostname, ID, or 'local'."""
    from .policy import decide
    from .tools import default_policy
    approved = _consume_local_approval("edit_workspace_file")
    d = decide(default_policy(), "edit_workspace_file", approval_granted=approved)
    if not d.allowed:
        raise PermissionError(d.reason + " Set AI_BRIDGE_ALLOW_TIER3=1 or use the approval queue.")
    return workspace.edit_workspace_file(relative_path, old_text, new_text)

@mcp.tool()
@device_aware()
def move_workspace_file(source: str, destination: str, device: str | None = None) -> dict:
    """Move/rename a file inside the workspace (Tier 3, opt-in).
    device (optional): Target device name, hostname, ID, or 'local'."""
    from .policy import decide
    from .tools import default_policy
    approved = _consume_local_approval("move_workspace_file")
    d = decide(default_policy(), "move_workspace_file", approval_granted=approved)
    if not d.allowed:
        raise PermissionError(d.reason)
    return workspace.move_workspace_file(source, destination)

@mcp.tool()
@device_aware()
def delete_workspace_file(relative_path: str, device: str | None = None) -> dict:
    """Delete a workspace file. Requires a prior approval (Tier 4).
    device (optional): Target device name, hostname, ID, or 'local'."""
    if not _consume_local_approval("delete_workspace_file"):
        raise PermissionError("delete_workspace_file requires an approval: call request_approval, "
                              "then approve_task with the admin token, then retry.")
    return workspace.delete_workspace_file(relative_path)

@mcp.tool()
@device_aware()
def get_service_status(service: str, device: str | None = None) -> dict:
    """Check whether a named service is active (allowlisted name only).
    device (optional): Target device name, hostname, ID, or 'local'."""
    return tools.get_service_status(service)

@mcp.tool()
@device_aware()
def get_recent_logs(source: str = "system", lines: int = 50, device: str | None = None) -> str:
    """Recent system logs (journalctl on Linux, fixed Event Log query on Windows).
    device (optional): Target device name, hostname, ID, or 'local'."""
    return diagnostics.recent_logs(source, lines)

@mcp.tool()
@device_aware()
def list_processes(limit: int = 50, device: str | None = None) -> list[dict]:
    """Top processes by CPU usage.
    device (optional): Target device name, hostname, ID, or 'local'."""
    return diagnostics.list_processes(limit)

@mcp.tool()
@device_aware()
def list_docker_containers(device: str | None = None) -> dict:
    """Docker containers, if Docker is installed.
    device (optional): Target device name, hostname, ID, or 'local'."""
    result = diagnostics.list_docker_containers()
    return result if isinstance(result, dict) else {"containers": result}

@mcp.tool()
@device_aware()
def git_status(relative_directory: str = ".", device: str | None = None) -> str:
    """git status for a workspace directory.
    device (optional): Target device name, hostname, ID, or 'local'."""
    return git_ops.git_status(relative_directory)

@mcp.tool()
@device_aware()
def git_diff(relative_directory: str = ".", device: str | None = None) -> str:
    """git diff --stat for a workspace directory.
    device (optional): Target device name, hostname, ID, or 'local'."""
    return git_ops.git_diff(relative_directory)

@mcp.tool()
@device_aware()
def run_project_tests(test_command: str = "pytest", timeout: int = 120, device: str | None = None) -> dict:
    """Run an allowlisted test command (pytest / npm test / go test) with a timeout.
    device (optional): Target device name, hostname, ID, or 'local'."""
    return tools.run_project_tests(test_command, timeout)

@mcp.tool()
@device_aware()
def run_linter(timeout: int = 60, device: str | None = None) -> dict:
    """Run ruff check on the workspace, if ruff is installed.
    device (optional): Target device name, hostname, ID, or 'local'."""
    return tools.run_linter(timeout)

@mcp.tool()
@device_aware()
def create_backup(relative_directory: str = ".", device: str | None = None) -> dict:
    """Create a timestamped ZIP backup of a workspace directory.
    device (optional): Target device name, hostname, ID, or 'local'."""
    return tools.create_backup(relative_directory)

@mcp.tool()
@device_aware()
def deploy_application(project_directory: str = ".", target_directory: str = "deploy-staging", device: str | None = None) -> dict:
    """Staging deploy inside the workspace (backup first). Not a production deploy.
    device (optional): Target device name, hostname, ID, or 'local'."""
    approved = _consume_local_approval("deploy_application")
    return tools.deploy_application(project_directory, target_directory, approval_granted=approved)

@mcp.tool()
@device_aware(bound="unavailable")
def submit_task(task_name: str, timeout: int = 30) -> dict:
    """Submit an allowlisted diagnostic/task to the bounded task runner."""
    tools._check("submit_task")
    if task_name in TOOL_TIERS:
        tools._check(task_name)
    r = RUNNER.submit(task_name, timeout=timeout, allowed_test_commands=tools.default_policy().allowed_test_commands)
    return {"task_id": r.task_id, "name": task_name, "status": r.status}

@mcp.tool()
@device_aware(bound="control")
def get_task_status(task_id: str, device: str | None = None) -> dict:
    """Status of a submitted task on droplet or target device.
    device (optional): Target device name, hostname, ID, or 'local'."""
    r = RUNNER.get(task_id)
    if r is None:
        raise ValueError("Unknown task_id.")
    return {"task_id": r.task_id, "name": r.name, "status": r.status}

@mcp.tool()
@device_aware(bound="control")
def get_task_result(task_id: str, device: str | None = None) -> dict:
    """Result/output of a submitted task on droplet or target device.
    device (optional): Target device name, hostname, ID, or 'local'."""
    r = RUNNER.get(task_id)
    if r is None:
        raise ValueError("Unknown task_id.")
    return {"task_id": r.task_id, "name": r.name, "status": r.status, "output": r.output}

@mcp.tool()
@device_aware(bound="control")
def cancel_task(task_id: str, device: str | None = None) -> dict:
    """Cancel a running task on droplet or target device.
    device (optional): Target device name, hostname, ID, or 'local'."""
    return {"task_id": task_id, "cancelled": RUNNER.cancel(task_id)}

@mcp.tool()
@device_aware(bound="unavailable")
def request_approval(tool_name: str, reason: str) -> dict:
    """Create an approval request for a high-risk operation. It grants nothing by itself."""
    import uuid
    approval_id = uuid.uuid4().hex[:12]
    _APPROVALS[approval_id] = {"tool": tool_name, "reason": reason, "status": "pending"}
    return {"approval_id": approval_id, "status": "pending",
            "note": "An administrator must approve this via the dashboard or approve_task with the admin token."}

@mcp.tool()
@device_aware(bound="unavailable")
def approve_task(approval_id: str, admin_token: str) -> dict:
    """Approve a pending request. Requires the admin token (never returned by any tool)."""
    expected = os.environ.get("AI_BRIDGE_ADMIN_TOKEN", "")
    if not expected or not hmac.compare_digest(admin_token, expected):
        raise PermissionError("Invalid admin token.")
    rec = _APPROVALS.get(approval_id)
    if rec is None:
        raise ValueError("Unknown approval_id.")
    rec["status"] = "approved"
    return {"approval_id": approval_id, "status": "approved"}

@mcp.tool()
@device_aware()
def get_desktop_status(device: str | None = None) -> dict:
    """Whether desktop automation is enabled for this machine or target device.
    device (optional): Target device name, hostname, ID, or 'local'."""
    return tools.get_desktop_status()

@mcp.tool()
@device_aware()
def capture_desktop_screenshot(device: str | None = None) -> dict:
    """Screenshot, only when desktop automation is explicitly enabled.
    device (optional): Target device name, hostname, ID, or 'local'."""
    return tools.capture_desktop_screenshot()

@mcp.tool()
@device_aware(dispatch_name="capture_desktop_screenshot")
def take_screenshot(device: str | None = None) -> dict:
    """Capture a high-resolution screenshot of the Windows desktop.
    Returns JPEG base64 image data, width, height, and currently active foreground window title.
    device (optional): Target Windows device name/ID, or automatically routes to active Windows machine."""
    return tools.capture_desktop_screenshot()

@mcp.tool()
@device_aware()
def mouse_click(
    x: int,
    y: int,
    button: str = "left",
    clicks: int = 1,
    device: str | None = None,
) -> dict:
    """Click the mouse at (x, y) coordinates on the Windows GUI.
    button: 'left' (default), 'right', or 'middle'.
    clicks: 1 for single click, 2 for double click, 3 for triple click.
    device (optional): Target Windows device name/ID, or automatically routes to active Windows machine."""
    approved = _consume_local_approval("mouse_click")
    return tools.mouse_click(x=x, y=y, button=button, clicks=clicks, approval_granted=approved)

@mcp.tool()
@device_aware()
def mouse_move(x: int, y: int, device: str | None = None) -> dict:
    """Move the mouse cursor to (x, y) coordinates on the Windows GUI.
    device (optional): Target Windows device name/ID, or automatically routes to active Windows machine."""
    approved = _consume_local_approval("mouse_move")
    return tools.mouse_move(x=x, y=y, approval_granted=approved)

@mcp.tool()
@device_aware()
def mouse_scroll(
    delta: int = -120,
    x: int | None = None,
    y: int | None = None,
    device: str | None = None,
) -> dict:
    """Scroll the mouse wheel on the Windows GUI.
    delta: positive scrolls up (e.g. 120), negative scrolls down (e.g. -120).
    x, y (optional): Cursor coordinates before scrolling.
    device (optional): Target Windows device name/ID, or automatically routes to active Windows machine."""
    approved = _consume_local_approval("mouse_scroll")
    return tools.mouse_scroll(delta=delta, x=x, y=y, approval_granted=approved)

@mcp.tool()
@device_aware()
def mouse_drag(
    start_x: int,
    start_y: int,
    end_x: int,
    end_y: int,
    device: str | None = None,
) -> dict:
    """Click and drag the mouse from (start_x, start_y) to (end_x, end_y) on the Windows GUI.
    Useful for selecting text, dragging windows, slider controls, or drag-and-drop operations.
    device (optional): Target Windows device name/ID, or automatically routes to active Windows machine."""
    approved = _consume_local_approval("mouse_drag")
    return tools.mouse_drag(start_x=start_x, start_y=start_y, end_x=end_x, end_y=end_y, approval_granted=approved)

@mcp.tool()
@device_aware()
def keyboard_type(text: str, device: str | None = None) -> dict:
    """Type unicode text into the currently active window or input control on the Windows GUI.
    Uses native Win32 Unicode injection for full compatibility across Chrome, Edge, VS Code, Terminal, etc.
    device (optional): Target Windows device name/ID, or automatically routes to active Windows machine."""
    approved = _consume_local_approval("keyboard_type")
    return tools.keyboard_type(text=text, approval_granted=approved)

@mcp.tool()
@device_aware()
def keyboard_press(key: str, device: str | None = None) -> dict:
    """Press a key or key combination on the Windows GUI.
    Supported keys: 'enter', 'tab', 'esc', 'space', 'backspace', 'delete', 'win', 'up', 'down', 'left', 'right',
    'pageup', 'pagedown', 'home', 'end', 'f1'-'f12', or hotkeys like 'ctrl+c', 'ctrl+v', 'ctrl+a', 'alt+tab', 'alt+f4', 'win+r'.
    device (optional): Target Windows device name/ID, or automatically routes to active Windows machine."""
    approved = _consume_local_approval("keyboard_press")
    return tools.keyboard_press(key=key, approval_granted=approved)

@mcp.tool()
@device_aware()
def list_desktop_windows(device: str | None = None) -> dict:
    """List all visible top-level windows on the desktop with titles, handles, and bounding rectangles [x, y, width, height].
    device (optional): Target Windows device name/ID, or automatically routes to active Windows machine."""
    approved = _consume_local_approval("list_desktop_windows")
    return tools.list_desktop_windows(approval_granted=approved)

@mcp.tool()
@device_aware()
def focus_window(title: str, device: str | None = None) -> dict:
    """Bring the window matching 'title' substring to the foreground and unminimize it if minimized.
    device (optional): Target Windows device name/ID, or automatically routes to active Windows machine."""
    approved = _consume_local_approval("focus_window")
    return tools.focus_window(title=title, approval_granted=approved)

@mcp.tool()
@device_aware()
def get_screen_size(device: str | None = None) -> dict:
    """Get the primary desktop screen width and height in pixels.
    device (optional): Target Windows device name/ID, or automatically routes to active Windows machine."""
    return tools.get_screen_size()

@mcp.tool()
@device_aware()
def launch_approved_application(app_name: str, url: str | None = None, device: str | None = None) -> dict:
    """Launch an application from the admin-approved list only.
    device (optional): Target device name, hostname, ID, or 'local'."""
    approved = _consume_local_approval("launch_approved_application")
    return tools.launch_approved_application(app_name, approval_granted=approved, url=url)

@mcp.tool()
@device_aware()
def perform_approved_ui_action(
    action: str,
    x: int | None = None,
    y: int | None = None,
    text: str | None = None,
    key: str | None = None,
    title: str | None = None,
    delta: int = -120,
    device: str | None = None,
) -> dict:
    """Perform a structured desktop UI action (list_windows, focus_window,
    move_mouse, click, double_click, right_click, scroll, type_text,
    press_key/hotkey). Requires desktop_enabled and Tier-3 permission.
    device (optional): Target device name, hostname, ID, or 'local'."""
    approved = _consume_local_approval("perform_approved_ui_action")
    return tools.perform_approved_ui_action(
        action, x=x, y=y, text=text, key=key, title=title, delta=delta, approval_granted=approved
    )

@mcp.tool()
@device_aware(bound="control")
def list_devices() -> list[dict]:
    """List all enrolled devices in the fleet and the local MCP host.
    Returns device IDs, friendly names, OS, and online status.
    GUI automation tools (mouse_click, mouse_move, mouse_scroll, mouse_drag, keyboard_type,
    keyboard_press, capture_desktop_screenshot, take_screenshot, list_desktop_windows, focus_window)
    automatically route to your active Windows machine if you are connected via cloud MCP.
    To execute other tools on any device, either:
      1. Pass device='<device_name_or_id>' to any tool call.
      2. Call select_device('<device_name_or_id>') to set the default target device for your session.
      3. Use device='local' to target the MCP host/droplet."""
    active = _session_device() or "local"
    out: list[dict] = []
    info = tools.get_system_info()
    out.append({
        "device_id": "local",
        "name": "local",
        "hostname": info.get("machine"),
        "system": info.get("system"),
        "os": info.get("system"),
        "status": "online",
        "workspace": info.get("workspace"),
        "active": active == "local",
        "routing_hint": "Pass device='local' or call select_device('local') to target the droplet host.",
    })
    token = os.environ.get("AI_BRIDGE_ADMIN_TOKEN", "")
    if token:
        try:
            for d in list_all_devices(CONTROL_URL, token):
                did = d.get("id")
                out.append({
                    "device_id": did,
                    "name": d.get("name"),
                    "hostname": d.get("hostname"),
                    "os": d.get("os"),
                    "status": d.get("status"),
                    "last_seen": d.get("last_seen"),
                    "active": did == active,
                    "routing_hint": f"Pass device='{d.get('name') or did}' to target this machine.",
                })
        except Exception:
            pass
    return out

@mcp.tool()
def select_device(device_id: str) -> dict:
    """Switch the default target device for this MCP session by device_id,
    device name, hostname, or 'local' (to target the MCP host/droplet).
    All subsequent tool calls without an explicit device parameter will execute on this device."""
    target = (device_id or "").strip()
    key = _session_key()
    if len(_SELECTED_DEVICE) >= 1024 and key not in _SELECTED_DEVICE:
        _SELECTED_DEVICE.pop(next(iter(_SELECTED_DEVICE)), None)
    if not target or target.lower() in ("local", "host", "droplet"):
        _SELECTED_DEVICE[key] = "local"
        return {
            "selected_device": "local",
            "mode": "local",
            "note": "Tools will execute locally on the MCP host (droplet).",
        }
    d = _resolve_device_record(target)
    if not d:
        _SELECTED_DEVICE[key] = "local"
        return {
            "selected_device": "local",
            "mode": "local",
            "note": "Tools will execute locally on the MCP host (droplet).",
        }
    resolved = d["id"]
    _SELECTED_DEVICE[key] = resolved
    return {
        "selected_device": resolved,
        "name": d.get("name"),
        "hostname": d.get("hostname"),
        "os": d.get("os"),
        "status": d.get("status"),
        "mode": "remote",
        "note": f"Tools will now execute remotely on '{d.get('name') or resolved}' by default.",
    }

@mcp.tool()
@device_aware(bound="control")
def get_device_status(device_id: str = "local") -> dict:
    """Status of a device ('local' for MCP host, or any enrolled device name or ID)."""
    if not device_id or device_id.strip().lower() in ("local", "host", "droplet"):
        return {"device_id": "local", "status": "online", **tools.get_resource_usage()}
    d = _resolve_device_record(device_id)
    if d is not None:
        return {
            "device_id": d.get("id"), "name": d.get("name"), "status": d.get("status"),
            "hostname": d.get("hostname"), "os": d.get("os"), "last_seen": d.get("last_seen"),
        }
    raise ValueError(f"Device '{device_id}' not found.")

@mcp.tool()
@device_aware(bound="unavailable")
def run_diagnostic_task(task_name: str) -> str:
    """Run one predefined, read-only diagnostic task: uptime, disk_usage, memory_summary."""
    from .tasks import run_diagnostic
    return run_diagnostic(task_name)

@mcp.tool()
@device_aware()
def run_shell(command: str, working_directory: str = "", timeout: int = 0, device: str | None = None) -> dict:
    """Run a shell command on any enrolled device in the fleet or local host.
    device (optional): Target device name, hostname, ID, or 'local'. Defaults to active device or local host.
    Tier-3 sensitive tool: executed on the target device via control-plane dispatch.
    timeout=0 (default) means standard execution without time limit. Output truncated per stream."""
    _require_host_tools_enabled()
    approved = _consume_local_approval("run_shell")
    admin_tok = os.environ.get("AI_BRIDGE_ADMIN_TOKEN", "")
    bearer = _bearer_token()
    is_admin = bool(admin_tok and bearer and hmac.compare_digest(bearer, admin_tok))
    return tools.run_shell(command, working_directory, timeout, approval_granted=approved, is_admin=is_admin)


@mcp.tool()
@device_aware()
def read_file(path: str, max_chars: int = 100000, device: str | None = None) -> str:
    """Read any UTF-8 text file on this machine or target device by path (host tools opt-in required).
    device (optional): Target device name, hostname, ID, or 'local'."""
    _require_host_tools_enabled()
    return tools.read_file(path, max_chars)


@mcp.tool()
@device_aware()
def write_file(path: str, content: str, overwrite: bool = False, device: str | None = None) -> dict:
    """Write content to any absolute path on this machine or target device (host tools opt-in required).
    device (optional): Target device name, hostname, ID, or 'local'.
    Refuses to overwrite an existing file unless overwrite=true."""
    _require_host_tools_enabled()
    return tools.write_file(path, content, overwrite)


@mcp.tool()
@device_aware()
def install_package(package_id: str, version: str | None = None, device: str | None = None) -> dict:
    """Install a software package on the target device (or local host).
    Supports Linux & WSL (apt-get on Ubuntu/Debian, dnf on Fedora/RHEL, pacman on Arch, apk on Alpine)
    and Windows (winget).
    device (optional): Target device name, hostname, ID, or 'local'.
    Tier-3 sensitive tool: requires approval in dashboard or policy opt-in (AI_BRIDGE_ALLOW_TIER3=1)."""
    approved = _consume_local_approval("install_package")
    return tools.install_package(package_id, version, approval_granted=approved)


class _BearerAuthMiddleware:
    """Enforce bearer token authentication on Streamable HTTP unless AI_BRIDGE_HTTP_ALLOW_ANON=1."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope.get("type") != "http" or os.environ.get("AI_BRIDGE_HTTP_ALLOW_ANON") == "1":
            await self.app(scope, receive, send)
            return
        headers = {k.decode("latin1").lower(): v.decode("latin1") for k, v in scope.get("headers", [])}
        auth = headers.get("authorization", "")
        tok = auth[7:].strip() if auth.startswith("Bearer ") else ""
        authorized = False
        admin_tok = os.environ.get("AI_BRIDGE_ADMIN_TOKEN", "")
        if tok:
            if admin_tok and hmac.compare_digest(tok, admin_tok):
                authorized = True
            else:
                try:
                    resolve_binding(VERIFY_URL, tok)
                    authorized = True
                except BindingError:
                    authorized = False
        if not authorized:
            body = b'{"detail":"Missing or invalid bearer token"}'
            await send({
                "type": "http.response.start",
                "status": 401,
                "headers": [
                    (b"content-type", b"application/json"),
                    (b"content-length", str(len(body)).encode("ascii")),
                    (b"www-authenticate", b"Bearer"),
                ],
            })
            await send({"type": "http.response.body", "body": body})
            return
        await self.app(scope, receive, send)


def create_http_app():
    return _BearerAuthMiddleware(mcp.streamable_http_app())


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(prog="ai-bridge")
    parser.add_argument("--http", action="store_true", help="Serve Streamable HTTP instead of stdio")
    parser.add_argument("--port", type=int, default=int(os.environ.get("AI_BRIDGE_MCP_PORT", "8001")))
    parser.add_argument("--host", default=os.environ.get("AI_BRIDGE_MCP_HOST", "127.0.0.1"))
    args = parser.parse_args(argv)
    if args.http or os.environ.get("AI_BRIDGE_HTTP") == "1":
        import uvicorn
        app = create_http_app()
        uvicorn.run(app, host=args.host, port=args.port, log_level="info")
    else:
        mcp.run(transport="stdio")

if __name__ == "__main__":
    main()
