"""Phase 7 deep: fleet health, tagged memory, live activity enrichment."""
from __future__ import annotations

import time

from fastapi.testclient import TestClient

from ai_bridge.control.agent_memory import append_memory_chunk, query_agent_memory
from ai_bridge.control.app import create_app
from ai_bridge.control import metrics as metricsmod


def test_agent_memory_query_by_project_task(tmp_path):
    app = create_app(admin_token="adm-p7", db_path=tmp_path / "mem7.db")
    conn = app.state.conn
    append_memory_chunk(conn, "agent-1", "alpha", project_tag="proj-a", task_tag="task-1")
    append_memory_chunk(conn, "agent-1", "beta", project_tag="proj-a", task_tag="task-2")
    append_memory_chunk(conn, "agent-1", "gamma", project_tag="proj-b")
    scoped = query_agent_memory(conn, "agent-1", project_tag="proj-a", task_tag="task-1")
    assert len(scoped) == 1
    assert "alpha" in scoped[0]["content"]


def test_fleet_health_and_live_activity(tmp_path):
    admin = "adm-p7-live"
    app = create_app(admin_token=admin, db_path=tmp_path / "live7.db")
    client = TestClient(app)
    headers = {"X-Admin-Token": admin}
    reg = client.post(
        "/api/devices/enroll",
        json={"name": "node", "os": "Linux"},
        headers=headers,
    ).json()
    dev_id = reg["device_id"]
    now = time.time()
    app.state.conn.execute(
        "UPDATE devices SET status='online', last_seen=? WHERE id=?",
        (now, dev_id),
    )
    app.state.conn.execute(
        "INSERT INTO telemetry (device_id, tenant, cpu_percent, memory_percent, disk_percent, recorded_at) "
        "VALUES (?, 'default', 12.5, 44.0, 20.0, ?)",
        (dev_id, now),
    )
    app.state.conn.execute(
        "INSERT INTO tasks (id, device_id, tenant, tool, args_json, tier, status, created_at, updated_at) "
        "VALUES ('t-run', ?, 'default', 'agent_delegate', ?, 2, 'running', ?, ?)",
        (dev_id, '{"_role": "developer", "_project": "p1"}', now, now),
    )
    app.state.conn.execute(
        "INSERT INTO tasks (id, device_id, tenant, tool, args_json, tier, status, result, created_at, updated_at) "
        "VALUES ('t-fail', ?, 'default', 'browser_navigate', '{}', 2, 'failed', 'timeout', ?, ?)",
        (dev_id, now, now),
    )
    app.state.conn.commit()

    health = client.get("/api/fleet/health", headers=headers).json()
    assert health["online_devices"] >= 1
    assert health["avg_cpu_percent"] == 12.5

    live = client.get("/api/activity/live", headers=headers).json()
    assert any(i.get("role") == "developer" for i in live["items"])
    assert len(live["recent_failures"]) >= 1
    assert "running_agents" in live


def test_metrics_exposes_phase_depth_gauge(tmp_path):
    app = create_app(admin_token="adm-met", db_path=tmp_path / "met7.db")
    client = TestClient(app)
    _ = client.get("/metrics").text
    payload, _ = metricsmod.get_metrics_payload(app.state.conn)
    text = payload.decode("utf-8", errors="replace")
    if metricsmod._PROMETHEUS_AVAILABLE:
        assert "aibridge_advanced_phase_depth" in text
        assert 'phase="7"' in text
        assert "aibridge_stale_heartbeat_devices" in text
    else:
        assert "aibridge_uptime_seconds" in text