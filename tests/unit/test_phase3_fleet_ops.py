import json
import time
import pytest
from fastapi.testclient import TestClient

from ai_bridge import tools
from ai_bridge.control.app import create_app
from ai_bridge.policy import Policy


def test_device_heartbeat_telemetry_and_fleet_stats(tmp_path):
    admin_token = "adm-tok-p3"
    app = create_app(admin_token=admin_token, db_path=tmp_path / "control.db")
    client = TestClient(app)

    # Register a device
    reg_res = client.post("/api/devices/enroll", json={"name": "linux-node-1", "os": "Linux Ubuntu 24.04"}, headers={"X-Admin-Token": admin_token})
    assert reg_res.status_code == 200
    dev_info = reg_res.json()
    dev_id = dev_info["device_id"]
    dev_tok = dev_info["device_token"]

    # Send heartbeat with telemetry metrics
    hb_payload = {
        "hostname": "ubuntu-srv",
        "os": "Linux Ubuntu 24.04",
        "metrics": {
            "cpu_percent": 18.5,
            "memory_percent": 42.0,
            "disk_percent": 65.2,
        },
    }
    hb_res = client.post("/api/agent/heartbeat", json=hb_payload, headers={"X-Device-Token": dev_tok})
    assert hb_res.status_code == 200
    assert hb_res.json()["device_id"] == dev_id

    # Query device telemetry
    tel_res = client.get(f"/api/devices/{dev_id}/telemetry", headers={"X-Admin-Token": admin_token})
    assert tel_res.status_code == 200
    tel_data = tel_res.json()
    assert tel_data["device_id"] == dev_id
    assert len(tel_data["telemetry"]) == 1
    point = tel_data["telemetry"][0]
    assert point["cpu_percent"] == 18.5
    assert point["memory_percent"] == 42.0
    assert point["disk_percent"] == 65.2

    # Query fleet telemetry summary
    fleet_res = client.get("/api/fleet/telemetry", headers={"X-Admin-Token": admin_token})
    assert fleet_res.status_code == 200
    fleet_data = fleet_res.json()
    assert fleet_data["total_devices"] == 1
    assert fleet_data["online_devices"] == 1
    assert fleet_data["avg_cpu_percent"] == 18.5
    assert fleet_data["avg_memory_percent"] == 42.0


def test_fleet_broadcast_command_execution(tmp_path):
    admin_token = "adm-tok-p3"
    app = create_app(admin_token=admin_token, db_path=tmp_path / "control.db")
    client = TestClient(app)

    # Register 2 devices (1 Linux, 1 Windows)
    dev1 = client.post("/api/devices/enroll", json={"name": "web-01", "os": "Linux Debian 12"}, headers={"X-Admin-Token": admin_token}).json()
    dev2 = client.post("/api/devices/enroll", json={"name": "win-01", "os": "Windows Server 2022"}, headers={"X-Admin-Token": admin_token}).json()

    # Broadcast to all devices
    bcast_res = client.post(
        "/api/fleet/broadcast",
        json={"tool": "get_system_info", "args": {}},
        headers={"X-Admin-Token": admin_token},
    )
    assert bcast_res.status_code == 200
    bcast_info = bcast_res.json()
    batch_id = bcast_info["batch_id"]
    assert bcast_info["device_count"] == 2
    assert len(bcast_info["tasks"]) == 2

    # Poll broadcast status
    status_res = client.get(f"/api/fleet/broadcast/{batch_id}", headers={"X-Admin-Token": admin_token})
    assert status_res.status_code == 200
    status_info = status_res.json()
    assert status_info["batch_id"] == batch_id
    assert status_info["total_tasks"] == 2
    assert status_info["status"] in ("running", "completed")

    # Broadcast filtered by OS
    bcast_linux = client.post(
        "/api/fleet/broadcast",
        json={"tool": "get_system_info", "target_os": "linux"},
        headers={"X-Admin-Token": admin_token},
    )
    assert bcast_linux.status_code == 200
    assert bcast_linux.json()["device_count"] == 1
    assert bcast_linux.json()["tasks"][0]["device_id"] == dev1["device_id"]


def test_event_driven_trigger_and_self_healing(tmp_path):
    admin_token = "adm-tok-p3"
    app = create_app(admin_token=admin_token, db_path=tmp_path / "control.db")
    client = TestClient(app)

    # Register a device
    dev = client.post("/api/devices/enroll", json={"name": "db-cluster", "os": "Linux Ubuntu"}, headers={"X-Admin-Token": admin_token}).json()
    dev_id = dev["device_id"]
    dev_tok = dev["device_token"]

    # Create self-healing trigger: if RAM > 80% -> run get_system_info
    trig_payload = {
        "name": "High RAM Alert",
        "device_id": dev_id,
        "metric": "memory_percent",
        "operator": ">",
        "threshold": 80.0,
        "action_type": "tool",
        "action_target": "get_system_info",
        "action_args": {},
        "cooldown_seconds": 60,
    }
    c_res = client.post("/api/triggers", json=trig_payload, headers={"X-Admin-Token": admin_token})
    assert c_res.status_code == 200
    trig_id = c_res.json()["trigger_id"]

    # Heartbeat below threshold (75%) -> trigger should NOT fire
    client.post("/api/agent/heartbeat", json={"metrics": {"memory_percent": 75.0}}, headers={"X-Device-Token": dev_tok})
    agent_tasks = client.get("/api/agent/tasks/next", headers={"X-Device-Token": dev_tok}).json()
    assert agent_tasks.get("task") is None

    # Heartbeat above threshold (85%) -> trigger SHOULD fire
    client.post("/api/agent/heartbeat", json={"metrics": {"memory_percent": 85.0}}, headers={"X-Device-Token": dev_tok})
    agent_tasks_fired = client.get("/api/agent/tasks/next", headers={"X-Device-Token": dev_tok}).json()
    assert agent_tasks_fired.get("task") is not None
    assert agent_tasks_fired["task"]["tool"] == "get_system_info"


def test_trigger_management_crud_and_test(tmp_path):
    admin_token = "adm-tok-p3"
    app = create_app(admin_token=admin_token, db_path=tmp_path / "control.db")
    client = TestClient(app)

    # Create trigger
    c_res = client.post(
        "/api/triggers",
        json={"name": "Disk Warning", "metric": "disk_percent", "threshold": 90.0, "action_type": "tool", "action_target": "get_system_info"},
        headers={"X-Admin-Token": admin_token},
    )
    assert c_res.status_code == 200
    trig_id = c_res.json()["trigger_id"]

    # List triggers
    t_list = client.get("/api/triggers", headers={"X-Admin-Token": admin_token}).json()
    assert len(t_list) == 1
    assert t_list[0]["id"] == trig_id

    # Toggle trigger
    tog = client.post(f"/api/triggers/{trig_id}/toggle", headers={"X-Admin-Token": admin_token}).json()
    assert tog["enabled"] is False

    # Test trigger simulation
    test_run = client.post(f"/api/triggers/{trig_id}/test", headers={"X-Admin-Token": admin_token}).json()
    assert test_run["status"] == "executed"

    # Delete trigger
    del_res = client.delete(f"/api/triggers/{trig_id}", headers={"X-Admin-Token": admin_token}).json()
    assert del_res["status"] == "deleted"
    assert len(client.get("/api/triggers", headers={"X-Admin-Token": admin_token}).json()) == 0


def test_fleet_scheduler_crud_and_run_now(tmp_path):
    admin_token = "adm-tok-p3"
    app = create_app(admin_token=admin_token, db_path=tmp_path / "control.db")
    client = TestClient(app)

    # Create schedule
    s_res = client.post(
        "/api/schedules",
        json={"name": "Nightly Health Check", "interval_seconds": 3600, "tool": "get_system_info", "args": {}},
        headers={"X-Admin-Token": admin_token},
    )
    assert s_res.status_code == 200
    sched_id = s_res.json()["schedule_id"]
    assert s_res.json()["next_run_at"] is not None

    # List schedules
    s_list = client.get("/api/schedules", headers={"X-Admin-Token": admin_token}).json()
    assert len(s_list) == 1
    assert s_list[0]["id"] == sched_id

    # Run schedule now
    run_res = client.post(f"/api/schedules/{sched_id}/run-now", headers={"X-Admin-Token": admin_token})
    assert run_res.status_code == 200
    assert run_res.json()["status"] == "executed"
    assert "result" in run_res.json()

    # Delete schedule
    del_res = client.delete(f"/api/schedules/{sched_id}", headers={"X-Admin-Token": admin_token}).json()
    assert del_res["status"] == "deleted"


def test_broadcast_fleet_command_tool_execution():
    p = Policy(allow_tier3=True, max_tier_unattended=4, desktop_enabled=True)
    res = tools.broadcast_fleet_command("get_system_info", policy=p)
    assert res["ok"] is True
    assert res["device_count"] == 1
    assert len(res["results"]) == 1
    assert res["results"][0]["status"] == "completed"
