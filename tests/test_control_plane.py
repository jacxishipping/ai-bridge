"""Integration tests for the AI Bridge control plane.

Tests auth, policy enforcement, device management, approval flows,
and API endpoint behavior using the FastAPI TestClient.
"""
from __future__ import annotations

import json
import os
import tempfile
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from ai_bridge.control.app import create_app


@pytest.fixture
def db_path():
    """Create a temporary SQLite database for testing."""
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
        path = Path(f.name)
    yield path
    # Close any remaining connections by letting GC handle it
    import gc
    gc.collect()
    try:
        if path.exists():
            path.unlink(missing_ok=True)
    except PermissionError:
        pass


@pytest.fixture
def admin_token():
    return "test-admin-token-12345"


@pytest.fixture
def app_instance(db_path, admin_token):
    application = create_app(admin_token=admin_token, db_path=db_path)
    yield application
    try:
        application.state.conn.close()
    except Exception:
        pass


@pytest.fixture
def client(app_instance):
    return TestClient(app_instance)


@pytest.fixture
def admin_headers(admin_token):
    return {"X-Admin-Token": admin_token}


# --- Health ---


class TestHealth:
    def test_health(self, client):
        resp = client.get("/health")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ok"
        assert "version" in data

    def test_health_live(self, client):
        resp = client.get("/health/live")
        assert resp.status_code == 200
        assert resp.json()["status"] == "live"

    def test_health_ready(self, client):
        resp = client.get("/health/ready")
        assert resp.status_code == 200
        assert resp.json()["status"] == "ready"


# --- Auth ---


class TestAuth:
    def test_no_auth_returns_401(self, client):
        resp = client.get("/api/devices")
        assert resp.status_code == 401

    def test_invalid_token_returns_401(self, client):
        resp = client.get("/api/devices", headers={"X-Admin-Token": "wrong"})
        assert resp.status_code == 401

    def test_valid_admin_token(self, client, admin_headers):
        resp = client.get("/api/devices", headers=admin_headers)
        assert resp.status_code == 200

    def test_csrf_token_requires_session(self, client):
        resp = client.get("/api/auth/csrf-token")
        assert resp.status_code == 401

    def test_create_user_and_login(self, client, admin_headers):
        # Create a user
        resp = client.post("/api/auth/users", json={"username": "testuser", "password": "testpass123", "role": "viewer"}, headers=admin_headers)
        assert resp.status_code == 200

        # Login
        resp = client.post("/api/auth/login", json={"username": "testuser", "password": "testpass123"})
        assert resp.status_code == 200
        data = resp.json()
        assert "session_token" in data
        assert data["role"] == "viewer"

        # Get CSRF token
        session_headers = {"X-Session-Token": data["session_token"]}
        resp = client.get("/api/auth/csrf-token", headers=session_headers)
        assert resp.status_code == 200
        assert "csrf_token" in resp.json()

    def test_role_enforcement(self, client, admin_headers):
        # Create a viewer user
        resp = client.post("/api/auth/users", json={"username": "viewer1", "password": "viewerpass123", "role": "viewer"}, headers=admin_headers)
        assert resp.status_code == 200

        # Login as viewer
        resp = client.post("/api/auth/login", json={"username": "viewer1", "password": "viewerpass123"})
        viewer_headers = {"X-Session-Token": resp.json()["session_token"]}

        # Viewer cannot create users (requires admin)
        resp = client.post("/api/auth/users", json={"username": "another", "password": "pass123456", "role": "viewer"}, headers=viewer_headers)
        assert resp.status_code == 403


# --- Devices ---


class TestDevices:
    def test_enroll_device(self, client, admin_headers):
        resp = client.post("/api/devices/enroll", json={"name": "test-device", "os": "linux"}, headers=admin_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "device_id" in data
        assert "device_token" in data
        assert data["device_token"]  # Token is returned once

    def test_list_devices(self, client, admin_headers):
        # Enroll a device first
        client.post("/api/devices/enroll", json={"name": "device-1", "os": "linux"}, headers=admin_headers)
        resp = client.get("/api/devices", headers=admin_headers)
        assert resp.status_code == 200
        assert len(resp.json()) >= 1

    def test_revoke_device(self, client, admin_headers):
        enroll = client.post("/api/devices/enroll", json={"name": "revoke-me", "os": "windows"}, headers=admin_headers).json()
        device_id = enroll["device_id"]
        resp = client.post(f"/api/devices/{device_id}/revoke", headers=admin_headers)
        assert resp.status_code == 200
        assert resp.json()["revoked"] is True

    def test_device_policy(self, client, admin_headers):
        enroll = client.post("/api/devices/enroll", json={"name": "policy-test", "os": "linux"}, headers=admin_headers).json()
        device_id = enroll["device_id"]
        resp = client.get(f"/api/devices/{device_id}/policy", headers=admin_headers)
        assert resp.status_code == 200
        assert "tools" in resp.json()

    def test_set_device_policy(self, client, admin_headers):
        enroll = client.post("/api/devices/enroll", json={"name": "policy-set", "os": "linux"}, headers=admin_headers).json()
        device_id = enroll["device_id"]
        resp = client.put(f"/api/devices/{device_id}/policy", json={"denied_tools": ["run_shell"]}, headers=admin_headers)
        assert resp.status_code == 200


# --- Tasks ---


class TestTasks:
    def test_submit_task_requires_auth(self, client):
        resp = client.post("/api/tasks", json={"device_id": "nonexistent", "tool": "get_system_info"})
        assert resp.status_code == 401

    def test_submit_task_unknown_device(self, client, admin_headers):
        resp = client.post("/api/tasks", json={"device_id": "nonexistent", "tool": "get_system_info"}, headers=admin_headers)
        assert resp.status_code == 404

    def test_submit_task_unknown_tool(self, client, admin_headers):
        enroll = client.post("/api/devices/enroll", json={"name": "task-test", "os": "linux"}, headers=admin_headers).json()
        resp = client.post("/api/tasks", json={"device_id": enroll["device_id"], "tool": "nonexistent_tool"}, headers=admin_headers)
        assert resp.status_code == 400

    def test_submit_and_list_tasks(self, client, admin_headers):
        enroll = client.post("/api/devices/enroll", json={"name": "task-list", "os": "linux"}, headers=admin_headers).json()
        device_id = enroll["device_id"]
        resp = client.post("/api/tasks", json={"device_id": device_id, "tool": "get_system_info"}, headers=admin_headers)
        assert resp.status_code == 200
        task = resp.json()
        assert task["status"] == "queued"

        resp = client.get(f"/api/tasks?device_id={device_id}", headers=admin_headers)
        assert resp.status_code == 200
        assert len(resp.json()) >= 1


# --- Approvals ---


class TestApprovals:
    def test_approval_flow(self, client, admin_headers):
        # Enroll device with restricted policy
        enroll = client.post("/api/devices/enroll", json={"name": "approval-test", "os": "linux"}, headers=admin_headers).json()
        device_id = enroll["device_id"]

        # Submit a tier-4 tool (requires approval)
        resp = client.post("/api/tasks", json={"device_id": device_id, "tool": "delete_workspace_file"}, headers=admin_headers)
        assert resp.status_code == 200
        task = resp.json()
        assert task["status"] == "needs_approval"
        assert task["approval_id"] is not None

        # List approvals
        resp = client.get("/api/approvals", headers=admin_headers)
        assert resp.status_code == 200
        approvals = resp.json()
        assert len(approvals) >= 1

        # Approve it
        approval_id = task["approval_id"]
        resp = client.post(f"/api/approvals/{approval_id}/decide", json={"decision": "approved"}, headers=admin_headers)
        assert resp.status_code == 200

        # Verify task is now queued
        resp = client.get(f"/api/tasks/{task['task_id']}", headers=admin_headers)
        assert resp.json()["status"] == "queued"


# --- Emergency Stop ---


class TestEmergencyStop:
    def test_emergency_stop(self, client, admin_headers):
        resp = client.post("/api/emergency-stop", headers=admin_headers)
        assert resp.status_code == 200
        assert resp.json()["emergency_stop"] is True

        # Tasks should be rejected during emergency stop
        enroll = client.post("/api/devices/enroll", json={"name": "emergency-device", "os": "linux"}, headers=admin_headers).json()
        resp = client.post("/api/tasks", json={"device_id": enroll["device_id"], "tool": "get_system_info"}, headers=admin_headers)
        assert resp.status_code == 403

        # Clear emergency stop
        resp = client.post("/api/emergency-stop/clear", headers=admin_headers)
        assert resp.status_code == 200
        assert resp.json()["emergency_stop"] is False


# --- Rate Limiting ---


class TestRateLimiting:
    def test_rate_limit_headers(self, client, admin_headers):
        # Make many rapid requests
        for _ in range(5):
            client.get("/health", headers=admin_headers)
        # Should still succeed (limit is 120/min)
        resp = client.get("/health", headers=admin_headers)
        assert resp.status_code == 200


# --- Webhook Settings ---


class TestWebhookSettings:
    def test_set_and_get_webhook(self, client, admin_headers):
        resp = client.post("/api/settings/webhook", json={"webhook_url": "https://hooks.slack.com/services/test"}, headers=admin_headers)
        assert resp.status_code == 200
        assert resp.json()["configured"] is True

        resp = client.get("/api/settings/webhook", headers=admin_headers)
        assert resp.status_code == 200
        assert resp.json()["configured"] is True

    def test_webhook_loopback_rejected(self, client, admin_headers):
        resp = client.post("/api/settings/webhook", json={"webhook_url": "http://localhost:9999/hook"}, headers=admin_headers)
        assert resp.status_code == 400


# --- Policies ---


class TestPolicies:
    def test_create_and_get_policy(self, client, admin_headers):
        resp = client.post("/api/policies", json={"allow_tier3": True, "note": "Test policy"}, headers=admin_headers)
        assert resp.status_code == 200
        assert resp.json()["version"] >= 1

        resp = client.get("/api/policies", headers=admin_headers)
        assert resp.status_code == 200
        assert resp.json()["version"] >= 1

    def test_policy_history(self, client, admin_headers):
        client.post("/api/policies", json={"allow_tier3": True}, headers=admin_headers)
        resp = client.get("/api/policies/history", headers=admin_headers)
        assert resp.status_code == 200
        assert len(resp.json()) >= 1


# --- Audit ---


class TestAudit:
    def test_audit_log(self, client, admin_headers):
        resp = client.get("/api/audit", headers=admin_headers)
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_audit_immutable(self, client, admin_headers):
        resp = client.put("/api/audit/1", headers=admin_headers)
        assert resp.status_code == 405

    def test_audit_export(self, client, admin_headers):
        resp = client.get("/api/audit/export", headers=admin_headers)
        assert resp.status_code == 200
        assert "events" in resp.json()


# --- CSRF Token ---


class TestCSRF:
    def test_csrf_token_generation(self):
        from ai_bridge.control.csrf import generate_csrf_token, validate_csrf_token

        token = generate_csrf_token("test-session-token")
        assert ":" in token
        assert validate_csrf_token("test-session-token", token) is True
        assert validate_csrf_token("wrong-token", token) is False
        assert validate_csrf_token("test-session-token", "invalid") is False
