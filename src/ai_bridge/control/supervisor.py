"""Thin supervisor orchestration across role_catalog presets (Phase 6 / MAI)."""
from __future__ import annotations

import json
import uuid
from contextvars import ContextVar
from typing import Any

from . import db as dbmod
from .role_catalog import ROLES
from ..policy import TOOL_TIERS

# Control-plane connection for dispatch-side supervisor tools (handoff / recover).
_PLANE_CONN: ContextVar[Any | None] = ContextVar("ai_bridge_plane_conn", default=None)


def set_plane_conn(conn: Any | None):
    """Bind the control-plane DB for in-process supervisor dispatch tools."""
    return _PLANE_CONN.set(conn)


def reset_plane_conn(token) -> None:
    _PLANE_CONN.reset(token)


def get_plane_conn() -> Any | None:
    return _PLANE_CONN.get()


HANDOFF_PROFILES: dict[str, list[dict[str, Any]]] = {
    "code": [
        {
            "name": "Planner — survey workspace",
            "role": "planner",
            "tool": "dev_workspace_plan",
            "args": {"relative_directory": "."},
        },
        {
            "name": "Developer — git status",
            "role": "developer",
            "tool": "git_status",
            "args": {"relative_directory": "."},
        },
        {
            "name": "Tester — structured tests",
            "role": "tester",
            "tool": "run_project_tests_structured",
            "args": {"test_command": "pytest -q"},
        },
    ],
    "research": [
        {
            "name": "Planner — survey workspace",
            "role": "planner",
            "tool": "dev_workspace_plan",
            "args": {"relative_directory": "."},
        },
        {
            "name": "Researcher — search workspace",
            "role": "researcher",
            "tool": "search_workspace",
            "args": {"query": "architecture overview", "relative_directory": "."},
        },
        {
            "name": "Browser Operator — session check",
            "role": "browser_operator",
            "tool": "browser_session_info",
            "args": {},
        },
    ],
    "desktop": [
        {
            "name": "Computer Operator — screenshot",
            "role": "computer_operator",
            "tool": "capture_desktop_screenshot",
            "args": {},
        },
        {
            "name": "Tester — desktop verify",
            "role": "tester",
            "tool": "desktop_verify_action",
            "args": {"expected_text": "", "capture_after": True},
        },
        {
            "name": "Security Auditor — recent logs",
            "role": "security_auditor",
            "tool": "get_recent_logs",
            "args": {"source": "system", "lines": 30},
        },
    ],
    "browser": [
        {
            "name": "Browser Operator — session",
            "role": "browser_operator",
            "tool": "browser_session_info",
            "args": {},
        },
        {
            "name": "Tester — browser diagnostics",
            "role": "tester",
            "tool": "browser_diagnostics",
            "args": {},
        },
    ],
    "full": [
        {
            "name": "Planner — survey workspace",
            "role": "planner",
            "tool": "dev_workspace_plan",
            "args": {"relative_directory": "."},
        },
        {
            "name": "Researcher — search workspace",
            "role": "researcher",
            "tool": "search_workspace",
            "args": {"query": "security risks", "relative_directory": "."},
        },
        {
            "name": "Developer — git status",
            "role": "developer",
            "tool": "git_status",
            "args": {"relative_directory": "."},
        },
        {
            "name": "Tester — structured tests",
            "role": "tester",
            "tool": "run_project_tests_structured",
            "args": {"test_command": "pytest -q"},
        },
        {
            "name": "Security Auditor — audit logs",
            "role": "security_auditor",
            "tool": "get_recent_logs",
            "args": {"source": "system", "lines": 40},
        },
        {
            "name": "Computer Operator — screenshot",
            "role": "computer_operator",
            "tool": "capture_desktop_screenshot",
            "args": {},
        },
        {
            "name": "Browser Operator — session",
            "role": "browser_operator",
            "tool": "browser_session_info",
            "args": {},
        },
    ],
}

RECOVERY_STEP: dict[str, Any] = {
    "name": "Recovery — service health",
    "role": "recovery",
    "tool": "get_service_status",
    "args": {"service": "ai-bridge"},
}


def role_agent_id(role: str) -> str:
    role = (role or "").strip().lower()
    if role not in ROLES:
        raise ValueError(f"Unknown role '{role}'. Choose one of: {', '.join(sorted(ROLES))}.")
    return f"agent-role-{role}"


def tag_task_args(
    args: dict | None = None,
    *,
    role: str | None = None,
    handoff_id: str | None = None,
    parent_task_id: str | None = None,
    goal: str | None = None,
    step_index: int | None = None,
    profile: str | None = None,
    mode: str | None = None,
    extra: dict | None = None,
) -> dict:
    """Standardize handoff/parent/role metadata on task args_json."""
    out = dict(args or {})
    if extra:
        out.update(extra)
    if role:
        role_l = str(role).strip().lower()
        out["_role"] = role_l
        out["_role_agent"] = role_agent_id(role_l)
    if handoff_id:
        out["_handoff_id"] = handoff_id
    if parent_task_id:
        out["_parent_task_id"] = parent_task_id
    if goal is not None:
        out["_goal"] = goal
    if step_index is not None:
        out["_step_index"] = int(step_index)
    if profile:
        out["_profile"] = profile
    if mode:
        out["_mode"] = mode
    return out


def enqueue_role_task(
    conn: Any,
    *,
    device_id: str,
    tenant: str,
    tool: str,
    args: dict | None = None,
    role: str | None = None,
    status: str = "queued",
    handoff_id: str | None = None,
    parent_task_id: str | None = None,
    goal: str | None = None,
    step_index: int | None = None,
    profile: str | None = None,
    mode: str | None = None,
) -> dict:
    """Queue a plane task with optional role / handoff metadata embedded in args_json."""
    if tool not in TOOL_TIERS:
        raise ValueError(f"Tool not in policy catalog: {tool}")
    tagged = tag_task_args(
        args,
        role=role,
        handoff_id=handoff_id,
        parent_task_id=parent_task_id,
        goal=goal,
        step_index=step_index,
        profile=profile,
        mode=mode,
    )
    if role and not tagged.get("_role"):
        tagged = tag_task_args(tagged, role=role)
    tier = int(TOOL_TIERS[tool].value)
    task_id = uuid.uuid4().hex[:12]
    now = dbmod.now()
    conn.execute(
        "INSERT INTO tasks (id, device_id, tenant, tool, args_json, tier, status, created_at, updated_at) "
        "VALUES (?,?,?,?,?,?,?,?,?)",
        (task_id, device_id, tenant, tool, json.dumps(tagged), tier, status, now, now),
    )
    conn.commit()
    return {
        "ok": True,
        "task_id": task_id,
        "tool": tool,
        "role": tagged.get("_role") or role,
        "args": tagged,
        "handoff_id": tagged.get("_handoff_id"),
        "step_index": tagged.get("_step_index"),
    }


def supervisor_handoff_plan(goal: str, profile: str = "code") -> list[dict]:
    """Deterministic role tool sequence for a named handoff profile."""
    goal = (goal or "").strip() or "unspecified goal"
    profile = (profile or "code").strip().lower()
    if profile not in HANDOFF_PROFILES:
        raise ValueError(f"Unknown handoff profile '{profile}'. Choose one of: {', '.join(sorted(HANDOFF_PROFILES))}.")
    steps: list[dict] = []
    for step in HANDOFF_PROFILES[profile]:
        args = dict(step.get("args") or {})
        args["goal"] = goal
        steps.append(
            {
                "name": step["name"],
                "role": step["role"],
                "tool": step["tool"],
                "args": args,
            }
        )
    return steps


def run_supervisor_handoff_enqueue(
    conn: Any,
    *,
    device_id: str,
    tenant: str,
    goal: str,
    profile: str = "code",
    mode: str = "gated",
) -> dict:
    """Enqueue a supervised handoff. Default mode=gated enqueues only the first step."""
    profile = (profile or "code").strip().lower()
    mode = (mode or "gated").strip().lower()
    if mode not in {"gated", "fanout"}:
        raise ValueError("mode must be 'gated' or 'fanout'")
    steps = supervisor_handoff_plan(goal, profile=profile)
    handoff_id = uuid.uuid4().hex[:12]
    queued: list[dict] = []
    to_enqueue = steps if mode == "fanout" else steps[:1]
    for idx, step in enumerate(to_enqueue):
        res = enqueue_role_task(
            conn,
            device_id=device_id,
            tenant=tenant,
            tool=step["tool"],
            args=step.get("args") or {},
            role=str(step.get("role") or ""),
            handoff_id=handoff_id,
            parent_task_id=None,
            goal=goal,
            step_index=idx if mode == "fanout" else 0,
            profile=profile,
            mode=mode,
        )
        queued.append({**res, "name": step.get("name")})
    return {
        "ok": True,
        "goal": goal,
        "profile": profile,
        "mode": mode,
        "handoff_id": handoff_id,
        "total_steps": len(steps),
        "queued": queued,
    }


def _parse_args(row: Any) -> dict:
    raw = row["args_json"] if hasattr(row, "keys") else (row.get("args_json") if isinstance(row, dict) else None)
    try:
        args = json.loads(raw or "{}")
    except json.JSONDecodeError:
        return {}
    return args if isinstance(args, dict) else {}


def advance_handoff(conn: Any, task: Any, *, status: str) -> dict | None:
    """On gated handoff task completion/failure, enqueue the next step or Recovery."""
    args = _parse_args(task)
    mode = str(args.get("_mode") or "").lower()
    if mode != "gated":
        return None
    handoff_id = str(args.get("_handoff_id") or "").strip()
    profile = str(args.get("_profile") or "code").strip().lower()
    if not handoff_id or profile not in HANDOFF_PROFILES:
        return None
    goal = str(args.get("_goal") or args.get("goal") or "")
    step_index = int(args.get("_step_index") or 0)
    device_id = task["device_id"] if hasattr(task, "keys") else task.get("device_id")
    tenant = task["tenant"] if hasattr(task, "keys") else task.get("tenant", "default")
    parent_id = task["id"] if hasattr(task, "keys") else task.get("id")
    status_l = (status or "").strip().lower()

    if status_l == "completed":
        plan = supervisor_handoff_plan(goal, profile=profile)
        next_idx = step_index + 1
        if next_idx >= len(plan):
            return {"ok": True, "handoff_id": handoff_id, "advanced": False, "reason": "handoff_complete"}
        step = plan[next_idx]
        res = enqueue_role_task(
            conn,
            device_id=device_id,
            tenant=tenant,
            tool=step["tool"],
            args=step.get("args") or {},
            role=str(step.get("role") or ""),
            handoff_id=handoff_id,
            parent_task_id=parent_id,
            goal=goal,
            step_index=next_idx,
            profile=profile,
            mode="gated",
        )
        return {
            "ok": True,
            "handoff_id": handoff_id,
            "advanced": True,
            "next_step": next_idx,
            "queued": res,
        }

    if status_l in {"failed", "timed_out", "cancelled"}:
        # Avoid infinite recovery loops when Recovery itself fails.
        if str(args.get("_role") or "").lower() == "recovery":
            return {"ok": True, "handoff_id": handoff_id, "advanced": False, "reason": "recovery_failed"}
        step = RECOVERY_STEP
        res = enqueue_role_task(
            conn,
            device_id=device_id,
            tenant=tenant,
            tool=step["tool"],
            args={
                **dict(step.get("args") or {}),
                "_failed_task_id": parent_id,
                "_failed_role": args.get("_role"),
                "_failed_tool": task["tool"] if hasattr(task, "keys") else task.get("tool"),
            },
            role=str(step.get("role") or "recovery"),
            handoff_id=handoff_id,
            parent_task_id=parent_id,
            goal=goal,
            step_index=step_index + 1,
            profile=profile,
            mode="gated",
        )
        return {
            "ok": True,
            "handoff_id": handoff_id,
            "advanced": True,
            "recovery": True,
            "queued": res,
        }
    return None


def handoff_status(conn: Any, handoff_id: str) -> dict:
    """Summarize child tasks for a handoff id."""
    handoff_id = (handoff_id or "").strip()
    if not handoff_id:
        raise ValueError("handoff_id is required")
    rows = conn.execute(
        "SELECT id, device_id, tool, status, args_json, created_at, updated_at, result FROM tasks "
        "ORDER BY created_at ASC"
    ).fetchall()
    children: list[dict] = []
    blocked_reason = None
    for row in rows:
        args = _parse_args(row)
        if str(args.get("_handoff_id") or "") != handoff_id:
            continue
        item = {
            "task_id": row["id"],
            "tool": row["tool"],
            "status": row["status"],
            "role": args.get("_role"),
            "step_index": args.get("_step_index"),
            "parent_task_id": args.get("_parent_task_id"),
            "profile": args.get("_profile"),
            "mode": args.get("_mode"),
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
        }
        children.append(item)
        if row["status"] in {"failed", "timed_out"} and blocked_reason is None:
            blocked_reason = f"step {args.get('_step_index')} ({args.get('_role')}) {row['status']}"
        if row["status"] in {"queued", "running"} and blocked_reason is None:
            blocked_reason = f"waiting on step {args.get('_step_index')} ({args.get('_role')})"
    profile = None
    mode = None
    goal = None
    if children:
        # Re-parse first matching for profile metadata
        for row in rows:
            args = _parse_args(row)
            if str(args.get("_handoff_id") or "") == handoff_id:
                profile = args.get("_profile")
                mode = args.get("_mode")
                goal = args.get("_goal")
                break
    statuses = {c["status"] for c in children}
    if not children:
        overall = "not_found"
    elif statuses <= {"completed"}:
        overall = "completed"
        blocked_reason = None
    elif "failed" in statuses or "timed_out" in statuses:
        overall = "failed"
    elif "running" in statuses or "queued" in statuses:
        overall = "in_progress"
    else:
        overall = "unknown"
    return {
        "ok": True,
        "handoff_id": handoff_id,
        "profile": profile,
        "mode": mode,
        "goal": goal,
        "status": overall,
        "blocked_reason": blocked_reason,
        "tasks": children,
        "count": len(children),
    }


def recover_failed_role_tasks(conn: Any, *, role: str, device_id: str | None = None) -> dict:
    """Re-queue failed tasks that were tagged with a given role."""
    role = (role or "").strip().lower()
    rows = conn.execute(
        "SELECT id, device_id, tool, args_json, tenant FROM tasks WHERE status='failed'"
    ).fetchall()
    requeued: list[str] = []
    for row in rows:
        args = _parse_args(row)
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


def enqueue_agent_run_role(
    conn: Any,
    *,
    device_id: str,
    tenant: str,
    role: str,
    prompt: str,
    parent_task_id: str | None = None,
    handoff_id: str | None = None,
    goal: str | None = None,
) -> dict:
    """Queue a shared-task that AgentRunner claims to execute a role agent."""
    role = (role or "").strip().lower()
    if role not in ROLES:
        raise ValueError(f"Unknown role '{role}'")
    prompt = (prompt or "").strip()
    if not prompt:
        raise ValueError("prompt is required")
    return enqueue_role_task(
        conn,
        device_id=device_id,
        tenant=tenant,
        tool="agent_run_role",
        args={"role": role, "prompt": prompt, "target_agent": role_agent_id(role)},
        role=role,
        handoff_id=handoff_id or uuid.uuid4().hex[:12],
        parent_task_id=parent_task_id,
        goal=goal or prompt[:200],
        step_index=0,
        profile="delegate",
        mode="queued_delegate",
    )


def dispatch_supervisor_enqueue_handoff(args: dict) -> dict:
    """Dispatch entry for supervisor_enqueue_handoff (requires plane conn)."""
    conn = get_plane_conn()
    if conn is None:
        raise RuntimeError(
            "supervisor_enqueue_handoff requires a control-plane database connection "
            "(run via Supervisor agent / control plane, not a bare device poller)."
        )
    device_id = str(args.get("device_id") or args.get("device") or "").strip()
    if not device_id:
        raise ValueError("device_id is required")
    tenant = str(args.get("tenant") or "default")
    goal = str(args.get("goal") or "")
    profile = str(args.get("profile") or "code")
    mode = str(args.get("mode") or "gated")
    return run_supervisor_handoff_enqueue(
        conn,
        device_id=device_id,
        tenant=tenant,
        goal=goal,
        profile=profile,
        mode=mode,
    )


def dispatch_supervisor_recover(args: dict) -> dict:
    """Dispatch entry for supervisor_recover_role_tasks."""
    conn = get_plane_conn()
    if conn is None:
        raise RuntimeError(
            "supervisor_recover_role_tasks requires a control-plane database connection."
        )
    role = str(args.get("role") or "").strip()
    if not role:
        raise ValueError("role is required")
    device_id = args.get("device_id") or args.get("device")
    device_id = str(device_id).strip() if device_id else None
    return recover_failed_role_tasks(conn, role=role, device_id=device_id)
