"""Dual-Engine Database Storage (SQLite for dev/edge, PostgreSQL for production clustering).

Supports:
- Zero-dependency local SQLite with WAL mode for dev and single-node setups.
- Production PostgreSQL 16+ with connection management when DATABASE_URL is set.
- Automatic parameter translation (? -> %s) for transparent cross-engine queries.
- Startup schema migrations via migrations.run_migrations().
"""
from __future__ import annotations

import contextlib
import hashlib
import json
import os
import sqlite3
import threading
import time
from pathlib import Path
from typing import Any

from ..security import redact, redact_obj

SCHEMA = """
CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, hostname TEXT, os TEXT,
  tenant TEXT NOT NULL DEFAULT 'default', token_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'offline', last_seen REAL,
  policy_json TEXT NOT NULL DEFAULT '{}', revoked INTEGER NOT NULL DEFAULT 0,
  created_at REAL NOT NULL, token_expires_at REAL, token_issued_at REAL);
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY, device_id TEXT NOT NULL, tenant TEXT NOT NULL DEFAULT 'default',
  tool TEXT NOT NULL, args_json TEXT NOT NULL DEFAULT '{}', tier INTEGER,
  status TEXT NOT NULL DEFAULT 'queued', result TEXT DEFAULT '',
  approval_id TEXT, created_at REAL NOT NULL, updated_at REAL NOT NULL);
CREATE TABLE IF NOT EXISTS approvals (
  id TEXT PRIMARY KEY, task_id TEXT, tool TEXT, reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending', created_at REAL NOT NULL, decided_by TEXT,
  expires_at REAL, decided_at REAL, policy_version INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT, ts REAL NOT NULL, tenant TEXT,
  actor TEXT, device_id TEXT, tool TEXT, args_json TEXT, decision TEXT, result TEXT);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL,
  salt TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'viewer',
  created_at REAL NOT NULL, disabled INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY, username TEXT NOT NULL, role TEXT NOT NULL,
  expires_at REAL NOT NULL, created_at REAL NOT NULL);
CREATE TABLE IF NOT EXISTS policies (
  id INTEGER PRIMARY KEY AUTOINCREMENT, version INTEGER NOT NULL,
  policy_json TEXT NOT NULL, created_by TEXT, created_at REAL NOT NULL, note TEXT);
CREATE TABLE IF NOT EXISTS workflows (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, tenant TEXT NOT NULL DEFAULT 'default',
  device_id TEXT, steps_json TEXT NOT NULL DEFAULT '[]', status TEXT NOT NULL DEFAULT 'pending',
  current_step INTEGER NOT NULL DEFAULT 0, total_steps INTEGER NOT NULL DEFAULT 0,
  results_json TEXT NOT NULL DEFAULT '[]', error TEXT DEFAULT '',
  created_at REAL NOT NULL, updated_at REAL NOT NULL, completed_at REAL);
CREATE TABLE IF NOT EXISTS telemetry (
  id INTEGER PRIMARY KEY AUTOINCREMENT, device_id TEXT NOT NULL,
  tenant TEXT NOT NULL DEFAULT 'default', cpu_percent REAL,
  memory_percent REAL, disk_percent REAL, recorded_at REAL NOT NULL);
CREATE TABLE IF NOT EXISTS triggers (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, tenant TEXT NOT NULL DEFAULT 'default',
  device_id TEXT, metric TEXT NOT NULL, operator TEXT NOT NULL DEFAULT '>',
  threshold REAL NOT NULL, action_type TEXT NOT NULL DEFAULT 'tool',
  action_target TEXT NOT NULL, action_args_json TEXT NOT NULL DEFAULT '{}',
  cooldown_seconds INTEGER NOT NULL DEFAULT 300, last_triggered_at REAL,
  enabled INTEGER NOT NULL DEFAULT 1, created_at REAL NOT NULL);
CREATE TABLE IF NOT EXISTS schedules (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, tenant TEXT NOT NULL DEFAULT 'default',
  device_id TEXT, interval_seconds INTEGER NOT NULL DEFAULT 300,
  tool TEXT NOT NULL, args_json TEXT NOT NULL DEFAULT '{}',
  last_run_at REAL, next_run_at REAL NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1, created_at REAL NOT NULL);
CREATE INDEX IF NOT EXISTS idx_devices_token_hash ON devices(token_hash);
CREATE INDEX IF NOT EXISTS idx_tasks_device_status ON tasks(device_id, status);
CREATE INDEX IF NOT EXISTS idx_approvals_task_id ON approvals(task_id);
CREATE INDEX IF NOT EXISTS idx_audit_tenant_ts ON audit(tenant, ts DESC);
CREATE INDEX IF NOT EXISTS idx_workflows_status ON workflows(status);
CREATE INDEX IF NOT EXISTS idx_workflows_tenant_ts ON workflows(tenant, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_telemetry_device_time ON telemetry(device_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_triggers_tenant ON triggers(tenant, enabled);
CREATE INDEX IF NOT EXISTS idx_schedules_next_run ON schedules(enabled, next_run_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_policies_version ON policies(version);
"""


def to_pg_sql(sql: str) -> str:
    """Translate SQLite '?' parameter placeholders to PostgreSQL '%s' placeholders."""
    parts = []
    in_single = False
    in_double = False
    i = 0
    n = len(sql)
    while i < n:
        ch = sql[i]
        if ch == "'" and not in_double:
            in_single = not in_single
            parts.append(ch)
        elif ch == '"' and not in_single:
            in_double = not in_double
            parts.append(ch)
        elif ch == '?' and not in_single and not in_double:
            parts.append('%s')
        else:
            parts.append(ch)
        i += 1
    return "".join(parts)


class RowDict(dict):
    """Dictionary supporting both column-name (row['id']) and integer (row[0]) access."""

    def __init__(self, data: dict, keys: list[str]) -> None:
        super().__init__(data)
        self._keys = keys

    def __getitem__(self, item: Any) -> Any:
        if isinstance(item, int):
            return super().__getitem__(self._keys[item])
        return super().__getitem__(item)


class _LockedResult:
    """Materialized query result so no raw database cursor is read outside lock."""

    def __init__(self, rows: list[Any], rowcount: int, lastrowid: int | None) -> None:
        self._rows = rows
        self.rowcount = rowcount
        self.lastrowid = lastrowid

    def fetchone(self) -> Any | None:
        return self._rows[0] if self._rows else None

    def fetchall(self) -> list[Any]:
        return list(self._rows)

    def __iter__(self):
        return iter(self._rows)


class LockedConnection:
    """Thread-safe wrapper around sqlite3.Connection for multi-threaded FastAPI routes."""

    def __init__(self, conn: sqlite3.Connection) -> None:
        self._conn = conn
        self._lock = threading.RLock()
        self.dialect = "sqlite"

    @contextlib.contextmanager
    def transaction(self):
        with self._lock:
            try:
                yield self
                self._conn.commit()
            except Exception:
                self._conn.rollback()
                raise

    def execute(self, sql: str, parameters: tuple | list = ()) -> _LockedResult:
        with self._lock:
            cur = self._conn.execute(sql, parameters)
            rows = cur.fetchall()
            return _LockedResult(rows, cur.rowcount, cur.lastrowid)

    def executescript(self, sql_script: str):
        with self._lock:
            return self._conn.executescript(sql_script)

    def commit(self) -> None:
        with self._lock:
            self._conn.commit()

    def rollback(self) -> None:
        with self._lock:
            self._conn.rollback()

    def close(self) -> None:
        with self._lock:
            self._conn.close()

    def __getattr__(self, name: str):
        return getattr(self._conn, name)


class PostgresConnection:
    """Thread-safe connection wrapper for PostgreSQL using psycopg."""

    def __init__(self, dsn: str):
        import psycopg
        self.dsn = dsn
        self._conn = psycopg.connect(dsn, autocommit=False)
        self._lock = threading.RLock()
        self.dialect = "postgres"

    @contextlib.contextmanager
    def transaction(self):
        with self._lock:
            try:
                yield self
                self._conn.commit()
            except Exception:
                self._conn.rollback()
                raise

    def execute(self, sql: str, parameters: tuple | list = ()) -> _LockedResult:
        with self._lock:
            pg_sql = to_pg_sql(sql)
            cur = self._conn.cursor()
            cur.execute(pg_sql, parameters)
            if cur.description:
                cols = [desc[0] for desc in cur.description]
                raw_rows = cur.fetchall()
                rows = [RowDict(dict(zip(cols, r)), cols) for r in raw_rows]
            else:
                rows = []
            return _LockedResult(rows, cur.rowcount, getattr(cur, "lastrowid", None))

    def executescript(self, sql_script: str):
        with self._lock:
            cur = self._conn.cursor()
            for stmt in sql_script.split(";"):
                s = stmt.strip()
                if s:
                    cur.execute(s)
            self._conn.commit()

    def commit(self) -> None:
        with self._lock:
            self._conn.commit()

    def rollback(self) -> None:
        with self._lock:
            self._conn.rollback()

    def close(self) -> None:
        with self._lock:
            self._conn.close()


def connect(db_path: Path | None = None, database_url: str | None = None) -> LockedConnection | PostgresConnection:
    """Connect to the database, auto-detecting PostgreSQL vs SQLite, and run migrations."""
    db_url = database_url or os.environ.get("DATABASE_URL")

    # 1. PostgreSQL Path
    if db_url and (db_url.startswith("postgres://") or db_url.startswith("postgresql://")):
        conn = PostgresConnection(db_url)
        from . import migrations
        migrations.run_migrations(conn, dialect="postgres")
        return conn

    # 2. SQLite Path
    if db_path is None:
        data_dir = Path(os.environ.get("AI_BRIDGE_DATA_DIR", str(Path.home() / ".ai-bridge")))
        db_path = data_dir / "control.db"

    if isinstance(db_path, str):
        db_path = Path(db_path)

    db_path.parent.mkdir(parents=True, exist_ok=True)
    raw = sqlite3.connect(str(db_path), check_same_thread=False, timeout=15.0)
    raw.row_factory = sqlite3.Row
    raw.execute("PRAGMA journal_mode=WAL")
    raw.execute("PRAGMA busy_timeout=5000")
    raw.executescript(SCHEMA)

    locked_conn = LockedConnection(raw)
    from . import migrations
    migrations.run_migrations(locked_conn, dialect="sqlite")
    return locked_conn


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def now() -> float:
    return time.time()


def audit(conn: Any, *, tenant: str, actor: str, device_id: str,
          tool: str, args: dict, decision: str, result: str = "") -> None:
    safe_args = redact_obj(json.loads(json.dumps(args or {}, default=str)))
    safe_result = redact(result or "")[:2000]
    conn.execute("INSERT INTO audit (ts, tenant, actor, device_id, tool, args_json, decision, result)"
                 " VALUES (?,?,?,?,?,?,?,?)",
                 (now(), tenant, actor, device_id, tool, json.dumps(safe_args, default=str), decision, safe_result))
    conn.commit()
