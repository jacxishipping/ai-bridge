import json
import tempfile
from pathlib import Path

from fastapi.testclient import TestClient

from ai_bridge.control.app import create_app
from ai_bridge.control.dispatch import dispatch

ADMIN = "test-admin-token"

def client(tmp_path=None):
    db = Path(tempfile.mkdtemp()) / "c.db"
    return TestClient(create_app(admin_token=ADMIN, db_path=db))

def enroll(c):
    r = c.post("/api/devices/enroll", json={"name": "lab", "hostname": "lab1", "os": "Linux"},
               headers={"X-Admin-Token": ADMIN})
    assert r.status_code == 200
    return r.json()

def test_enroll_task_agent_result_flow():
    c = client()
    dev = enroll(c)
    t = c.post("/api/tasks", json={"device_id": dev["device_id"], "tool": "get_system_info", "args": {}},
               headers={"X-Admin-Token": ADMIN}).json()
    assert t["status"] == "queued"
    nxt = c.get("/api/agent/tasks/next", headers={"X-Device-Token": dev["device_token"]}).json()
    assert nxt["task"]["id"] == t["task_id"]
    # Agent executes locally through the policy-enforced dispatcher.
    result = dispatch("get_system_info", {})
    assert "system" in result
    r = c.post(f"/api/agent/tasks/{t['task_id']}/result",
               json={"status": "completed", "result": json.dumps(result)},
               headers={"X-Device-Token": dev["device_token"]})
    assert r.status_code == 200
    got = c.get(f"/api/tasks/{t['task_id']}", headers={"X-Admin-Token": ADMIN}).json()
    assert got["status"] == "completed" and "system" in got["result"]

def test_tenant_isolation_and_revocation():
    c = client()
    dev = enroll(c)
    # Another tenant cannot see this device's tasks.
    c.post("/api/tasks", json={"device_id": dev["device_id"], "tool": "get_system_info", "args": {}},
           headers={"X-Admin-Token": ADMIN})
    other = c.get("/api/tasks", params={"tenant": "other-tenant"}, headers={"X-Admin-Token": ADMIN}).json()
    assert other == []
    c.post(f"/api/devices/{dev['device_id']}/revoke", headers={"X-Admin-Token": ADMIN})
    assert c.get("/api/agent/tasks/next", headers={"X-Device-Token": dev["device_token"]}).status_code == 401

def test_tier4_requires_approval_then_queues():
    c = client()
    dev = enroll(c)
    t = c.post("/api/tasks", json={"device_id": dev["device_id"], "tool": "delete_workspace_file",
                                   "args": {"relative_path": "x.txt"}},
               headers={"X-Admin-Token": ADMIN}).json()
    assert t["status"] == "needs_approval" and t["approval_id"]
    approvals = c.get("/api/approvals", headers={"X-Admin-Token": ADMIN}).json()
    assert any(a["id"] == t["approval_id"] for a in approvals)
    d = c.post(f"/api/approvals/{t['approval_id']}/decide", json={"decision": "approved"},
               headers={"X-Admin-Token": ADMIN}).json()
    assert d["status"] == "approved"
    got = c.get(f"/api/tasks/{t['task_id']}", headers={"X-Admin-Token": ADMIN}).json()
    assert got["status"] == "queued"

def test_emergency_stop_blocks_new_tasks():
    c = client()
    dev = enroll(c)
    c.post("/api/emergency-stop", headers={"X-Admin-Token": ADMIN})
    r = c.post("/api/tasks", json={"device_id": dev["device_id"], "tool": "get_system_info", "args": {}},
               headers={"X-Admin-Token": ADMIN})
    assert r.status_code == 403
    c.post("/api/emergency-stop/clear", headers={"X-Admin-Token": ADMIN})
    r = c.post("/api/tasks", json={"device_id": dev["device_id"], "tool": "get_system_info", "args": {}},
               headers={"X-Admin-Token": ADMIN})
    assert r.status_code == 200
