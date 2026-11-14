"""Phase 3 — trustworthy desktop autonomy (monitor SoM, grounding, verify loop, platform honesty)."""

from __future__ import annotations

import json
from unittest.mock import MagicMock, patch

import pytest

from ai_bridge import screen_capture, tools
from ai_bridge.policy import Policy
from ai_bridge.webrtc_stream import AgentStreamer, ScreenTrack


def test_virtual_desktop_bounds_and_per_monitor_normalization():
    mons = [
        {"index": 0, "left": 0, "top": 0, "right": 1920, "bottom": 1080, "width": 1920, "height": 1080},
        {"index": 1, "left": 1920, "top": 0, "right": 3840, "bottom": 1080, "width": 1920, "height": 1080},
    ]
    vdesk = screen_capture.get_virtual_desktop_bounds(mons)
    assert vdesk["width"] == 3840
    assert vdesk["height"] == 1080

    norm = screen_capture.normalize_bounds_for_monitor(2000, 40, 120, 32, mons)
    assert norm["monitor_index"] == 1
    assert 0.0 < norm["norm_x"] < 0.2
    assert norm["absolute_x"] == 2060


def test_som_synthetic_fallback_off_returns_error(monkeypatch):
    monkeypatch.delenv("AI_BRIDGE_SOM_SYNTHETIC_FALLBACK", raising=False)
    monkeypatch.setattr("sys.platform", "linux")
    res = tools.desktop_get_ui_elements(policy=Policy(desktop_enabled=True, allow_tier3=True))
    assert res.get("ok") is False
    assert res.get("count") == 0
    assert "elements" in res


def test_click_element_prefers_cached_som_marks(monkeypatch):
    policy = Policy(desktop_enabled=True, allow_tier3=True, max_tier_unattended=4)
    tools.clear_som_marks_cache()
    with tools._LAST_SOM_LOCK:
        tools._LAST_SOM_MARKS["3"] = {
            "id": "3",
            "x": 512,
            "y": 384,
            "center": [512, 384],
            "bounds": [500, 370, 40, 28],
            "text": "Save",
        }

    seen = {}

    def fake_ui(action, **kwargs):
        seen["action"] = action
        seen.update(kwargs)
        return {"action": action}

    monkeypatch.setattr(tools, "perform_approved_ui_action", fake_ui)
    res = tools.click_element(mark_id="3", approval_granted=True, policy=policy)
    assert res["grounding"] == "som_mark"
    assert res["x"] == 512
    assert seen["x"] == 512
    assert seen["y"] == 384


def test_click_element_rejects_unknown_mark_when_cache_populated(monkeypatch):
    policy = Policy(desktop_enabled=True, allow_tier3=True, max_tier_unattended=4)
    with tools._LAST_SOM_LOCK:
        tools._LAST_SOM_MARKS.clear()
        tools._LAST_SOM_MARKS["1"] = {"x": 10, "y": 10, "center": [10, 10]}
    with pytest.raises(ValueError, match="not in cached SoM marks"):
        tools.click_element(mark_id="99", approval_granted=True, policy=policy)


def test_screen_track_apply_stream_params_updates_fps_step():
    try:
        track = ScreenTrack(fps=30)
    except ModuleNotFoundError:
        pytest.skip("aiortc not installed")

    assert track._fps == 30
    assert track._step == 3000
    track.apply_stream_params(fps=15, bitrate_kbps=2000)
    assert track._fps == 15
    assert track._step == 6000
    assert track._bitrate_kbps == 2000


def test_network_quality_applies_fps_to_video_track(monkeypatch):
    streamer = AgentStreamer("p3-fps", MagicMock(), fps=30, bitrate_kbps=4500)
    fake_track = MagicMock()
    fake_track.apply_stream_params.return_value = {"fps": 20, "bitrate_kbps": 3000}
    streamer.video_track = fake_track
    out = streamer._handle_input_payload(
        json.dumps({"action": "network_quality", "rtt_ms": 200.0, "packet_loss_pct": 3.0})
    )
    assert out["ok"] is True
    assert out["fps"] <= 30
    fake_track.apply_stream_params.assert_called_once()
    assert fake_track.apply_stream_params.call_args.kwargs["fps"] == out["fps"]


@patch.object(tools.platform, "system", return_value="Linux")
def test_get_desktop_status_linux_honesty(mock_sys, monkeypatch):
    monkeypatch.delenv("DISPLAY", raising=False)
    monkeypatch.delenv("WAYLAND_DISPLAY", raising=False)
    st = tools.get_desktop_status()
    assert st["stream_available"] is False
    assert st["ocr_available"] is False
    assert st["available"] is False
    assert st.get("reason")


@patch.object(tools.platform, "system", return_value="Linux")
def test_get_desktop_status_linux_wayland_honesty(mock_sys, monkeypatch):
    monkeypatch.delenv("DISPLAY", raising=False)
    monkeypatch.setenv("WAYLAND_DISPLAY", "wayland-0")
    monkeypatch.setattr(tools.shutil, "which", lambda _name: "/usr/bin/xdotool")
    monkeypatch.setattr(
        tools,
        "get_settings",
        lambda: type("S", (), {"desktop_enabled": True})(),
    )
    st = tools.get_desktop_status()
    assert st["stream_available"] is False
    assert st["available"] is False
    assert st.get("reason") == "linux_wayland_xdotool_unsupported"
    assert "wayland" in (st.get("session") or "").lower()


@patch.object(tools.platform, "system", return_value="Darwin")
def test_get_desktop_status_macos_honesty(_mock_sys, monkeypatch):
    monkeypatch.setattr(
        tools,
        "get_settings",
        lambda: type("S", (), {"desktop_enabled": True})(),
    )
    st = tools.get_desktop_status()
    assert st["stream_available"] is False
    assert st["webrtc_desktop"] is False
    assert "macos" in st.get("reason", "")


def test_desktop_verify_action_post_screenshot_evidence(monkeypatch):
    policy = Policy(desktop_enabled=True, allow_tier3=True, max_tier_unattended=4)

    def fake_shot(**_kwargs):
        return {"available": True, "path": "/tmp/x.png", "size": [100, 100], "active_window": "Test"}

    monkeypatch.setattr(tools, "capture_desktop_screenshot", fake_shot)
    monkeypatch.setattr(tools, "list_desktop_windows", lambda **_: {"windows": []})
    monkeypatch.setattr(tools, "verify_screen_contains", lambda *a, **k: {"contains": True})
    res = tools.desktop_verify_action(
        expected_text="hello",
        wait_seconds=0,
        capture_after=True,
        approval_granted=True,
        policy=policy,
    )
    assert "post_action_screenshot" in res["evidence"]
    assert res["evidence"]["post_action_screenshot"]["available"] is True