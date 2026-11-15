"""Durable agent memory chunks beyond the legacy 8k custom_agents.memory column."""
from __future__ import annotations

import json
from typing import Any

from . import db as dbmod

CHUNK_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS agent_memory_chunks (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  tenant TEXT NOT NULL DEFAULT 'default',
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  project_tag TEXT,
  task_tag TEXT,
  created_at REAL NOT NULL,
  updated_at REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_agent_memory_agent ON agent_memory_chunks(agent_id, chunk_index);
"""


def ensure_memory_table(conn: Any) -> None:
    for stmt in CHUNK_TABLE_SQL.strip().split(";"):
        s = stmt.strip()
        if s:
            conn.execute(s)
    dialect = getattr(conn, "dialect", "sqlite")
    try:
        if dialect == "postgres":
            cols = {
                r[0]
                for r in conn.execute(
                    "SELECT column_name FROM information_schema.columns WHERE table_name = 'agent_memory_chunks'"
                ).fetchall()
            }
        else:
            cols = {r[1] for r in conn.execute("PRAGMA table_info(agent_memory_chunks)").fetchall()}
    except Exception:
        cols = set()
    for col in ("project_tag", "task_tag"):
        if col not in cols:
            try:
                conn.execute(f"ALTER TABLE agent_memory_chunks ADD COLUMN {col} TEXT")
            except Exception:
                if dialect == "postgres":
                    try:
                        conn.rollback()
                    except Exception:
                        pass
    try:
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_agent_memory_tags "
            "ON agent_memory_chunks(agent_id, project_tag, task_tag)"
        )
    except Exception:
        if dialect == "postgres":
            try:
                conn.rollback()
            except Exception:
                pass
    conn.commit()


def append_memory_chunk(
    conn: Any,
    agent_id: str,
    content: str,
    *,
    tenant: str = "default",
    project_tag: str | None = None,
    task_tag: str | None = None,
) -> dict:
    ensure_memory_table(conn)
    row = conn.execute(
        "SELECT MAX(chunk_index) AS m FROM agent_memory_chunks WHERE agent_id=?",
        (agent_id,),
    ).fetchone()
    next_idx = int((row["m"] if row and row["m"] is not None else -1)) + 1
    chunk_id = f"{agent_id}-{next_idx:04d}"
    now = dbmod.now()
    conn.execute(
        "INSERT INTO agent_memory_chunks "
        "(id, agent_id, tenant, chunk_index, content, project_tag, task_tag, created_at, updated_at) "
        "VALUES (?,?,?,?,?,?,?,?,?)",
        (
            chunk_id,
            agent_id,
            tenant,
            next_idx,
            content[:500_000],
            (project_tag or "").strip() or None,
            (task_tag or "").strip() or None,
            now,
            now,
        ),
    )
    conn.commit()
    return {
        "chunk_id": chunk_id,
        "chunk_index": next_idx,
        "bytes": len(content),
        "project_tag": project_tag,
        "task_tag": task_tag,
    }


def query_agent_memory(
    conn: Any,
    agent_id: str,
    *,
    project_tag: str | None = None,
    task_tag: str | None = None,
    limit: int = 50,
) -> list[dict]:
    ensure_memory_table(conn)
    limit = max(1, min(200, int(limit)))
    q = (
        "SELECT chunk_index, content, project_tag, task_tag, updated_at FROM agent_memory_chunks "
        "WHERE agent_id=?"
    )
    params: list[Any] = [agent_id]
    if project_tag:
        q += " AND project_tag=?"
        params.append(project_tag.strip())
    if task_tag:
        q += " AND task_tag=?"
        params.append(task_tag.strip())
    q += " ORDER BY chunk_index DESC LIMIT ?"
    params.append(limit)
    rows = conn.execute(q, tuple(params)).fetchall()
    return [dict(r) for r in reversed(rows)]


def load_agent_memory(conn: Any, agent_id: str, *, limit: int = 50) -> list[dict]:
    ensure_memory_table(conn)
    rows = conn.execute(
        "SELECT chunk_index, content, project_tag, task_tag, updated_at FROM agent_memory_chunks "
        "WHERE agent_id=? ORDER BY chunk_index DESC LIMIT ?",
        (agent_id, max(1, min(limit, 200))),
    ).fetchall()
    return [dict(r) for r in reversed(rows)]


def clear_agent_memory(
    conn: Any,
    agent_id: str,
    *,
    project_tag: str | None = None,
    task_tag: str | None = None,
) -> dict:
    """Delete memory chunks for an agent, optionally scoped by project/task tags."""
    ensure_memory_table(conn)
    q = "DELETE FROM agent_memory_chunks WHERE agent_id=?"
    params: list[Any] = [agent_id]
    if project_tag:
        q += " AND project_tag=?"
        params.append(project_tag.strip())
    if task_tag:
        q += " AND task_tag=?"
        params.append(task_tag.strip())
    cur = conn.execute(q, tuple(params))
    conn.commit()
    return {"ok": True, "agent_id": agent_id, "deleted": int(cur.rowcount or 0), "project": project_tag, "task": task_tag}


def format_chunks_for_prompt(chunks: list[dict], *, max_chars: int = 4000) -> str:
    """Render tagged chunks for system-prompt injection (newest already ordered ascending)."""
    if not chunks:
        return ""
    lines: list[str] = []
    used = 0
    for ch in chunks:
        content = str(ch.get("content") or "").strip()
        if not content:
            continue
        tags = []
        if ch.get("project_tag"):
            tags.append(f"project={ch['project_tag']}")
        if ch.get("task_tag"):
            tags.append(f"task={ch['task_tag']}")
        prefix = f"[{', '.join(tags)}] " if tags else ""
        line = f"- {prefix}{content}"
        if used + len(line) > max_chars:
            break
        lines.append(line)
        used += len(line) + 1
    if not lines:
        return ""
    return "Durable memory chunks (project/task tagged):\n" + "\n".join(lines) + "\n"


def export_agent_memory(conn: Any, agent_id: str) -> str:
    chunks = load_agent_memory(conn, agent_id, limit=500)
    return json.dumps(chunks, ensure_ascii=False)