"""Unit tests for the AI Bridge Windows all-in-one setup wizard."""
import json
import urllib.error
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


def test_write_client_config_never_stores_the_token(tmp_path: Path, monkeypatch):
    config_dir = tmp_path / ".ai-bridge"
    config_file = config_dir / "agent_gui.json"
    monkeypatch.setattr(installer_gui, "HOME_DIR", config_dir)
    monkeypatch.setattr(installer_gui, "CONFIG_FILE", config_file)

    installer_gui.write_client_config(
        "https://test-server.example.com/",
        {"autostart_client": True, "allowed_apps": ["notepad"]},
        lambda _line: None,
    )

    cfg = json.loads(config_file.read_text(encoding="utf-8"))
    assert cfg["control_url"] == "https://test-server.example.com"
    assert cfg["autostart_windows"] is True
    assert cfg["allowed_apps"] == ["notepad"]
    # The credential lives in device.token (DPAPI-sealed), never in this file.
    assert "device_token" not in cfg


def test_client_config_defaults_to_conservative_policy():
    cfg = installer_gui.client_config("https://plane.example", {})

    assert cfg["allow_shell"] is False
    assert cfg["allow_writes"] is False
    assert cfg["allow_tier3"] is False
    assert cfg["max_tier_unattended"] == 2


def test_client_config_honours_explicit_policy_opt_in():
    cfg = installer_gui.client_config(
        "https://plane.example", {"allow_shell": True, "allow_writes": True, "allow_tier3": True}
    )

    assert cfg["allow_shell"] is True
    assert cfg["allow_writes"] is True
    assert cfg["allow_tier3"] is True


def test_check_control_plane_requires_a_url():
    ok, message, _latency, token_ok = installer_gui.check_control_plane("")

    assert not ok
    assert "required" in message.lower()
    assert token_ok is False


def test_check_control_plane_reports_reachability_without_a_token():
    mock_resp = MagicMock()
    mock_resp.read.return_value = b"{}"
    mock_resp.__enter__.return_value = mock_resp

    with patch("urllib.request.urlopen", return_value=mock_resp) as urlopen:
        ok, message, _latency, token_ok = installer_gui.check_control_plane("https://mock-domain.com")

    assert ok is True
    assert token_ok is False
    # The real health route is /health; /api/health does not exist on the plane.
    assert urlopen.call_args[0][0].full_url == "https://mock-domain.com/health"


def test_check_control_plane_rejects_an_unauthorized_token():
    calls = {"n": 0}

    def fake_urlopen(req, timeout=None):
        calls["n"] += 1
        if calls["n"] == 1:
            resp = MagicMock()
            resp.read.return_value = b"{}"
            resp.__enter__.return_value = resp
            return resp
        raise urllib.error.HTTPError(req.full_url, 401, "Unauthorized", {}, None)

    with patch("urllib.request.urlopen", side_effect=fake_urlopen):
        ok, message, _latency, token_ok = installer_gui.check_control_plane(
            "https://mock-domain.com", "bad-token"
        )

    assert ok is False
    assert token_ok is False
    assert "401" in message


def test_verify_installation_reports_each_module():
    mock_proc = MagicMock(returncode=0, stdout="", stderr="")
    logs: list[str] = []

    with patch("subprocess.run", return_value=mock_proc):
        results = installer_gui.verify_installation(Path("mock_python.exe"), logs.append)

    assert set(results) >= {"aiortc", "av", "PIL", "psutil", "pystray"}
    assert all(results.values())
    assert any("[OK]" in line for line in logs)


def test_verify_installation_flags_a_missing_module():
    ok_proc = MagicMock(returncode=0)
    bad_proc = MagicMock(returncode=1)

    def fake_run(cmd, **kwargs):
        return bad_proc if "import aiortc" in cmd[-1] else ok_proc

    with patch("subprocess.run", side_effect=fake_run):
        results = installer_gui.verify_installation(Path("mock_python.exe"), lambda _line: None)

    assert results["aiortc"] is False
    assert results["fastapi"] is True


def test_create_environment_reuses_a_matching_venv(tmp_path: Path):
    venv_dir = tmp_path / "venv"
    scripts = venv_dir / "Scripts"
    scripts.mkdir(parents=True)
    fake_python = scripts / "python.exe"
    fake_python.write_text("", encoding="utf-8")

    system_python = tmp_path / "py312" / "python.exe"

    def probe(exe, args=()):
        if Path(exe) == fake_python:
            return ("3.12", str(fake_python))
        if Path(exe) == system_python:
            return ("3.12", str(system_python))
        return None

    logs: list[str] = []

    with patch.object(installer_gui, "_probe_python", side_effect=probe):
        result = installer_gui.create_environment(system_python, venv_dir, logs.append)

    assert result == fake_python
    assert any("Reusing existing" in line for line in logs)


def test_create_environment_rebuilds_a_venv_on_another_minor(tmp_path: Path):
    venv_dir = tmp_path / "venv"
    scripts = venv_dir / "Scripts"
    scripts.mkdir(parents=True)
    fake_python = scripts / "python.exe"
    fake_python.write_text("", encoding="utf-8")

    system_python = tmp_path / "py312" / "python.exe"
    state = {"rebuilt": False}

    def probe(exe, args=()):
        if Path(exe) == system_python:
            return ("3.12", str(system_python))
        if Path(exe) == fake_python:
            return ("3.12" if state["rebuilt"] else "3.15", str(fake_python))
        return None

    def fake_run(cmd, **kwargs):
        state["rebuilt"] = True
        fake_python.parent.mkdir(parents=True, exist_ok=True)
        fake_python.write_text("", encoding="utf-8")
        return MagicMock(returncode=0, stdout="", stderr="")

    logs: list[str] = []

    with patch.object(installer_gui, "_probe_python", side_effect=probe), \
         patch("subprocess.run", side_effect=fake_run):
        installer_gui.create_environment(system_python, venv_dir, logs.append)

    # A 3.15 venv must not be reused for a 3.12 install.
    assert any("REBUILD" in line for line in logs)
    assert state["rebuilt"] is True


def test_resolve_supported_python_explains_an_unsupported_only_machine(monkeypatch):
    monkeypatch.setattr(installer_gui.shutil, "which", lambda _name: None)
    monkeypatch.setattr(
        installer_gui, "_probe_python", lambda exe, args=(): ("3.15", str(exe))
    )
    monkeypatch.setattr(
        installer_gui, "detect_installed_pythons", lambda: [("3.15", "C:/py315/python.exe")]
    )

    with pytest.raises(installer_gui.InstallerError) as excinfo:
        installer_gui.resolve_supported_python()

    message = str(excinfo.value)
    assert "3.12" in message
    assert "3.15" in message


def test_assets_icon_exists():
    ico = Path("assets/ai-bridge.ico")
    png = Path("assets/ai-bridge.png")
    assert ico.exists(), "assets/ai-bridge.ico should exist"
    assert png.exists(), "assets/ai-bridge.png should exist"
