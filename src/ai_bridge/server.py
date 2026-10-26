"""MCP server: stdio (local clients) and Streamable HTTP (remote clients).

Usage:
  python -m ai_bridge.server                # stdio (default)
  python -m ai_bridge.server --http --port 8001   # Streamable HTTP
  AI_BRIDGE_HTTP=1 python -m ai_bridge.server

HTTP mode requires AI_BRIDGE_ADMIN_TOKEN (bearer) unless
AI_BRIDGE_HTTP_ALLOW_ANON=1 is set for local development only.

Device-bound sessions: when the caller's bearer token belongs to an
OAuth client bound to a device (see the OAuth gateway's device token
field), tools marked with @device_aware run on that device via
control-plane tasks instead of on the droplet. Unbound sessions keep
the previous droplet-local behavior.
"""
from __future__ import annotations

import argparse
import functools
import hmac
import json
import os

from mcp.server.fastmcp import FastMCP

from . import diagnostics, git_ops, tools, workspace
from .device_routing import (
    cancel_device_task,
    get_device,
    get_device_task,
    resolve_binding,
    run_device_tool,
)
from .execution import RUNNER
from .security import read_workspace_text

# Local approval store: approvals are created via request_approval and
# granted only by approve_task with the admin token (hmac compare) or by
# the control-plane dashboard. AI text alone never grants approval.
_APPROVALS: dict[str, dict] = {}


def _consume_local_approval(tool_name: str) -> bool:
    """Consume one approved local approval record for tool_name, if any."""
    for rec in _APPROVALS.values():
        if rec.get("tool") == tool_name and rec.get("status") == "approved":
            rec["status"] = "used"
            return True
    return False


def _require_host_tools_enabled() -> None:
    if os.environ.get("AI_BRIDGE_DISABLE_HOST_TOOLS", "0") == "1":
        raise PermissionError("Unconfined host tools are disabled (AI_BRIDGE_DISABLE_HOST_TOOLS=1).")


mcp = FastMCP("ai-bridge")

VERIFY_URL = os.environ.get("AI_BRIDGE_GATEWAY_VERIFY_URL", "http://127.0.0.1:8002/internal/verify")
CONTROL_URL = os.environ.get("AI_BRIDGE_CONTROL_URL", "http://127.0.0.1:8000")


def _session_device() -> str | None:
    """Device_id bound to this MCP call, or None for unbound/local calls.

    Uses the FastMCP instance's request context (SDK 1.x): in streamable
    HTTP mode it carries the Starlette request and its Authorization
    header; in stdio mode, or outside a request, there is no HTTP
    request, so the call is unbound. A resolution failure raises
    (fail closed) rather than silently running droplet tools for a
    session that was meant to be device-scoped."""
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
    return resolve_binding(VERIFY_URL, auth[7:].strip())


def _admin_token() -> str:
    token = os.environ.get("AI_BRIDGE_ADMIN_TOKEN", "")
    if not token:
        raise RuntimeError("AI_BRIDGE_ADMIN_TOKEN is not set; device-bound routing needs it.")
    return token


def device_aware(dispatch_name: str | None = None, *, bound: str = "route"):
    """Route a tool call to the session's bound device when there is one.

    bound="route": run the same-named (or dispatch_name) control-plane
      tool on the device and wait for its result.
    bound="control": device-task helpers (status/result/cancel, device
      info) served from the control plane instead of the droplet-local
      runner.
    bound="unavailable": droplet-only tools, refused in bound sessions.
    Unbound sessions always run the original droplet-local function.
    """
    def deco(fn):
        @functools.wraps(fn)
        def wrapper(*args, **kwargs):
            device = _session_device()
            if device is None:
                return fn(*args, **kwargs)
            admin = _admin_token()
            if bound == "unavailable":
                raise ValueError(
                    "This tool acts on the droplet only and is not available "
                    "in a device-bound MCP session.")
            if bound == "route":
                return run_device_tool(CONTROL_URL, admin, device,
                                       dispatch_name or fn.__name__, dict(kwargs))
            if bound == "control":
                name = fn.__name__
                if name == "get_task_status":
                    t = get_device_task(CONTROL_URL, admin, kwargs["task_id"])
                    return {"task_id": t.get("id"), "status": t.get("status")}
                if name == "get_task_result":
                    t = get_device_task(CONTROL_URL, admin, kwargs["task_id"])
                    try:
                        out = json.loads(t.get("result") or "")
                    except Exception:
                        out = t.get("result") or ""
                    return {"task_id": t.get("id"), "status": t.get("status"), "output": out}
                if name == "cancel_task":
                    t = cancel_device_task(CONTROL_URL, admin, kwargs["task_id"])
                    return {"task_id": t.get("id"), "cancelled": t.get("status") == "cancelled"}
                if name == "list_devices":
                    d = get_device(CONTROL_URL, admin, device)
                    return [{"device_id": d.get("id"), "name": d.get("name"),
                             "status": d.get("status")}] if d else []
                if name == "get_device_status":
                    did = kwargs.get("device_id", "local")
                    if did not in ("local", device):
                        raise ValueError("This session is bound to a single device.")
                    d = get_device(CONTROL_URL, admin, device)
                    return {"device_id": device, "status": (d or {}).get("status")}
            return fn(*args, **kwargs)
        return wrapper
    return deco

@mcp.tool()
@device_aware("get_system_info")
def system_info() -> dict:
    """Return basic operating-system information without exposing secrets."""
    return tools.get_system_info()

@mcp.tool()
@device_aware()
def get_resource_usage() -> dict:
    """CPU, memory and disk usage for this machine."""
    return tools.get_resource_usage()

@mcp.tool()
@device_aware()
def get_disk_usage() -> dict:
    """Disk usage for the root filesystem."""
    return diagnostics.disk_usage("/")

@mcp.tool()
@device_aware()
def get_memory_usage() -> dict:
    """Memory usage for this machine."""
    return diagnostics.memory_usage()

@mcp.tool()
@device_aware()
def list_workspace(relative_directory: str = ".") -> list[dict]:
    """List entries inside the configured workspace. No arbitrary filesystem access."""
    return workspace.list_workspace(relative_directory)

@mcp.tool()
@device_aware()
def read_workspace_file(relative_path: str) -> str:
    """Read a UTF-8 text file inside the configured workspace (size-limited)."""
    return read_workspace_text(relative_path)

@mcp.tool()
@device_aware()
def search_workspace(query: str, relative_directory: str = ".") -> list[dict]:
    """Search file contents inside the workspace (secret-named files excluded)."""
    return workspace.search_workspace(query, relative_directory)

@mcp.tool()
@device_aware()
def create_workspace_file(relative_path: str, content: str, overwrite: bool = False) -> dict:
    """Create a file inside the workspace (Tier 2). Atomic write."""
    return workspace.create_workspace_file(relative_path, content, overwrite)

@mcp.tool()
@device_aware()
def edit_workspace_file(relative_path: str, old_text: str, new_text: str) -> dict:
    """Edit a workspace file; a backup is taken first (Tier 3, opt-in)."""
    from .policy import decide
    from .tools import default_policy
    approved = _consume_local_approval("edit_workspace_file")
    d = decide(default_policy(), "edit_workspace_file", approval_granted=approved)
    if not d.allowed:
        raise PermissionError(d.reason + " Set AI_BRIDGE_ALLOW_TIER3=1 or use the approval queue.")
    return workspace.edit_workspace_file(relative_path, old_text, new_text)

@mcp.tool()
@device_aware()
def move_workspace_file(source: str, destination: str) -> dict:
    """Move/rename a file inside the workspace (Tier 3, opt-in)."""
    from .policy import decide
    from .tools import default_policy
    approved = _consume_local_approval("move_workspace_file")
    d = decide(default_policy(), "move_workspace_file", approval_granted=approved)
    if not d.allowed:
        raise PermissionError(d.reason)
    return workspace.move_workspace_file(source, destination)

@mcp.tool()
@device_aware()
def delete_workspace_file(relative_path: str) -> dict:
    """Delete a workspace file. Requires a prior approval (Tier 4)."""
    if not _consume_local_approval("delete_workspace_file"):
        raise PermissionError("delete_workspace_file requires an approval: call request_approval, "
                              "then approve_task with the admin token, then retry.")
    return workspace.delete_workspace_file(relative_path)

@mcp.tool()
@device_aware()
def get_service_status(service: str) -> dict:
    """Check whether a named service is active (allowlisted name only)."""
    return diagnostics.service_status(service)

@mcp.tool()
@device_aware()
def get_recent_logs(source: str = "system", lines: int = 50) -> str:
    """Recent system logs (journalctl on Linux, fixed Event Log query on Windows)."""
    return diagnostics.recent_logs(source, lines)

@mcp.tool()
@device_aware()
def list_processes(limit: int = 50) -> list[dict]:
    """Top processes by CPU usage."""
    return diagnostics.list_processes(limit)

@mcp.tool()
@device_aware()
def list_docker_containers() -> dict:
    """Docker containers, if Docker is installed."""
    result = diagnostics.list_docker_containers()
    return result if isinstance(result, dict) else {"containers": result}

@mcp.tool()
@device_aware()
def git_status(relative_directory: str = ".") -> str:
    """git status for a workspace directory."""
    return git_ops.git_status(relative_directory)

@mcp.tool()
@device_aware()
def git_diff(relative_directory: str = ".") -> str:
    """git diff --stat for a workspace directory."""
    return git_ops.git_diff(relative_directory)

@mcp.tool()
@device_aware()
def run_project_tests(test_command: str = "pytest", timeout: int = 120) -> dict:
    """Run an allowlisted test command (pytest / npm test / go test) with a timeout."""
    return tools.run_project_tests(test_command, timeout)

@mcp.tool()
@device_aware()
def run_linter(timeout: int = 60) -> dict:
    """Run ruff check on the workspace, if ruff is installed."""
    return tools.run_linter(timeout)

@mcp.tool()
@device_aware()
def create_backup(relative_directory: str = ".") -> dict:
    """Create a timestamped ZIP backup of a workspace directory."""
    return tools.create_backup(relative_directory)

@mcp.tool()
@device_aware()
def deploy_application(project_directory: str = ".", target_directory: str = "deploy-staging") -> dict:
    """Staging deploy inside the workspace (backup first). Not a production deploy."""
    approved = _consume_local_approval("deploy_application")
    return tools.deploy_application(project_directory, target_directory, approval_granted=approved)

@mcp.tool()
@device_aware(bound="unavailable")
def submit_task(task_name: str, timeout: int = 30) -> dict:
    """Submit an allowlisted diagnostic/task to the bounded task runner."""
    r = RUNNER.submit(task_name, timeout=timeout)
    return {"task_id": r.task_id, "name": task_name, "status": r.status}

@mcp.tool()
@device_aware(bound="control")
def get_task_status(task_id: str) -> dict:
    """Status of a submitted task."""
    r = RUNNER.get(task_id)
    if r is None:
        raise ValueError("Unknown task_id.")
    return {"task_id": r.task_id, "name": r.name, "status": r.status}

@mcp.tool()
@device_aware(bound="control")
def get_task_result(task_id: str) -> dict:
    """Result/output of a submitted task."""
    r = RUNNER.get(task_id)
    if r is None:
        raise ValueError("Unknown task_id.")
    return {"task_id": r.task_id, "name": r.name, "status": r.status, "output": r.output}

@mcp.tool()
@device_aware(bound="control")
def cancel_task(task_id: str) -> dict:
    """Cancel a running task."""
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
def get_desktop_status() -> dict:
    """Whether desktop automation is enabled for this machine."""
    return tools.get_desktop_status()

@mcp.tool()
@device_aware()
def capture_desktop_screenshot() -> dict:
    """Screenshot, only when desktop automation is explicitly enabled."""
    return tools.capture_desktop_screenshot()

@mcp.tool()
@device_aware()
def launch_approved_application(app_name: str) -> dict:
    """Launch an application from the admin-approved list only."""
    return tools.launch_approved_application(app_name)

@mcp.tool()
@device_aware(bound="control")
def list_devices() -> list[dict]:
    """Local mode: this machine is the only enrolled device."""
    info = tools.get_system_info()
    return [{"device_id": "local", "hostname": info["machine"], "system": info["system"],
             "status": "online", "workspace": info["workspace"]}]

@mcp.tool()
@device_aware(bound="control")
def get_device_status(device_id: str = "local") -> dict:
    """Status of a device (local mode: only 'local')."""
    if device_id != "local":
        raise ValueError("Local mode only knows device 'local'; use the control plane for remote devices.")
    return {"device_id": "local", "status": "online", **tools.get_resource_usage()}

@mcp.tool()
@device_aware(bound="unavailable")
def run_diagnostic_task(task_name: str) -> str:
    """Run one predefined, read-only diagnostic task: uptime, disk_usage, memory_summary."""
    from .tasks import run_diagnostic
    return run_diagnostic(task_name)

@mcp.tool()
@device_aware(bound="unavailable")
def run_shell(command: str, working_directory: str = "", timeout: int = 0) -> dict:
    """Run any shell command on this machine. Ungated: runs as the MCP
    service user (root on this droplet). timeout=0 (default) means no
    time limit: the call returns when the command finishes or fails.
    A positive timeout still caps the run. Output truncated per stream."""
    import subprocess

    _require_host_tools_enabled()
    timeout_arg = None if timeout <= 0 else int(timeout)
    try:
        proc = subprocess.run(
            command,
            shell=True,
            cwd=working_directory or None,
            capture_output=True,
            text=True,
            timeout=timeout_arg,
        )
        return {
            "returncode": proc.returncode,
            "stdout": proc.stdout[-20000:],
            "stderr": proc.stderr[-20000:],
        }
    except subprocess.TimeoutExpired:
        return {
            "returncode": None,
            "timeout": True,
            "stdout": "",
            "stderr": f"command timed out after {timeout}s",
        }
    except Exception as exc:  # noqa: BLE001 - surfaced as a tool result
        return {"returncode": None, "error": str(exc)}


@mcp.tool()
@device_aware(bound="unavailable")
def read_file(path: str, max_chars: int = 100000) -> str:
    """Read any UTF-8 text file on this machine by absolute path."""
    from pathlib import Path

    _require_host_tools_enabled()
    try:
        text = Path(path).read_bytes().decode("utf-8")
    except UnicodeDecodeError:
        raise ValueError("not a UTF-8 text file")
    if len(text) > max_chars:
        text = text[:max_chars] + "\n[truncated]"
    return text


@mcp.tool()
@device_aware(bound="unavailable")
def write_file(path: str, content: str, overwrite: bool = False) -> dict:
    """Write content to any absolute path, creating parent directories.
    Refuses to overwrite an existing file unless overwrite=true."""
    from pathlib import Path

    _require_host_tools_enabled()
    target = Path(path)
    if target.exists() and not overwrite:
        raise ValueError("file exists; pass overwrite=true to replace it")
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8")
    return {"path": str(target), "bytes": len(content.encode("utf-8"))}


@mcp.tool()
def install_package(package_id: str, version: str | None = None) -> dict:
    """Install a package on the bound device via winget (Windows).
    Requires a device-bound MCP session; unbound sessions cannot install
    on a device. Tier-3: the call returns needs_approval until an admin
    approves it in the dashboard, then re-check with get_task_result."""
    device = _session_device()
    if device is None:
        return {"available": False,
                "note": "install_package requires a device-bound MCP session: "
                        "approve the connection with a device token, then call again."}
    args = {"package_id": package_id}
    if version:
        args["version"] = version
    return run_device_tool(CONTROL_URL, _admin_token(), device, "install_package", args)


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(prog="ai-bridge")
    parser.add_argument("--http", action="store_true", help="Serve Streamable HTTP instead of stdio")
    parser.add_argument("--port", type=int, default=int(os.environ.get("AI_BRIDGE_MCP_PORT", "8001")))
    parser.add_argument("--host", default=os.environ.get("AI_BRIDGE_MCP_HOST", "127.0.0.1"))
    args = parser.parse_args(argv)
    if args.http or os.environ.get("AI_BRIDGE_HTTP") == "1":
        # FastMCP's Streamable HTTP app; bearer check is enforced by the
        # control-plane / reverse proxy in production (see docs/remote-access.md).
        # For local dev, bind loopback only by default.
        import uvicorn
        app = mcp.streamable_http_app()
        uvicorn.run(app, host=args.host, port=args.port, log_level="info")
    else:
        mcp.run(transport="stdio")

if __name__ == "__main__":
    main()
