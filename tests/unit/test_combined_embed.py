"""Embedded control+MCP+OAuth dispatcher used on Render."""
from __future__ import annotations

from pathlib import Path
import os

import pytest
from starlette.testclient import TestClient

from ai_bridge.device_routing import BindingError, resolve_binding, set_control_hook, set_verify_hook


def test_inprocess_verify_hook():
    set_verify_hook(lambda tok: {"ok": True, "device_id": "dev-1"} if tok == "good" else {"ok": False})
    try:
        assert resolve_binding("inprocess:", "good") == "dev-1"
        with pytest.raises(BindingError):
            resolve_binding("inprocess:", "bad")
    finally:
        set_verify_hook(None)


def test_combined_app_serves_mcp_and_health(monkeypatch, tmp_path):
    monkeypatch.setenv("AI_BRIDGE_EMBED_MCP", "1")
    monkeypatch.setenv("AI_BRIDGE_ADMIN_TOKEN", "test-admin-secret")
    monkeypatch.setenv("AI_BRIDGE_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("AI_BRIDGE_PUBLIC_URL", "https://ai-bridge-control.onrender.com")
    monkeypatch.setenv("AI_BRIDGE_OAUTH_ISSUER", "https://ai-bridge-control.onrender.com")
    monkeypatch.setenv(
        "AI_BRIDGE_MCP_ALLOWED_HOSTS",
        "testserver,ai-bridge-control.onrender.com,localhost:*,127.0.0.1:*",
    )
    monkeypatch.delenv("PORT", raising=False)

    # Fresh import path: ensure server picks up allowed hosts from env.
    import importlib

    import ai_bridge.control.combined as combined
    import ai_bridge.server as server

    importlib.reload(server)
    importlib.reload(combined)

    app = combined.create_combined_app()
    # Context manager starts FastMCP's streamable HTTP task group (lifespan).
    with TestClient(app) as client:
        health = client.get("/health")
        assert health.status_code == 200
        assert health.json()["status"] == "ok"

        install_sh = client.get("/install.sh")
        assert install_sh.status_code == 200, install_sh.text
        assert "device-token" in install_sh.text or "control-url" in install_sh.text

        install_ps1 = client.get("/install.ps1")
        assert install_ps1.status_code == 200, install_ps1.text
        assert "DeviceToken" in install_ps1.text or "ControlUrl" in install_ps1.text

        well_known = client.get("/.well-known/oauth-authorization-server")
        assert well_known.status_code == 200
        assert "authorization_endpoint" in well_known.json()

        headers = {
            "Authorization": "Bearer test-admin-secret",
            "Content-Type": "application/json",
            "Accept": "application/json, text/event-stream",
        }
        tools = client.post(
            "/mcp",
            headers=headers,
            json={"jsonrpc": "2.0", "id": 1, "method": "tools/list", "params": {}},
        )
        assert tools.status_code == 200, tools.text
        body = tools.json()
        assert "result" in body and "tools" in body["result"]


def test_combined_app_chatbot_lists_and_routes_enrolled_devices(monkeypatch, tmp_path):
    """External chatbots over /mcp and /api/ai/execute see enrolled devices, not only 'local'."""
    import importlib
    import json

    monkeypatch.setenv("AI_BRIDGE_EMBED_MCP", "1")
    monkeypatch.setenv("AI_BRIDGE_ADMIN_TOKEN", "test-admin-secret")
    monkeypatch.setenv("AI_BRIDGE_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("AI_BRIDGE_PUBLIC_URL", "https://ai-bridge-control.onrender.com")
    monkeypatch.setenv("AI_BRIDGE_CONTROL_URL", "https://ai-bridge-control.onrender.com")
    monkeypatch.setenv("AI_BRIDGE_OAUTH_ISSUER", "https://ai-bridge-control.onrender.com")
    monkeypatch.setenv(
        "AI_BRIDGE_MCP_ALLOWED_HOSTS",
        "testserver,ai-bridge-control.onrender.com,localhost:*,127.0.0.1:*",
    )
    monkeypatch.delenv("PORT", raising=False)

    import ai_bridge.control.combined as combined
    import ai_bridge.server as server

    importlib.reload(server)
    importlib.reload(combined)

    app = combined.create_combined_app()
    headers_admin = {"X-Admin-Token": "test-admin-secret"}
    mcp_headers = {
        "Authorization": "Bearer test-admin-secret",
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream",
    }
    try:
        with TestClient(app) as client:
            enr = client.post(
                "/api/devices/enroll",
                json={"name": "office-windows-pc", "hostname": "WIN-DESK-01", "os": "Windows 11"},
                headers=headers_admin,
            )
            assert enr.status_code == 200, enr.text
            dev_id = enr.json()["device_id"]

            # 1. MCP tools/call -> list_devices over /mcp
            r_list = client.post(
                "/mcp",
                headers=mcp_headers,
                json={
                    "jsonrpc": "2.0",
                    "id": 10,
                    "method": "tools/call",
                    "params": {"name": "list_devices", "arguments": {}},
                },
            )
            assert r_list.status_code == 200, r_list.text
            res_payload = r_list.json()["result"]
            structured = res_payload.get("structuredContent")
            if structured and "result" in structured:
                devices_out = structured["result"]
            else:
                text_items = [c.get("text", "") for c in res_payload.get("content", []) if c.get("type") == "text"]
                parsed = [json.loads(t) for t in text_items if t.strip()]
                devices_out = parsed[0] if len(parsed) == 1 and isinstance(parsed[0], list) else parsed
            names = [d.get("name") for d in devices_out]
            assert "local" in names and "office-windows-pc" in names, devices_out

            # 2. MCP tools/call -> select_device & get_device_status
            r_sel = client.post(
                "/mcp",
                headers=mcp_headers,
                json={
                    "jsonrpc": "2.0",
                    "id": 11,
                    "method": "tools/call",
                    "params": {"name": "select_device", "arguments": {"device_id": "office-windows-pc"}},
                },
            )
            assert r_sel.status_code == 200, r_sel.text
            sel_data = r_sel.json()["result"].get("structuredContent") or json.loads(
                r_sel.json()["result"]["content"][0]["text"]
            )
            assert sel_data["selected_device"] == dev_id
            assert sel_data["mode"] == "remote"

            r_stat = client.post(
                "/mcp",
                headers=mcp_headers,
                json={
                    "jsonrpc": "2.0",
                    "id": 12,
                    "method": "tools/call",
                    "params": {"name": "get_device_status", "arguments": {"device_id": "office-windows-pc"}},
                },
            )
            assert r_stat.status_code == 200, r_stat.text
            stat_data = r_stat.json()["result"].get("structuredContent") or json.loads(
                r_stat.json()["result"]["content"][0]["text"]
            )
            assert stat_data["device_id"] == dev_id
            assert stat_data["name"] == "office-windows-pc"

            # 3. /api/ai/execute -> list_devices (no device & device='auto') and select_device
            ai_list_1 = client.post("/api/ai/execute", headers=headers_admin, json={"tool": "list_devices"})
            assert ai_list_1.status_code == 200, ai_list_1.text
            ai_names_1 = [d["name"] for d in ai_list_1.json()["result"]["devices"]]
            assert "local" in ai_names_1 and "office-windows-pc" in ai_names_1

            ai_list_auto = client.post(
                "/api/ai/execute", headers=headers_admin, json={"tool": "list_devices", "device": "auto"}
            )
            assert ai_list_auto.status_code == 200, ai_list_auto.text
            ai_names_auto = [d["name"] for d in ai_list_auto.json()["result"]["devices"]]
            assert "local" in ai_names_auto and "office-windows-pc" in ai_names_auto

            ai_sel = client.post(
                "/api/ai/execute",
                headers=headers_admin,
                json={"tool": "select_device", "device": "auto", "args": {"device_id": "office-windows-pc"}},
            )
            assert ai_sel.status_code == 200, ai_sel.text
            assert ai_sel.json()["result"]["selected_device"] == dev_id
    finally:
        server._SELECTED_DEVICE.clear()
        set_control_hook(None)
        set_verify_hook(None)


def test_simple_fleet_default_access_mode_and_agent_config_persistence(monkeypatch, tmp_path: Path):
    """Verify 1-click default device routing, access-mode toggle, and Windows config persistence."""
    import importlib

    monkeypatch.setenv("AI_BRIDGE_EMBED_MCP", "1")
    monkeypatch.setenv("AI_BRIDGE_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("AI_BRIDGE_ADMIN_TOKEN", "test-admin-secret")
    monkeypatch.setenv("AI_BRIDGE_OAUTH_SECRET", "test-oauth-secret-min-32-bytes-long-ok")
    monkeypatch.setenv("AI_BRIDGE_PUBLIC_URL", "https://bridge.example.com")
    monkeypatch.setenv(
        "AI_BRIDGE_MCP_ALLOWED_HOSTS",
        "testserver,bridge.example.com,localhost:*,127.0.0.1:*",
    )
    monkeypatch.delenv("PORT", raising=False)

    import ai_bridge.control.combined as combined
    import ai_bridge.server as server

    importlib.reload(server)
    importlib.reload(combined)

    app = combined.create_combined_app()
    headers_admin = {"X-Admin-Token": "test-admin-secret"}
    try:
        with TestClient(app) as client:
            # 1. Enroll with unrestricted=True and set_default=True
            r1 = client.post(
                "/api/devices/enroll",
                json={"name": "home-win-pc", "os": "Windows", "unrestricted": True, "set_default": True},
                headers=headers_admin,
            )
            assert r1.status_code == 200, r1.text
            d1 = r1.json()
            assert d1["unrestricted"] is True
            assert d1["is_default"] is True

            # Enroll a second device without set_default
            r2 = client.post(
                "/api/devices/enroll",
                json={"name": "edge-linux", "os": "Linux", "unrestricted": False, "set_default": False},
                headers=headers_admin,
            )
            assert r2.status_code == 200, r2.text
            d2 = r2.json()
            assert d2["unrestricted"] is False
            assert d2["is_default"] is False

            # Simulate heartbeats so both devices are online
            assert client.post("/api/agent/heartbeat", headers={"X-Device-Token": d1["device_token"]}).status_code == 200
            assert client.post("/api/agent/heartbeat", headers={"X-Device-Token": d2["device_token"]}).status_code == 200

            # Toggle d2 access mode to unrestricted and make it the default target
            am = client.post(
                f"/api/devices/{d2['device_id']}/access-mode",
                json={"mode": "unrestricted"},
                headers=headers_admin,
            )
            assert am.status_code == 200 and am.json()["unrestricted"] is True

            sd = client.post(f"/api/devices/{d2['device_id']}/default", headers=headers_admin)
            assert sd.status_code == 200 and sd.json()["default_device_id"] == d2["device_id"]

            devs = client.get("/api/devices", headers=headers_admin).json()
            by_id = {d["id"]: d for d in devs}
            assert by_id[d2["device_id"]]["is_default"] is True
            assert by_id[d2["device_id"]]["unrestricted"] is True
            assert by_id[d1["device_id"]]["is_default"] is False

            # Toggle d2 back to guarded mode
            gm = client.post(
                f"/api/devices/{d2['device_id']}/access-mode",
                json={"mode": "guarded"},
                headers=headers_admin,
            )
            assert gm.status_code == 200 and gm.json()["unrestricted"] is False

            # Auto-routing without select_device targets the online default device (d2)
            assert server._auto_select_remote_device() == d2["device_id"]

            # Explicit select_device("local") overrides auto-routing cleanly
            sel_local = server.select_device("local")
            assert sel_local["mode"] == "local"
            assert server._session_explicitly_local() is True
            local_res = server.system_info()
            assert "system" in local_res

            # Unselecting restores automatic routing on non-local calls
            server._SELECTED_DEVICE.clear()
            routed_calls = []
            monkeypatch.setattr(
                server,
                "run_device_tool",
                lambda url, tok, dev_id, tool, args: routed_calls.append((dev_id, tool)) or {"ok": True, "dev": dev_id},
            )
            res_auto = server.system_info()
            assert res_auto["dev"] == d2["device_id"]
            assert routed_calls[-1] == (d2["device_id"], "get_system_info")

        # Windows agent config persistence roundtrip
        import agents.windows.agent_main as win_agent

        monkeypatch.setattr(Path, "home", lambda: tmp_path)
        tok_path = tmp_path / ".ai-bridge" / "device.token"
        win_agent._save_agent_config("https://bridge.example.com/", "dev-tok-12345", tok_path)
        resolved_url, resolved_tok = win_agent._resolve_saved_config("http://127.0.0.1:8000", "", tok_path)
        assert resolved_url == "https://bridge.example.com"
        assert resolved_tok == "dev-tok-12345"
    finally:
        server._SELECTED_DEVICE.clear()
        server._AUTO_DEVICE_CACHE.clear()
        set_control_hook(None)
        set_verify_hook(None)
