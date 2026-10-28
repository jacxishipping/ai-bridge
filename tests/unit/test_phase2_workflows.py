"""Unit tests for Phase 2: Autonomous Workflows, Screen Verification & Multi-Turn Plan Execution."""
from __future__ import annotations

import time
import pytest
from fastapi.testclient import TestClient

from ai_bridge import tools, vision
from ai_bridge.control.app import create_app
from ai_bridge.policy import Policy, decide


def test_wait_for_text_found_and_timeout(monkeypatch):
    # 1. Found immediately
    mock_found = {
        "found": True,
        "x": 400,
        "y": 300,
        "match": {"text": "Google Search", "bounds": [350, 280, 100, 40]},
    }
    monkeypatch.setattr(tools, "capture_desktop_screenshot", lambda **kw: {"available": False, "path": ""})
    monkeypatch.setattr(vision, "find_text_coordinates", lambda *a, **kw: mock_found)

    p = Policy(allow_tier3=True, max_tier_unattended=3, desktop_enabled=True)
    res = tools.wait_for_text("Google", timeout_seconds=2.0, policy=p)
    assert res["ok"] is True
    assert res["found"] is True
    assert res["matched_text"] == "Google Search"
    assert res["attempts"] == 1
    assert res["x"] == 400

    # 2. Timeout reached
    mock_not_found = {"found": False, "x": None, "y": None, "match": None}
    monkeypatch.setattr(vision, "find_text_coordinates", lambda *a, **kw: mock_not_found)
    res_to = tools.wait_for_text("NonExistentString12345", timeout_seconds=0.5, poll_interval=0.1, policy=p)
    assert res_to["ok"] is False
    assert res_to["found"] is False
    assert "Timeout waiting for text" in res_to["error"]


def test_verify_screen_contains(monkeypatch):
    mock_match = {
        "found": True,
        "x": 200,
        "y": 150,
        "match": {"text": "Welcome to Dashboard", "bounds": [100, 140, 200, 20]},
    }
    monkeypatch.setattr(tools, "capture_desktop_screenshot", lambda **kw: {"available": False, "path": ""})
    monkeypatch.setattr(vision, "find_text_coordinates", lambda *a, **kw: mock_match)

    p = Policy(allow_tier3=True, max_tier_unattended=3, desktop_enabled=True)
    res = tools.verify_screen_contains("Welcome", policy=p)
    assert res["ok"] is True
    assert res["contains"] is True
    assert res["center"] == [200, 150]


def test_press_hotkey(monkeypatch):
    recorded = []
    def fake_perform(action, *, key=None, **kw):
        recorded.append({"action": action, "key": key})
        return {"action": action, "status": "ok"}

    monkeypatch.setattr(tools, "perform_approved_ui_action", fake_perform)
    p = Policy(allow_tier3=True, max_tier_unattended=3, desktop_enabled=True)

    res = tools.press_hotkey("ctrl+s", policy=p)
    assert res["status"] == "ok"
    assert recorded[-1]["action"] == "hotkey"
    assert recorded[-1]["key"] == "ctrl+s"


def test_execute_workflow_local(monkeypatch):
    # Mock shell execution
    monkeypatch.setattr(
        tools,
        "run_shell",
        lambda cmd, **kw: {"returncode": 0, "stdout": f"executed {cmd}", "stderr": ""},
    )

    steps = [
        {"name": "Check Uptime", "action": "run_shell", "args": {"command": "uptime"}},
        {"name": "Check Disk", "action": "run_shell", "args": {"command": "df -h"}},
    ]

    p = Policy(allow_tier3=True, max_tier_unattended=4, desktop_enabled=True)
    res = tools.execute_workflow(steps, policy=p)

    assert res["ok"] is True
    assert res["total_steps"] == 2
    assert res["executed_steps"] == 2
    assert res["successful_steps"] == 2
    assert len(res["steps"]) == 2
    assert res["steps"][0]["status"] == "completed"
    assert "uptime" in res["steps"][0]["result"]["stdout"]
    assert res["steps"][1]["status"] == "completed"


def test_execute_workflow_stop_on_failure(monkeypatch):
    call_count = 0
    def fake_shell(cmd, **kw):
        nonlocal call_count
        call_count += 1
        if "fail" in cmd:
            raise RuntimeError("Command crashed with code 1")
        return {"returncode": 0, "stdout": "ok", "stderr": ""}

    monkeypatch.setattr(tools, "run_shell", fake_shell)

    steps = [
        {"name": "Step 1", "action": "run_shell", "args": {"command": "echo 1"}},
        {"name": "Step 2 (Failing)", "action": "run_shell", "args": {"command": "fail now"}, "retries": 0},
        {"name": "Step 3 (Should be skipped)", "action": "run_shell", "args": {"command": "echo 3"}},
    ]

    p = Policy(allow_tier3=True, max_tier_unattended=4, desktop_enabled=True)
    res = tools.execute_workflow(steps, stop_on_failure=True, policy=p)

    assert res["ok"] is False
    assert res["executed_steps"] == 2
    assert res["successful_steps"] == 1
    assert res["failed_steps"] == 1
    assert res["steps"][1]["status"] == "failed"
    assert "crashed" in res["steps"][1]["error"]
    # Step 3 was never executed
    assert len(res["steps"]) == 2


def test_control_plane_workflows_api(tmp_path):
    admin_token = "phase2-admin-token"
    app = create_app(admin_token=admin_token, db_path=tmp_path / "control.db")
    client = TestClient(app)

    # 1. Fetch templates
    tpl_res = client.get("/api/workflows/templates", headers={"X-Admin-Token": admin_token})
    assert tpl_res.status_code == 200
    templates = tpl_res.json()["templates"]
    assert len(templates) >= 3
    assert any("web_navigation" in t["id"] for t in templates)

    # 2. Submit workflow
    wf_payload = {
        "name": "E2E Automated Health Check",
        "device_id": "local",
        "steps": [
            {"name": "Step 1", "action": "get_system_info", "args": {}},
            {"name": "Step 2", "action": "get_resource_usage", "args": {}},
        ],
        "stop_on_failure": True,
    }
    sub_res = client.post("/api/workflows", json=wf_payload, headers={"X-Admin-Token": admin_token})
    assert sub_res.status_code == 200
    wf_id = sub_res.json()["workflow_id"]
    assert wf_id is not None
    assert sub_res.json()["status"] == "running"

    # Wait for completion
    deadline = time.time() + 5.0
    final_wf = None
    while time.time() < deadline:
        time.sleep(0.1)
        r = client.get(f"/api/workflows/{wf_id}", headers={"X-Admin-Token": admin_token}).json()
        if r["status"] in ("completed", "failed"):
            final_wf = r
            break

    assert final_wf is not None
    assert final_wf["status"] == "completed"
    assert final_wf["total_steps"] == 2
    assert len(final_wf["results"]) == 2
    assert final_wf["results"][0]["status"] == "completed"

    # 3. List workflows
    wf_list = client.get("/api/workflows", headers={"X-Admin-Token": admin_token}).json()
    assert len(wf_list) >= 1
    assert wf_list[0]["id"] == wf_id

