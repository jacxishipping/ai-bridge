"""Thin supervisor orchestration across role_catalog presets (Phase 6)."""
from __future__ import annotations

import json
import time
import uuid
from typing import Any

from . import db as dbmod
from .role_catalog import ROLES
from ..policy import TOOL_TIERS


def role_agent_id(role: str) -> str:
    role = (role or "").strip().lower()
    if role not in ROLES:
        raise ValueError(f"Unknown role '{role}'. Choose one of: {', '.join(sorted(ROLES))}.")
    return f"agent-role-{role}"


def enqueue_role_task(
    conn: Any,
    *,
    device_id: str,
    tenant: str,
    tool: str,
    args: dict | None = None,
    role: str | None = None,
    status: str = "queued",
) -> dict:
    """Queue a plane task with optional role metadata embedded in args_json."""
    if tool not in TOOL_TIERS:
        raise ValueError(f"Tool not in policy catalog: {tool}")
    args = dict(args or {})
    if role:
        args["_role"] = role
        args["_role_agent"] = role_agent_id(role)
    tier = int(TOOL_TIERS[tool].value)
    task_id = uuid.uuid4().hex[:12]
    now = dbmod.now()
    conn.execute(
        "INSERT INTO tasks (id, device_id, tenant, tool, args_json, tier, status, created_at, updated_at) "
        "VALUES (?,?,?,?,?,?,?,?,?)",
        (task_id, device_id, tenant, tool, json.dumps(args), tier, status, now, now),
    )
    conn.commit()
    return {"ok": True, "task_id": task_id, "tool": tool, "role": role, "args": args}


def supervisor_handoff_plan(goal: str) -> list[dict]:
    """Deterministic supervisor → planner → developer tool sequence for workflows."""
    goal = (goal or "").strip() or "unspecified goal"
    return [
        {
            "name": "Planner — survey workspace",
            "tool": "dev_workspace_plan",
            "args": {"relative_directory": ".", "_role": "planner", "goal": goal},
        },
        {
            "name": "Developer — git status",
            "tool": "git_status",
            "args": {"relative_directory": ".", "_role": "developer", "goal": goal},
        },
        {
            "name": "Tester — structured tests",
            "tool": "run_project_tests_structured",
            "args": {"test_command": "pytest -q", "_role": "tester", "goal": goal},
        },
    ]


def run_supervisor_handoff_enqueue(conn: Any, *, device_id: str, tenant: str, goal: str) -> dict:
    """Enqueue the handoff plan as separate role-tagged plane tasks (no LLM)."""
    queued = []
    for step in supervisor_handoff_plan(goal):
        tool = step["tool"]
        args = dict(step.get("args") or {})
        role = str(args.get("_role") or "")
        res = enqueue_role_task(conn, device_id=device_id, tenant=tenant, tool=tool, args=args, role=role)
        queued.append({**res, "name": step.get("name")})
    return {"ok": True, "goal": goal, "queued": queued}


def recover_failed_role_tasks(conn: Any, *, role: str, device_id: str | None = None) -> dict:
    """Re-queue failed tasks that were tagged with a given role."""
    role = (role or "").strip().lower()
    rows = conn.execute(
        "SELECT id, device_id, tool, args_json, tenant FROM tasks WHERE status='failed'"
    ).fetchall()
    requeued: list[str] = []
    for row in rows:
        try:
            args = json.loads(row["args_json"] or "{}")
        except json.JSONDecodeError:
            continue
        if str(args.get("_role") or "").lower() != role:
            continue
        if device_id and row["device_id"] != device_id:
            continue
        now = dbmod.now()
        conn.execute(
            "UPDATE tasks SET status='queued', result=NULL, updated_at=? WHERE id=?",
            (now, row["id"]),
        )
        requeued.append(row["id"])
    if requeued:
        conn.commit()
    return {"ok": True, "role": role, "requeued": requeued, "count": len(requeued)}


def delegate_role_target(role: str) -> dict:
    """Map a role id to the seeded custom agent row id for agent_delegate."""
    aid = role_agent_id(role)
    return {
        "ok": True,
        "role": role,
        "target_agent": aid,
        "agent_name": ROLES[role]["name"],
        "allowed_tools": ROLES[role].get("allowed_tools") or [],
    }