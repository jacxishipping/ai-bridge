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


def test_v3_file_transfer_chunking_and_sha256():
    """Verify Phase 3 bi-directional 64KB chunked file transfers and integrity validation."""
    import base64
    import hashlib

    # Generate 150 KB test binary payload spanning 3 x 64KB chunks
    payload = b"AI-Bridge-V3-Transfer-Chunk-" * 5500
    expected_hash = hashlib.sha256(payload).hexdigest()
    file_size = len(payload)
    chunk_size = 64 * 1024
    total_chunks = (file_size + chunk_size - 1) // chunk_size

    transfer_id = "test_tx_phase3_001"
    filename = "test_artifact_v3.bin"

    # 1. Start transfer
    start_res = tools.desktop_handle_file_start(transfer_id, filename, file_size, total_chunks)
    assert start_res["ok"] is True
    assert start_res["transfer_id"] == transfer_id
    assert start_res["status"] == "ready_for_chunks"

    # 2. Feed chunks
    for i in range(total_chunks):
        slice_bytes = payload[i * chunk_size : (i + 1) * chunk_size]
        b64 = base64.b64encode(slice_bytes).decode("ascii")
        chunk_res = tools.desktop_handle_file_chunk(transfer_id, i, b64)
        assert chunk_res["ok"] is True
        assert chunk_res["received_chunks"] == i + 1

    # 3. Finalize transfer with SHA-256 validation
    end_res = tools.desktop_handle_file_end(transfer_id, expected_hash)
    assert end_res["ok"] is True
    assert end_res["status"] == "completed"
    assert end_res["sha256"] == expected_hash
    assert end_res["file_size"] == file_size

    # 4. Check listing
    transfers = tools.desktop_list_transfers()
    assert any(t["name"] == filename for t in transfers)

    # 5. Check prepare download
    dl_prep = tools.desktop_prepare_file_download(filename)
    assert dl_prep["ok"] is True
    assert dl_prep["size"] == file_size
    assert dl_prep["sha256"] == expected_hash
    assert dl_prep["total_chunks"] == total_chunks

    # 6. Verify SHA-256 mismatch rejection
    bad_id = "test_tx_bad_hash"
    tools.desktop_handle_file_start(bad_id, "bad.bin", 10, 1)
    tools.desktop_handle_file_chunk(bad_id, 0, base64.b64encode(b"0123456789").decode("ascii"))
    bad_res = tools.desktop_handle_file_end(bad_id, "0000000000000000000000000000000000000000000000000000000000000000")
    assert bad_res["ok"] is False
    assert bad_res["error"] == "sha256_mismatch"

    # 7. Clean up test file
    try:
        Path(end_res["saved_path"]).unlink()
    except Exception:
        pass

