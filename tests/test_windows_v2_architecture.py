"""Tests for the AI Bridge Windows Remote Desktop & Autonomous Agent Architecture (v2.0)."""

from __future__ import annotations

import json
from pathlib import Path

from ai_bridge import policy, screen_capture, tools, webrtc_stream

REPO_ROOT = Path(__file__).resolve().parents[1]


def test_v2_native_multi_monitor_and_window_capture():
    """Verify multi-monitor enumeration and window-specific capture in v2."""
    mons = screen_capture.get_monitors()
    assert len(mons) >= 1
    assert "width" in mons[0] and mons[0]["width"] > 0
    assert "height" in mons[0] and mons[0]["height"] > 0
    assert "name" in mons[0]

    test_policy = policy.Policy(desktop_enabled=True, allow_tier3=True)
    mon_tool_res = tools.desktop_get_monitors(policy=test_policy)
    assert mon_tool_res["ok"] is True
    assert len(mon_tool_res["monitors"]) >= 1

    wins = tools.desktop_get_windows(approval_granted=True, policy=test_policy).get("windows", [])
    if wins:
        hwnd = wins[0]["hwnd"]
        w_img = screen_capture.capture_window_by_hwnd(hwnd, scale=0.5)
        assert w_img.width > 0 and w_img.height > 0
        assert w_img.width % 2 == 0 and w_img.height % 2 == 0

        win_shot_res = tools.desktop_get_window_screenshot(hwnd=hwnd, scale=0.5, approval_granted=True, policy=test_policy)
        assert win_shot_res["available"] is True
        assert win_shot_res["hwnd"] == hwnd
        assert "image_base64" in win_shot_res


def test_v2_dynamic_adaptive_bitrate_adaptation():
    """Verify adaptive H.264 bitrate & frame rate calculation based on network health."""
    # Healthy network: low RTT, 0 packet loss -> ramp up
    healthy = webrtc_stream.compute_adaptive_stream_params(
        current_bitrate_kbps=4500,
        current_fps=30,
        rtt_ms=25.0,
        packet_loss_pct=0.1,
    )
    assert healthy["bitrate_kbps"] >= 4500
    assert healthy["fps"] == 30

    # Mild congestion: 160ms RTT or 2.5% loss -> throttle to ~80%
    mild = webrtc_stream.compute_adaptive_stream_params(
        current_bitrate_kbps=4500,
        current_fps=30,
        rtt_ms=160.0,
        packet_loss_pct=2.5,
    )
    assert mild["bitrate_kbps"] < 4500
    assert mild["fps"] <= 30

    # Severe congestion: 300ms RTT or 6% loss -> throttle to 65% and drop FPS
    severe = webrtc_stream.compute_adaptive_stream_params(
        current_bitrate_kbps=4500,
        current_fps=30,
        rtt_ms=300.0,
        packet_loss_pct=6.0,
    )
    assert severe["bitrate_kbps"] <= int(4500 * 0.65)
    assert severe["fps"] <= 24


def test_v2_clipboard_synchronization_and_policy():
    """Verify clipboard get and set tools with policy enforcement."""
    test_policy = policy.Policy(desktop_enabled=True, allow_tier3=True)
    test_text = "AI Bridge v2.0 Clipboard Test Payload"
    set_res = tools.desktop_clipboard_set(text=test_text, paste=False, approval_granted=True, policy=test_policy)
    assert set_res["ok"] is True

    get_res = tools.desktop_clipboard_get(policy=test_policy)
    assert get_res["ok"] is True
    assert test_text in get_res["text"]

    # Verify policy tier mapping
    assert policy.TOOL_TIERS["desktop_clipboard_get"] == policy.RiskTier.READ_ONLY
    assert policy.TOOL_TIERS["desktop_clipboard_set"] == policy.RiskTier.SENSITIVE
    assert policy.TOOL_TIERS["desktop_get_window_screenshot"] == policy.RiskTier.SENSITIVE
    assert policy.TOOL_TIERS["desktop_get_monitors"] == policy.RiskTier.READ_ONLY
