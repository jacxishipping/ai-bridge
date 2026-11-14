"""Regression coverage for Windows P0–P2 gaps: clipboard, signing, auto-update, desktop honesty."""

from __future__ import annotations

import hashlib
import importlib.util
from pathlib import Path

import pytest

from ai_bridge import screen_capture, updates
from ai_bridge.control.v1_routes import derive_session_permissions
from ai_bridge.webrtc_stream import AgentStreamer, DictSignaling


REPO_ROOT = Path(__file__).resolve().parents[2]


def _load_build_exe():
    path = REPO_ROOT / "deployment" / "windows" / "build_exe.py"
    spec = importlib.util.spec_from_file_location("aibridge_build_exe", path)
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_clipboard_not_implied_by_desktop_enabled():
    perms = derive_session_permissions("human_control", {"desktop_enabled": True})
    assert perms["control_mouse"] is True
    assert perms["clipboard_sync"] is False
    perms_on = derive_session_permissions(
        "human_control",
        {"desktop_enabled": True, "allow_clipboard": True},
    )
    assert perms_on["clipboard_sync"] is True


def test_webrtc_clipboard_requires_explicit_permission():
    signaling = DictSignaling(
        {
            "mode": "human_control",
            "permissions": {
                "control_mouse": True,
                "control_keyboard": True,
                "clipboard_sync": False,
            },
        }
    )
    streamer = AgentStreamer("sess-test", signaling)
    assert streamer._session_allows_input(is_keyboard=True) is True
    assert streamer._session_allows_input(require_clipboard=True) is False

    signaling.session["permissions"]["clipboard_sync"] = True
    assert streamer._session_allows_input(require_clipboard=True) is True


def test_desktop_session_state_shape():
    state = screen_capture.get_desktop_session_state()
    for key in (
        "platform",
        "secure_desktop",
        "desktop_name",
        "session_active",
        "capture_blocked",
        "reason",
        "metrics",
    ):
        assert key in state


def test_require_sign_refuses_unsigned(tmp_path, monkeypatch):
    build_exe = _load_build_exe()
    monkeypatch.setenv("AIBRIDGE_REQUIRE_SIGN", "1")
    monkeypatch.delenv("AIBRIDGE_SIGN_CERT", raising=False)
    monkeypatch.delenv("AIBRIDGE_SIGN_THUMBPRINT", raising=False)
    fake = tmp_path / "AIBridge-Agent.exe"
    fake.write_bytes(b"MZ")
    with pytest.raises(RuntimeError, match="AIBRIDGE_REQUIRE_SIGN"):
        build_exe.sign_executable(fake)


def test_download_and_stage_update_apply_gate(tmp_path, monkeypatch):
    payload = b"hello-update"
    digest = hashlib.sha256(payload).hexdigest()
    src = tmp_path / "payload.bin"
    src.write_bytes(payload)
    manifest = {
        "name": "ai-bridge",
        "version": "9.9.9",
        "files": [{"path": "payload.bin", "sha256": digest, "url": src.as_uri()}],
    }
    staging = tmp_path / "staging"
    install = tmp_path / "install"

    monkeypatch.delenv("AI_BRIDGE_ALLOW_AUTO_UPDATE", raising=False)
    with pytest.raises(PermissionError, match="AI_BRIDGE_ALLOW_AUTO_UPDATE"):
        updates.download_and_stage_update(
            manifest, staging_dir=staging, install_dir=install, apply=True
        )

    monkeypatch.setenv("AI_BRIDGE_ALLOW_AUTO_UPDATE", "1")
    result = updates.download_and_stage_update(
        manifest, staging_dir=staging, install_dir=install, apply=True
    )
    assert result["ok"] is True
    assert result["applied"] == ["payload.bin"]
    assert (install / "payload.bin").read_bytes() == payload


def test_install_mode_docs_and_scripts_exist():
    assert (REPO_ROOT / "deployment" / "windows" / "Install-AIBridge.ps1").is_file()
    assert (REPO_ROOT / "deployment" / "windows" / "install-agent.ps1").is_file()
    assert (REPO_ROOT / "windows-agent" / "installer" / "install-service.ps1").is_file()
    install_shim = (REPO_ROOT / "deployment" / "windows" / "Install-AIBridge.ps1").read_text(
        encoding="utf-8"
    )
    assert "ValidateSet(\"Attended\", \"Headless\", \"Service\")" in install_shim
    service = (REPO_ROOT / "windows-agent" / "installer" / "install-service.ps1").read_text(
        encoding="utf-8"
    )
    assert "sc.exe create" in service
    assert "native-pipe.secret" in service
    assert "AIBridgeDesktopAgent" in service


def test_conpty_and_transfer_helpers_present():
    from ai_bridge import terminal_manager, tools

    assert callable(terminal_manager._start_windows_conpty)
    assert callable(terminal_manager._windows_conpty_available)
    assert "ConPTY" in (terminal_manager.__doc__ or "")
    assert callable(tools.get_transfer_quarantine_dir)
    assert callable(tools.max_transfer_bytes)
    assert callable(tools.desktop_handle_file_start)
    q = tools.get_transfer_quarantine_dir()
    assert q.name == "quarantine"
