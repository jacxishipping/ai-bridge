"""Phase 9 — platform hardening & parity."""
from __future__ import annotations

import json
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from ai_bridge import browser_tools, native_encode, webrtc_stream
from ai_bridge import tools
from ai_bridge.control import dispatch, durable_ratelimit, metrics as metricsmod, plane_state
from ai_bridge.control.app import create_app
from ai_bridge.control.desktop_capabilities import build_capability_matrix
from ai_bridge.control.v1_routes import (
    bind_control_connection,
    is_device_human_takeover_active,
    set_device_human_takeover,
)
from ai_bridge.plane_control_flags import is_emergency_stop, set_emergency_stop


def test_durable_ratelimit_db_multi_worker(tmp_path):
    app = create_app(admin_token="adm-rl", db_path=tmp_path / "rl.db")
    conn = app.state.conn
    assert durable_ratelimit.allow("worker-a", 2, 60.0, conn=conn) is True
    assert durable_ratelimit.allow("worker-a", 2, 60.0, conn=conn) is True
    assert durable_ratelimit.allow("worker-a", 2, 60.0, conn=conn) is False
    assert durable_ratelimit.backend_name(conn) == "database"


def test_emergency_stop_refresh_converges_workers(tmp_path):
    app = create_app(admin_token="adm-p9", db_path=tmp_path / "estop.db")
    app2 = create_app(admin_token="adm-p9", db_path=tmp_path / "estop.db")
    plane_state.set_emergency_stop(app.state.conn, True)
    assert plane_state.is_emergency_stop(app2.state.conn, app2.state) is True


def test_poller_mirror_emergency_stop_to_webrtc():
    set_emergency_stop(False)
    streamer = webrtc_stream.AgentStreamer("s-test", object(), monitor_index=0)
    set_emergency_stop(True)
    out = streamer._handle_input_payload(json.dumps({"action": "mousedown", "x": 0.5, "y": 0.5}))
    assert out.get("error") == "emergency_stop_active"


def test_native_encode_honesty_off(monkeypatch):
    monkeypatch.setenv("AI_BRIDGE_NATIVE_ENCODE", "off")
    desc = native_encode.describe_native_encode()
    assert desc["mode"] == "off"
    assert desc["use_native_encode_timing"] is False
    assert desc["fallback"] == "pyav_screen_track"
    assert "libwebrtc" in desc["webrtc_path"]


def test_browser_hard_isolation_flags(monkeypatch):
    monkeypatch.delenv("AI_BRIDGE_ALLOW_BROWSER_NO_SANDBOX", raising=False)
    monkeypatch.setenv("AI_BRIDGE_BROWSER_HARD_ISOLATION", "1")
    monkeypatch.setenv("AI_BRIDGE_BROWSER_NETWORK_LOCKDOWN", "1")
    opts = browser_tools.playwright_launch_options()
    assert opts["isolation_level"] == "hard"
    args = opts["args"] or []
    assert "--incognito" in args
    assert any("host-resolver-rules" in a for a in args)
    assert opts["isolation"]["secondary_os_process"] is False


def test_fleet_desktop_capabilities_endpoint(tmp_path):
    app = create_app(admin_token="adm-cap", db_path=tmp_path / "cap9.db")
    client = TestClient(app)
    headers = {"x-admin-token": "adm-cap"}
    res = client.get("/api/fleet/desktop-capabilities", headers=headers)
    assert res.status_code == 200
    body = res.json()
    assert body["schema"] == "ai-bridge-desktop-capabilities/v1"
    assert "Windows" in body["platforms"]
    assert body["platforms"]["Linux"]["webrtc_desktop_stream"] is False
    assert "native_encode" in body


def test_capability_matrix_includes_host_status():
    matrix = build_capability_matrix()
    assert matrix["host_os"]
    assert "stream_available" in matrix["host_live_status"]


def test_human_takeover_db_visible_without_cache(tmp_path):
    app = create_app(admin_token="adm-ht", db_path=tmp_path / "ht.db")
    conn = app.state.conn
    bind_control_connection(conn)
    set_device_human_takeover("dev-a", True, conn=conn)
    # Simulate fresh worker with empty in-process cache.
    from ai_bridge.control import v1_routes as v1

    v1._HUMAN_TAKEOVER_BY_DEVICE.clear()
    assert is_device_human_takeover_active("dev-a") is True


def test_legacy_webrtc_session_deprecation_header(tmp_path):
    app = create_app(admin_token="adm-rtc", db_path=tmp_path / "rtc9.db")
    client = TestClient(app)
    headers = {"x-admin-token": "adm-rtc"}
    res = client.post("/api/devices/local/desktop/webrtc/session", headers=headers, json={"fps": 15})
    assert res.status_code == 200
    assert res.headers.get("deprecation") == "true"
    assert "v1/sessions" in (res.headers.get("link") or "")


def test_dispatch_native_encode_status():
    out = dispatch.dispatch("get_native_encode_status", {}, policy=tools.default_policy())
    assert out["fallback"] == "pyav_screen_track"
    assert "mode" in out


def test_metrics_phase9_depth(tmp_path):
    app = create_app(admin_token="adm-p9m", db_path=tmp_path / "m9.db")
    _ = TestClient(app).get("/metrics").text
    payload, _ = metricsmod.get_metrics_payload(app.state.conn)
    text = payload.decode("utf-8", errors="replace")
    if metricsmod._PROMETHEUS_AVAILABLE:
        assert 'phase="9"' in text
    else:
        assert "aibridge_uptime_seconds" in text


def test_webrtc_input_rate_limit_shared_key():
    streamer = webrtc_stream.AgentStreamer("rate-sess", object())
    with patch.object(durable_ratelimit, "allow", return_value=False):
        assert streamer._check_input_rate_limit() is False