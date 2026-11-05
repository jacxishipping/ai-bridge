import sqlite3
from concurrent.futures import ThreadPoolExecutor

import pytest
from fastapi.testclient import TestClient

from ai_bridge.control.app import create_app
from ai_bridge.control.backup import verified_backup


@pytest.fixture
def workspace(tmp_path, monkeypatch):
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.setenv("AI_BRIDGE_ALLOW_TIER3", "0")
    app = create_app(admin_token="workspace-test-admin", db_path=tmp_path / "control.db")
    with TestClient(app) as client:
        yield client, app, {"X-Admin-Token": "workspace-test-admin"}
    app.state.conn.close()


def make_user(client, headers, username, role="viewer"):
    assert client.post("/api/auth/users", headers=headers, json={
        "username": username, "password": "test-only-password", "role": role,
    }).status_code == 200
    login = client.post("/api/auth/login", json={"username": username, "password": "test-only-password"})
    return {"X-Session-Token": login.json()["session_token"]}


def test_roles_session_revocation_and_last_admin(workspace):
    client, _, admin = workspace
    first = make_user(client, admin, "first", "admin")
    make_user(client, admin, "second", "admin")
    viewer = make_user(client, admin, "reader")
    assert client.patch("/api/auth/users/first", headers=viewer, json={"role": "viewer"}).status_code == 403
    assert client.patch("/api/auth/users/first", headers=first, json={"role": "viewer"}).status_code == 409
    assert client.patch("/api/auth/users/second", headers=admin, json={"role": "viewer"}).status_code == 200
    assert client.patch("/api/auth/users/first", headers=admin, json={"role": "viewer"}).status_code == 409
    assert client.patch("/api/auth/users/reader", headers=admin, json={"role": "operator"}).status_code == 200
    assert client.get("/api/auth/me", headers=viewer).status_code == 401


def test_device_labels_pagination_and_exact_tag_filter(workspace):
    client, _, admin = workspace
    first = client.post("/api/devices/enroll", headers=admin, json={"name": "A"}).json()["device_id"]
    client.post("/api/devices/enroll", headers=admin, json={"name": "B"})
    viewer = make_user(client, admin, "reader")
    path = f"/api/devices/{first}/metadata"
    assert client.put(path, headers=viewer, json={"group": "Production"}).status_code == 403
    assert client.put(path, headers=admin, json={"group": " Production ", "tags": ["eu", "eu", "blue"]}).json() == {
        "group": "Production", "tags": ["blue", "eu"],
    }
    assert client.put(path, headers=admin, json={"tags": ["x" * 41]}).status_code == 422
    rows = client.get("/api/fleet/inventory", headers=viewer, params={"page_size": 1}).json()
    assert rows["total"] == 2 and len(rows["items"]) == 1
    assert rows["items"][0]["group"] == "Production"
    assert "token_hash" not in rows["items"][0]
    assert client.get("/api/fleet/inventory", headers=viewer, params={"tag": "e"}).json()["total"] == 0
    assert client.get("/api/fleet/inventory", headers=viewer, params={"tag": "eu", "group": "Production"}).json()["total"] == 1
    assert client.get("/api/fleet/inventory", headers=viewer, params={"tenant": "other"}).json()["total"] == 0
    assert client.get("/api/fleet/inventory", headers=viewer, params={"page_size": 101}).status_code == 422


def test_idempotency_is_atomic_and_bound_to_payload_and_actor(workspace):
    client, app, admin = workspace
    device = client.post("/api/devices/enroll", headers=admin, json={"name": "A"}).json()["device_id"]
    body = {"device_id": device, "tool": "delete_workspace_file", "args": {"relative_path": "x"}}
    headers = {**admin, "Idempotency-Key": "same-reviewed-submission"}
    with ThreadPoolExecutor(max_workers=4) as pool:
        responses = list(pool.map(lambda _: client.post("/api/tasks", headers=headers, json=body), range(4)))
    assert all(response.status_code == 200 for response in responses)
    assert len({response.json()["task_id"] for response in responses}) == 1
    assert app.state.conn.execute("SELECT COUNT(*) AS n FROM tasks").fetchone()["n"] == 1
    assert app.state.conn.execute("SELECT COUNT(*) AS n FROM approvals").fetchone()["n"] == 1
    assert client.post("/api/tasks", headers=headers, json={**body, "args": {"relative_path": "y"}}).status_code == 409
    operator = make_user(client, admin, "operator", "operator")
    second = client.post("/api/tasks", headers={**operator, "Idempotency-Key": headers["Idempotency-Key"]}, json=body)
    assert second.status_code == 200 and second.json()["task_id"] != responses[0].json()["task_id"]
    assert client.post("/api/tasks", headers={**admin, "Idempotency-Key": "x" * 129}, json=body).status_code == 422


def test_history_notifications_and_authorization(workspace):
    client, app, admin = workspace
    device = client.post("/api/devices/enroll", headers=admin, json={"name": "A"}).json()["device_id"]
    response = client.post("/api/tasks", headers=admin, json={"device_id": device, "tool": "get_system_info"}).json()
    app.state.conn.execute("UPDATE tasks SET status='failed' WHERE id=?", (response["task_id"],))
    app.state.conn.commit()
    assert client.get("/api/fleet/notifications").status_code == 401
    counts = client.get("/api/fleet/notifications", headers=admin).json()
    assert counts["offline_devices"] == 1 and counts["failed_tasks_24h"] == 1
    result = client.get("/api/tasks/history", headers=admin, params={"q": "system", "status": "failed"}).json()
    assert result["total"] == 1 and result["items"][0]["id"] == response["task_id"]
    assert client.get("/api/tasks/history", headers=admin, params={"tenant": "other"}).json()["total"] == 0


def test_backup_roundtrip_never_overwrites(workspace, tmp_path):
    client, _, admin = workspace
    client.post("/api/devices/enroll", headers=admin, json={"name": "backup-device"})
    backup = tmp_path / "backup.db"
    verified_backup(tmp_path / "control.db", backup)
    with sqlite3.connect(backup) as conn:
        assert conn.execute("SELECT name FROM devices").fetchone()[0] == "backup-device"
        assert conn.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
    with pytest.raises(FileExistsError):
        verified_backup(tmp_path / "control.db", backup)
