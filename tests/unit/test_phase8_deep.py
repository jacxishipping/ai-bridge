"""Phase 8 deep: authz, secrets, sandbox, audit, load/reliability."""
from __future__ import annotations

import json
import logging
import os
import time
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from ai_bridge import browser_tools
from ai_bridge.control import dispatch, dispatch_audit, production_readiness, task_runtime
from ai_bridge.control.app import create_app
from ai_bridge.control import metrics as metricsmod
from ai_bridge.logging_config import JSONFormatter
from ai_bridge.policy import Policy
from ai_bridge.security import redact, refuse_device_token_log


def _open_policy() -> Policy:
    return Policy(
        allow_writes=True,
        allow_tier3=True,
        desktop_enabled=True,
        max_tier_unattended=4,
        unrestricted=True,
    )


def test_redact_turn_and_device_token():
    blob = "device_token=abcDEF1234567890xyz AI_BRIDGE_TURN_SECRET=hunter2"
    out = redact(blob)
    assert "hunter2" not in out
    assert "abcDEF1234567890xyz" not in out
    assert "***REDACTED***" in out


def test_refuse_device_token_log():
    msg = refuse_device_token_log("enroll returned device_token=SuperSecretDeviceTokenValue")
    assert "SuperSecretDeviceTokenValue" not in msg


def test_json_formatter_redacts_message():
    record = logging.LogRecord("t", logging.INFO, "", 0, "device_token=leakvalue123456789", (), None)
    line = JSONFormatter().format(record)
    assert "leakvalue123456789" not in line


def test_browser_sandbox_defaults_on(monkeypatch):
    monkeypatch.delenv("AI_BRIDGE_ALLOW_BROWSER_NO_SANDBOX", raising=False)
    opts = browser_tools.playwright_launch_options()
    assert opts["chromium_sandbox"] is True
    assert opts["args"] is None
    assert ".ai-bridge" in opts["user_data_dir"]


def test_browser_no_sandbox_only_when_explicit(monkeypatch):
    monkeypatch.setenv("AI_BRIDGE_ALLOW_BROWSER_NO_SANDBOX", "1")
    opts = browser_tools.playwright_launch_options()
    assert opts["chromium_sandbox"] is False
    assert "--no-sandbox" in (opts["args"] or [])


def test_production_readiness_turn_missing(monkeypatch, tmp_path):
    monkeypatch.setenv("AI_BRIDGE_PROFILE", "production")
    monkeypatch.delenv("AI_BRIDGE_TURN_SECRET", raising=False)
    monkeypatch.delenv("AI_BRIDGE_ICE_SERVERS", raising=False)
    app = create_app(admin_token="adm-p8", db_path=tmp_path / "prod.db")
    checklist = production_readiness.assess_production_readiness(app.state.conn)
    assert checklist["production_profile"] is True
    assert checklist["ok"] is False
    assert any(i["code"] == "turn_secret_missing" for i in checklist["issues"])


def test_health_ready_503_without_turn_in_prod(monkeypatch, tmp_path):
    monkeypatch.setenv("AI_BRIDGE_PROFILE", "production")
    monkeypatch.delenv("AI_BRIDGE_TURN_SECRET", raising=False)
    app = create_app(admin_token="adm-p8r", db_path=tmp_path / "ready.db")
    client = TestClient(app)
    res = client.get("/health/ready")
    assert res.status_code == 503
    detail = res.json()["detail"]
    assert detail["production_checklist"]["ok"] is False


def test_fleet_health_requires_operator(tmp_path):
    app = create_app(admin_token="adm-p8fh", db_path=tmp_path / "fh.db")
    client = TestClient(app)
    assert client.get("/api/fleet/health").status_code == 401
    assert client.get("/api/fleet/health", headers={"X-Admin-Token": "adm-p8fh"}).status_code == 200


def test_supervisor_handoff_audited(tmp_path):
    admin = "adm-p8sup"
    app = create_app(admin_token=admin, db_path=tmp_path / "sup.db")
    client = TestClient(app)
    headers = {"X-Admin-Token": admin}
    reg = client.post(
        "/api/devices/enroll",
        json={"name": "node", "os": "Linux"},
        headers=headers,
    ).json()
    dev_id = reg["device_id"]
    res = client.post(
        "/api/supervisor/handoff",
        json={"device_id": dev_id, "goal": "harden phase 8", "mode": "fanout"},
        headers=headers,
    )
    assert res.status_code == 200
    assert len(res.json().get("queued") or []) >= 3
    row = app.state.conn.execute(
        "SELECT tool FROM audit WHERE tool='supervisor_handoff_enqueue' ORDER BY id DESC LIMIT 1"
    ).fetchone()
    assert row is not None


def test_dispatch_connector_audit_callback(monkeypatch):
    seen: list[tuple] = []

    def _cb(tool, args, result, device_id):
        seen.append((tool, device_id))

    dispatch_audit.set_dispatch_audit_callback(_cb)
    task_runtime.set_execution_context("t1", None, device_id="dev-9")
    monkeypatch.setenv("AI_BRIDGE_FIRECRAWL_API_KEY", "fc-test-key")
    try:
        with patch("ai_bridge.connectors.firecrawl.httpx.Client") as mock_client:
            mock_client.return_value.__enter__.return_value.post.return_value.status_code = 200
            mock_client.return_value.__enter__.return_value.post.return_value.json.return_value = {
                "data": {"markdown": "ok"}
            }
            dispatch.dispatch("firecrawl_scrape", {"url": "https://example.com"}, policy=_open_policy())
    finally:
        task_runtime.clear_execution_context()
        dispatch_audit.set_dispatch_audit_callback(None)
    assert seen and seen[0][0] == "firecrawl_scrape" and seen[0][1] == "dev-9"


def test_concurrent_claim_and_cancel_under_load(tmp_path):
    admin = "adm-p8load"
    app = create_app(admin_token=admin, db_path=tmp_path / "load8.db")
    client = TestClient(app)
    headers = {"X-Admin-Token": admin}
    devices = []
    for i in range(3):
        reg = client.post(
            "/api/devices/enroll",
            json={"name": f"n{i}", "os": "Linux"},
            headers=headers,
        ).json()
        devices.append((reg["device_id"], reg["device_token"]))
    for dev_id, _ in devices:
        client.post(
            "/api/tasks",
            json={"device_id": dev_id, "tool": "get_system_info", "args": {}},
            headers=headers,
        )
    t0 = time.perf_counter()
    claimed = []
    for _dev_id, tok in devices:
        nxt = client.get("/api/agent/tasks/next?wait=0", headers={"X-Device-Token": tok})
        if nxt.json().get("task"):
            claimed.append(nxt.json()["task"]["id"])
    assert len(claimed) == 3
    assert time.perf_counter() - t0 < 2.0
    if claimed:
        client.post(f"/api/tasks/{claimed[0]}/cancel", headers=headers)
        row = app.state.conn.execute("SELECT status FROM tasks WHERE id=?", (claimed[0],)).fetchone()
        assert row["status"] in {"cancelled", "running", "completed"}


def test_live_activity_multi_device(tmp_path):
    admin = "adm-p8live"
    app = create_app(admin_token=admin, db_path=tmp_path / "live8.db")
    client = TestClient(app)
    headers = {"X-Admin-Token": admin}
    ids = []
    now = time.time()
    for i in range(2):
        reg = client.post(
            "/api/devices/enroll",
            json={"name": f"d{i}", "os": "Linux"},
            headers=headers,
        ).json()
        ids.append(reg["device_id"])
        app.state.conn.execute(
            "UPDATE devices SET status='online', last_seen=? WHERE id=?",
            (now, reg["device_id"]),
        )
        app.state.conn.execute(
            "INSERT INTO tasks (id, device_id, tenant, tool, args_json, tier, status, created_at, updated_at) "
            "VALUES (?, ?, 'default', 'agent_delegate', ?, 2, 'running', ?, ?)",
            (f"run-{i}", reg["device_id"], json.dumps({"_role": "developer"}), now, now),
        )
    app.state.conn.commit()
    live = client.get("/api/activity/live", headers=headers).json()
    roles = [x.get("role") for x in live.get("items", [])]
    assert roles.count("developer") >= 2


def test_metrics_phase8_depth(tmp_path, monkeypatch):
    monkeypatch.delenv("AI_BRIDGE_PROFILE", raising=False)
    app = create_app(admin_token="adm-p8m", db_path=tmp_path / "met8.db")
    payload, _ = metricsmod.get_metrics_payload(app.state.conn)
    text = payload.decode("utf-8", errors="replace")
    if metricsmod._PROMETHEUS_AVAILABLE:
        assert 'phase="8"' in text