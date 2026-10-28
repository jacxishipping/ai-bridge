"""Tests for MCP Admin Token Authentication and Full Fleet Control.

Verifies:
1. MCP sessions authenticated with only the Admin Token have unrestricted access across all devices.
2. Tools accept an optional `device` argument to direct execution directly to any device in the fleet.
3. `select_device()` sets the default device for subsequent calls in the session.
4. `list_devices()` shows all fleet devices and local host with active indicators and routing hints.
"""
import pytest
from ai_bridge import server as mcp_server


ADMIN = "a0f63388f83290e1dec8cdba8a140a2bacfa4e6801d916bd"


def test_admin_mcp_fleet_routing(monkeypatch):
    monkeypatch.setenv("AI_BRIDGE_ADMIN_TOKEN", ADMIN)
    fake_devices = [
        {"id": "win-123", "name": "workstation-windows", "hostname": "PC-OFFICE", "os": "Windows", "status": "online"},
        {"id": "lin-456", "name": "server-ubuntu", "hostname": "prod-node-1", "os": "Linux", "status": "online"},
        {"id": "mac-789", "name": "laptop-macos", "hostname": "macbook-pro", "os": "Darwin", "status": "offline"},
    ]
    monkeypatch.setattr(mcp_server, "list_all_devices", lambda url, tok: fake_devices)

    routed_calls = []

    def fake_run_device_tool(url, tok, dev_id, tool, args):
        assert tok == ADMIN
        routed_calls.append({"dev_id": dev_id, "tool": tool, "args": args})
        return {"status": "completed", "dev_id": dev_id, "tool": tool, "output": f"executed {tool} on {dev_id}"}

    monkeypatch.setattr(mcp_server, "run_device_tool", fake_run_device_tool)

    try:
        # 1. list_devices returns local host + all 3 enrolled fleet devices
        devs = mcp_server.list_devices()
        dev_ids = [d["device_id"] for d in devs]
        assert dev_ids == ["local", "win-123", "lin-456", "mac-789"]

        # 2. Direct per-call device targeting via friendly name
        res1 = mcp_server.run_shell("dir", device="workstation-windows")
        assert res1["status"] == "completed"
        assert routed_calls[-1]["dev_id"] == "win-123"
        assert routed_calls[-1]["tool"] == "run_shell"
        assert routed_calls[-1]["args"] == {"command": "dir", "working_directory": "", "timeout": 0}

        # 3. Direct targeting via device ID
        res2 = mcp_server.system_info(device="lin-456")
        assert res2["status"] == "completed"
        assert routed_calls[-1]["dev_id"] == "lin-456"
        assert routed_calls[-1]["tool"] == "get_system_info"

        # 4. Direct targeting via hostname (case-insensitive)
        res3 = mcp_server.get_desktop_status(device="pc-office")
        assert res3["status"] == "completed"
        assert routed_calls[-1]["dev_id"] == "win-123"

        # 5. select_device switches default target for the session
        sel = mcp_server.select_device("server-ubuntu")
        assert sel["selected_device"] == "lin-456"
        assert sel["mode"] == "remote"

        # Calling without device argument now routes to server-ubuntu
        res4 = mcp_server.system_info()
        assert res4["status"] == "completed"
        assert routed_calls[-1]["dev_id"] == "lin-456"

        # Can override session device with explicit device="local"
        res_local = mcp_server.system_info(device="local")
        assert "system" in res_local  # local execution returns local dict

        # 6. get_device_status by friendly name
        status = mcp_server.get_device_status("workstation-windows")
        assert status["device_id"] == "win-123"
        assert status["os"] == "Windows"
        assert status["status"] == "online"

        # 7. Unknown device raises helpful error listing available machines
        with pytest.raises(ValueError, match="Unknown device 'phantom-pc'"):
            mcp_server.system_info(device="phantom-pc")

    finally:
        mcp_server._SELECTED_DEVICE.clear()
