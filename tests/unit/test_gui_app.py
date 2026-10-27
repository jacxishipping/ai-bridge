"""Unit tests for the advanced Windows GUI application helpers and lifecycle."""
from __future__ import annotations

import platform
import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

# Ensure agents/windows is in path
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "agents" / "windows"))

import gui_app  # noqa: E402


def test_gather_system_telemetry():
    telemetry = gui_app.gather_system_telemetry()
    assert isinstance(telemetry, dict)
    assert "cpu_percent" in telemetry
    assert "memory_percent" in telemetry
    assert "disk_percent" in telemetry
    assert "hostname" in telemetry
    assert "system" in telemetry
    assert telemetry["system"] in ("Windows", "Linux", "Darwin")


def test_load_and_save_agent_config(tmp_path, monkeypatch):
    test_cfg_file = tmp_path / "test_gui_config.json"
    test_tok_file = tmp_path / "test_device.token"
    monkeypatch.setattr(gui_app, "CONFIG_FILE", test_cfg_file)
    monkeypatch.setattr(gui_app, "TOKEN_FILE", test_tok_file)
    monkeypatch.setattr(gui_app, "CONFIG_DIR", tmp_path)

    sample_cfg = {
        "control_url": "https://test.ai-bridge.local",
        "device_token": "test-token-12345",
        "auto_start": False,
        "theme": "light",
        "poll_wait_s": 15,
        "minimize_to_tray": True,
        "desktop_notifications": False,
        "autostart_windows": False,
    }

    gui_app.save_agent_config(sample_cfg)
    assert test_cfg_file.exists()
    assert test_tok_file.exists()
    assert test_tok_file.read_text(encoding="utf-8").strip() == "test-token-12345"

    loaded = gui_app.load_agent_config()
    assert loaded["control_url"] == "https://test.ai-bridge.local"
    assert loaded["device_token"] == "test-token-12345"
    assert loaded["theme"] == "light"
    assert loaded["poll_wait_s"] == 15


def test_connection_ping_mock():
    with patch("urllib.request.urlopen") as mock_urlopen:
        mock_resp = MagicMock()
        mock_resp.status = 200
        mock_resp.__enter__.return_value = mock_resp
        mock_urlopen.return_value = mock_resp

        ok, lat, detail = gui_app.test_connection_ping("https://mock.control.plane")
        assert ok is True
        assert lat >= 0
        assert "200" in detail


def test_connection_ping_error_mock():
    with patch("urllib.request.urlopen", side_effect=Exception("Connection refused")):
        ok, lat, detail = gui_app.test_connection_ping("https://invalid.server")
        assert ok is False
        assert "Connection refused" in detail


def test_autostart_registry_mock():
    with patch("winreg.OpenKey"), patch("winreg.SetValueEx"), patch("winreg.CloseKey"):
        res = gui_app.set_windows_autostart(True)
        if platform.system() == "Windows":
            assert res is True
        else:
            assert res is False


def test_gui_app_headless_init(monkeypatch, tmp_path):
    """Test that AgentGuiApp can instantiate, build tabs, and switch tabs without errors."""
    test_cfg_file = tmp_path / "test_gui_config.json"
    test_tok_file = tmp_path / "test_device.token"
    monkeypatch.setattr(gui_app, "CONFIG_FILE", test_cfg_file)
    monkeypatch.setattr(gui_app, "TOKEN_FILE", test_tok_file)
    monkeypatch.setattr(gui_app, "CONFIG_DIR", tmp_path)

    # Disable auto-start and tray thread for test
    monkeypatch.setattr(gui_app.SystemTrayManager, "start", lambda self: None)

    import tkinter as tk

    try:
        root = tk.Tk()
        root.withdraw()
    except Exception:
        pytest.skip("Tkinter display not available in this environment")

    try:
        app = gui_app.AgentGuiApp(root)
        assert app.device_id_var.get() == "—"
        assert app.status_var.get() == "Stopped"

        # Test switching across all 6 tabs
        for idx in range(6):
            app.select_tab(idx)
            assert app.active_tab_idx == idx

        # Test theme toggle
        old_theme = app.theme_name
        app.toggle_theme()
        assert app.theme_name != old_theme

        app.exit_application()
    finally:
        try:
            root.destroy()
        except Exception:
            pass
