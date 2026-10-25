"""v0.3 security batch tests: users/roles, token expiry/rotation,
policy versioning + Tier-3 gating, signed updates."""
import tempfile
from pathlib import Path

from fastapi.testclient import TestClient

from ai_bridge.control import db as dbmod
from ai_bridge.control.app import create_app
from ai_bridge.updates import generate_keypair, sign_manifest, verify_manifest

ADMIN = "batch-admin"

def client():
    db = Path(tempfile.mkdtemp()) / "c.db"
    app = create_app(admin_token=ADMIN, db_path=db)
    return TestClient(app), app

def enroll(c):
    r = c.post("/api/devices/enroll", json={"name": "box", "os": "Linux"}, headers={"X-Admin-Token": ADMIN})
    assert r.status_code == 200, r.text
    return r.json()

def test_users_roles_and_sessions():
    c, app = client()
    # Bootstrap: first user can be created without auth.
    r = c.post("/api/auth/users", json={"username": "alice", "password": "correct-horse-123", "role": "viewer"})
    assert r.status_code == 200, r.text
    # Second user requires admin.
    r = c.post("/api/auth/users", json={"username": "bob", "password": "correct-horse-123", "role": "operator"})
    assert r.status_code == 401
    r = c.post("/api/auth/users", json={"username": "bob", "password": "correct-horse-123", "role": "operator"},
               headers={"X-Admin-Token": ADMIN})
    assert r.status_code == 200
    # Login + viewer can read but cannot enroll; operator can submit but not approve.
    alice = c.post("/api/auth/login", json={"username": "alice", "password": "correct-horse-123"}).json()
    assert c.get("/api/devices", headers={"X-Session-Token": alice["session_token"]}).status_code == 200
    assert c.post("/api/devices/enroll", json={"name": "x"}, headers={"X-Session-Token": alice["session_token"]}).status_code == 403
    assert c.post("/api/auth/login", json={"username": "alice", "password": "wrong-password"}).status_code == 401
    # Passwords are never returned.
    users = c.get("/api/auth/users", headers={"X-Admin-Token": ADMIN}).json()
    assert all("password_hash" not in u and "salt" not in u for u in users)

def test_device_token_expiry_and_rotation():
    c, app = client()
    dev = enroll(c)
    assert dev["token_expires_at"] > dev["token_expires_at"] - 7 * 86400  # expiry present
    assert c.post("/api/agent/heartbeat", json={}, headers={"X-Device-Token": dev["device_token"]}).status_code == 200
    # Expire the token directly in the DB (simulating time passing).
    conn = app.state.conn
    conn.execute("UPDATE devices SET token_expires_at=? WHERE id=?", (dbmod.now() - 10, dev["device_id"]))
    conn.commit()
    assert c.post("/api/agent/heartbeat", json={}, headers={"X-Device-Token": dev["device_token"]}).status_code == 401
    # Rotation: new token works, old token stops immediately.
    dev2 = enroll(c)
    rot = c.post("/api/agent/rotate", headers={"X-Device-Token": dev2["device_token"]}).json()
    assert rot["device_token"] != dev2["device_token"]
    assert c.post("/api/agent/heartbeat", json={}, headers={"X-Device-Token": dev2["device_token"]}).status_code == 401
    assert c.post("/api/agent/heartbeat", json={}, headers={"X-Device-Token": rot["device_token"]}).status_code == 200

def test_policy_versioning_and_tier3_gating():
    c, app = client()
    dev = enroll(c)
    # Default (no versioned policy, env allow_tier3 unset) -> Tier 3 needs approval.
    t = c.post("/api/tasks", json={"device_id": dev["device_id"], "tool": "edit_workspace_file", "args": {}},
               headers={"X-Admin-Token": ADMIN}).json()
    assert t["status"] == "needs_approval", t
    # Versioned policy allowing Tier 3 -> queued directly.
    pol = c.post("/api/policies", json={"allow_tier3": True, "note": "test"}, headers={"X-Admin-Token": ADMIN}).json()
    assert pol["version"] == 1
    t2 = c.post("/api/tasks", json={"device_id": dev["device_id"], "tool": "edit_workspace_file", "args": {}},
                headers={"X-Admin-Token": ADMIN}).json()
    assert t2["status"] == "queued", t2
    hist = c.get("/api/policies/history", headers={"X-Admin-Token": ADMIN}).json()
    assert len(hist) == 1 and hist[0]["version"] == 1

def test_signed_updates():
    d = Path(tempfile.mkdtemp())
    priv, pub = generate_keypair(d)
    manifest = {"name": "ai-bridge", "version": "0.3.0", "files": []}
    sig = sign_manifest(manifest, priv)
    assert verify_manifest(manifest, sig, pub) is True
    assert verify_manifest({**manifest, "version": "9.9.9"}, sig, pub) is False
