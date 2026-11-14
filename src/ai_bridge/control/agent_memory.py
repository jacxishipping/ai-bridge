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
    conn.commit()


def append_memory_chunk(conn: Any, agent_id: str, content: str, *, tenant: str = "default") -> dict:
    ensure_memory_table(conn)
    row = conn.execute(
        "SELECT MAX(chunk_index) AS m FROM agent_memory_chunks WHERE agent_id=?",
        (agent_id,),
    ).fetchone()
    next_idx = int((row["m"] if row and row["m"] is not None else -1)) + 1
    chunk_id = f"{agent_id}-{next_idx:04d}"
    now = dbmod.now()
    conn.execute(
        "INSERT INTO agent_memory_chunks (id, agent_id, tenant, chunk_index, content, created_at, updated_at) "
        "VALUES (?,?,?,?,?,?,?)",
        (chunk_id, agent_id, tenant, next_idx, content[:500_000], now, now),
    )
    conn.commit()
    return {"chunk_id": chunk_id, "chunk_index": next_idx, "bytes": len(content)}


def load_agent_memory(conn: Any, agent_id: str, *, limit: int = 50) -> list[dict]:
    ensure_memory_table(conn)
    rows = conn.execute(
        "SELECT chunk_index, content, updated_at FROM agent_memory_chunks "
        "WHERE agent_id=? ORDER BY chunk_index DESC LIMIT ?",
        (agent_id, max(1, min(limit, 200))),
    ).fetchall()
    return [dict(r) for r in reversed(rows)]


def export_agent_memory(conn: Any, agent_id: str) -> str:
    chunks = load_agent_memory(conn, agent_id, limit=500)
    return json.dumps(chunks, ensure_ascii=False)