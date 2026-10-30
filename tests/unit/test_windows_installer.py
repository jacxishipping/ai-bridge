"""Unit tests for AI Bridge Windows Setup & Installer Wizard."""
import json
import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from deployment.windows import installer_gui


def test_requirements_file_exists_and_contains_core_packages():
    req_file = Path("deployment/windows/requirements.txt")
    assert req_file.exists(), "deployment/windows/requirements.txt must exist"
    content = req_file.read_text(encoding="utf-8")
    assert "fastapi" in content
    assert "pydantic" in content
    assert "psutil" in content
    assert "Pillow" in content
    assert "aiortc" in content
    assert "av" in content
    assert "pystray" in content


def test_write_agent_config(tmp_path: Path, monkeypatch):
    test_config_dir = tmp_path / ".ai-bridge"
    test_config_file = test_config_dir / "agent_gui.json"
    test_token_file = test_config_dir / "device.token"

    monkeypatch.setattr(installer_gui, "CONFIG_DIR", test_config_dir)
    monkeypatch.setattr(installer_gui, "CONFIG_FILE", test_config_file)
    monkeypatch.setattr(installer_gui, "TOKEN_FILE", test_token_file)

    installer_gui.write_agent_config(
        control_url="https://test-server.example.com/",
        device_token="test-token-12345",
        autostart=True,
    )

    assert test_config_file.exists()
    assert test_token_file.exists()

    cfg = json.loads(test_config_file.read_text(encoding="utf-8"))
    assert cfg["control_url"] == "https://test-server.example.com"
    assert cfg["device_token"] == "test-token-12345"
    assert cfg["autostart_windows"] is True
    assert "chrome" in cfg["allowed_apps"]
    assert test_token_file.read_text(encoding="utf-8") == "test-token-12345"


def test_test_control_connection_empty_url():
    ok, msg, ms = installer_gui.test_control_connection("")
    assert not ok
    assert "required" in msg.lower()


def test_test_control_connection_success(monkeypatch):
    mock_resp = MagicMock()
    mock_resp.status = 200
    mock_resp.__enter__.return_value = mock_resp

    with patch("urllib.request.urlopen", return_value=mock_resp):
        ok, msg, ms = installer_gui.test_control_connection("https://mock-domain.com", "token123")
        assert ok is True
        assert "Connected to" in msg


def test_test_control_connection_unauthorized(monkeypatch):
    import urllib.error

    def mock_urlopen(req, timeout=6.0):
        if "poll" in req.full_url:
            raise urllib.error.HTTPError(req.full_url, 401, "Unauthorized", {}, None)
        resp = MagicMock()
        resp.status = 200
        resp.__enter__.return_value = resp
        return resp

    monkeypatch.setattr("urllib.request.urlopen", mock_urlopen)
    ok, msg, ms = installer_gui.test_control_connection("https://mock-domain.com", "bad-token")
    assert ok is False
    assert "HTTP 401" in msg


def test_verify_installation_mock(monkeypatch):
    # Mock subprocess run returning success with all modules
    mock_proc = MagicMock()
    mock_proc.stdout = "aiortc: 1.15.0\nav: 17.1.0\nPIL: 13.0.0\npsutil: 7.2.2\npydantic: 2.14.1\ncryptography: 50.0.2\nfastapi: 0.115.0\nuvicorn: 0.30.0\npystray: 0.19.5\n"
    mock_proc.stderr = ""
    mock_proc.returncode = 0

    with patch("subprocess.run", return_value=mock_proc):
        logs = []
        res = installer_gui.verify_installation(Path("mock_python.exe"), log_cb=logs.append)
        assert res["aiortc"] is True
        assert res["av"] is True
        assert res["PIL"] is True
        assert res["psutil"] is True
        assert res["pystray"] is True
        assert any("[OK]" in log for log in logs)


def test_setup_virtualenv_reusing(tmp_path: Path):
    venv_dir = tmp_path / "venv"
    scripts_dir = venv_dir / "Scripts"
    scripts_dir.mkdir(parents=True)
    fake_python = scripts_dir / "python.exe"
    fake_python.write_text("#!mock python", encoding="utf-8")

    logs = []
    py_exe = installer_gui.setup_virtualenv(tmp_path, log_cb=logs.append)
    assert py_exe == fake_python
    assert any("Using existing virtual environment" in log for log in logs)


def test_assets_icon_exists():
    ico = Path("assets/ai-bridge.ico")
    png = Path("assets/ai-bridge.png")
    assert ico.exists(), "assets/ai-bridge.ico should exist"
    assert png.exists(), "assets/ai-bridge.png should exist"

