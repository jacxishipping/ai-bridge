"""Local Offline Task Spooler for AI Bridge Agents.

Guarantees zero-data-loss execution when network connectivity is severed.
If an agent executes a task while disconnected from the Control Plane,
the result is persisted locally in SQLite (agent_spool.db) and automatically
flushed with exponential retry as soon as connectivity is restored.
"""
from __future__ import annotations

import logging
import os
import sqlite3
import threading
import time
from pathlib import Path
from typing import Callable

logger = logging.getLogger("ai_bridge.spool")


class TaskSpooler:
    """Thread-safe persistent task result queue backed by SQLite."""

    def __init__(self, db_path: Path | None = None) -> None:
        if db_path is None:
            if os.name == "nt":
                base_dir = Path(os.environ.get("ProgramData", "C:\\ProgramData")) / "AIBridge"
            else:
                base_dir = Path("/var/lib/ai-bridge") if os.geteuid() == 0 else (Path.home() / ".ai-bridge")
            db_path = base_dir / "agent_spool.db"

        self.db_path = Path(db_path)
        self._lock = threading.Lock()
        self._init_db()

    def _init_db(self) -> None:
        """Initialize the local spool table."""
        try:
            self.db_path.parent.mkdir(parents=True, exist_ok=True)
            with sqlite3.connect(str(self.db_path), timeout=10.0) as conn:
                conn.execute("PRAGMA journal_mode=WAL")
                conn.execute("""
                    CREATE TABLE IF NOT EXISTS spooled_results (
                        task_id TEXT PRIMARY KEY,
                        status TEXT NOT NULL,
                        result TEXT NOT NULL,
                        created_at REAL NOT NULL,
                        attempts INTEGER NOT NULL DEFAULT 0,
                        last_attempt_at REAL NOT NULL DEFAULT 0
                    );
                """)
                conn.commit()
        except Exception as exc:
            logger.warning("Could not initialize local task spool at %s: %s", self.db_path, exc)

    def spool(self, task_id: str, status: str, result: str) -> None:
        """Persist a task result locally to survive network cuts or process restarts."""
        with self._lock:
            try:
                now_ts = time.time()
                with sqlite3.connect(str(self.db_path), timeout=5.0) as conn:
                    conn.execute("""
                        INSERT INTO spooled_results (task_id, status, result, created_at, attempts, last_attempt_at)
                        VALUES (?, ?, ?, ?, 1, ?)
                        ON CONFLICT(task_id) DO UPDATE SET
                            status=excluded.status,
                            result=excluded.result,
                            attempts=spooled_results.attempts + 1,
                            last_attempt_at=excluded.last_attempt_at;
                    """, (task_id, status, result, now_ts, now_ts))
                    conn.commit()
                logger.info("Persisted spooled result for task %s to %s", task_id, self.db_path.name)
            except Exception as exc:
                logger.error("Failed to spool task %s locally: %s", task_id, exc)

    def mark_flushed(self, task_id: str) -> bool:
        """Remove a successfully delivered task result from the spool."""
        with self._lock:
            try:
                with sqlite3.connect(str(self.db_path), timeout=5.0) as conn:
                    cur = conn.execute("DELETE FROM spooled_results WHERE task_id=?", (task_id,))
                    conn.commit()
                    return cur.rowcount > 0
            except Exception as exc:
                logger.warning("Failed to remove task %s from spool: %s", task_id, exc)
                return False

    def get_pending(self, max_items: int = 50) -> list[dict]:
        """Retrieve pending unsent task results."""
        with self._lock:
            try:
                with sqlite3.connect(str(self.db_path), timeout=5.0) as conn:
                    conn.row_factory = sqlite3.Row
                    rows = conn.execute(
                        "SELECT task_id, status, result, created_at, attempts FROM spooled_results ORDER BY created_at ASC LIMIT ?",
                        (max_items,),
                    ).fetchall()
                    return [dict(r) for r in rows]
            except Exception as exc:
                logger.warning("Failed to query spooled tasks: %s", exc)
                return []

    def flush(self, sender_fn: Callable[[str, str, str], bool]) -> int:
        """Attempt to deliver all spooled tasks to the Control Plane.

        sender_fn(task_id, status, result) -> bool
        Returns the count of successfully delivered tasks.
        """
        pending = self.get_pending()
        if not pending:
            return 0

        flushed_count = 0
        for item in pending:
            tid = item["task_id"]
            st = item["status"]
            res = item["result"]
            try:
                ok = sender_fn(tid, st, res)
                if ok:
                    self.mark_flushed(tid)
                    flushed_count += 1
                    logger.info("Successfully flushed spooled task %s to control plane", tid)
                else:
                    break
            except Exception as exc:
                logger.debug("Failed to flush spooled task %s: %s", tid, exc)
                break

        return flushed_count

