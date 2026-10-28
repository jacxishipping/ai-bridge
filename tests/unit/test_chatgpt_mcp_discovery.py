"""Tests for ChatGPT / remote MCP discovery and stateless HTTP compliance.

Verifies:
1. FastMCP server runs with stateless_http=True and json_response=True so
   stateless clients (e.g. openai-mcp, ChatGPT Actions, curl) can directly
   query tools/list without a session ID or SSE requirement.
2. Accept headers like */* or omitted are normalized so FastMCP content
   negotiation never returns 406 Not Acceptable.
3. Path variations (/, /mcp/) rewrite cleanly to /mcp.
4. OAuth gateway provides compliant /.well-known/openid-configuration
   and lowercase "bearer" token_type in /oauth/token.
"""
import os
import sys
from pathlib import Path

from fastapi.testclient import TestClient as APITestClient
from starlette.testclient import TestClient as StarletteTestClient

# Add deployment/oauth to path
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "deployment" / "oauth"))
import gateway  # noqa: E402
from ai_bridge.server import create_http_app  # noqa: E402

ADMIN = "test-admin-secret"


def test_gateway_openid_configuration(monkeypatch):
    monkeypatch.setenv("AI_BRIDGE_ADMIN_TOKEN", ADMIN)
    client = APITestClient(gateway.app)
    res = client.get("/.well-known/openid-configuration")
    assert res.status_code == 200
    data = res.json()
    assert "authorization_endpoint" in data
    assert "token_endpoint" in data
    assert "scopes_supported" in data
    assert "offline_access" in data["scopes_supported"]


def test_gateway_token_type_lowercase():
    pair = gateway.issue_pair("test-client", "mcp")
    assert pair["token_type"] == "bearer"
    assert "refresh_token" in pair
    assert pair["expires_in"] > 0


def test_streamable_http_accept_and_path_normalization(monkeypatch):
    monkeypatch.setenv("AI_BRIDGE_ADMIN_TOKEN", ADMIN)
    app = create_http_app()
    with StarletteTestClient(app, base_url="http://localhost:8001") as client:
        headers = {
            "Authorization": f"Bearer {ADMIN}",
            "Content-Type": "application/json",
            "Accept": "*/*",
        }
        # 1. tools/list with Accept: */*
        r1 = client.post("/mcp", headers=headers, json={"jsonrpc": "2.0", "id": 1, "method": "tools/list", "params": {}})
        assert r1.status_code == 200, f"Expected 200, got {r1.status_code}: {r1.text}"
        data1 = r1.json()
        assert "result" in data1
        assert "tools" in data1["result"]
        assert any(t["name"] == "system_info" for t in data1["result"]["tools"])

        # 2. tools/list without Accept header
        no_accept_headers = {
            "Authorization": f"Bearer {ADMIN}",
            "Content-Type": "application/json",
        }
        r2 = client.post("/mcp", headers=no_accept_headers, json={"jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {}})
        assert r2.status_code == 200, f"Expected 200 without Accept: {r2.text}"

        # 3. Path / normalization
        r3 = client.post("/", headers=headers, json={"jsonrpc": "2.0", "id": 3, "method": "tools/list", "params": {}})
        assert r3.status_code == 200, f"Expected 200 on /: {r3.text}"

        # 4. Path /mcp/ normalization
        r4 = client.post("/mcp/", headers=headers, json={"jsonrpc": "2.0", "id": 4, "method": "tools/list", "params": {}})
        assert r4.status_code == 200, f"Expected 200 on /mcp/: {r4.text}"
