"""Unit tests for the AI API integration (/api/ai/tools, /api/ai/execute, /api/ai/agent, /v1/chat/completions, and AIBridgeClient)."""
from __future__ import annotations

import json
import tempfile
import threading
import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from ai_bridge.client import AIBridgeClient, AIBridgeError
from ai_bridge.control.app import create_app

ADMIN_TOKEN = "test-ai-admin-token"


@pytest.fixture
def fresh_client():
    tmp_dir = Path(tempfile.mkdtemp())
    db = tmp_dir / "test_ai_control.db"
    app = create_app(admin_token=ADMIN_TOKEN, db_path=db)
    client = TestClient(app)
    return client, app


def test_ai_tools_formats(fresh_client):
    client, _ = fresh_client

    # 1. Raw format (default)
    res_raw = client.get("/api/ai/tools", headers={"Authorization": f"Bearer {ADMIN_TOKEN}"})
    assert res_raw.status_code == 200
    data_raw = res_raw.json()
    assert data_raw["ok"] is True
    assert data_raw["count"] > 10
    tool_names = [t["name"] for t in data_raw["tools"]]
    assert "run_shell" in tool_names
    assert "take_screenshot" in tool_names
    assert "mouse_click" in tool_names

    # 2. OpenAI format
    res_oai = client.get("/api/ai/tools?format=openai", headers={"X-Admin-Token": ADMIN_TOKEN})
    assert res_oai.status_code == 200
    data_oai = res_oai.json()
    for t in data_oai["tools"]:
        assert t["type"] == "function"
        assert "name" in t["function"]
        assert "description" in t["function"]
        assert "parameters" in t["function"]

    # 3. Anthropic format
    res_ant = client.get("/api/ai/tools?format=anthropic", headers={"Authorization": f"Bearer {ADMIN_TOKEN}"})
    assert res_ant.status_code == 200
    data_ant = res_ant.json()
    for t in data_ant["tools"]:
        assert "name" in t
        assert "input_schema" in t

    # 4. Gemini format
    res_gem = client.get("/api/ai/tools?format=gemini", headers={"Authorization": f"Bearer {ADMIN_TOKEN}"})
    assert res_gem.status_code == 200
    data_gem = res_gem.json()
    for t in data_gem["tools"]:
        assert "name" in t
        assert "parameters" in t

    # 5. Category filter
    res_desk = client.get("/api/ai/tools?category=desktop", headers={"Authorization": f"Bearer {ADMIN_TOKEN}"})
    assert res_desk.status_code == 200
    for t in res_desk.json()["tools"]:
        assert t["category"] == "desktop"


def test_ai_tools_auth_required(fresh_client):
    client, _ = fresh_client
    res = client.get("/api/ai/tools")
    assert res.status_code == 401


def test_bearer_auth_normalization_on_standard_endpoints(fresh_client):
    client, _ = fresh_client
    # Standard endpoints like /api/devices and /api/tasks accept Authorization: Bearer
    res = client.get("/api/devices", headers={"Authorization": f"Bearer {ADMIN_TOKEN}"})
    assert res.status_code == 200
    res_tasks = client.get("/api/tasks", headers={"Authorization": f"Bearer {ADMIN_TOKEN}"})
    assert res_tasks.status_code == 200


def test_ai_execute_local_tool(fresh_client):
    client, _ = fresh_client
    res = client.post(
        "/api/ai/execute",
        json={"tool": "list_workspace", "device": "local", "args": {"relative_directory": "."}},
        headers={"Authorization": f"Bearer {ADMIN_TOKEN}"},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["ok"] is True
    assert data["status"] == "completed"
    assert data["tool"] == "list_workspace"
    assert isinstance(data["result"], list)


def test_ai_execute_device_flow(fresh_client):
    client, _ = fresh_client

    # Enroll a Linux server device
    enroll_res = client.post(
        "/api/devices/enroll",
        json={"name": "ubuntu-srv", "hostname": "srv1", "os": "Linux Ubuntu 24.04", "unrestricted": True},
        headers={"X-Admin-Token": ADMIN_TOKEN},
    )
    assert enroll_res.status_code == 200
    dev_info = enroll_res.json()
    dev_id = dev_info["device_id"]
    dev_token = dev_info["device_token"]

    # Background simulator for agent execution
    def agent_worker():
        for _ in range(50):
            nxt = client.get("/api/agent/tasks/next", headers={"X-Device-Token": dev_token})
            if nxt.status_code == 200:
                t = nxt.json().get("task")
                if t:
                    task_id = t["id"]
                    # Mark completed with dummy result
                    client.post(
                        f"/api/agent/tasks/{task_id}/result",
                        json={"status": "completed", "result": json.dumps({"output": "Linux srv1 6.8.0 x86_64"})},
                        headers={"X-Device-Token": dev_token},
                    )
                    return
            time.sleep(0.05)

    th = threading.Thread(target=agent_worker, daemon=True)
    th.start()

    # Client executes tool synchronously targeting the device by name!
    res = client.post(
        "/api/ai/execute",
        json={"tool": "run_shell", "device": "ubuntu-srv", "args": {"command": "uname -a"}, "timeout": 5},
        headers={"Authorization": f"Bearer {ADMIN_TOKEN}"},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["ok"] is True
    assert data["status"] == "completed"
    assert data["device_name"] == "ubuntu-srv"
    assert data["result"]["output"] == "Linux srv1 6.8.0 x86_64"
    th.join(timeout=2)


def test_ai_execute_unknown_device(fresh_client):
    client, _ = fresh_client
    res = client.post(
        "/api/ai/execute",
        json={"tool": "run_shell", "device": "non-existent-device-xyz", "args": {"command": "dir"}},
        headers={"Authorization": f"Bearer {ADMIN_TOKEN}"},
    )
    assert res.status_code == 404
    assert "not found" in res.json()["detail"].lower()


def test_ai_agent_smart_intent(fresh_client):
    client, _ = fresh_client

    # Enroll a device
    client.post(
        "/api/devices/enroll",
        json={"name": "windows-workstation", "hostname": "win11", "os": "Windows 11 Pro"},
        headers={"X-Admin-Token": ADMIN_TOKEN},
    )

    # Ask for fleet list via natural language
    res = client.post(
        "/api/ai/agent",
        json={"prompt": "list all connected devices in our fleet"},
        headers={"Authorization": f"Bearer {ADMIN_TOKEN}"},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["ok"] is True
    assert data["provider"] == "smart-intent"
    assert "windows-workstation" in data["response"]


def test_openai_chat_completions_endpoint(fresh_client):
    client, _ = fresh_client

    # Query /v1/models
    res_models = client.get("/v1/models")
    assert res_models.status_code == 200
    models_data = res_models.json()
    assert "data" in models_data
    model_ids = [m["id"] for m in models_data["data"]]
    assert "ai-bridge-agent" in model_ids

    # Post to /v1/chat/completions
    res = client.post(
        "/v1/chat/completions",
        json={
            "model": "ai-bridge-agent",
            "messages": [{"role": "user", "content": "list devices"}],
        },
        headers={"Authorization": f"Bearer {ADMIN_TOKEN}"},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["object"] == "chat.completion"
    assert len(data["choices"]) == 1
    assert "role" in data["choices"][0]["message"]
    assert data["choices"][0]["message"]["role"] == "assistant"
    assert data["choices"][0]["message"]["content"]


def test_ai_fleet_endpoint(fresh_client):
    client, _ = fresh_client
    client.post(
        "/api/devices/enroll",
        json={"name": "win-box", "hostname": "winbox", "os": "Windows Server 2025"},
        headers={"X-Admin-Token": ADMIN_TOKEN},
    )
    res = client.get("/api/ai/devices", headers={"Authorization": f"Bearer {ADMIN_TOKEN}"})
    assert res.status_code == 200
    data = res.json()
    assert data["ok"] is True
    assert len(data["devices"]) >= 1
    win = [d for d in data["devices"] if d["name"] == "win-box"][0]
    assert win["capabilities"]["desktop_gui"] is True
    assert win["capabilities"]["screenshot"] is True


def test_ai_bridge_client_sdk(monkeypatch):
    sdk = AIBridgeClient(base_url="http://test-server:8000", token="test-token")
    assert sdk.base_url == "http://test-server:8000"
    assert sdk.token == "test-token"

    calls = []

    def mock_request(method, path, payload=None, params=None, timeout=None):
        calls.append({"method": method, "path": path, "payload": payload, "params": params})
        if path == "/api/ai/devices":
            return {"ok": True, "devices": [{"id": "d1", "name": "ubuntu-srv", "os": "Linux"}]}
        if path == "/api/ai/tools":
            return {"ok": True, "tools": [{"name": "run_shell"}]}
        if path == "/api/ai/execute":
            return {"ok": True, "result": {"output": "hello world", "width": 1920, "height": 1080}}
        if path == "/api/ai/agent":
            return {"ok": True, "response": "done"}
        if path == "/v1/chat/completions":
            return {"choices": [{"message": {"content": "pong"}}]}
        return {}

    monkeypatch.setattr(sdk, "_request", mock_request)

    # Test list_devices & get_device
    devs = sdk.list_devices()
    assert len(devs) == 1
    assert devs[0]["name"] == "ubuntu-srv"
    dev = sdk.get_device("ubuntu-srv")
    assert dev["id"] == "d1"

    # Test get_tools
    tools = sdk.get_tools(format="openai")
    assert len(tools) == 1
    assert calls[-1]["params"]["format"] == "openai"

    # Test run_shell
    out = sdk.run_shell("echo hi", device="ubuntu-srv")
    assert out["output"] == "hello world"
    assert calls[-1]["payload"]["tool"] == "run_shell"

    # Test desktop GUI helpers
    shot = sdk.take_screenshot(device="win-box")
    assert shot["width"] == 1920

    sdk.mouse_click(150, 250, device="win-box")
    assert calls[-1]["payload"]["args"]["x"] == 150

    sdk.keyboard_type("test text", device="win-box")
    assert calls[-1]["payload"]["args"]["text"] == "test text"

    sdk.keyboard_press("enter", device="win-box")
    assert calls[-1]["payload"]["args"]["key"] == "enter"

    # Test agent & chat
    agent_res = sdk.run_agent("do something")
    assert agent_res["ok"] is True

    chat_res = sdk.chat([{"role": "user", "content": "ping"}])
    assert chat_res["choices"][0]["message"]["content"] == "pong"


def test_ai_settings_endpoints(fresh_client):
    client, _ = fresh_client

    # 1. Initial settings
    res = client.get("/api/settings/ai", headers={"Authorization": f"Bearer {ADMIN_TOKEN}"})
    assert res.status_code == 200
    data = res.json()
    assert data["ok"] is True
    assert "keys_configured" in data

    # 2. Save an API key (bypass live probe by setting test_connection=False or using ollama)
    save_res = client.post(
        "/api/settings/ai",
        json={"provider": "ollama", "model": "llama3.2", "test_connection": False},
        headers={"Authorization": f"Bearer {ADMIN_TOKEN}"},
    )
    assert save_res.status_code == 200
    save_data = save_res.json()
    assert save_data["ok"] is True
    assert save_data["provider"] == "ollama"

    # 3. Save an OpenAI key with test_connection=False
    save_oai = client.post(
        "/api/settings/ai",
        json={"provider": "openai", "model": "gpt-4o", "api_key": "sk-proj-test1234567890abcdef", "test_connection": False},
        headers={"Authorization": f"Bearer {ADMIN_TOKEN}"},
    )
    assert save_oai.status_code == 200
    assert save_oai.json()["masked_key"].startswith("sk-proj")

    # 4. Check settings again
    res2 = client.get("/api/settings/ai", headers={"Authorization": f"Bearer {ADMIN_TOKEN}"})
    data2 = res2.json()
    assert data2["keys_configured"]["openai"] is True
    assert data2["masked_keys"]["openai"].startswith("sk-proj")

    # 5. Clear key
    clear_res = client.post(
        "/api/settings/ai",
        json={"provider": "openai", "clear": True},
        headers={"Authorization": f"Bearer {ADMIN_TOKEN}"},
    )
    assert clear_res.status_code == 200
    res3 = client.get("/api/settings/ai", headers={"Authorization": f"Bearer {ADMIN_TOKEN}"})
    assert res3.json()["keys_configured"]["openai"] is False


def test_ai_chat_endpoint(fresh_client):
    client, _ = fresh_client

    # Enroll a test device
    client.post(
        "/api/devices/enroll",
        json={"name": "srv-node", "hostname": "node1", "os": "Linux Ubuntu"},
        headers={"X-Admin-Token": ADMIN_TOKEN},
    )

    # Chat with smart intent
    res = client.post(
        "/api/ai/chat",
        json={
            "messages": [
                {"role": "user", "content": "list devices"},
            ],
            "device": "auto",
        },
        headers={"Authorization": f"Bearer {ADMIN_TOKEN}"},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["ok"] is True
    assert "message" in data
    assert data["message"]["role"] == "assistant"
    assert "srv-node" in data["message"]["content"]

