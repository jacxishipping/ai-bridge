"""Verify the GUI's config/token wiring without a display or Windows host.

Tkinter modules are stubbed at import time: only the persistence functions are
under test, and they must keep the bearer token out of the JSON config while
still round-tripping it through the dedicated token file.
"""
from __future__ import annotations

import json
import sys
import types
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "agents" / "windows"))


def _install_tkinter_stubs() -> None:
    tk = types.ModuleType("tkinter")
    for child in ("filedialog", "messagebox", "ttk"):
        module = types.ModuleType(f"tkinter.{child}")
        setattr(tk, child, module)
        sys.modules.setdefault(f"tkinter.{child}", module)
    sys.modules.setdefault("tkinter", tk)


_install_tkinter_stubs()

import app_runtime as runtime  # noqa: E402
import gui_app  # noqa: E402


@pytest.fixture()
def isolated_paths(tmp_path, monkeypatch):
    monkeypatch.setattr(gui_app, "CONFIG_DIR", tmp_path)
    monkeypatch.setattr(gui_app, "CONFIG_FILE", tmp_path / "agent_gui.json")
    monkeypatch.setattr(gui_app, "TOKEN_FILE", tmp_path / "device.token")
    monkeypatch.setattr(gui_app, "get_windows_autostart", lambda: False)
    monkeypatch.setattr(gui_app, "_detect_scheduled_task_defaults", lambda: ("", ""))
    return tmp_path


def test_token_is_never_written_to_the_json_config(isolated_paths):
    cfg = gui_app.load_agent_config()
    cfg["control_url"] = "https://control.example.test"
    cfg["device_token"] = "tok-abcdef123456"

    gui_app.save_agent_config(cfg)

    raw = (isolated_paths / "agent_gui.json").read_text(encoding="utf-8")
    assert "tok-abcdef123456" not in raw
    assert "device_token" not in json.loads(raw)
    assert json.loads(raw)["control_url"] == "https://control.example.test"

    token_file = isolated_paths / "device.token"
    # The token lives only in its own file, sealed with DPAPI where available.
    assert runtime.load_token(token_file) == "tok-abcdef123456"


def test_config_roundtrips_token_from_the_token_file_only(isolated_paths):
    cfg = gui_app.load_agent_config()
    cfg["device_token"] = "tok-abcdef123456"
    cfg["theme"] = "light"
    gui_app.save_agent_config(cfg)

    reloaded = gui_app.load_agent_config()

    assert reloaded["device_token"] == "tok-abcdef123456"
    assert reloaded["theme"] == "light"


def test_legacy_token_in_json_is_scrubbed_on_next_save(isolated_paths):
    (isolated_paths / "agent_gui.json").write_text(
        json.dumps({"control_url": "https://old.example.test", "device_token": "tok-legacy-999999"}),
        encoding="utf-8",
    )

    cfg = gui_app.load_agent_config()
    gui_app.save_agent_config(cfg)

    raw = (isolated_paths / "agent_gui.json").read_text(encoding="utf-8")
    assert "tok-legacy-999999" not in raw
    # The token itself still survives in its own file.
    assert gui_app.load_agent_config()["device_token"] == "tok-legacy-999999"
