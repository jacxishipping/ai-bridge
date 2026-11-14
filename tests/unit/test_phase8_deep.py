"""Phase 8 deep: authz, secrets, sandbox, audit, load/reliability."""
from __future__ import annotations

import json
import logging
import os
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from ai_bridge import browser_tools
from ai_bridge.control import dispatch, dispatch_audit, production_readiness, task_runtime
from ai_bridge.control.app import create_app, make_quick_sig
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


def _clear_prod_env(monkeypatch) -> None:
    monkeypatch.delenv("RENDER", raising=False)
    monkeypatch.delenv("AI_BRIDGE_HTTP_ALLOW_ANON", raising=False)
    monkeypatch.delenv("AI_BRIDGE_ALLOW_BROWSER_NO_SANDBOX", raising=False)
    monkeypatch.delenv("AI_BRIDGE_ALLOW_UNSAFE_BROWSER", raising=False)
    monkeypatch.delenv("AI_BRIDGE_PUBLIC_BASE_URL", raising=False)
    monkeypatch.delenv("AI_BRIDGE_PUBLIC_URL", raising=False)
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.delenv("AI_BRIDGE_REQUIRE_REDIS", raising=False)
    monkeypatch.delenv("AI_BRIDGE_MULTI_HOST", raising=False)
    monkeypatch.delenv("AI_BRIDGE_ALLOW_LEGACY_WEBRTC", raising=False)


def _mark_postgres_configured(monkeypatch) -> None:
    """Satisfy prod readiness without opening a real Postgres connection."""
    monkeypatch.setenv("DATABASE_URL", "postgresql://unit:unit@127.0.0.1:5432/aibridge_unit")


def test_production_readiness_turn_missing(monkeypatch, tmp_path):
    _clear_prod_env(monkeypatch)
    monkeypatch.setenv("AI_BRIDGE_PROFILE", "production")
    monkeypatch.setenv("AI_BRIDGE_ADMIN_TOKEN", "adm-p8-turn")
    monkeypatch.delenv("AI_BRIDGE_TURN_SECRET", raising=False)
    monkeypatch.delenv("AI_BRIDGE_ICE_SERVERS", raising=False)
    monkeypatch.delenv("AI_BRIDGE_TURN_URL", raising=False)
    app = create_app(admin_token="adm-p8-turn", db_path=tmp_path / "prod.db")
    _mark_postgres_configured(monkeypatch)
    checklist = production_readiness.assess_production_readiness(app.state.conn)
    assert checklist["production_profile"] is True
    assert checklist["ok"] is False
    assert any(i["code"] == "turn_secret_missing" for i in checklist["issues"])
    assert "browser_isolation" in checklist


def test_production_readiness_admin_and_anon_critical(monkeypatch, tmp_path):
    _clear_prod_env(monkeypatch)
    monkeypatch.setenv("AI_BRIDGE_PROFILE", "production")
    monkeypatch.setenv("AI_BRIDGE_TURN_SECRET", "turn-secret-for-tests")
    monkeypatch.delenv("AI_BRIDGE_ADMIN_TOKEN", raising=False)
    app = create_app(admin_token=None, db_path=tmp_path / "admin.db")
    _mark_postgres_configured(monkeypatch)
    checklist = production_readiness.assess_production_readiness(app.state.conn)
    assert checklist["ok"] is False
    assert any(i["code"] == "admin_token_unset" and i["severity"] == "critical" for i in checklist["issues"])

    monkeypatch.setenv("AI_BRIDGE_ADMIN_TOKEN", "adm-ok")
    monkeypatch.setenv("AI_BRIDGE_HTTP_ALLOW_ANON", "1")
    checklist2 = production_readiness.assess_production_readiness(app.state.conn)
    assert checklist2["ok"] is False
    assert any(i["code"] == "anon_mcp_enabled" for i in checklist2["issues"])


def test_production_readiness_browser_sandbox_and_http_url(monkeypatch, tmp_path):
    _clear_prod_env(monkeypatch)
    monkeypatch.setenv("AI_BRIDGE_PROFILE", "production")
    monkeypatch.setenv("AI_BRIDGE_ADMIN_TOKEN", "adm-br")
    monkeypatch.setenv("AI_BRIDGE_TURN_SECRET", "turn-secret")
    monkeypatch.setenv("AI_BRIDGE_ALLOW_BROWSER_NO_SANDBOX", "1")
    monkeypatch.setenv("AI_BRIDGE_PUBLIC_BASE_URL", "http://insecure.example")
    app = create_app(admin_token="adm-br", db_path=tmp_path / "br.db")
    _mark_postgres_configured(monkeypatch)
    checklist = production_readiness.assess_production_readiness(app.state.conn)
    assert checklist["ok"] is False
    codes = {i["code"] for i in checklist["issues"]}
    assert "browser_sandbox_disabled" in codes
    assert "public_base_url_http" in codes

    monkeypatch.setenv("AI_BRIDGE_ALLOW_UNSAFE_BROWSER", "1")
    monkeypatch.setenv("AI_BRIDGE_PUBLIC_BASE_URL", "https://secure.example")
    checklist2 = production_readiness.assess_production_readiness(app.state.conn)
    codes2 = {i["code"] for i in checklist2["issues"] if i["severity"] == "critical"}
    assert "browser_sandbox_disabled" not in codes2
    assert "public_base_url_http" not in codes2


def test_public_url_alias_shares_resolution(monkeypatch, tmp_path):
    """AI_BRIDGE_PUBLIC_URL aliases PUBLIC_BASE_URL for readiness + helpers."""
    _clear_prod_env(monkeypatch)
    monkeypatch.setenv("AI_BRIDGE_PROFILE", "production")
    monkeypatch.setenv("AI_BRIDGE_ADMIN_TOKEN", "adm-alias")
    monkeypatch.setenv("AI_BRIDGE_TURN_SECRET", "turn-secret")
    monkeypatch.setenv("AI_BRIDGE_PUBLIC_URL", "http://legacy-alias.example")
    assert production_readiness.env_public_base_url() == "http://legacy-alias.example"
    app = create_app(admin_token="adm-alias", db_path=tmp_path / "alias.db")
    _mark_postgres_configured(monkeypatch)
    checklist = production_readiness.assess_production_readiness(app.state.conn)
    assert any(i["code"] == "public_base_url_http" for i in checklist["issues"])

    monkeypatch.setenv("AI_BRIDGE_PUBLIC_BASE_URL", "https://preferred.example")
    assert production_readiness.env_public_base_url() == "https://preferred.example"
    checklist2 = production_readiness.assess_production_readiness(app.state.conn)
    assert not any(i["code"] == "public_base_url_http" for i in checklist2["issues"])


def test_production_requires_postgres_and_optional_redis(monkeypatch, tmp_path):
    _clear_prod_env(monkeypatch)
    monkeypatch.setenv("AI_BRIDGE_PROFILE", "production")
    monkeypatch.setenv("AI_BRIDGE_ADMIN_TOKEN", "adm-pg")
    monkeypatch.setenv("AI_BRIDGE_TURN_SECRET", "turn")
    monkeypatch.setenv("AI_BRIDGE_PUBLIC_BASE_URL", "https://ok.example")
    app = create_app(admin_token="adm-pg", db_path=tmp_path / "pg.db")
    checklist = production_readiness.assess_production_readiness(app.state.conn)
    assert any(i["code"] == "postgres_required_in_production" for i in checklist["issues"])

    _mark_postgres_configured(monkeypatch)
    monkeypatch.setenv("AI_BRIDGE_REQUIRE_REDIS", "1")
    checklist2 = production_readiness.assess_production_readiness(app.state.conn)
    assert any(i["code"] == "redis_required_for_multi_host" for i in checklist2["issues"])


def test_legacy_webrtc_gone_in_production(monkeypatch, tmp_path):
    _clear_prod_env(monkeypatch)
    monkeypatch.setenv("AI_BRIDGE_PROFILE", "production")
    monkeypatch.setenv("AI_BRIDGE_ADMIN_TOKEN", "adm-leg")
    app = create_app(admin_token="adm-leg", db_path=tmp_path / "leg.db")
    client = TestClient(app)
    res = client.post(
        "/api/devices/local/desktop/webrtc/session",
        headers={"X-Admin-Token": "adm-leg"},
        json={"fps": 15},
    )
    assert res.status_code == 410
    assert res.json()["detail"]["error"] == "legacy_webrtc_gone"


def test_quick_sig_refuses_hardcoded_secret_in_prod(monkeypatch):
    _clear_prod_env(monkeypatch)
    monkeypatch.setenv("AI_BRIDGE_PROFILE", "production")
    monkeypatch.delenv("AI_BRIDGE_ADMIN_TOKEN", raising=False)
    with pytest.raises(ValueError, match="production"):
        make_quick_sig(None, "appr1", "approved")
    monkeypatch.setenv("AI_BRIDGE_ADMIN_TOKEN", "prod-admin")
    sig = make_quick_sig(None, "appr1", "approved")
    assert len(sig) == 32


def test_health_ready_503_without_turn_in_prod(monkeypatch, tmp_path):
    _clear_prod_env(monkeypatch)
    monkeypatch.setenv("AI_BRIDGE_PROFILE", "production")
    monkeypatch.setenv("AI_BRIDGE_ADMIN_TOKEN", "adm-p8r")
    monkeypatch.delenv("AI_BRIDGE_TURN_SECRET", raising=False)
    monkeypatch.delenv("AI_BRIDGE_ICE_SERVERS", raising=False)
    monkeypatch.delenv("AI_BRIDGE_TURN_URL", raising=False)
    app = create_app(admin_token="adm-p8r", db_path=tmp_path / "ready.db")
    _mark_postgres_configured(monkeypatch)
    client = TestClient(app)
    res = client.get("/health/ready")
    assert res.status_code == 503
    detail = res.json()["detail"]
    assert detail["ok"] is False
    assert detail["status"] == "not_ready"
    assert "codes" in detail
    assert "turn_secret_missing" in detail["codes"]
    assert "production_checklist" not in detail


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
        "SELECT tool, entry_hash FROM audit WHERE tool='supervisor_handoff_enqueue' ORDER BY id DESC LIMIT 1"
    ).fetchone()
    assert row is not None
    assert row["entry_hash"]


def test_dispatch_audits_sensitive_tools():
    assert dispatch_audit.should_audit_tool("firecrawl_scrape") is True
    assert dispatch_audit.should_audit_tool("supervisor_enqueue_handoff") is True
    assert dispatch_audit.should_audit_tool("capture_desktop_screenshot") is True
    assert dispatch_audit.should_audit_tool("get_system_info") is False


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
    for i in range(10):
        reg = client.post(
            "/api/devices/enroll",
            json={"name": f"n{i}", "os": "Linux"},
            headers=headers,
        ).json()
        devices.append((reg["device_id"], reg["device_token"]))
    # 3 tasks per device = 30 tasks
    for dev_id, _ in devices:
        for _ in range(3):
            client.post(
                "/api/tasks",
                json={"device_id": dev_id, "tool": "get_system_info", "args": {}},
                headers=headers,
            )
    t0 = time.perf_counter()
    claimed: list[str] = []

    def _drain(tok: str) -> list[str]:
        """Claim → complete/cancel cycle (one running lease per device)."""
        got: list[str] = []
        for i in range(3):
            nxt = client.get("/api/agent/tasks/next?wait=0", headers={"X-Device-Token": tok})
            task = nxt.json().get("task")
            if not task:
                break
            tid = task["id"]
            got.append(tid)
            if i == 0:
                client.post(f"/api/tasks/{tid}/cancel", headers=headers)
            else:
                client.post(
                    f"/api/agent/tasks/{tid}/result",
                    json={"status": "completed", "result": "{}"},
                    headers={"X-Device-Token": tok},
                )
        return got

    with ThreadPoolExecutor(max_workers=10) as pool:
        futs = [pool.submit(_drain, tok) for _dev_id, tok in devices]
        for fut in as_completed(futs):
            claimed.extend(fut.result())

    elapsed = time.perf_counter() - t0
    assert len(claimed) == 30
    assert len(set(claimed)) == 30  # no double-claim
    assert elapsed < 5.0
    statuses = [
        app.state.conn.execute("SELECT status FROM tasks WHERE id=?", (tid,)).fetchone()["status"]
        for tid in claimed
    ]
    assert all(s in {"cancelled", "completed"} for s in statuses)
    assert statuses.count("cancelled") == 10
    assert statuses.count("completed") == 20


def test_audit_list_exposes_entry_hash(tmp_path):
    admin = "adm-p8hash"
    app = create_app(admin_token=admin, db_path=tmp_path / "hash.db")
    client = TestClient(app)
    headers = {"X-Admin-Token": admin}
    client.post("/api/devices/enroll", json={"name": "h", "os": "Linux"}, headers=headers)
    rows = client.get("/api/audit", headers=headers).json()
    assert isinstance(rows, list) and rows
    assert rows[0].get("entry_hash") or rows[0].get("hash")


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
    monkeypatch.delenv("RENDER", raising=False)
    app = create_app(admin_token="adm-p8m", db_path=tmp_path / "met8.db")
    payload, _ = metricsmod.get_metrics_payload(app.state.conn)
    text = payload.decode("utf-8", errors="replace")
    if metricsmod._PROMETHEUS_AVAILABLE:
        assert 'phase="8"' in text
        assert "aibridge_advanced_phase_depth" in text
