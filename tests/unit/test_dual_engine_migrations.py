"""Unit tests for Dual-Engine Database & Native Migrations Runner."""
import sqlite3
import time
from pathlib import Path

import pytest

from ai_bridge.control import db as dbmod
from ai_bridge.control import migrations


def test_to_pg_sql_translation():
    assert dbmod.to_pg_sql("SELECT * FROM devices WHERE id=?") == "SELECT * FROM devices WHERE id=%s"
    assert dbmod.to_pg_sql("INSERT INTO audit (a, b) VALUES (?, ?)") == "INSERT INTO audit (a, b) VALUES (%s, %s)"
    # String literal with ? should be preserved
    assert dbmod.to_pg_sql("SELECT 'question?' AS q, id FROM t WHERE id=?") == "SELECT 'question?' AS q, id FROM t WHERE id=%s"
    # LIKE wildcards and other literal % must be escaped for psycopg pyformat
    assert (
        dbmod.to_pg_sql("SELECT key FROM settings WHERE key LIKE 'plane.human_takeover.%'")
        == "SELECT key FROM settings WHERE key LIKE 'plane.human_takeover.%%'"
    )
    assert (
        dbmod.to_pg_sql("SELECT id FROM custom_agents WHERE id LIKE 'agent-role-%' AND tenant=?")
        == "SELECT id FROM custom_agents WHERE id LIKE 'agent-role-%%' AND tenant=%s"
    )


def test_row_dict_access():
    rd = dbmod.RowDict({"id": "d-123", "name": "srv-prod"}, ["id", "name"])
    # By name
    assert rd["id"] == "d-123"
    assert rd["name"] == "srv-prod"
    # By index
    assert rd[0] == "d-123"
    assert rd[1] == "srv-prod"


def test_migration_runner_lifecycle(tmp_path: Path):
    db_file = tmp_path / "test_mig.db"
    conn = dbmod.connect(db_path=db_file)

    # Verify schema_migrations table exists and has recorded migrations
    rows = conn.execute("SELECT version, name FROM schema_migrations ORDER BY version ASC").fetchall()
    applied_versions = [r["version"] for r in rows]

    assert "001" in applied_versions
    assert "002" in applied_versions
    assert "003" in applied_versions

    # Calling run_migrations again should be a no-op
    newly_applied = migrations.run_migrations(conn, dialect="sqlite")
    assert newly_applied == []

    conn.close()

