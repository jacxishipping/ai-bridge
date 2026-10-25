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
    policy = policy or Policy()
    d = decide(policy, tool, approval_granted=approval_granted, is_admin=is_admin)
    if not d.allowed:
        raise PermissionError(d.reason)
    tier = TOOL_TIERS.get(tool)
    if tier == RiskTier.HIGH_RISK and not approval_granted:
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
        "get_service_status": lambda a: diagnostics.service_status(a["service"]),
        "get_recent_logs": lambda a: diagnostics.recent_logs(a.get("source", "system"), a.get("lines", 50)),
        "list_processes": lambda a: diagnostics.list_processes(a.get("limit", 50)),
        "list_docker_containers": lambda a: diagnostics.list_docker_containers(),
        "git_status": lambda a: git_ops.git_status(a.get("relative_directory", ".")),
        "git_diff": lambda a: git_ops.git_diff(a.get("relative_directory", ".")),
        "run_project_tests": lambda a: tools.run_project_tests(a.get("test_command", "pytest"), a.get("timeout", 120)),
        "run_linter": lambda a: tools.run_linter(a.get("timeout", 60)),
        "create_backup": lambda a: tools.create_backup(a.get("relative_directory", ".")),
        "deploy_application": lambda a: tools.deploy_application(a.get("project_directory", "."), a.get("target_directory", "deploy-staging")),
        "get_desktop_status": lambda a: tools.get_desktop_status(),
        "capture_desktop_screenshot": lambda a: tools.capture_desktop_screenshot(),
        "launch_approved_application": lambda a: tools.launch_approved_application(a["app_name"]),
        "install_package": lambda a: tools.install_package(a["package_id"], a.get("version"), approval_granted=approval_granted),
    }
    handler = handlers.get(tool)
    if handler is None:
        raise ValueError(f"Tool not executable via the control plane: {tool}")
    if tool in {"read_workspace_file", "edit_workspace_file", "move_workspace_file", "delete_workspace_file",
                "create_workspace_file", "search_workspace"} and tool != "search_workspace":
        # Require the exact argument keys; extra keys are ignored, missing keys fail loudly.
        pass
    return handler(args or {})
