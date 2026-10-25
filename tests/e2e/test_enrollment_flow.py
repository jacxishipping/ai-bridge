"""End-to-end: enroll -> submit -> agent poll (real HTTP via TestClient
as transport) -> dispatch -> result -> audit visible -> revoke."""
import json
import tempfile
from pathlib import Path

from fastapi.testclient import TestClient

from ai_bridge.control.app import create_app
from ai_bridge.control.dispatch import dispatch

ADMIN = "e2e-admin"

def test_full_flow():
    db = Path(tempfile.mkdtemp()) / "c.db"
    c = TestClient(create_app(admin_token=ADMIN, db_path=db))
    dev = c.post("/api/devices/enroll", json={"name": "e2e-box", "os": "Linux"},
                 headers={"X-Admin-Token": ADMIN}).json()
    assert c.post("/api/agent/heartbeat", json={}, headers={"X-Device-Token": dev["device_token"]}).status_code == 200
    task = c.post("/api/tasks", json={"device_id": dev["device_id"], "tool": "get_resource_usage", "args": {}},
                  headers={"X-Admin-Token": ADMIN}).json()
    nxt = c.get("/api/agent/tasks/next", headers={"X-Device-Token": dev["device_token"]}).json()["task"]
    result = dispatch(nxt["tool"], json.loads(nxt["args_json"]))
    c.post(f"/api/agent/tasks/{nxt['id']}/result", json={"status": "completed", "result": json.dumps(result)},
           headers={"X-Device-Token": dev["device_token"]})
    final = c.get(f"/api/tasks/{task['task_id']}", headers={"X-Admin-Token": ADMIN}).json()
    assert final["status"] == "completed"
    audit = c.get("/api/audit", headers={"X-Admin-Token": ADMIN}).json()
    assert any(a["tool"] == "get_resource_usage" for a in audit)
    assert c.post(f"/api/devices/{dev['device_id']}/revoke", headers={"X-Admin-Token": ADMIN}).status_code == 200
    assert c.get("/api/agent/tasks/next", headers={"X-Device-Token": dev["device_token"]}).status_code == 401
