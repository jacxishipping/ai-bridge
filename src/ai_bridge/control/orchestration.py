"""Task lifecycle maintenance: stale running recovery and concurrency helpers."""
from __future__ import annotations

import json
import os
from typing import Any

from . import db as dbmod
from .plane_state import is_emergency_stop


DEFAULT_RUNNING_LEASE_SEC = int(os.environ.get("AI_BRIDGE_TASK_RUNNING_LEASE_SEC", "900"))
DEFAULT_SWEEP_INTERVAL_SEC = int(os.environ.get("AI_BRIDGE_TASK_SWEEP_INTERVAL_SEC", "30"))


def device_has_active_lease(conn: Any, device_id: str, *, lease_sec: int | None = None) -> bool:
    """True when a fresh 'running' task still holds the per-device execution lease."""
    lease = lease_sec if lease_sec is not None else DEFAULT_RUNNING_LEASE_SEC
    cutoff = dbmod.now() - lease
    row = conn.execute(
        "SELECT id FROM tasks WHERE device_id=? AND status='running' AND updated_at >= ? LIMIT 1",
        (device_id, cutoff),
    ).fetchone()
    return row is not None


def sweep_stale_running_tasks(
    conn: Any,
    *,
    lease_sec: int | None = None,
    requeue: bool | None = None,
) -> dict[str, int]:
    """Reclaim tasks stuck in 'running' longer than the lease (agent crash / network loss)."""
    lease = lease_sec if lease_sec is not None else DEFAULT_RUNNING_LEASE_SEC
    if requeue is None:
        requeue = os.environ.get("AI_BRIDGE_STALE_TASK_REQUEUE", "1").strip().lower() in (
            "1",
            "true",
            "yes",
        )
    cutoff = dbmod.now() - lease
    rows = conn.execute(
        "SELECT id, device_id, tool, args_json FROM tasks WHERE status='running' AND updated_at < ?",
        (cutoff,),
    ).fetchall()
    timed_out = 0
    requeued = 0
    for row in rows:
        tid = row["id"] if hasattr(row, "keys") else row[0]
        if requeue and not is_emergency_stop(conn):
            conn.execute(
                "UPDATE tasks SET status='queued', result=?, updated_at=? WHERE id=? AND status='running'",
                (
                    json.dumps({"note": "Requeued after stale running lease expired."})[:2000],
                    dbmod.now(),
                    tid,
                ),
            )
            requeued += 1
        else:
            conn.execute(
                "UPDATE tasks SET status='timed_out', result=?, updated_at=? WHERE id=? AND status='running'",
                (
                    json.dumps({"error": "Task exceeded running lease without completion."})[:2000],
                    dbmod.now(),
                    tid,
                ),
            )
            timed_out += 1
    if timed_out or requeued:
        conn.commit()
    return {"timed_out": timed_out, "requeued": requeued, "scanned": len(rows)}