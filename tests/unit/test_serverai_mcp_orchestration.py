"""ServerAI MCP communication + agent wake-channel tests."""
from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi.testclient import TestClient

from ai_bridge import device_routing
from ai_bridge.control import agent_channel
from ai_bridge.control.app import create_app


@pytest.fixture(autouse=True)
def _reset_routing_state():
    device_routing.clear_verify_cache()
    device_routing.close_http_client()
    agent_channel.reset_for_tests()
    yield
    device_routing.clear_verify_cache()
    device_routing.close_http_client()
    agent_channel.reset_for_tests()


def test_http_client_reused_across_api_calls():
    c1 = device_routing.get_http_client()
    c2 = device_routing.get_http_client()
    assert c1 is c2
    assert not c1.is_closed


def test_run_device_tool_uses_long_poll_without_extra_sleep(monkeypatch):
    sleeps: list[float] = []

    def fake_api(method, url, admin_token, payload=None, timeout=20):
        if method == "POST" and url.endswith("/api/tasks"):
            return {"task_id": "t1", "status": "queued"}
        if method == "GET" and "/api/tasks/t1" in url:
            return {"status": "completed", "result": '{"ok": true}'}
        raise AssertionError(f"unexpected {method} {url}")

    monkeypatch.setattr(device_routing, "_api", fake_api)
    monkeypatch.setattr(device_routing.time, "sleep", lambda s: sleeps.append(s))

    out = device_routing.run_device_tool("http://cp", "tok", "dev1", "get_system_info", {})
    assert out["status"] == "completed"
    assert out["task_id"] == "t1"
    assert "queue_ms" in out and "exec_ms" in out
    assert sleeps == []


def test_run_device_tool_abort_cancels(monkeypatch):
    calls: list[tuple] = []

    def fake_api(method, url, admin_token, payload=None, timeout=20):
        calls.append((method, url))
        if method == "POST" and url.endswith("/api/tasks"):
            return {"task_id": "t2", "status": "queued"}
        if method == "POST" and url.endswith("/cancel"):
            return {"task_id": "t2", "status": "cancelled"}
        if method == "GET":
            return {"status": "running"}
        raise AssertionError(url)

    monkeypatch.setattr(device_routing, "_api", fake_api)
    out = device_routing.run_device_tool(
        "http://cp",
        "tok",
        "dev1",
        "get_system_info",
        {},
        wait_seconds=30,
        should_abort=lambda: True,
    )
    assert out["status"] == "cancelled"
    assert any(m == "POST" and u.endswith("/cancel") for m, u in calls)


def test_verify_binding_cache(monkeypatch):
    hits = {"n": 0}

    class FakeResp:
        def raise_for_status(self):
            return None

        def json(self):
            return {"ok": True, "device_id": "d-cache"}

    class FakeClient:
        is_closed = False

        def get(self, *a, **k):
            hits["n"] += 1
            return FakeResp()

        def close(self):
            self.is_closed = True

    fake = FakeClient()
    monkeypatch.setattr(device_routing, "get_http_client", lambda: fake)
    device_routing.set_verify_hook(None)
    a = device_routing.resolve_binding("http://verify", "bearer-token-xyz")
    b = device_routing.resolve_binding("http://verify", "bearer-token-xyz")
    assert a == b == "d-cache"
    assert hits["n"] == 1


def test_agent_channel_push_task_and_cancel():
    sent: list[dict] = []
    ws = MagicMock()
    ws.send_json = AsyncMock(side_effect=lambda payload: sent.append(payload) or True)
    agent_channel.register("dev-a", ws)
    assert agent_channel.subscriber_count("dev-a") == 1

    n = asyncio.run(agent_channel.push_to_device("dev-a", {"type": "task_available", "task_id": "t9"}))
    assert n == 1
    assert sent[-1]["type"] == "task_available"

    n2 = asyncio.run(agent_channel.push_to_device("dev-a", {"type": "cancel", "task_id": "t9"}))
    assert n2 == 1
    assert sent[-1] == {"type": "cancel", "task_id": "t9"}


def test_agent_ws_hello(tmp_path):
    admin = "adm-ws-orch"
    app = create_app(admin_token=admin, db_path=tmp_path / "ws.db")
    client = TestClient(app)
    enroll = client.post(
        "/api/devices/enroll",
        headers={"X-Admin-Token": admin},
        json={"name": "ws-dev", "os": "Windows", "tenant": "default"},
    )
    assert enroll.status_code == 200, enroll.text
    device_id = enroll.json()["device_id"]
    device_token = enroll.json()["device_token"]

    with client.websocket_connect(
        "/api/agent/ws",
        headers={"X-Device-Token": device_token},
    ) as ws:
        hello = ws.receive_json()
        assert hello["type"] == "hello"
        assert hello["device_id"] == device_id
        ws.send_json({"type": "heartbeat"})
        ack = ws.receive_json()
        assert ack["type"] == "heartbeat_ok"


def test_cancel_notifies_agent_channel(tmp_path, monkeypatch):
    admin = "adm-ws-cancel"
    app = create_app(admin_token=admin, db_path=tmp_path / "ws2.db")
    client = TestClient(app)
    enroll = client.post(
        "/api/devices/enroll",
        headers={"X-Admin-Token": admin},
        json={"name": "ws-dev2", "os": "Windows"},
    )
    device_id = enroll.json()["device_id"]
    submit = client.post(
        "/api/tasks",
        headers={"X-Admin-Token": admin},
        json={"device_id": device_id, "tool": "get_system_info", "args": {}, "tenant": "default"},
    )
    task_id = submit.json()["task_id"]

    calls: list[tuple] = []

    def capture_cancel(dev, tid, *, emergency_stop=False):
        calls.append((dev, tid, emergency_stop))

    monkeypatch.setattr(agent_channel, "notify_cancel", capture_cancel)
    cancel = client.post(f"/api/tasks/{task_id}/cancel", headers={"X-Admin-Token": admin})
    assert cancel.status_code == 200
    assert calls == [(device_id, task_id, False)]
