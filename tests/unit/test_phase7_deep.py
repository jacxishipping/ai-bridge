"""Phase 7 deep: fleet health, tagged memory, live activity enrichment, metrics, events."""
from __future__ import annotations

import json
import time

from fastapi.testclient import TestClient

from ai_bridge.control.agent_memory import (
    append_memory_chunk,
    clear_agent_memory,
    format_chunks_for_prompt,
    query_agent_memory,
)
from ai_bridge.control.app import create_app
from ai_bridge.control import metrics as metricsmod
from ai_bridge.control import task_events
from ai_bridge.control.custom_agents import _system_prompt


def test_agent_memory_query_by_project_task(tmp_path):
    app = create_app(admin_token="adm-p7", db_path=tmp_path / "mem7.db")
    conn = app.state.conn
    append_memory_chunk(conn, "agent-1", "alpha", project_tag="proj-a", task_tag="task-1")
    append_memory_chunk(conn, "agent-1", "beta", project_tag="proj-a", task_tag="task-2")
    append_memory_chunk(conn, "agent-1", "gamma", project_tag="proj-b")
    scoped = query_agent_memory(conn, "agent-1", project_tag="proj-a", task_tag="task-1")
    assert len(scoped) == 1
    assert "alpha" in scoped[0]["content"]


def test_memory_chunks_in_prompt_and_clear(tmp_path):
    app = create_app(admin_token="adm-p7-prompt", db_path=tmp_path / "prompt7.db")
    conn = app.state.conn
    append_memory_chunk(conn, "agent-x", "remember the API key lives in vault", project_tag="ship", task_tag="t1")
    prompt = _system_prompt(
        {"id": "agent-x", "name": "Tester", "instruction": "Do work", "memory": "legacy note"},
        [],
        conn=conn,
        project_tag="ship",
        task_tag="t1",
    )
    assert "Durable memory chunks" in prompt
    assert "vault" in prompt
    assert "legacy note" in prompt
    cleared = clear_agent_memory(conn, "agent-x", project_tag="ship")
    assert cleared["deleted"] >= 1
    assert query_agent_memory(conn, "agent-x", project_tag="ship") == []
    assert "project=ship" in format_chunks_for_prompt(
        [{"content": "x", "project_tag": "ship", "task_tag": None}]
    )


def test_memory_chunk_rest_api(tmp_path):
    admin = "adm-p7-memapi"
    app = create_app(admin_token=admin, db_path=tmp_path / "memapi7.db")
    client = TestClient(app)
    headers = {"X-Admin-Token": admin}
    # Use seeded role agent (create_custom_agent validates provider credentials).
    agent_id = "agent-role-planner"
    row = app.state.conn.execute("SELECT id FROM custom_agents WHERE id=?", (agent_id,)).fetchone()
    assert row is not None
    post = client.post(
        f"/api/agents/{agent_id}/memory/chunks",
        json={"content": "proj fact", "project": "p7", "task": "t9"},
        headers=headers,
    )
    assert post.status_code == 200
    listed = client.get(f"/api/agents/{agent_id}/memory/chunks?project=p7", headers=headers)
    assert listed.status_code == 200
    assert any("proj fact" in (c.get("content") or "") for c in listed.json()["chunks"])
    cleared = client.delete(f"/api/agents/{agent_id}/memory/chunks?project=p7", headers=headers)
    assert cleared.status_code == 200
    assert cleared.json()["deleted"] >= 1


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
    assert "stale_devices" in health
    assert "unhealthy_streams" in health

    live = client.get("/api/activity/live", headers=headers).json()
    assert any(i.get("role") == "developer" for i in live["items"])
    assert len(live["recent_failures"]) >= 1
    assert "running_agents" in live
    assert "last_stale_sweep" in live
    assert "handoffs" in live or "role_agents" in live


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


def test_metrics_summary_and_task_events(tmp_path):
    admin = "adm-p7-metsum"
    app = create_app(admin_token=admin, db_path=tmp_path / "metsum7.db")
    client = TestClient(app)
    headers = {"X-Admin-Token": admin}
    reg = client.post("/api/devices/enroll", json={"name": "n", "os": "Linux"}, headers=headers).json()
    dev_id = reg["device_id"]
    now = time.time()
    app.state.conn.execute(
        "INSERT INTO tasks (id, device_id, tenant, tool, args_json, tier, status, created_at, updated_at) "
        "VALUES ('evt1', ?, 'default', 'git_status', '{}', 1, 'queued', ?, ?)",
        (dev_id, now - 2, now - 2),
    )
    app.state.conn.commit()
    task_events.append_task_event(app.state.conn, "evt1", "queued", {"tool": "git_status"})
    task_events.append_task_event(app.state.conn, "evt1", "running", {"device_id": dev_id})
    metricsmod.record_task_execution("git_status", "completed", 1.5)
    metricsmod.record_http_request("GET", "/api/metrics/summary", 200)

    summary = client.get("/api/metrics/summary", headers=headers)
    assert summary.status_code == 200
    body = summary.json()
    assert body["ok"] is True
    assert "queue_depth" in body
    assert "completed_1h" in body

    events = client.get("/api/tasks/evt1/events", headers=headers)
    assert events.status_code == 200
    ev = events.json()["events"]
    assert any(e["event"] == "queued" for e in ev)
    assert any(e["event"] == "running" for e in ev)

    # Simulate device result path for events + metrics
    token = reg["device_token"]
    app.state.conn.execute(
        "UPDATE tasks SET status='running', updated_at=? WHERE id='evt1'",
        (now,),
    )
    app.state.conn.commit()
    res = client.post(
        "/api/agent/tasks/evt1/result",
        json={"status": "completed", "result": json.dumps({"ok": True})},
        headers={"X-Device-Token": token},
    )
    assert res.status_code == 200
    events2 = client.get("/api/tasks/evt1/events", headers=headers).json()["events"]
    assert any(e["event"] == "completed" for e in events2)
