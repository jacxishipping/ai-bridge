"""Phase 9 — platform hardening & parity."""
from __future__ import annotations

import json
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from ai_bridge import browser_tools, native_encode, webrtc_stream
from ai_bridge import tools
from ai_bridge.control import dispatch, durable_ratelimit, metrics as metricsmod, plane_state
from ai_bridge.control.app import create_app
from ai_bridge.control.desktop_capabilities import (
    build_capability_matrix,
    platform_supports_webrtc_desktop_stream,
    stream_gate_for_os,
)
from ai_bridge.control.v1_routes import (
    bind_control_connection,
    is_device_human_takeover_active,
    set_device_human_takeover,
)
from ai_bridge.plane_control_flags import is_emergency_stop, set_emergency_stop
from ai_bridge.webrtc_stream import AgentStreamer, DictSignaling


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
    assert matrix["host_live_status"].get("scope") == "control_plane_host"
    assert "desktop_audio" in matrix
    assert isinstance(matrix["desktop_audio"]["capture_implemented"], bool)
    assert "reason" in matrix["desktop_audio"]


def test_stream_gate_for_os_windows_only():
    assert platform_supports_webrtc_desktop_stream("Windows 11") is True
    assert platform_supports_webrtc_desktop_stream("win32") is True
    assert platform_supports_webrtc_desktop_stream("Ubuntu 24.04") is False
    assert platform_supports_webrtc_desktop_stream("Linux") is False
    # Regression: bare \"win\" substring must not match Darwin.
    assert platform_supports_webrtc_desktop_stream("Darwin") is False
    assert platform_supports_webrtc_desktop_stream("darwin") is False
    assert platform_supports_webrtc_desktop_stream("macOS") is False
    win = stream_gate_for_os("Windows")
    assert win["allowed"] is True
    linux = stream_gate_for_os("Linux")
    assert linux["allowed"] is False
    assert linux["stream_available"] is False
    assert "linux" in linux["reason"]
    mac = stream_gate_for_os("Darwin")
    assert mac["allowed"] is False
    assert mac["platform"] == "Darwin"


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
    import platform as _platform

    app = create_app(admin_token="adm-rtc", db_path=tmp_path / "rtc9.db")
    client = TestClient(app)
    headers = {"x-admin-token": "adm-rtc"}
    res = client.post("/api/devices/local/desktop/webrtc/session", headers=headers, json={"fps": 15})
    assert res.headers.get("deprecation") == "true"
    assert "v1/sessions" in (res.headers.get("link") or "")
    if _platform.system() == "Windows":
        assert res.status_code == 200
    else:
        # Non-Windows control-plane hosts cannot stream local desktop.
        assert res.status_code == 400
        assert "unavailable" in str(res.json().get("detail") or "").lower()


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


def test_desktop_audio_opt_in_default_off(monkeypatch):
    """F11: desktop audio stays off unless AI_BRIDGE_DESKTOP_AUDIO is explicitly set."""
    monkeypatch.delenv("AI_BRIDGE_DESKTOP_AUDIO", raising=False)
    assert webrtc_stream.desktop_audio_opt_in() is False
    monkeypatch.setenv("AI_BRIDGE_DESKTOP_AUDIO", "0")
    assert webrtc_stream.desktop_audio_opt_in() is False
    monkeypatch.setenv("AI_BRIDGE_DESKTOP_AUDIO", "no")
    assert webrtc_stream.desktop_audio_opt_in() is False


def test_desktop_audio_opt_in_enabled(monkeypatch):
    for value in ("1", "true", "yes", "TRUE", "Yes"):
        monkeypatch.setenv("AI_BRIDGE_DESKTOP_AUDIO", value)
        assert webrtc_stream.desktop_audio_opt_in() is True, value


def test_desktop_audio_silent_pcm_is_zeros():
    """Honest silent track: PCM buffer is all zeros (no fake live capture)."""
    pcm = webrtc_stream.desktop_audio_silent_pcm_bytes(960, 2)
    assert len(pcm) == 960 * 2 * 2
    assert pcm == b"\x00" * len(pcm)


def test_streamer_skips_desktop_audio_when_env_unset(monkeypatch):
    monkeypatch.delenv("AI_BRIDGE_DESKTOP_AUDIO", raising=False)
    signaling = DictSignaling({"mode": "human_control"})
    streamer = AgentStreamer("audio-off", signaling)
    pc = MagicMock()
    created = []

    def _boom(*_a, **_k):
        created.append(1)
        raise AssertionError("DesktopAudioTrack must not be constructed when audio is off")

    monkeypatch.setattr(webrtc_stream, "DesktopAudioTrack", _boom)
    assert streamer._attach_desktop_audio_if_enabled(pc) is False
    pc.addTrack.assert_not_called()
    assert created == []
    assert signaling.session.get("audio_enabled") is False


def test_streamer_attaches_silent_audio_when_opted_in(monkeypatch):
    monkeypatch.setenv("AI_BRIDGE_DESKTOP_AUDIO", "1")
    signaling = DictSignaling({"mode": "human_control"})
    streamer = AgentStreamer("audio-on", signaling)
    pc = MagicMock()
    fake_track = MagicMock()
    fake_track.kind = "audio"
    # Expose silent-PCM contract without requiring aiortc/WASAPI.
    fake_track._silent_bytes = webrtc_stream.desktop_audio_silent_pcm_bytes()
    monkeypatch.setattr(webrtc_stream, "DesktopAudioTrack", lambda: fake_track)

    assert streamer._attach_desktop_audio_if_enabled(pc, RTCRtpSender=None) is True
    pc.addTrack.assert_called_once_with(fake_track)
    assert signaling.session.get("audio_enabled") is True
    assert fake_track._silent_bytes == b"\x00" * len(fake_track._silent_bytes)