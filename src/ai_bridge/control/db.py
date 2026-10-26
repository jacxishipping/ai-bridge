"""SQLite storage for the control plane (dev / small deployments).

Production deployments should use PostgreSQL with the same table shapes;
see migrations/001_initial.sql and migrations/002_security_batch.sql,
which mirror this schema. SQLite is chosen here so the plane runs with
zero external services for testing and single-owner use.

v0.3 additions: device token expiry, local users/sessions (roles),
versioned policies. Existing databases are migrated in connect().
"""
from __future__ import annotations

import hashlib
import json
import sqlite3
import threading
import time
from pathlib import Path

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
  status TEXT NOT NULL DEFAULT 'pending', created_at REAL NOT NULL, decided_by TEXT);
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
"""


class LockedConnection:
    """Thread-safe wrapper around sqlite3.Connection for multi-threaded FastAPI routes."""

    def __init__(self, conn: sqlite3.Connection) -> None:
        self._conn = conn
        self._lock = threading.RLock()

    def execute(self, sql: str, parameters: tuple | list = ()):
        with self._lock:
            return self._conn.execute(sql, parameters)

    def executescript(self, sql_script: str):
        with self._lock:
            return self._conn.executescript(sql_script)

    def commit(self) -> None:
        with self._lock:
            self._conn.commit()

    def close(self) -> None:
        with self._lock:
            self._conn.close()

    def __getattr__(self, name: str):
        return getattr(self._conn, name)


def connect(db_path: Path) -> LockedConnection:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    raw = sqlite3.connect(str(db_path), check_same_thread=False, timeout=15.0)
    raw.row_factory = sqlite3.Row
    raw.execute("PRAGMA journal_mode=WAL")
    raw.execute("PRAGMA busy_timeout=5000")
    raw.executescript(SCHEMA)
    # Migrate databases created by v0.2 (which lacked these columns).
    cols = {r[1] for r in raw.execute("PRAGMA table_info(devices)")}
    for col, ddl in [("token_expires_at", "REAL"), ("token_issued_at", "REAL")]:
        if col not in cols:
            raw.execute(f"ALTER TABLE devices ADD COLUMN {col} {ddl}")
    raw.commit()
    return LockedConnection(raw)

def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()

def now() -> float:
    return time.time()

def audit(conn: LockedConnection | sqlite3.Connection, *, tenant: str, actor: str, device_id: str,
          tool: str, args: dict, decision: str, result: str = "") -> None:
    conn.execute("INSERT INTO audit (ts, tenant, actor, device_id, tool, args_json, decision, result)"
                 " VALUES (?,?,?,?,?,?,?,?)",
                 (now(), tenant, actor, device_id, tool, json.dumps(args, default=str), decision, result[:2000]))
    conn.commit()
