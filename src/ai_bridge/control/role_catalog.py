"""Named multi-agent role presets (Phase 6) seeded as workflow templates + custom agents."""
from __future__ import annotations

import json
import uuid
from typing import Any

from . import db as dbmod

ROLES: dict[str, dict[str, Any]] = {
    "supervisor": {
        "name": "Supervisor",
        "instruction": (
            "You coordinate other agents. Pause unsafe work, delegate subtasks, "
            "and require approvals before tier-4 actions."
        ),
        "allowed_tools": [
            "agent_delegate",
            "agent_run_workflow",
            "agent_notify",
            "supervisor_delegate_role",
            "dev_workspace_plan",
            "get_system_info",
            "list_processes",
        ],
    },
    "planner": {
        "name": "Planner",
        "instruction": "Break goals into ordered steps and queue workflow templates.",
        "allowed_tools": [
            "agent_run_workflow",
            "dev_workspace_plan",
            "workspace_project_structure",
            "search_workspace",
            "list_workspace",
            "agent_remember",
        ],
    },
    "researcher": {
        "name": "Researcher",
        "instruction": "Gather evidence from the web and workspace; cite sources in memory.",
        "allowed_tools": [
            "you_web_search",
            "you_fetch_contents",
            "firecrawl_scrape",
            "firecrawl_search",
            "search_workspace",
            "browser_navigate",
            "browser_get_text",
        ],
    },
    "developer": {
        "name": "Developer",
        "instruction": "Implement and test code changes inside the workspace with git discipline.",
        "allowed_tools": [
            "list_workspace",
            "workspace_project_structure",
            "dev_workspace_plan",
            "read_workspace_file",
            "edit_workspace_file",
            "git_status",
            "git_diff",
            "git_apply_patch",
            "git_create_branch",
            "git_checkpoint",
            "run_project_tests",
            "run_project_tests_structured",
            "run_linter",
        ],
    },
    "computer_operator": {
        "name": "Computer Operator",
        "instruction": "Operate the desktop with grounding screenshots and bounded UI tools.",
        "allowed_tools": ["desktop_get_screenshot", "desktop_click", "desktop_keyboard", "set_of_marks_screenshot"],
    },
    "browser_operator": {
        "name": "Browser Operator",
        "instruction": "Automate browser workflows on dispatched Playwright tools.",
        "allowed_tools": [
            "browser_navigate",
            "browser_click",
            "browser_type",
            "browser_screenshot",
            "browser_get_url",
            "browser_session_info",
            "browserbase_create_session",
            "browserbase_navigate",
        ],
    },
    "tester": {
        "name": "Tester",
        "instruction": "Run tests and report failures with repro steps.",
        "allowed_tools": [
            "run_project_tests",
            "run_project_tests_structured",
            "run_linter",
            "git_diff",
            "agent_notify",
        ],
    },
    "security_auditor": {
        "name": "Security Auditor",
        "instruction": "Review policy, audit trails, and risky tool usage patterns.",
        "allowed_tools": ["search_workspace", "git_diff", "get_recent_logs", "agent_notify"],
    },
    "recovery": {
        "name": "Recovery",
        "instruction": "Diagnose stuck tasks, service health, and recommend rollback steps.",
        "allowed_tools": [
            "get_service_status",
            "get_recent_logs",
            "list_processes",
            "create_backup",
            "supervisor_delegate_role",
        ],
    },
}


def seed_role_catalog(conn: Any, *, tenant: str = "default") -> int:
    """Insert workflow templates + disabled custom agent stubs for each role (idempotent)."""
    now = dbmod.now()
    created = 0
    for role_id, spec in ROLES.items():
        tpl_id = f"role-{role_id}"
        existing = conn.execute("SELECT id FROM workflow_templates WHERE id=?", (tpl_id,)).fetchone()
        if existing is None:
            steps = [
                {
                    "tool": "agent_delegate",
                    "args": {"role": role_id, "message": f"Run as {spec['name']} role."},
                }
            ]
            conn.execute(
                "INSERT INTO workflow_templates (id, name, description, steps_json, tenant, created_by, created_at) "
                "VALUES (?,?,?,?,?,?,?)",
                (
                    tpl_id,
                    f"Role: {spec['name']}",
                    spec["instruction"][:500],
                    json.dumps(steps),
                    tenant,
                    "system",
                    now,
                ),
            )
            created += 1
        agent_id = f"agent-role-{role_id}"
        row = conn.execute("SELECT id FROM custom_agents WHERE id=?", (agent_id,)).fetchone()
        if row is None:
            conn.execute(
                "INSERT INTO custom_agents "
                "(id, name, instruction, tenant, provider, model, device_ids_json, interval_seconds, enabled, "
                "status, next_run_at, allowed_tools_json, created_at, updated_at) "
                "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                (
                    agent_id,
                    spec["name"],
                    spec["instruction"],
                    tenant,
                    "openai",
                    None,
                    json.dumps([]),
                    86400,
                    0,
                    "idle",
                    now + 86400,
                    json.dumps(spec["allowed_tools"]),
                    now,
                    now,
                ),
            )
            created += 1
    handoff_id = "role-handoff-supervisor-planner-developer"
    if conn.execute("SELECT id FROM workflow_templates WHERE id=?", (handoff_id,)).fetchone() is None:
        from . import supervisor as sup

        steps = [
            {
                "tool": step["tool"],
                "args": step.get("args") or {},
                "name": step.get("name"),
            }
            for step in sup.supervisor_handoff_plan("{{goal}}")
        ]
        conn.execute(
            "INSERT INTO workflow_templates (id, name, description, steps_json, tenant, created_by, created_at) "
            "VALUES (?,?,?,?,?,?,?)",
            (
                handoff_id,
                "Handoff: Supervisor → Planner → Developer",
                "Queues role-tagged planning, git status, and structured test tasks.",
                json.dumps(steps),
                tenant,
                "system",
                now,
            ),
        )
        created += 1
    if created:
        conn.commit()
    return created