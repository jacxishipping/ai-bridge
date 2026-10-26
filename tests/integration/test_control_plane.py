import json
import tempfile
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from ai_bridge import server as mcp_server
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

def test_tier4_requires_approval_then_queues_and_dispatches(monkeypatch, tmp_path):
    monkeypatch.setenv("AI_BRIDGE_WORKSPACE", str(tmp_path))
    (tmp_path / "x.txt").write_text("to delete", encoding="utf-8")
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
    # Agent fetches the approved task and executes it via dispatch().
    nxt = c.get("/api/agent/tasks/next", headers={"X-Device-Token": dev["device_token"]}).json()["task"]
    assert nxt["approval_granted"] is True
    res = dispatch(nxt["tool"], json.loads(nxt["args_json"]), approval_granted=bool(nxt["approval_granted"]))
    assert res["deleted"] == "x.txt"
    assert not (tmp_path / "x.txt").exists()

def test_tier3_deploy_application_dispatches_when_approved(monkeypatch, tmp_path):
    monkeypatch.setenv("AI_BRIDGE_WORKSPACE", str(tmp_path))
    monkeypatch.setenv("AI_BRIDGE_ALLOW_TIER3", "0")
    (tmp_path / "app.py").write_text("print('hi')\n", encoding="utf-8")
    res = dispatch("deploy_application", {"project_directory": ".", "target_directory": "staging"},
                   approval_granted=True)
    assert res["files_copied"] >= 1
    assert (tmp_path / "staging" / "app.py").exists()

def test_local_mcp_approval_and_host_tools_gate(monkeypatch, tmp_path):
    monkeypatch.setenv("AI_BRIDGE_WORKSPACE", str(tmp_path))
    monkeypatch.setenv("AI_BRIDGE_ADMIN_TOKEN", ADMIN)
    (tmp_path / "del.txt").write_text("bye", encoding="utf-8")
    with pytest.raises(PermissionError):
        mcp_server.delete_workspace_file("del.txt")
    req = mcp_server.request_approval("delete_workspace_file", "cleanup")
    mcp_server.approve_task(req["approval_id"], ADMIN)
    out = mcp_server.delete_workspace_file("del.txt")
    assert out["deleted"] == "del.txt"
    # Approval is one-shot; a second call requires a new approval.
    (tmp_path / "del.txt").write_text("bye2", encoding="utf-8")
    with pytest.raises(PermissionError):
        mcp_server.delete_workspace_file("del.txt")
    # AI_BRIDGE_DISABLE_HOST_TOOLS=1 blocks unconfined host tools.
    monkeypatch.setenv("AI_BRIDGE_DISABLE_HOST_TOOLS", "1")
    with pytest.raises(PermissionError):
        mcp_server.run_shell("echo hi")
    with pytest.raises(PermissionError):
        mcp_server.read_file(str(tmp_path / "del.txt"))
    with pytest.raises(PermissionError):
        mcp_server.write_file(str(tmp_path / "out.txt"), "x")

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
