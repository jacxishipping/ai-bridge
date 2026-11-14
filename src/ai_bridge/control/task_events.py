"""Lightweight per-task execution event trail (Phase 7)."""
from __future__ import annotations

import json
import uuid
from typing import Any

from . import db as dbmod

EVENTS_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS task_events (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  event TEXT NOT NULL,
  detail_json TEXT,
  created_at REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_task_events_task ON task_events(task_id, created_at);
"""


def ensure_events_table(conn: Any) -> None:
    for stmt in EVENTS_TABLE_SQL.strip().split(";"):
        s = stmt.strip()
        if s:
            conn.execute(s)
    conn.commit()


def append_task_event(
    conn: Any,
    task_id: str,
    event: str,
    detail: dict | None = None,
    *,
    commit: bool = True,
) -> dict:
    ensure_events_table(conn)
    event_id = uuid.uuid4().hex[:12]
    now = dbmod.now()
    conn.execute(
        "INSERT INTO task_events (id, task_id, event, detail_json, created_at) VALUES (?,?,?,?,?)",
        (event_id, task_id, (event or "event")[:80], json.dumps(detail or {}, default=str)[:4000], now),
    )
    if commit:
        conn.commit()
    return {"id": event_id, "task_id": task_id, "event": event, "created_at": now}


def list_task_events(conn: Any, task_id: str, *, limit: int = 50) -> list[dict]:
    ensure_events_table(conn)
    limit = max(1, min(200, int(limit)))
    rows = conn.execute(
        "SELECT id, task_id, event, detail_json, created_at FROM task_events "
        "WHERE task_id=? ORDER BY created_at ASC LIMIT ?",
        (task_id, limit),
    ).fetchall()
    out = []
    for r in rows:
        item = dict(r)
        try:
            item["detail"] = json.loads(item.pop("detail_json") or "{}")
        except Exception:
            item["detail"] = {"raw": item.pop("detail_json", None)}
        out.append(item)
    return out
