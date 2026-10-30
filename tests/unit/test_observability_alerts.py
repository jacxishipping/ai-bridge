"""Unit tests for Phase 2: Observability, Health Probes, Metrics, and Alert Engine."""
from pathlib import Path
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from ai_bridge.control import alerts
from ai_bridge.control.app import create_app


@pytest.fixture
def client(tmp_path: Path):
    app = create_app(db_path=tmp_path / "obs_test.db", admin_token="adm-token")
    return TestClient(app)


def test_health_live_probe(client):
    res = client.get("/health/live")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "live"
    assert "uptime" in data


def test_health_ready_probe(client):
    res = client.get("/health/ready")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "ready"
    assert data["database"] == "connected"


def test_prometheus_metrics_endpoint(client):
    res = client.get("/metrics")
    assert res.status_code == 200
    assert "text/plain" in res.headers["content-type"]
    text = res.text
    assert "aibridge_" in text


def test_alert_engine_dispatch(monkeypatch):
    dispatched = []

    def mock_send(url, payload, headers=None, timeout=6.0):
        dispatched.append((url, payload))
        return True

    monkeypatch.setattr(alerts, "_send_http_json", mock_send)
    monkeypatch.setenv("SLACK_WEBHOOK_URL", "https://hooks.slack.com/services/T00/B00/X00")
    monkeypatch.setenv("DISCORD_WEBHOOK_URL", "https://discord.com/api/webhooks/00/XX")
    monkeypatch.setenv("ALERT_WEBHOOK_URL", "https://example.com/webhook/alerts")

    res = alerts.dispatch_alert(
        event_type="test_event",
        severity="warning",
        title="High Memory Usage",
        details={"usage": "92%"},
        device_id="dev-prod-01",
        async_dispatch=False,
    )

    assert len(dispatched) == 3
    urls = [d[0] for d in dispatched]
    assert "https://hooks.slack.com/services/T00/B00/X00" in urls
    assert "https://discord.com/api/webhooks/00/XX" in urls
    assert "https://example.com/webhook/alerts" in urls
