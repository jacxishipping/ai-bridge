"""Live operator activity snapshot (Phase 7): tasks, roles, agents, failures."""
from __future__ import annotations

import json
from typing import Any

from . import db as dbmod
from . import plane_state


def _parse_task_args(args_json: str | None) -> dict[str, Any]:
    if not args_json:
        return {}
    try:
        val = json.loads(args_json)
        return val if isinstance(val, dict) else {}
    except Exception:
        return {}


def _enrich_task_row(row: Any) -> dict[str, Any]:
    d = dict(row)
    args = _parse_task_args(d.get("args_json"))
    d.pop("args_json", None)
    d["role"] = args.get("_role") or args.get("role")
    d["project"] = args.get("_project") or args.get("project")
    d["task_tag"] = args.get("_task") or args.get("task")
    d["role_agent"] = args.get("_role_agent")
    d["handoff_id"] = args.get("_handoff_id")
    d["parent_task_id"] = args.get("_parent_task_id")
    d["step_index"] = args.get("_step_index")
    d["profile"] = args.get("_profile")
    d["mode"] = args.get("_mode")
    d["goal"] = args.get("_goal") or args.get("goal")
    return d


def _group_handoffs(items: list[dict[str, Any]], failures: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Group active + recent failed tasks by _handoff_id for the live pulse."""
    buckets: dict[str, dict[str, Any]] = {}
    for src in (items, failures):
        for item in src:
            hid = item.get("handoff_id")
            if not hid:
                continue
            bucket = buckets.setdefault(
                str(hid),
                {
                    "handoff_id": hid,
                    "profile": item.get("profile"),
                    "mode": item.get("mode"),
                    "goal": item.get("goal"),
                    "roles": [],
                    "tasks": [],
                    "blocked_reason": None,
                    "status": "in_progress",
                },
            )
            role = item.get("role")
            if role and role not in bucket["roles"]:
                bucket["roles"].append(role)
            bucket["tasks"].append(
                {
                    "id": item.get("id"),
                    "tool": item.get("tool"),
                    "status": item.get("status"),
                    "role": role,
                    "step_index": item.get("step_index"),
                }
            )
            st = str(item.get("status") or "")
            if st in {"failed", "timed_out"} and not bucket["blocked_reason"]:
                bucket["blocked_reason"] = f"{role or item.get('tool')} {st}"
                bucket["status"] = "blocked"
            elif st in {"queued", "running"} and bucket["status"] != "blocked":
                bucket["status"] = "in_progress"
                if not bucket["blocked_reason"]:
                    bucket["blocked_reason"] = f"waiting on {role or item.get('tool')}"
    return list(buckets.values())[:20]


def build_live_activity(conn: Any, app_state: Any, *, limit: int = 50) -> dict[str, Any]:
    limit = max(1, min(200, int(limit)))
    task_rows = conn.execute(
        "SELECT id, device_id, tool, status, args_json, updated_at FROM tasks "
        "WHERE status IN ('running', 'queued') ORDER BY updated_at DESC LIMIT ?",
        (limit,),
    ).fetchall()
    active_items = [_enrich_task_row(r) for r in task_rows]

    fail_rows = conn.execute(
        "SELECT id, device_id, tool, status, args_json, updated_at, result FROM tasks "
        "WHERE status IN ('failed', 'timed_out') ORDER BY updated_at DESC LIMIT ?",
        (min(30, limit),),
    ).fetchall()
    recent_failures = []
    for r in fail_rows:
        item = _enrich_task_row(r)
        res = (r["result"] or "")[:500]
        item["error_preview"] = res
        recent_failures.append(item)

    agent_rows = conn.execute(
        "SELECT id, name, status, last_run_at, last_error, consecutive_failures, enabled "
        "FROM custom_agents WHERE status='running' OR (enabled=1 AND consecutive_failures > 0) "
        "ORDER BY updated_at DESC LIMIT ?",
        (min(40, limit),),
    ).fetchall()
    running_agents = [
        {
            "id": a["id"],
            "name": a["name"],
            "status": a["status"],
            "last_run_at": a["last_run_at"],
            "last_error": (a["last_error"] or "")[:300] or None,
            "consecutive_failures": a["consecutive_failures"],
        }
        for a in agent_rows
        if a["status"] == "running"
    ]
    agents_with_errors = [
        {
            "id": a["id"],
            "name": a["name"],
            "consecutive_failures": a["consecutive_failures"],
            "last_error": (a["last_error"] or "")[:300] or None,
        }
        for a in agent_rows
        if a["consecutive_failures"] and a["status"] != "running"
    ]

    role_agents = []
    try:
        role_rows = conn.execute(
            "SELECT id, name, enabled, status FROM custom_agents WHERE id LIKE 'agent-role-%' ORDER BY name"
        ).fetchall()
        role_agents = [
            {
                "id": r["id"],
                "name": r["name"],
                "role": str(r["id"]).removeprefix("agent-role-"),
                "enabled": bool(r["enabled"]),
                "status": r["status"],
            }
            for r in role_rows
        ]
    except Exception:
        role_agents = []

    handoffs = _group_handoffs(active_items, recent_failures)
    sweep = getattr(app_state, "last_stale_sweep", {}) or {}
    return {
        "items": active_items,
        "recent_failures": recent_failures,
        "running_agents": running_agents,
        "agents_with_errors": agents_with_errors,
        "role_agents": role_agents,
        "handoffs": handoffs,
        "emergency_stop": plane_state.is_emergency_stop(conn, app_state),
        "last_stale_sweep": sweep,
        "ts": dbmod.now(),
    }