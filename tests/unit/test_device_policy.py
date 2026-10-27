"""Unit and API tests for per-device policy configuration and enforcement."""
from __future__ import annotations

import json
from pathlib import Path
import pytest
from fastapi.testclient import TestClient

from ai_bridge.control.app import create_app


@pytest.fixture
def test_setup(tmp_path: Path):
    db_file = tmp_path / "control.db"
    app = create_app(admin_token="adm-secret", db_path=db_file)
    client = TestClient(app)

    # Enroll a test device
    res = client.post("/api/devices/enroll", json={"name": "test-box"}, headers={"X-Admin-Token": "adm-secret"})
    assert res.status_code == 200
    enroll_data = res.json()
    device_id = enroll_data["device_id"]
    device_token = enroll_data["device_token"]

    return {
        "client": client,
        "device_id": device_id,
        "device_token": device_token,
    }


def test_device_policy_get_default(test_setup):
    client = test_setup["client"]
    device_id = test_setup["device_id"]

    res = client.get(f"/api/devices/{device_id}/policy", headers={"X-Admin-Token": "adm-secret"})
    assert res.status_code == 200
    body = res.json()
    assert body["device_id"] == device_id
    assert body["has_custom_policy"] is False
    assert body["custom_policy"] == {}
    assert "effective_policy" in body
    assert isinstance(body["tools"], list)
    assert len(body["tools"]) >= 26

    # By default, tools should be allowed
    run_shell_meta = next(t for t in body["tools"] if t["tool"] == "run_shell")
    assert run_shell_meta["allowed"] is True


def test_device_policy_set_and_enforce(test_setup):
    client = test_setup["client"]
    device_id = test_setup["device_id"]
    device_token = test_setup["device_token"]

    # Block run_shell and install_package specifically on this device
    policy_payload = {
        "inherit_global": True,
        "allow_writes": True,
        "allow_tier3": False,
        "desktop_enabled": False,
        "allow_shell": False,
        "allow_package_install": False,
        "allow_file_deletion": False,
        "max_tier_unattended": 1,
        "allowed_apps": ["code", "terminal"],
        "allowed_services": ["docker"],
        "denied_tools": ["run_shell", "install_package", "delete_workspace_file"],
        "note": "Production worker lockdown",
    }

    put_res = client.put(f"/api/devices/{device_id}/policy", json=policy_payload, headers={"X-Admin-Token": "adm-secret"})
    assert put_res.status_code == 200
    put_body = put_res.json()
    assert put_body["has_custom_policy"] is True
    assert "run_shell" in put_body["effective_policy"]["denied_tools"]
    assert "install_package" in put_body["effective_policy"]["denied_tools"]

    # In list_devices, custom policy flag should be True
    dev_res = client.get("/api/devices", headers={"X-Admin-Token": "adm-secret"})
    assert dev_res.status_code == 200
    devices = dev_res.json()
    target_dev = next(d for d in devices if d["id"] == device_id)
    assert target_dev["has_custom_policy"] is True

    # Submitting a denied tool should return HTTP 403 Forbidden
    task_res = client.post(
        "/api/tasks",
        json={"device_id": device_id, "tool": "run_shell", "args": {"command": "ls"}},
        headers={"X-Admin-Token": "adm-secret"},
    )
    assert task_res.status_code == 403
    assert "disabled by device policy" in task_res.json()["detail"]

    # Submitting an allowed tool should succeed
    ok_res = client.post(
        "/api/tasks",
        json={"device_id": device_id, "tool": "get_system_info", "args": {}},
        headers={"X-Admin-Token": "adm-secret"},
    )
    assert ok_res.status_code == 200
    task_id = ok_res.json()["task_id"]

    # Agent polling next task should receive device-effective policy
    poll_res = client.get("/api/agent/tasks/next", headers={"X-Device-Token": device_token})
    assert poll_res.status_code == 200
    task_data = poll_res.json()["task"]
    assert task_data is not None
    assert task_data["id"] == task_id
    assert "policy" in task_data
    assert "run_shell" in task_data["policy"]["denied_tools"]


def test_device_policy_reset_to_global(test_setup):
    client = test_setup["client"]
    device_id = test_setup["device_id"]

    # Set custom policy
    client.put(
        f"/api/devices/{device_id}/policy",
        json={"denied_tools": ["run_shell"], "inherit_global": False},
        headers={"X-Admin-Token": "adm-secret"},
    )

    # Reset
    del_res = client.delete(f"/api/devices/{device_id}/policy", headers={"X-Admin-Token": "adm-secret"})
    assert del_res.status_code == 200
    assert del_res.json()["reset"] is True

    # Verify device policy is reset
    get_res = client.get(f"/api/devices/{device_id}/policy", headers={"X-Admin-Token": "adm-secret"})
    assert get_res.status_code == 200
    assert get_res.json()["has_custom_policy"] is False
    assert "run_shell" not in get_res.json()["effective_policy"].get("denied_tools", [])
