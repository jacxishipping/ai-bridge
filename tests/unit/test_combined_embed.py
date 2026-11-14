"""Embedded control+MCP+OAuth dispatcher used on Render."""
from __future__ import annotations

import os

import pytest
from starlette.testclient import TestClient

from ai_bridge.device_routing import BindingError, resolve_binding, set_verify_hook


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
