"""Regression tests for platform & custom agent enhancements."""
from __future__ import annotations

import json
import time
import uuid

from fastapi.testclient import TestClient

from ai_bridge.control import alerts as alertsmod
from ai_bridge.control import custom_agents
from ai_bridge.control.app import create_app


ADMIN = "test-admin-enhancements"
HEADERS = {"x-admin-token": ADMIN}


def _make_client(tmp_path, monkeypatch):
    monkeypatch.setenv("AI_BRIDGE_BACKUP_DIR", str(tmp_path / "backups"))
    app = create_app(admin_token=ADMIN, db_path=tmp_path / "ctrl.db")
    return TestClient(app), app


def test_workflow_templates_crud_and_retry(tmp_path, monkeypatch):
    client, app = _make_client(tmp_path, monkeypatch)
    with client:
        # 1. Create custom template + list built-in & custom
        tpl_res = client.post(
            "/api/workflows/templates",
            headers=HEADERS,
            json={
                "name": "Disk Check & Cleanup",
                "description": "Checks disk space",
                "steps": [{"tool": "system.info", "args": {}}],
            },
        )
        assert tpl_res.status_code == 200
        tpl = tpl_res.json()
        assert tpl["custom"] is True
        tpl_id = tpl["id"]

        list_res = client.get("/api/workflows/templates", headers=HEADERS)
        assert list_res.status_code == 200
        templates = list_res.json()["templates"]
        assert any(t["id"] == tpl_id for t in templates)
        assert any(not t.get("custom") for t in templates)

        # 2. Seed a failed workflow with 2 steps (step 0 succeeded, step 1 failed) and retry it
        conn = app.state.conn
        wf_id = "wf-retry-1"
        now = time.time()
        steps = [
            {"action": "get_system_info", "args": {}},
            {"action": "list_processes", "args": {}},
        ]
        prev_results = [
            {"step": 0, "action": "get_system_info", "status": "completed", "result": {"ok": True}},
            {"step": 1, "action": "list_processes", "status": "failed", "error": "transient error"},
        ]
        conn.execute(
            "INSERT INTO workflows (id, name, tenant, device_id, steps_json, status, current_step, total_steps, results_json, error, created_at, updated_at) "
            "VALUES (?, ?, 'default', 'local', ?, 'failed', 1, 2, ?, 'transient error', ?, ?)",
            (wf_id, "Retryable Workflow", json.dumps(steps), json.dumps(prev_results), now, now),
        )
        conn.commit()

        retry_res = client.post(
            f"/api/workflows/{wf_id}/retry",
            headers=HEADERS,
            json={"from_failed_step": True},
        )
        assert retry_res.status_code == 200
        assert retry_res.json()["status"] == "running"
        assert retry_res.json()["start_step"] == 2

        # Wait briefly for background worker to finish step 1
        deadline = time.time() + 5.0
        wf_data = None
        while time.time() < deadline:
            r = client.get(f"/api/workflows/{wf_id}", headers=HEADERS)
            wf_data = r.json()
            if wf_data["status"] in ("completed", "failed"):
                break
            time.sleep(0.05)
        assert wf_data is not None
        assert wf_data["status"] == "completed"
        assert len(wf_data["results"]) == 2

        del_res = client.delete(f"/api/workflows/templates/{tpl_id}", headers=HEADERS)
        assert del_res.status_code == 200
        assert del_res.json()["deleted"] is True


def test_workflow_schedule_full_multistep_run_now(tmp_path, monkeypatch):
    client, app = _make_client(tmp_path, monkeypatch)
    with client:
        conn = app.state.conn
        wf_id = "wf-sched-1"
        now = time.time()
        steps = [
            {"action": "get_system_info", "args": {}},
            {"action": "list_processes", "args": {}},
        ]
        conn.execute(
            "INSERT INTO workflows (id, name, tenant, device_id, steps_json, status, current_step, total_steps, results_json, created_at, updated_at) "
            "VALUES (?, ?, 'default', 'local', ?, 'completed', 2, 2, '[]', ?, ?)",
            (wf_id, "Scheduled Multi-Step", json.dumps(steps), now, now),
        )
        conn.commit()

        sched_res = client.post(
            f"/api/workflows/{wf_id}/schedule",
            headers=HEADERS,
            json={"interval_seconds": 60, "name": "Hourly Multi-Step"},
        )
        assert sched_res.status_code == 200
        sched = sched_res.json()
        assert sched["total_steps"] == 2

        run_res = client.post(f"/api/schedules/{sched['schedule_id']}/run-now", headers=HEADERS)
        assert run_res.status_code == 200
        run_data = run_res.json()
        assert run_data["status"] == "executed"
        spawned_wf_id = run_data["workflow_id"]

        deadline = time.time() + 5.0
        wf_state = None
        while time.time() < deadline:
            r = client.get(f"/api/workflows/{spawned_wf_id}", headers=HEADERS)
            if r.status_code == 200:
                wf_state = r.json()
                if wf_state["status"] in ("completed", "failed"):
                    break
            time.sleep(0.05)
        assert wf_state is not None
        assert wf_state["status"] == "completed"
        assert wf_state["total_steps"] == 2
        assert len(wf_state["results"]) == 2


def test_approval_replan_denies_with_feedback_and_cancels_task(tmp_path, monkeypatch):
    client, app = _make_client(tmp_path, monkeypatch)
    with client:
        conn = app.state.conn
        now = time.time()
        task_id = "task-replan-1"
        appr_id = "appr-replan-1"
        conn.execute(
            "INSERT INTO tasks (id, device_id, tenant, tool, args_json, tier, status, created_at, updated_at) "
            "VALUES (?, 'local', 'default', 'shell.run', '{}', 2, 'needs_approval', ?, ?)",
            (task_id, now, now),
        )
        conn.execute(
            "INSERT INTO approvals (id, task_id, tool, reason, status, created_at, expires_at) "
            "VALUES (?, ?, 'shell.run', 'Needs review', 'pending', ?, ?)",
            (appr_id, task_id, now, now + 600),
        )
        conn.commit()

        res = client.post(
            f"/api/approvals/{appr_id}/replan",
            headers=HEADERS,
            json={"reason": "Use read-only command instead"},
        )
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "denied"
        assert data["feedback"] == "Use read-only command instead"

        task_row = conn.execute("SELECT status FROM tasks WHERE id=?", (task_id,)).fetchone()
        assert task_row["status"] == "cancelled"


def test_alerts_config_test_deliveries_and_backups(tmp_path, monkeypatch):
    client, _app = _make_client(tmp_path, monkeypatch)
    monkeypatch.setattr(
        alertsmod,
        "dispatch_alert",
        lambda *a, **kw: {"slack": True, "discord": False},
    )
    with client:
        put_res = client.put(
            "/api/alerts/config",
            headers=HEADERS,
            json={
                "slack_webhook": "https://hooks.slack.com/services/T00/B00/XXX",
                "discord_webhook": "https://discord.com/api/webhooks/123/abc",
                "telegram_token": "",
                "telegram_chat_id": "",
                "generic_webhook": "",
            },
        )
        assert put_res.status_code == 200
        assert put_res.json()["saved"] is True

        get_res = client.get("/api/alerts/config", headers=HEADERS)
        assert get_res.status_code == 200
        assert "hooks.slack.com" in get_res.json()["slack_webhook"]

        test_res = client.post("/api/alerts/test", headers=HEADERS)
        assert test_res.status_code == 200
        assert test_res.json()["results"] == {"slack": True, "discord": False}

        deliv_res = client.get("/api/alerts/deliveries", headers=HEADERS)
        assert deliv_res.status_code == 200
        deliveries = deliv_res.json()
        assert len(deliveries) >= 2
        assert {d["channel"] for d in deliveries[:2]} == {"slack", "discord"}

        # Backups create, list, download
        b_create = client.post("/api/admin/backups", headers=HEADERS)
        assert b_create.status_code == 200
        filename = b_create.json()["filename"]
        assert b_create.json()["size_bytes"] > 0

        b_list = client.get("/api/admin/backups", headers=HEADERS)
        assert b_list.status_code == 200
        assert any(item["filename"] == filename for item in b_list.json()["items"])

        b_dl = client.get(f"/api/admin/backups/{filename}", headers=HEADERS)
        assert b_dl.status_code == 200
        assert len(b_dl.content) > 0


def test_agent_ask_endpoint_and_native_tools(tmp_path, monkeypatch):
    client, app = _make_client(tmp_path, monkeypatch)
    with client:
        # Seed a provider key & device so agent creation validation passes
        app.state.conn.execute(
            "INSERT INTO settings (key, value) VALUES ('ai_openai_key', 'sk-test-123') ON CONFLICT(key) DO UPDATE SET value=excluded.value"
        )
        app.state.conn.execute(
            "INSERT INTO devices (id, name, hostname, os, tenant, token_hash, status, created_at) "
            "VALUES ('dev-test-1', 'TestNode', 'test-node', 'linux', 'default', 'hash123', 'online', ?)",
            (time.time(),),
        )
        app.state.conn.commit()

        # Create primary agent and specialist peer agent
        r1 = client.post(
            "/api/agents",
            headers=HEADERS,
            json={
                "name": "SupervisorAgent",
                "instruction": "Coordinate tasks across devices and peer agents",
                "provider": "openai",
                "device_ids": ["dev-test-1"],
                "enabled": True,
            },
        )
        assert r1.status_code == 200
        supervisor_id = r1.json()["agent"]["id"]

        r2 = client.post(
            "/api/agents",
            headers=HEADERS,
            json={
                "name": "ResearchPeer",
                "instruction": "Research docs using MCP tools",
                "provider": "openai",
                "device_ids": ["dev-test-1"],
                "enabled": True,
            },
        )
        assert r2.status_code == 200
        peer_id = r2.json()["agent"]["id"]

        # 1. Test /api/agents/{id}/ask endpoint
        monkeypatch.setattr(
            custom_agents,
            "execute_agent",
            lambda conn, agent, tool_executor=None, **kw: {
                "status": "completed",
                "response": f"Answered: {kw.get('user_prompt')}",
                "steps": [{"iteration": 1, "tool": "agent_remember", "result": {"ok": True}}],
                "error": None,
            },
        )
        ask_res = client.post(
            f"/api/agents/{supervisor_id}/ask",
            headers=HEADERS,
            json={"prompt": "Check disk health"},
        )
        assert ask_res.status_code == 200
        ask_data = ask_res.json()
        assert ask_data["status"] == "completed"
        assert "Check disk health" in ask_data["response"]
        assert len(ask_data["steps"]) == 1

    # 2. Test execute_agent native tools: agent_remember, agent_request_approval,
    #    agent_delegate, and agent_run_workflow with a mocked OpenAI HTTP response
    monkeypatch.undo()
    conn = app.state.conn
    call_seq = {"n": 0}

    class _FakeHttpResp:
        def __init__(self, payload: dict):
            self._payload = payload

        def read(self):
            return json.dumps(self._payload).encode("utf-8")

        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

    def fake_urlopen(req, timeout=90):
        call_seq["n"] += 1
        n = call_seq["n"]
        if n == 1:
            msg = {
                "role": "assistant",
                "content": "",
                "tool_calls": [
                    {
                        "id": "tc-1",
                        "type": "function",
                        "function": {
                            "name": "agent_remember",
                            "arguments": json.dumps({"fact": "Remembered node state"}),
                        },
                    },
                    {
                        "id": "tc-2",
                        "type": "function",
                        "function": {
                            "name": "agent_request_approval",
                            "arguments": json.dumps({"tool": "restart_service", "reason": "High CPU"}),
                        },
                    },
                    {
                        "id": "tc-3",
                        "type": "function",
                        "function": {
                            "name": "agent_delegate",
                            "arguments": json.dumps({"target_agent": "ResearchPeer", "prompt": "Fetch release notes"}),
                        },
                    },
                    {
                        "id": "tc-4",
                        "type": "function",
                        "function": {
                            "name": "agent_run_workflow",
                            "arguments": json.dumps({
                                "name": "Agent Diagnostic Flow",
                                "steps": [{"action": "get_system_info", "args": {}}],
                            }),
                        },
                    },
                ],
            }
        elif n == 2:
            # Delegated peer agent's turn
            msg = {"role": "assistant", "content": "Peer completed research."}
        else:
            msg = {"role": "assistant", "content": "Supervisor finished all tool calls."}
        return _FakeHttpResp({"choices": [{"message": msg}]})

    import urllib.request
    monkeypatch.setattr(urllib.request, "urlopen", fake_urlopen)

    sup_row = dict(conn.execute("SELECT * FROM custom_agents WHERE id=?", (supervisor_id,)).fetchone())
    executed_tools = []

    def fake_tool_exec(tool_name, args, device_id, tenant="default", actor="agent"):
        executed_tools.append((tool_name, device_id))
        return {"ok": True, "tool": tool_name}

    res = custom_agents.execute_agent(
        conn,
        sup_row,
        tool_executor=fake_tool_exec,
        user_prompt="Run all native tools",
    )
    assert res["response"] == "Supervisor finished all tool calls."

    step_tools = [s["tool"] for s in res["steps"]]
    assert "agent_remember" in step_tools
    assert "agent_request_approval" in step_tools
    assert "agent_delegate" in step_tools
    assert "agent_run_workflow" in step_tools

    # Verify memory updated
    updated_sup = conn.execute("SELECT memory FROM custom_agents WHERE id=?", (supervisor_id,)).fetchone()
    assert "Remembered node state" in (updated_sup["memory"] or "")

    # Verify approval row created
    appr = conn.execute("SELECT * FROM approvals WHERE tool='restart_service'").fetchone()
    assert appr is not None
    assert appr["status"] == "pending"

    # Verify delegated peer step succeeded
    delegate_step = next(s for s in res["steps"] if s["tool"] == "agent_delegate")
    assert delegate_step["result"]["ok"] is True
    assert delegate_step["result"]["agent_id"] == peer_id
    assert delegate_step["result"]["response"] == "Peer completed research."

    # Verify workflow created and executed
    wf_row = conn.execute("SELECT * FROM workflows WHERE name='Agent Diagnostic Flow'").fetchone()
    assert wf_row is not None
    assert wf_row["status"] == "completed"
    assert ("get_system_info", "dev-test-1") in executed_tools
