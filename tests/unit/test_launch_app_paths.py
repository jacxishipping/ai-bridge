"""Tests for the launch_approved_application App Paths fallback: on
Windows, allowlisted names like chrome resolve through the App Paths
registry keys when they are not on PATH (Chrome's install dir is not
on PATH, so a bare Popen would otherwise report "not found")."""

import sys
import types

import pytest

from ai_bridge import tools
from ai_bridge.policy import Policy

CHROME_KEY = r"SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe"
CHROME_PATH = r"C:\Program Files\Google\Chrome\Application\chrome.exe"


class FakeKey:
    def __init__(self, path):
        self.path = path

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


def _fake_winreg(entries):
    mod = types.ModuleType("winreg")
    mod.HKEY_LOCAL_MACHINE = "HKLM"
    mod.HKEY_CURRENT_USER = "HKCU"

    def OpenKey(root, path):
        if path in entries:
            return FakeKey(path)
        raise OSError("no such key")

    def QueryValueEx(key, name):
        return (entries[key.path], 0)

    mod.OpenKey = OpenKey
    mod.QueryValueEx = QueryValueEx
    return mod


def _allow_chrome(monkeypatch):
    monkeypatch.setattr(tools, "_check", lambda *a, **k: None)
    monkeypatch.setattr(
        tools,
        "default_policy",
        lambda: Policy(desktop_enabled=True, allow_tier3=True, allowed_apps=frozenset({"chrome"})),
    )


def test_resolve_passthrough_off_windows(monkeypatch):
    monkeypatch.setattr(tools.os, "name", "posix")
    assert tools._resolve_app_executable("chrome") == "chrome"
    assert tools._resolve_app_executable(CHROME_PATH) == CHROME_PATH


def test_resolve_uses_app_paths_on_windows(monkeypatch):
    monkeypatch.setattr(tools.os, "name", "nt")
    monkeypatch.setitem(sys.modules, "winreg", _fake_winreg({CHROME_KEY: CHROME_PATH}))
    assert tools._resolve_app_executable("chrome") == CHROME_PATH
    assert tools._resolve_app_executable("chrome.exe") == CHROME_PATH
    assert tools._resolve_app_executable("nosuchapp") == "nosuchapp"


def test_launch_falls_back_to_app_paths(monkeypatch):
    _allow_chrome(monkeypatch)
    monkeypatch.setattr(tools.os, "name", "nt")
    monkeypatch.setitem(sys.modules, "winreg", _fake_winreg({CHROME_KEY: CHROME_PATH}))
    seen = {}

    def fake_popen(argv, **kwargs):
        if argv[0] == "chrome":
            raise FileNotFoundError("chrome")
        seen["argv"] = argv
        assert kwargs.get("shell") is False
        return object()

    monkeypatch.setattr(tools.subprocess, "Popen", fake_popen)
    result = tools.launch_approved_application("chrome", approval_granted=True, url="https://www.copart.com")
    assert result == {"launched": "chrome", "url": "https://www.copart.com"}
    assert seen["argv"] == [CHROME_PATH, "https://www.copart.com"]


def test_launch_not_found_without_app_paths_entry(monkeypatch):
    _allow_chrome(monkeypatch)
    monkeypatch.setattr(tools.os, "name", "nt")
    monkeypatch.setitem(sys.modules, "winreg", _fake_winreg({}))

    def fake_popen(argv, **kwargs):
        raise FileNotFoundError("chrome")

    monkeypatch.setattr(tools.subprocess, "Popen", fake_popen)
    with pytest.raises(ValueError, match="not found"):
        tools.launch_approved_application("chrome", approval_granted=True)
