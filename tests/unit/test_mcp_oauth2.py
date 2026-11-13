"""Tests for automated OAuth 2.0 / 2.1 outbound MCP authentication & refresh."""
from __future__ import annotations

import json
import time
import urllib.parse

from fastapi.testclient import TestClient

from ai_bridge.control import mcp_oauth
from ai_bridge.control.app import create_app


ADMIN = "test-admin-token-oauth2"


def test_mcp_oauth2_client_credentials_and_auto_refresh(monkeypatch, tmp_path):
    token_calls = []

    def fake_urlopen(req, timeout=12.0):
        url = req.full_url
        body = req.data.decode("utf-8") if req.data else ""

        class _Resp:
            def __init__(self, payload, status=200):
                self._payload = payload
                self.status = status

            def read(self):
                return json.dumps(self._payload).encode("utf-8")

            def __enter__(self):
                return self

            def __exit__(self, *a):
                return False

        if url == "https://ext.example.com/oauth/token":
            token_calls.append(body)
            return _Resp({
                "access_token": f"tok-{len(token_calls)}",
                "token_type": "Bearer",
                "expires_in": 3600,
            })
        if url == "https://ext.example.com/mcp":
            auth = req.headers.get("Authorization", "")
            assert auth == f"Bearer tok-{len(token_calls)}"
            req_json = json.loads(body)
            if req_json.get("method") == "tools/list":
                return _Resp({"jsonrpc": "2.0", "id": 1, "result": {"tools": [{"name": "ping", "description": "Ping"}]}})
            return _Resp({"jsonrpc": "2.0", "id": 1, "result": {"content": [{"type": "text", "text": "pong"}]}})
        raise AssertionError(f"Unexpected URL: {url}")

    monkeypatch.setattr(mcp_oauth.urllib.request, "urlopen", fake_urlopen)
    import ai_bridge.control.mcp_client as mcp_client_mod
    monkeypatch.setattr(mcp_client_mod.urllib.request, "urlopen", fake_urlopen)

    app = create_app(db_path=tmp_path / "ctrl.db", admin_token=ADMIN)
    c = TestClient(app)

    r = c.post(
        "/api/mcp/servers",
        json={
            "name": "Ext M2M",
            "url": "https://ext.example.com/mcp",
            "auth_type": "oauth2_client_credentials",
            "oauth_token_url": "https://ext.example.com/oauth/token",
            "oauth_client_id": "cid-1",
            "oauth_client_secret": "csec-1",
            "oauth_scopes": "mcp:read",
        },
        headers={"X-Admin-Token": ADMIN},
    )
    assert r.status_code == 200, r.text
    srv = r.json()["server"]
    assert srv["status"] == "healthy"
    assert srv["oauth_connected"] is True
    assert srv["oauth_secret_configured"] is True
    assert srv["tools_count"] == 1
    assert len(token_calls) == 1

    # Simulate token near expiry and verify sync auto-refreshes to tok-2
    conn = app.state.conn
    conn.execute("UPDATE mcp_servers SET oauth_token_expires_at=? WHERE id=?", (time.time() + 10, srv["id"]))
    conn.commit()

    r_sync = c.post(f"/api/mcp/servers/{srv['id']}/sync", headers={"X-Admin-Token": ADMIN})
    assert r_sync.status_code == 200 and r_sync.json()["ok"] is True
    assert len(token_calls) == 2


def test_mcp_oauth2_pkce_discovery_dcr_and_callback(monkeypatch, tmp_path):
    def fake_urlopen(req, timeout=12.0):
        url = req.full_url
        body = req.data.decode("utf-8") if req.data else ""

        class _Resp:
            def __init__(self, payload, status=200):
                self._payload = payload
                self.status = status

            def read(self):
                return json.dumps(self._payload).encode("utf-8")

            def __enter__(self):
                return self

            def __exit__(self, *a):
                return False

        if url.endswith("/.well-known/oauth-protected-resource/mcp"):
            return _Resp({"authorization_servers": ["https://auth.example.com"]})
        if url == "https://auth.example.com/.well-known/oauth-authorization-server":
            return _Resp({
                "issuer": "https://auth.example.com",
                "authorization_endpoint": "https://auth.example.com/authorize",
                "token_endpoint": "https://auth.example.com/token",
                "registration_endpoint": "https://auth.example.com/register",
            })
        if url == "https://auth.example.com/register":
            return _Resp({"client_id": "dcr-client-99"})
        if url == "https://auth.example.com/token":
            form = urllib.parse.parse_qs(body)
            assert form["client_id"] == ["dcr-client-99"]
            assert form["code"] == ["auth-code-xyz"]
            assert "code_verifier" in form
            return _Resp({
                "access_token": "pkce-access-1",
                "refresh_token": "pkce-refresh-1",
                "expires_in": 3600,
            })
        if url == "https://mcp.example.com/mcp":
            assert req.headers.get("Authorization") == "Bearer pkce-access-1"
            return _Resp({"jsonrpc": "2.0", "id": 1, "result": {"tools": [{"name": "search", "description": "Search"}]}})
        raise AssertionError(f"Unexpected URL: {url}")

    monkeypatch.setattr(mcp_oauth.urllib.request, "urlopen", fake_urlopen)
    import ai_bridge.control.mcp_client as mcp_client_mod
    monkeypatch.setattr(mcp_client_mod.urllib.request, "urlopen", fake_urlopen)

    app = create_app(db_path=tmp_path / "ctrl.db", admin_token=ADMIN)
    c = TestClient(app)

    # 1. Create PKCE server (auto-discovers endpoints, enters pending_auth)
    r = c.post(
        "/api/mcp/servers",
        json={"name": "Cloud MCP", "url": "https://mcp.example.com/mcp", "auth_type": "oauth2_pkce"},
        headers={"X-Admin-Token": ADMIN},
    )
    assert r.status_code == 200, r.text
    srv = r.json()["server"]
    assert srv["status"] == "pending_auth"
    assert srv["oauth_auth_url"] == "https://auth.example.com/authorize"

    # 2. Start OAuth2 PKCE flow (triggers DCR and returns authorize_url)
    r_start = c.post(f"/api/mcp/servers/{srv['id']}/oauth/start", headers={"X-Admin-Token": ADMIN})
    assert r_start.status_code == 200, r_start.text
    auth_url = r_start.json()["authorize_url"]
    qs = urllib.parse.parse_qs(urllib.parse.urlparse(auth_url).query)
    assert qs["client_id"] == ["dcr-client-99"]
    assert qs["code_challenge_method"] == ["S256"]
    state = qs["state"][0]

    # 3. Simulate browser callback
    r_cb = c.get(f"/api/mcp/oauth/callback?state={urllib.parse.quote(state)}&code=auth-code-xyz")
    assert r_cb.status_code == 200
    assert "MCP Service Authorized" in r_cb.text

    # 4. Verify server is now healthy, connected, and has discovered tools
    r_list = c.get("/api/mcp/servers", headers={"X-Admin-Token": ADMIN})
    srv_after = r_list.json()["servers"][0]
    assert srv_after["status"] == "healthy"
    assert srv_after["oauth_connected"] is True
    assert srv_after["oauth_has_refresh_token"] is True
    assert srv_after["tools_count"] == 1
