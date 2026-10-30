"""Lightweight, zero-dependency database migration runner for AI Bridge.

Tracks applied migrations in the `schema_migrations` table and applies
pending versioned migrations in chronological order. Compatible with both
SQLite and PostgreSQL engines.
"""
from __future__ import annotations

import logging
import os
import re
import time
from pathlib import Path
from typing import Any

logger = logging.getLogger("ai_bridge.migrations")

MIGRATIONS_DIR = Path(__file__).resolve().parent.parent.parent.parent / "migrations"


def ensure_migrations_table(conn: Any, dialect: str = "sqlite") -> None:
    """Ensure the schema_migrations tracking table exists."""
    if dialect == "sqlite":
        conn.execute("""
            CREATE TABLE IF NOT EXISTS schema_migrations (
                version TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                applied_at REAL NOT NULL
            );
        """)
    else:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS schema_migrations (
                version TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                applied_at DOUBLE PRECISION NOT NULL
            );
        """)
    conn.commit()


def get_applied_versions(conn: Any) -> set[str]:
    """Retrieve all previously applied migration version identifiers."""
    rows = conn.execute("SELECT version FROM schema_migrations ORDER BY version ASC").fetchall()
    return {r["version"] if isinstance(r, dict) or hasattr(r, "keys") else r[0] for r in rows}


def _sqlite_has_column(conn: Any, table: str, col: str) -> bool:
    """Check if a table in SQLite already has the specified column."""
    try:
        rows = conn.execute(f"PRAGMA table_info({table})").fetchall()
        cols = {r["name"] if hasattr(r, "keys") else r[1] for r in rows}
        return col.lower() in {c.lower() for c in cols}
    except Exception:
        return False


def _adapt_and_execute_statement(conn: Any, stmt: str, dialect: str) -> None:
    """Execute a single SQL statement with dialect-specific adaptations."""
    stmt = stmt.strip()
    if not stmt:
        return

    if dialect == "sqlite":
        # Check for ALTER TABLE <table> ADD COLUMN [IF NOT EXISTS] <col>
        alter_match = re.search(r"ALTER\s+TABLE\s+(\w+)\s+ADD\s+COLUMN(?:\s+IF\s+NOT\s+EXISTS)?\s+(\w+)", stmt, re.IGNORECASE)
        if alter_match:
            table_name = alter_match.group(1)
            col_name = alter_match.group(2)
            if _sqlite_has_column(conn, table_name, col_name):
                logger.debug("Column %s.%s already exists, skipping ADD COLUMN", table_name, col_name)
                return
            # Remove IF NOT EXISTS for SQLite syntax
            stmt = re.sub(r"\bADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\b", "ADD COLUMN", stmt, flags=re.IGNORECASE)

        # Type adaptations
        stmt = re.sub(r"\bSERIAL\s+PRIMARY\s+KEY\b", "INTEGER PRIMARY KEY AUTOINCREMENT", stmt, flags=re.IGNORECASE)
        stmt = re.sub(r"\bDOUBLE\s+PRECISION\b", "REAL", stmt, flags=re.IGNORECASE)

    elif dialect in ("postgres", "postgresql"):
        stmt = re.sub(r"\bINTEGER\s+PRIMARY\s+KEY\s+AUTOINCREMENT\b", "SERIAL PRIMARY KEY", stmt, flags=re.IGNORECASE)
        stmt = re.sub(r"\bREAL\b", "DOUBLE PRECISION", stmt, flags=re.IGNORECASE)

    conn.execute(stmt)


def run_migrations(conn: Any, dialect: str = "sqlite", migrations_dir: Path | None = None) -> list[str]:
    """Discover and apply all unapplied migration files in chronological order."""
    mdir = migrations_dir or MIGRATIONS_DIR
    if not mdir.exists():
        logger.debug("No migrations directory found at %s", mdir)
        return []

    ensure_migrations_table(conn, dialect)
    applied = get_applied_versions(conn)

    sql_files = sorted([f for f in mdir.glob("*.sql") if re.match(r"^\d+_", f.name)])
    newly_applied: list[str] = []

    for fpath in sql_files:
        version = fpath.stem.split("_")[0]
        if version in applied:
            continue

        raw_sql = fpath.read_text(encoding="utf-8")
        logger.info("Applying database migration [%s] %s ...", version, fpath.name)

        try:
            # Parse statements by semicolon (ignoring comments)
            statements = []
            for raw_line in raw_sql.splitlines():
                line = raw_line.strip()
                if line.startswith("--"):
                    continue
                statements.append(raw_line)
            clean_sql = "\n".join(statements)

            for stmt in clean_sql.split(";"):
                _adapt_and_execute_statement(conn, stmt, dialect)

            # Record migration in tracking table
            now_ts = time.time()
            if dialect == "sqlite":
                conn.execute(
                    "INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)",
                    (version, fpath.name, now_ts),
                )
            else:
                conn.execute(
                    "INSERT INTO schema_migrations (version, name, applied_at) VALUES (%s, %s, %s)",
                    (version, fpath.name, now_ts),
                )
            conn.commit()
            newly_applied.append(version)
            logger.info("Successfully applied migration [%s].", version)
        except Exception as exc:
            logger.error("Failed to apply migration [%s] %s: %s", version, fpath.name, exc)
            if hasattr(conn, "rollback"):
                try:
                    conn.rollback()
                except Exception:
                    pass
            raise

    return newly_applied
