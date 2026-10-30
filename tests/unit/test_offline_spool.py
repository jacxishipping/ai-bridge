"""Unit tests for Agent Fleet Offline Spooler (agents/common/spool.py)."""
from pathlib import Path
import pytest

from agents.common.spool import TaskSpooler


def test_spooler_lifecycle(tmp_path: Path):
    db_file = tmp_path / "test_spool.db"
    spooler = TaskSpooler(db_path=db_file)

    # 1. Initially empty
    assert spooler.get_pending() == []

    # 2. Spool 2 results
    spooler.spool("task-001", "completed", '{"output": "success 1"}')
    spooler.spool("task-002", "failed", "Permission denied")

    pending = spooler.get_pending()
    assert len(pending) == 2
    assert pending[0]["task_id"] == "task-001"
    assert pending[1]["task_id"] == "task-002"

    # 3. Flush with simulated network callback
    flushed_ids = []

    def mock_sender(tid, status, result):
        flushed_ids.append(tid)
        return True

    count = spooler.flush(mock_sender)
    assert count == 2
    assert flushed_ids == ["task-001", "task-002"]

    # 4. Spool is now clean
    assert spooler.get_pending() == []


def test_spooler_partial_flush(tmp_path: Path):
    db_file = tmp_path / "test_spool_partial.db"
    spooler = TaskSpooler(db_path=db_file)

    spooler.spool("task-A", "completed", "ok")
    spooler.spool("task-B", "completed", "ok")

    # Sender fails on task-B (e.g. network drops after task-A)
    def fail_on_b(tid, status, result):
        return tid == "task-A"

    count = spooler.flush(fail_on_b)
    assert count == 1

    # task-B remains in spool
    rem = spooler.get_pending()
    assert len(rem) == 1
    assert rem[0]["task_id"] == "task-B"

