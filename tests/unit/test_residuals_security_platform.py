"""Residuals: vault/env secrets, mTLS, WORM SIEM, netns helpers, F13 honesty."""
from __future__ import annotations

from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from ai_bridge import browser_isolation_os, native_encode
from ai_bridge.control import device_mtls, production_readiness, secrets_backend, worm_siem
from ai_bridge.control.app import create_app


def test_secrets_backend_env_default(monkeypatch):
    monkeypatch.delenv("AI_BRIDGE_SECRETS_BACKEND", raising=False)
    monkeypatch.setenv("AI_BRIDGE_ADMIN_TOKEN", "tok-env")
    assert secrets_backend.get_secret("AI_BRIDGE_ADMIN_TOKEN") == "tok-env"
    assert secrets_backend.describe_secrets_backend()["backend"] == "env"


def test_secrets_backend_vault_fail_closed(monkeypatch):
    monkeypatch.setenv("AI_BRIDGE_SECRETS_BACKEND", "vault")
    monkeypatch.setenv("AI_BRIDGE_SECRETS_REQUIRED", "1")
    monkeypatch.delenv("AI_BRIDGE_VAULT_ADDR", raising=False)
    monkeypatch.delenv("AI_BRIDGE_VAULT_TOKEN", raising=False)
    with pytest.raises(RuntimeError, match="Vault"):
        secrets_backend.get_secret("AI_BRIDGE_ADMIN_TOKEN")


def test_worm_siem_emit_posts(monkeypatch):
    monkeypatch.setenv("AI_BRIDGE_WORM_SIEM_URL", "https://siem.example/ingest")

    class _Resp:
        status_code = 204

    with patch("httpx.post", return_value=_Resp()) as post:
        out = worm_siem.emit_audit_event({"tool": "enroll_device", "decision": "allowed"})
        assert out["ok"] is True
        assert post.called


def test_device_mtls_gate(tmp_path, monkeypatch):
    monkeypatch.setenv("AI_BRIDGE_DEVICE_MTLS", "1")
    app = create_app(admin_token="adm-mtls", db_path=tmp_path / "mtls.db")
    client = TestClient(app)
    headers = {"X-Admin-Token": "adm-mtls"}
    reg = client.post(
        "/api/devices/enroll",
        json={"name": "m", "os": "Linux", "policy": {"mtls_fingerprint": "aa:bb:cc:dd:ee:ff:11:22:33:44:55:66:77:88:99:00"}},
        headers=headers,
    ).json()
    assert reg["mtls_fingerprint"]
    # Claim without fingerprint → 403
    denied = client.get(
        "/api/agent/tasks/next?wait=0",
        headers={"X-Device-Token": reg["device_token"]},
    )
    assert denied.status_code == 403
    ok = client.get(
        "/api/agent/tasks/next?wait=0",
        headers={
            "X-Device-Token": reg["device_token"],
            "X-Client-Cert-Fingerprint": reg["mtls_fingerprint"],
        },
    )
    assert ok.status_code == 200


def test_browser_netns_wrapper_argv(monkeypatch):
    monkeypatch.setenv("AI_BRIDGE_BROWSER_NETNS", "1")
    info = browser_isolation_os.describe_os_browser_isolation()
    assert "mode" in info
    wrapped = browser_isolation_os.chromium_launch_wrapper_argv(["chromium", "--headless"])
    assert wrapped[-1] == "--headless" or wrapped == ["chromium", "--headless"]


def test_native_encode_libwebrtc_honesty():
    desc = native_encode.describe_native_encode()
    assert desc["libwebrtc_e2e"] is False
    assert desc["shipping_path"] == "python_aiortc"
    assert "libwebrtc" in desc["honesty"].lower()


def test_production_checklist_includes_residual_surfaces(monkeypatch, tmp_path):
    monkeypatch.delenv("AI_BRIDGE_PROFILE", raising=False)
    monkeypatch.delenv("RENDER", raising=False)
    app = create_app(admin_token="adm-res", db_path=tmp_path / "res.db")
    checklist = production_readiness.assess_production_readiness(app.state.conn)
    assert "secrets_backend" in checklist
    assert "worm_siem" in checklist
    assert "device_mtls" in checklist
    assert "os_browser_isolation" in checklist
