"""Tests for OAuth gateway device binding.

The gateway's DB path is env-overridable (AI_BRIDGE_OAUTH_DB) so tests
run against a throwaway SQLite file instead of /etc/ai-bridge-oauth.
"""
import os
import sqlite3
import sys
import tempfile
import time
from pathlib import Path

DB = Path(tempfile.gettempdir()) / "ai-bridge-test-oauth.db"
os.environ["AI_BRIDGE_OAUTH_DB"] = str(DB)
os.environ["AI_BRIDGE_ADMIN_TOKEN"] = "test-admin"
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "deployment" / "oauth"))

import gateway  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402


def _fresh_client():
    if DB.exists():
        DB.unlink()
    gateway.init_db()
    return TestClient(gateway.app, raise_server_exceptions=False)


def _register(client):
    r = client.post("/oauth/register", json={"redirect_uris": ["https://example.com/cb"],
                                       "client_name": "test-app"})
    assert r.status_code == 200, r.text
    return r.json()["client_id"]


def _approve(client, client_id, device_token=""):
    return client.post(
        "/oauth/authorize",
        data={"client_id": client_id, "redirect_uri": "https://example.com/cb",
              "scope": "", "state": "s", "code_challenge": "", "code_challenge_method": "",
              "admin_token": "test-admin", "device_token": device_token,
              "action": "approve"},
        follow_redirects=False,
    )


def _binding(client_id):
    conn = sqlite3.connect(DB)
    row = conn.execute("SELECT device_id FROM clients WHERE client_id=?", (client_id,)).fetchone()
    conn.close()
    return row[0] if row else None


def test_approve_binds_device_and_verify_returns_it(monkeypatch):
    client = _fresh_client()
    cid = _register(client)
    monkeypatch.setattr(gateway, "resolve_device_token",
                        lambda t: "dev-123" if t == "good-token" else None)
    r = _approve(client, cid, device_token="good-token")
    assert r.status_code == 302, r.text
    assert "code=" in r.headers["location"]
    assert _binding(cid) == "dev-123"

    now = int(time.time())
    conn = sqlite3.connect(DB)
    conn.execute("INSERT INTO tokens (token_hash, kind, client_id, scope, created_at, expires_at, revoked)"
                 " VALUES (?, 'access', ?, '', ?, ?, 0)",
                 (gateway.digest("tok-1"), cid, now, now + 3600))
    conn.commit()
    conn.close()
    r = client.get("/internal/verify", headers={"Authorization": "Bearer tok-1"})
    assert r.status_code == 200
    assert r.json()["device_id"] == "dev-123"


def test_blank_or_invalid_device_token_rejected(monkeypatch):
    client = _fresh_client()
    cid = _register(client)
    monkeypatch.setattr(gateway, "resolve_device_token",
                        lambda t: "dev-123" if t == "good-token" else None)

    # Blank device token is rejected because device_token is required
    r_blank = _approve(client, cid, device_token="")
    assert r_blank.status_code == 401
    assert "Device token is required" in r_blank.text
    assert _binding(cid) in ("", None)

    # Invalid device token is rejected
    r_bad = _approve(client, cid, device_token="bad-token")
    assert r_bad.status_code == 401
    assert "Invalid device token" in r_bad.text
    assert _binding(cid) in ("", None)

    # Valid device token succeeds and binds the client
    r_ok = _approve(client, cid, device_token="good-token")
    assert r_ok.status_code == 302
    assert _binding(cid) == "dev-123"


def test_admin_token_verify_is_unbound():
    client = _fresh_client()
    r = client.get("/internal/verify", headers={"Authorization": "Bearer test-admin"})
    assert r.status_code == 200
    assert r.json()["device_id"] is None
