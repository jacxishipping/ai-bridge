"""MCP server: stdio (local clients) and Streamable HTTP (remote clients).

Usage:
  python -m ai_bridge.server                # stdio (default)
  python -m ai_bridge.server --http --port 8001   # Streamable HTTP
  AI_BRIDGE_HTTP=1 python -m ai_bridge.server

HTTP mode requires AI_BRIDGE_ADMIN_TOKEN (bearer) unless
AI_BRIDGE_HTTP_ALLOW_ANON=1 is set for local development only.
"""
from __future__ import annotations

import argparse
import hmac
import os

from mcp.server.fastmcp import FastMCP

from . import diagnostics, git_ops, tools, workspace
from .execution import RUNNER
from .security import read_workspace_text

# Local approval store: approvals are created via request_approval and
# granted only by approve_task with the admin token (hmac compare) or by
# the control-plane dashboard. AI text alone never grants approval.
_APPROVALS: dict[str, dict] = {}

mcp = FastMCP("ai-bridge")

@mcp.tool()
def system_info() -> dict:
    """Return basic operating-system information without exposing secrets."""
    return tools.get_system_info()

@mcp.tool()
def get_resource_usage() -> dict:
    """CPU, memory and disk usage for this machine."""
    return tools.get_resource_usage()

@mcp.tool()
def get_disk_usage() -> dict:
    """Disk usage for the root filesystem."""
    return diagnostics.disk_usage("/")

@mcp.tool()
def get_memory_usage() -> dict:
    """Memory usage for this machine."""
    return diagnostics.memory_usage()

@mcp.tool()
def list_workspace(relative_directory: str = ".") -> list[dict]:
    """List entries inside the configured workspace. No arbitrary filesystem access."""
    return workspace.list_workspace(relative_directory)

@mcp.tool()
def read_workspace_file(relative_path: str) -> str:
    """Read a UTF-8 text file inside the configured workspace (size-limited)."""
    return read_workspace_text(relative_path)

@mcp.tool()
def search_workspace(query: str, relative_directory: str = ".") -> list[dict]:
    """Search file contents inside the workspace (secret-named files excluded)."""
    return workspace.search_workspace(query, relative_directory)

@mcp.tool()
def create_workspace_file(relative_path: str, content: str, overwrite: bool = False) -> dict:
    """Create a file inside the workspace (Tier 2). Atomic write."""
    return workspace.create_workspace_file(relative_path, content, overwrite)

@mcp.tool()
def edit_workspace_file(relative_path: str, old_text: str, new_text: str) -> dict:
    """Edit a workspace file; a backup is taken first (Tier 3, opt-in)."""
    from .policy import decide
    from .tools import default_policy
    d = decide(default_policy(), "edit_workspace_file")
    if not d.allowed:
        raise PermissionError(d.reason + " Set AI_BRIDGE_ALLOW_TIER3=1 or use the approval queue.")
    return workspace.edit_workspace_file(relative_path, old_text, new_text)

@mcp.tool()
def move_workspace_file(source: str, destination: str) -> dict:
    """Move/rename a file inside the workspace (Tier 3, opt-in)."""
    from .policy import decide
    from .tools import default_policy
    d = decide(default_policy(), "move_workspace_file")
    if not d.allowed:
        raise PermissionError(d.reason)
    return workspace.move_workspace_file(source, destination)

@mcp.tool()
def delete_workspace_file(relative_path: str) -> dict:
    """Delete a workspace file. Requires a prior approval (Tier 4)."""
    raise PermissionError("delete_workspace_file requires an approval: call request_approval, "
                          "then approve_task with the admin token, then retry via the control plane.")

@mcp.tool()
def get_service_status(service: str) -> dict:
    """Check whether a named service is active (allowlisted name only)."""
    return diagnostics.service_status(service)

@mcp.tool()
def get_recent_logs(source: str = "system", lines: int = 50) -> str:
    """Recent system logs (journalctl on Linux, fixed Event Log query on Windows)."""
    return diagnostics.recent_logs(source, lines)

@mcp.tool()
def list_processes(limit: int = 50) -> list[dict]:
    """Top processes by CPU usage."""
    return diagnostics.list_processes(limit)

@mcp.tool()
def list_docker_containers() -> dict:
    """Docker containers, if Docker is installed."""
    result = diagnostics.list_docker_containers()
    return result if isinstance(result, dict) else {"containers": result}

@mcp.tool()
def git_status(relative_directory: str = ".") -> str:
    """git status for a workspace directory."""
    return git_ops.git_status(relative_directory)

@mcp.tool()
def git_diff(relative_directory: str = ".") -> str:
    """git diff --stat for a workspace directory."""
    return git_ops.git_diff(relative_directory)

@mcp.tool()
def run_project_tests(test_command: str = "pytest", timeout: int = 120) -> dict:
    """Run an allowlisted test command (pytest / npm test / go test) with a timeout."""
    return tools.run_project_tests(test_command, timeout)

@mcp.tool()
def run_linter(timeout: int = 60) -> dict:
    """Run ruff check on the workspace, if ruff is installed."""
    return tools.run_linter(timeout)

@mcp.tool()
def create_backup(relative_directory: str = ".") -> dict:
    """Create a timestamped ZIP backup of a workspace directory."""
    return tools.create_backup(relative_directory)

@mcp.tool()
def deploy_application(project_directory: str = ".", target_directory: str = "deploy-staging") -> dict:
    """Staging deploy inside the workspace (backup first). Not a production deploy."""
    return tools.deploy_application(project_directory, target_directory)

@mcp.tool()
def submit_task(task_name: str, timeout: int = 30) -> dict:
    """Submit an allowlisted diagnostic/task to the bounded task runner."""
    r = RUNNER.submit(task_name, timeout=timeout)
    return {"task_id": r.task_id, "name": task_name, "status": r.status}

@mcp.tool()
def get_task_status(task_id: str) -> dict:
    """Status of a submitted task."""
    r = RUNNER.get(task_id)
    if r is None:
        raise ValueError("Unknown task_id.")
    return {"task_id": r.task_id, "name": r.name, "status": r.status}

@mcp.tool()
def get_task_result(task_id: str) -> dict:
    """Result/output of a submitted task."""
    r = RUNNER.get(task_id)
    if r is None:
        raise ValueError("Unknown task_id.")
    return {"task_id": r.task_id, "name": r.name, "status": r.status, "output": r.output}

@mcp.tool()
def cancel_task(task_id: str) -> dict:
    """Cancel a running task."""
    return {"task_id": task_id, "cancelled": RUNNER.cancel(task_id)}

@mcp.tool()
def request_approval(tool_name: str, reason: str) -> dict:
    """Create an approval request for a high-risk operation. It grants nothing by itself."""
    import uuid
    approval_id = uuid.uuid4().hex[:12]
    _APPROVALS[approval_id] = {"tool": tool_name, "reason": reason, "status": "pending"}
    return {"approval_id": approval_id, "status": "pending",
            "note": "An administrator must approve this via the dashboard or approve_task with the admin token."}

@mcp.tool()
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
def get_desktop_status() -> dict:
    """Whether desktop automation is enabled for this machine."""
    return tools.get_desktop_status()

@mcp.tool()
def capture_desktop_screenshot() -> dict:
    """Screenshot, only when desktop automation is explicitly enabled."""
    return tools.capture_desktop_screenshot()

@mcp.tool()
def launch_approved_application(app_name: str) -> dict:
    """Launch an application from the admin-approved list only."""
    return tools.launch_approved_application(app_name)

@mcp.tool()
def list_devices() -> list[dict]:
    """Local mode: this machine is the only enrolled device."""
    info = tools.get_system_info()
    return [{"device_id": "local", "hostname": info["machine"], "system": info["system"],
             "status": "online", "workspace": info["workspace"]}]

@mcp.tool()
def get_device_status(device_id: str = "local") -> dict:
    """Status of a device (local mode: only 'local')."""
    if device_id != "local":
        raise ValueError("Local mode only knows device 'local'; use the control plane for remote devices.")
    return {"device_id": "local", "status": "online", **tools.get_resource_usage()}

@mcp.tool()
def run_diagnostic_task(task_name: str) -> str:
    """Run one predefined, read-only diagnostic task: uptime, disk_usage, memory_summary."""
    from .tasks import run_diagnostic
    return run_diagnostic(task_name)

@mcp.tool()
def run_shell(command: str, working_directory: str = "", timeout: int = 120) -> dict:
    """Run any shell command on this machine. Ungated: runs as the MCP
    service user (root on this droplet). Output truncated per stream."""
    import subprocess

    timeout = max(1, min(int(timeout), 300))
    try:
        proc = subprocess.run(
            command,
            shell=True,
            cwd=working_directory or None,
            capture_output=True,
            text=True,
            timeout=timeout,
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
def read_file(path: str, max_chars: int = 100000) -> str:
    """Read any UTF-8 text file on this machine by absolute path."""
    from pathlib import Path

    try:
        text = Path(path).read_bytes().decode("utf-8")
    except UnicodeDecodeError:
        raise ValueError("not a UTF-8 text file")
    if len(text) > max_chars:
        text = text[:max_chars] + "\n[truncated]"
    return text


@mcp.tool()
def write_file(path: str, content: str, overwrite: bool = False) -> dict:
    """Write content to any absolute path, creating parent directories.
    Refuses to overwrite an existing file unless overwrite=true."""
    from pathlib import Path

    target = Path(path)
    if target.exists() and not overwrite:
        raise ValueError("file exists; pass overwrite=true to replace it")
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8")
    return {"path": str(target), "bytes": len(content.encode("utf-8"))}


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
