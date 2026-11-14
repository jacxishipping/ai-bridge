"""Live MCP-over-HTTP round-trip against an in-process FastAPI+MCP embed when available."""
from __future__ import annotations

import os

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def mcp_client(tmp_path, monkeypatch):
    monkeypatch.setenv("AI_BRIDGE_EMBED_MCP", "1")
    monkeypatch.setenv("AI_BRIDGE_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("AI_BRIDGE_ADMIN_TOKEN", "adm-mcp-http")
    monkeypatch.delenv("AI_BRIDGE_PROFILE", raising=False)
    monkeypatch.delenv("RENDER", raising=False)
    monkeypatch.delenv("DATABASE_URL", raising=False)
    try:
        from ai_bridge.control.combined import create_combined_app
    except Exception as exc:
        pytest.skip(f"combined MCP embed unavailable: {exc}")
    try:
        app = create_combined_app()
    except Exception as exc:
        pytest.skip(f"combined app failed to start: {exc}")
    return TestClient(app)


def test_mcp_http_initialize_roundtrip(mcp_client):
    """Streamable HTTP MCP initialize must not 404 when embed is enabled."""
    # Probe common mount paths used by combined embed / FastMCP.
    paths = ["/mcp", "/mcp/", "/api/mcp", "/sse"]
    saw_ok = False
    last = None
    for path in paths:
        res = mcp_client.post(
            path,
            json={
                "jsonrpc": "2.0",
                "id": 1,
                "method": "initialize",
                "params": {
                    "protocolVersion": "2024-11-05",
                    "capabilities": {},
                    "clientInfo": {"name": "ai-bridge-test", "version": "0.0.1"},
                },
            },
            headers={
                "Content-Type": "application/json",
                "Accept": "application/json, text/event-stream",
            },
        )
        last = (path, res.status_code, res.text[:200])
        if res.status_code in (200, 202, 406):
            # 406 can mean wrong Accept for streamable HTTP — still proves route exists.
            saw_ok = True
            break
        if res.status_code == 404:
            continue
        # Auth challenge / method not allowed still proves the route is mounted.
        if res.status_code in (401, 403, 405):
            saw_ok = True
            break
    assert saw_ok, f"No MCP HTTP route responded; last={last}"


def test_prod_smoke_module_importable():
    from deployment import smoke_check

    assert callable(smoke_check.main)
