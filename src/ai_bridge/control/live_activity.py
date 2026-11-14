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
    return d


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

    sweep = getattr(app_state, "last_stale_sweep", {}) or {}
    return {
        "items": active_items,
        "recent_failures": recent_failures,
        "running_agents": running_agents,
        "agents_with_errors": agents_with_errors,
        "emergency_stop": plane_state.is_emergency_stop(conn, app_state),
        "last_stale_sweep": sweep,
        "ts": dbmod.now(),
    }