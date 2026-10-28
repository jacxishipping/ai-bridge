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

        # Test policy defaults
        assert app.policy_desktop_enabled.get() is True
        assert app.policy_allow_tier3.get() is True
        assert app.policy_max_tier.get() >= 3
        assert "chrome" in app.policy_allowed_apps
        assert "notepad" in app.policy_allowed_apps

        # Test allow / disallow applications
        app.add_custom_app("slack.exe")
        assert "slack" in app.policy_allowed_apps

        app.disallow_app("slack")
        assert "slack" not in app.policy_allowed_apps

        # Test toggle quick app
        app.toggle_quick_app("notepad")
        assert "notepad" not in app.policy_allowed_apps
        app.toggle_quick_app("notepad")
        assert "notepad" in app.policy_allowed_apps

        # Test disallow all and allow all standard
        app.disallow_all_apps()
        assert len(app.policy_allowed_apps) == 0
        app.allow_all_standard_apps()
        assert "chrome" in app.policy_allowed_apps
        assert "msedge" in app.policy_allowed_apps

        # Test get_current_policy
        pol = app.get_current_policy()
        assert pol.desktop_enabled is True
        assert pol.allow_tier3 is True
        assert pol.max_tier_unattended >= 3
        assert "chrome" in pol.allowed_apps

        # Test preview screenshot call does not crash or raise permission error
        with patch("ai_bridge.tools.capture_desktop_screenshot", return_value={"available": False, "note": "Mocked screenshot"}), patch("tkinter.messagebox.showwarning"):
            app.capture_preview_screenshot()

        app.exit_application()
    finally:
        try:
            root.destroy()
        except Exception:
            pass


def test_poller_effective_policy_merging():
    from ai_bridge.policy import Policy
    from common.poller import Poller

    local_pol = Policy(
        allow_writes=True,
        allow_tier3=True,
        desktop_enabled=True,
        max_tier_unattended=3,
        allowed_apps=frozenset({"chrome", "notepad"}),
    )
    poller = Poller("https://example.com", "fake-token", policy=local_pol)

    remote = {
        "allowed_apps": ["calc", "code"],
        "max_tier_unattended": 2,
    }
    eff = poller._effective_policy(remote)
    assert eff.desktop_enabled is True
    assert eff.allow_tier3 is True
    assert eff.max_tier_unattended >= 3
    assert "chrome" in eff.allowed_apps
    assert "calc" in eff.allowed_apps

