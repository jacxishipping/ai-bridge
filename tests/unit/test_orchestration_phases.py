"""Roadmap Phase 2–8 core regression (orchestration / browser / plane state).

Phase → primary test files (avoid renaming older milestone suites):
  Phase 2 orchestration → this file + cancel/sweeper/lease cases
  Phase 3 desktop → test_phase3_desktop_autonomy.py
  Phase 4–6 browser/dev/supervisor → test_phases_456_deep.py (+ v1 WebRTC in test_phase4_streaming_and_updater.py)
  Phase 7 memory/health → test_phase7_deep.py
  Phase 8 security → test_phase8_deep.py
  Phase 9 hardening → test_phase9_deep.py
  Windows P0–P2 gaps → test_windows_p0_p2_gaps.py
"""
from __future__ import annotations

import json
import time
from pathlib import Path
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from ai_bridge.control.app import create_app
from ai_bridge.control import dispatch, orchestration, plane_state, role_catalog, task_runtime
from ai_bridge.control.agent_memory import append_memory_chunk, load_agent_memory
from ai_bridge.policy import Policy


def _open_policy() -> Policy:
    return Policy(
        allow_writes=True,
        allow_tier3=True,
        desktop_enabled=True,
        max_tier_unattended=4,
        unrestricted=True,
    )


def test_webrtc_task_dispatch_passes_monitor_and_bitrate():
    seen: dict = {}

    def fake_start(session_id, signaling, scale=1.0, fps=30, monitor_index=None, bitrate_kbps=4500):
        seen.update(
            {
                "session_id": session_id,
                "scale": scale,
                "fps": fps,
                "monitor_index": monitor_index,
                "bitrate_kbps": bitrate_kbps,
            }
        )
        return {"ok": True}

    with patch.object(dispatch.webrtc_stream, "_AGENT_CONTEXT", {"control_url": "http://x", "device_token": "t"}):
        with patch.object(dispatch.webrtc_stream, "HttpSignaling", lambda *a, **k: object()):
            with patch.object(dispatch.webrtc_stream, "start_stream", fake_start):
                dispatch.dispatch(
                    "start_webrtc_stream",
                    {
                        "session_id": "s1",
                        "scale": 0.5,
                        "fps": 24,
                        "monitor_index": 2,
                        "bitrate_kbps": 6000,
                    },
                    policy=_open_policy(),
                    approval_granted=True,
                )
    assert seen["monitor_index"] == 2
    assert seen["bitrate_kbps"] == 6000
    assert seen["fps"] == 24


def test_dispatch_registers_browser_navigate():
    with patch.object(dispatch.browser_tools, "browser_navigate", return_value={"ok": True}) as nav:
        out = dispatch.dispatch(
            "browser_navigate",
            {"url": "https://example.com"},
            policy=_open_policy(),
            approval_granted=True,
        )
        assert out["ok"] is True
        nav.assert_called_once()


def test_stale_running_task_sweeper_requeues(tmp_path):
    admin_token = "adm-orch"
    app = create_app(admin_token=admin_token, db_path=tmp_path / "orch.db")
    conn = app.state.conn
    dev_id = "dev-1"
    now = time.time()
    conn.execute(
        "INSERT INTO devices (id, name, hostname, os, token_hash, created_at, status, last_seen) "
        "VALUES (?, ?, ?, ?, ?, ?, 'online', ?)",
        (dev_id, "n", "h", "Linux", "x", now, now),
    )
    conn.execute(
        "INSERT INTO tasks (id, device_id, tenant, tool, args_json, tier, status, created_at, updated_at) "
        "VALUES (?, ?, 'default', 'get_system_info', '{}', 1, 'running', ?, ?)",
        ("stale1", dev_id, now - 5000, now - 5000),
    )
    conn.commit()
    stats = orchestration.sweep_stale_running_tasks(conn, lease_sec=60)
    row = conn.execute("SELECT status FROM tasks WHERE id='stale1'").fetchone()
    assert stats["requeued"] + stats["timed_out"] >= 1
    assert row["status"] in {"queued", "timed_out"}


def test_emergency_stop_durable_across_app_state(tmp_path):
    admin_token = "adm-stop"
    app = create_app(admin_token=admin_token, db_path=tmp_path / "stop.db")
    client = TestClient(app)
    assert client.get("/health").json()["emergency_stop"] is False
    client.post("/api/emergency-stop", headers={"X-Admin-Token": admin_token})
    assert plane_state.load_emergency_stop(app.state.conn) is True
    app2 = create_app(admin_token=admin_token, db_path=tmp_path / "stop.db")
    assert app2.state.emergency_stop is True


def test_execution_state_reflects_cancel(tmp_path):
    admin_token = "adm-exec"
    app = create_app(admin_token=admin_token, db_path=tmp_path / "exec.db")
    client = TestClient(app)
    reg = client.post(
        "/api/devices/enroll",
        json={"name": "node", "os": "Linux"},
        headers={"X-Admin-Token": admin_token},
    ).json()
    dev_tok = reg["device_token"]
    dev_id = reg["device_id"]
    now = time.time()
    app.state.conn.execute(
        "INSERT INTO tasks (id, device_id, tenant, tool, args_json, tier, status, created_at, updated_at) "
        "VALUES ('t-cancel', ?, 'default', 'get_system_info', '{}', 1, 'running', ?, ?)",
        (dev_id, now, now),
    )
    app.state.conn.commit()
    client.post("/api/tasks/t-cancel/cancel", headers={"X-Admin-Token": admin_token})
    st = client.get("/api/agent/tasks/t-cancel/execution-state", headers={"X-Device-Token": dev_tok}).json()
    assert st["status"] == "cancelled"


def test_task_runtime_cancel_interrupts_dispatch():
    task_runtime.set_execution_context("tid", lambda: True)
    with pytest.raises(task_runtime.TaskCancelled):
        dispatch.dispatch("get_system_info", {}, policy=_open_policy())
    task_runtime.clear_execution_context()


def test_role_catalog_seed_idempotent(tmp_path):
    app = create_app(admin_token="adm-role", db_path=tmp_path / "roles.db")
    conn = app.state.conn
    n1 = role_catalog.seed_role_catalog(conn)
    n2 = role_catalog.seed_role_catalog(conn)
    assert n2 == 0
    rows = conn.execute("SELECT COUNT(*) AS c FROM custom_agents WHERE id LIKE 'agent-role-%'").fetchone()
    assert rows["c"] >= len(role_catalog.ROLES)


def test_agent_memory_chunks(tmp_path):
    app = create_app(admin_token="adm-mem", db_path=tmp_path / "mem.db")
    conn = app.state.conn
    append_memory_chunk(conn, "agent-1", "fact a")
    append_memory_chunk(conn, "agent-1", "fact b" * 100)
    chunks = load_agent_memory(conn, "agent-1")
    assert len(chunks) == 2


def test_per_device_concurrency_lease_blocks_second_task(tmp_path):
    admin_token = "adm-lease"
    app = create_app(admin_token=admin_token, db_path=tmp_path / "lease.db")
    client = TestClient(app)
    reg = client.post(
        "/api/devices/enroll",
        json={"name": "node", "os": "Linux"},
        headers={"X-Admin-Token": admin_token},
    ).json()
    dev_tok = reg["device_token"]
    dev_id = reg["device_id"]
    now = time.time()
    app.state.conn.execute(
        "INSERT INTO tasks (id, device_id, tenant, tool, args_json, tier, status, created_at, updated_at) "
        "VALUES ('run1', ?, 'default', 'get_system_info', '{}', 1, 'running', ?, ?)",
        (dev_id, now, now),
    )
    app.state.conn.execute(
        "INSERT INTO tasks (id, device_id, tenant, tool, args_json, tier, status, created_at, updated_at) "
        "VALUES ('q2', ?, 'default', 'get_system_info', '{}', 1, 'queued', ?, ?)",
        (dev_id, now, now),
    )
    app.state.conn.commit()
    nxt = client.get("/api/agent/tasks/next?wait=0", headers={"X-Device-Token": dev_tok}).json()
    assert nxt.get("task") is None


def test_turn_secret_required_in_prod_profile(monkeypatch):
    from ai_bridge import webrtc_stream

    monkeypatch.delenv("AI_BRIDGE_TURN_SECRET", raising=False)
    monkeypatch.setenv("AI_BRIDGE_PROFILE", "production")
    with pytest.raises(RuntimeError, match="AI_BRIDGE_TURN_SECRET"):
        webrtc_stream.generate_ephemeral_turn_credentials()


def test_orchestration_load_smoke(tmp_path):
    """Light poll latency smoke: enqueue + next_task should stay sub-second locally."""
    admin_token = "adm-load"
    app = create_app(admin_token=admin_token, db_path=tmp_path / "load.db")
    client = TestClient(app)
    reg = client.post(
        "/api/devices/enroll",
        json={"name": "node", "os": "Linux"},
        headers={"X-Admin-Token": admin_token},
    ).json()
    dev_tok = reg["device_token"]
    client.post(
        "/api/tasks",
        json={"device_id": reg["device_id"], "tool": "get_system_info", "args": {}},
        headers={"X-Admin-Token": admin_token},
    )
    t0 = time.perf_counter()
    nxt = client.get("/api/agent/tasks/next?wait=0", headers={"X-Device-Token": dev_tok})
    elapsed = time.perf_counter() - t0
    assert nxt.status_code == 200
    assert nxt.json().get("task") is not None
    assert elapsed < 1.0