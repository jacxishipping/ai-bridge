"""Tests for the AI Bridge Windows Remote Desktop & Autonomous Agent Architecture (v1.0)."""

from __future__ import annotations

import json
from pathlib import Path

from ai_bridge import policy, screen_capture, tools, webrtc_stream
from ai_bridge.control.v1_routes import (
    derive_session_permissions,
    is_device_human_takeover_active,
    set_device_human_takeover,
)


REPO_ROOT = Path(__file__).resolve().parents[1]


def test_shared_schemas_and_protocols_exist_and_parse():
    """Verify all shared/ schemas, protocols, and permission matrices are valid JSON."""
    session_schema = json.loads((REPO_ROOT / "shared/schemas/session.schema.json").read_text(encoding="utf-8"))
    input_proto = json.loads((REPO_ROOT / "shared/protocols/input_protocol.json").read_text(encoding="utf-8"))
    pipe_proto = json.loads((REPO_ROOT / "shared/protocols/named_pipe_protocol.json").read_text(encoding="utf-8"))
    perm_matrix = json.loads((REPO_ROOT / "shared/permissions/permissions_matrix.json").read_text(encoding="utf-8"))

    assert session_schema["title"] == "AI Bridge Remote Desktop & Autonomous Session Schema"
    assert "permissions" in session_schema["properties"]
    assert input_proto["channel_label"] == "input"
    assert pipe_proto["pipe_name"] == r"\\.\pipe\AIBridgeDesktopPipe"
    assert "screen access must not automatically grant command execution" in perm_matrix["principle"]
    assert perm_matrix["modes"]["view_only"]["human_permissions"]["control_mouse"] is False
    assert perm_matrix["modes"]["human_control"]["ai_allowed"] is False
    assert perm_matrix["modes"]["ai_assisted"]["ai_allowed"] is True


def test_native_windows_dll_metrics_and_screen_capture():
    """Verify native C++ DXGI capture integration and frame capture."""
    dll = screen_capture.get_native_dll()
    assert dll is not None

    img = screen_capture.capture_desktop(monitor_index=0, scale=0.5)
    assert img.width > 0
    assert img.height > 0
    assert img.width % 2 == 0
    assert img.height % 2 == 0

    metrics = screen_capture.get_last_capture_metrics()
    assert isinstance(metrics, dict)
    assert metrics["backend"] in ("dxgi_cpp_native", "win32_cpp_native", "win32_bitblt")
    assert metrics["width"] > 0
    assert metrics["height"] > 0


def test_v1_session_permission_derivation():
    """Verify server-side session permission derivation and mode invariants."""
    # 1. view_only mode never grants mouse/keyboard or command execution
    p_view = derive_session_permissions("view_only", {"desktop_enabled": True, "allow_shell": False})
    assert p_view["view_screen"] is True
    assert p_view["control_mouse"] is False
    assert p_view["control_keyboard"] is False
    assert p_view["execute_commands"] is False

    # 2. human_control / ai_assisted grants screen & input when desktop_enabled,
    #    but screen-view permission NEVER automatically grants command execution!
    p_assist = derive_session_permissions("ai_assisted", {"desktop_enabled": True, "allow_shell": False})
    assert p_assist["view_screen"] is True
    assert p_assist["control_mouse"] is True
    assert p_assist["control_keyboard"] is True
    assert p_assist["execute_commands"] is False

    # 3. execute_commands is only granted when allow_shell is explicitly enabled in policy
    p_shell = derive_session_permissions("ai_assisted", {"desktop_enabled": True, "allow_shell": True})
    assert p_shell["execute_commands"] is True


def test_desktop_mcp_tools_and_human_takeover_enforcement():
    """Verify canonical desktop_* MCP tools and immediate Human Takeover suppression."""
    pol = policy.Policy(
        allow_writes=True,
        allow_tier3=True,
        desktop_enabled=True,
        allowed_apps=frozenset({"notepad", "calc"}),
    )

    # Clear human takeover initially
    set_device_human_takeover("local", False, actor="test")
    assert is_device_human_takeover_active("local") is False

    status = tools.desktop_get_status(device_id="local")
    assert status["human_takeover_active"] is False
    assert status["mode"] == "ai_assisted"
    assert "capture_metrics" in status

    win_res = tools.desktop_get_windows(approval_granted=True, policy=pol)
    assert "windows" in win_res

    wait_res = tools.desktop_wait(condition="sleep", seconds=0.05, approval_granted=True, policy=pol)
    assert wait_res["ok"] is True
    assert wait_res["waited_seconds"] == 0.05

    verify_res = tools.desktop_verify_action(approval_granted=True, policy=pol)
    assert verify_res["ok"] is True
    assert "verified" in verify_res

    # Engage Human Takeover and verify AI input tools immediately raise PermissionError
    set_device_human_takeover("local", True, actor="operator-sarah")
    assert is_device_human_takeover_active("local") is True

    status_after = tools.desktop_get_status(device_id="local")
    assert status_after["human_takeover_active"] is True
    assert status_after["mode"] == "human_control"

    for fn in (
        lambda: tools.desktop_mouse_move(100, 100, approval_granted=True, policy=pol, device_id="local"),
        lambda: tools.desktop_click(100, 100, approval_granted=True, policy=pol, device_id="local"),
        lambda: tools.desktop_keyboard(text="hello", approval_granted=True, policy=pol, device_id="local"),
        lambda: tools.desktop_scroll(delta=-120, approval_granted=True, policy=pol, device_id="local"),
        lambda: tools.desktop_open_application("notepad", approval_granted=True, policy=pol, device_id="local"),
        lambda: tools.desktop_execute_command("echo hi", approval_granted=True, policy=pol, device_id="local"),
    ):
        try:
            fn()
            raise AssertionError("Expected PermissionError when Human Takeover is active")
        except PermissionError as exc:
            assert "Human takeover is active" in str(exc)

    # Hand control back to AI
    set_device_human_takeover("local", False, actor="operator-sarah")
    assert is_device_human_takeover_active("local") is False


def test_webrtc_disconnect_releases_held_keys():
    """Verify held keys tracked during a WebRTC session are released on disconnect."""
    webrtc_stream.track_key_state("shift", is_down=True)
    webrtc_stream.track_key_state("ctrl", is_down=True)
    assert set(webrtc_stream.get_held_keys()) >= {"shift", "ctrl"}
    released_count = webrtc_stream.release_all_held_keys()
    assert released_count >= 2
    assert webrtc_stream.get_held_keys() == []
    # Second call should have 0 held keys remaining
    assert webrtc_stream.release_all_held_keys() == 0


if __name__ == "__main__":
    test_shared_schemas_and_protocols_exist_and_parse()
    print("[PASS] test_shared_schemas_and_protocols_exist_and_parse")
    test_native_windows_dll_metrics_and_screen_capture()
    print("[PASS] test_native_windows_dll_metrics_and_screen_capture")
    test_v1_session_permission_derivation()
    print("[PASS] test_v1_session_permission_derivation")
    test_desktop_mcp_tools_and_human_takeover_enforcement()
    print("[PASS] test_desktop_mcp_tools_and_human_takeover_enforcement")
    test_webrtc_disconnect_releases_held_keys()
    print("[PASS] test_webrtc_disconnect_releases_held_keys")
    print("All Windows v1.0 architecture tests passed!")
