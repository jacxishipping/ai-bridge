"""Unit tests for Windows GUI desktop automation (mouse, keyboard, window control)."""
from __future__ import annotations

import pytest

from ai_bridge import server as mcp_server
from ai_bridge import tools
from ai_bridge.control.dispatch import dispatch
from ai_bridge.policy import Policy, decide


def test_desktop_tools_policy_gating():
    # 1. Blocked when desktop_enabled is False
    p_disabled = Policy(allow_tier3=True, desktop_enabled=False)
    for tool_name in ["mouse_click", "mouse_move", "keyboard_type", "keyboard_press", "mouse_drag", "focus_window"]:
        d = decide(p_disabled, tool_name, approval_granted=True)
        assert not d.allowed
        assert "Desktop automation is not enabled" in d.reason

    # 2. Blocked when tier-3 is not allowed and unattended ceiling is low
    p_tier2 = Policy(allow_tier3=False, max_tier_unattended=2, desktop_enabled=True)
    d_click = decide(p_tier2, "mouse_click", approval_granted=False)
    assert not d_click.allowed
    assert d_click.needs_approval is True

    # 3. Allowed unattended when desktop_enabled and allow_tier3 are True
    p_allowed = Policy(allow_tier3=True, max_tier_unattended=3, desktop_enabled=True)
    for tool_name in ["mouse_click", "mouse_move", "mouse_scroll", "mouse_drag", "keyboard_type", "keyboard_press", "focus_window", "list_desktop_windows", "get_screen_size"]:
        d = decide(p_allowed, tool_name, approval_granted=False)
        assert d.allowed, f"Tool {tool_name} should be allowed unattended"


def test_mouse_actions_dispatch_and_routing(monkeypatch):
    seen = []

    def fake_win32(act, *, x=None, y=None, text=None, key=None, title=None, delta=-120, start_x=None, start_y=None):
        seen.append({
            "action": act, "x": x, "y": y, "text": text, "key": key,
            "title": title, "delta": delta, "start_x": start_x, "start_y": start_y,
        })
        return {"action": act, "status": "ok"}

    monkeypatch.setattr(tools, "_win32_ui_action", fake_win32)
    monkeypatch.setattr(tools.platform, "system", lambda: "Windows")

    p = Policy(allow_tier3=True, max_tier_unattended=3, desktop_enabled=True)

    # 1. mouse_click single left
    res = dispatch("mouse_click", {"x": 100, "y": 200, "button": "left", "clicks": 1}, policy=p)
    assert res["status"] == "ok"
    assert seen[-1]["action"] == "click" and seen[-1]["x"] == 100 and seen[-1]["y"] == 200

    # 2. mouse_click double right
    res = dispatch("mouse_click", {"x": 300, "y": 400, "button": "right", "clicks": 2}, policy=p)
    assert res["status"] == "ok"
    assert seen[-1]["action"] == "double_click"

    # 3. mouse_click right click
    res = dispatch("mouse_click", {"x": 300, "y": 400, "button": "right", "clicks": 1}, policy=p)
    assert res["status"] == "ok"
    assert seen[-1]["action"] == "right_click"

    # 4. mouse_move
    res = dispatch("mouse_move", {"x": 550, "y": 660}, policy=p)
    assert res["status"] == "ok"
    assert seen[-1]["action"] == "move_mouse" and seen[-1]["x"] == 550 and seen[-1]["y"] == 660

    # 5. mouse_scroll
    res = dispatch("mouse_scroll", {"delta": -240, "x": 500, "y": 500}, policy=p)
    assert res["status"] == "ok"
    assert seen[-1]["action"] == "scroll" and seen[-1]["delta"] == -240

    # 6. mouse_drag
    res = dispatch("mouse_drag", {"start_x": 50, "start_y": 50, "end_x": 250, "end_y": 300}, policy=p)
    assert res["status"] == "ok"
    assert seen[-1]["action"] == "drag" and seen[-1]["start_x"] == 50 and seen[-1]["x"] == 250


def test_keyboard_actions_dispatch_and_routing(monkeypatch):
    seen = []

    def fake_win32(act, *, x=None, y=None, text=None, key=None, title=None, delta=-120, start_x=None, start_y=None):
        seen.append({"action": act, "text": text, "key": key})
        return {"action": act, "status": "ok"}

    monkeypatch.setattr(tools, "_win32_ui_action", fake_win32)
    monkeypatch.setattr(tools.platform, "system", lambda: "Windows")

    p = Policy(allow_tier3=True, max_tier_unattended=3, desktop_enabled=True)

    # 1. keyboard_type
    res = dispatch("keyboard_type", {"text": "Hello, Windows Desktop!"}, policy=p)
    assert res["status"] == "ok"
    assert seen[-1]["action"] == "type_text"
    assert seen[-1]["text"] == "Hello, Windows Desktop!"

    # 2. keyboard_press (hotkey)
    res = dispatch("keyboard_press", {"key": "ctrl+c"}, policy=p)
    assert res["status"] == "ok"
    assert seen[-1]["action"] == "press_key"
    assert seen[-1]["key"] == "ctrl+c"


def test_window_management_and_screen_size(monkeypatch):
    seen = []

    def fake_win32(act, *, x=None, y=None, text=None, key=None, title=None, delta=-120, start_x=None, start_y=None):
        seen.append({"action": act, "title": title})
        if act == "list_windows":
            return {"action": "list_windows", "windows": [{"hwnd": 1234, "title": "Notepad", "bounds": [0, 0, 800, 600]}]}
        if act == "focus_window":
            return {"action": "focus_window", "focused": title}
        if act == "get_screen_size":
            return {"action": "get_screen_size", "width": 1920, "height": 1080}
        return {"action": act}

    monkeypatch.setattr(tools, "_win32_ui_action", fake_win32)
    monkeypatch.setattr(tools.platform, "system", lambda: "Windows")

    p = Policy(allow_tier3=True, max_tier_unattended=3, desktop_enabled=True)

    # list_desktop_windows
    w = dispatch("list_desktop_windows", {}, policy=p)
    assert len(w["windows"]) == 1
    assert w["windows"][0]["title"] == "Notepad"

    # focus_window
    f = dispatch("focus_window", {"title": "Notepad"}, policy=p)
    assert f["focused"] == "Notepad"

    # get_screen_size
    s = dispatch("get_screen_size", {}, policy=p)
    assert s["width"] == 1920 and s["height"] == 1080


def test_auto_route_to_windows_device_on_headless_host(monkeypatch):
    # Simulate MCP server running on a headless Linux host (e.g. Droplet)
    monkeypatch.setattr(mcp_server.platform, "system", lambda: "Linux")
    monkeypatch.setenv("AI_BRIDGE_ADMIN_TOKEN", "mock-token")

    mock_devices = [
        {"id": "drop-01", "name": "droplet-linux", "os": "Ubuntu 24.04", "status": "online"},
        {"id": "win-box-12", "name": "my-windows-pc", "os": "Windows 11 Pro", "status": "online"},
    ]
    monkeypatch.setattr(mcp_server, "list_all_devices", lambda url, token: mock_devices)

    target = mcp_server._find_default_windows_device()
    assert target == "win-box-12", f"Expected to find online Windows workstation 'win-box-12', got {target}"
