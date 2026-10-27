"""Unit tests for Device 360 System Dashboard endpoints (/api/devices/{id}/overview and /refresh)."""
from __future__ import annotations

import json
from pathlib import Path
import pytest
from fastapi.testclient import TestClient

from ai_bridge.control.app import create_app


@pytest.fixture
def dash_setup(tmp_path: Path):
    db_file = tmp_path / "control.db"
    app = create_app(admin_token="adm-secret", db_path=db_file)
    client = TestClient(app)

    # Enroll a test device
    res = client.post("/api/devices/enroll", json={"name": "srv-prod-01", "hostname": "prod-node-1", "os": "Ubuntu 24.04 LTS"}, headers={"X-Admin-Token": "adm-secret"})
    assert res.status_code == 200
    enroll_data = res.json()
    device_id = enroll_data["device_id"]
    device_token = enroll_data["device_token"]

    return {
        "client": client,
        "device_id": device_id,
        "device_token": device_token,
    }


def test_device_overview_defaults(dash_setup):
    client = dash_setup["client"]
    device_id = dash_setup["device_id"]

    res = client.get(f"/api/devices/{device_id}/overview", headers={"X-Admin-Token": "adm-secret"})
    assert res.status_code == 200
    data = res.json()

    assert data["device"]["id"] == device_id
    assert data["device"]["name"] == "srv-prod-01"
    assert data["device"]["hostname"] == "prod-node-1"
    assert "health" in data
    assert "system_info" in data
    assert "resource_usage" in data
    assert "processes" in data
    assert "docker" in data
    assert "apps" in data
    assert "recent_tasks" in data


def test_heartbeat_updates_metadata_and_overview(dash_setup):
    client = dash_setup["client"]
    device_id = dash_setup["device_id"]
    device_token = dash_setup["device_token"]

    # Heartbeat from agent with dynamic hostname and OS
    hb_res = client.post(
        "/api/agent/heartbeat",
        json={"hostname": "droplet-frankfurt-01", "os": "Linux 6.8.0-45-generic"},
        headers={"X-Device-Token": device_token},
    )
    assert hb_res.status_code == 200
    assert hb_res.json()["device_id"] == device_id

    # Check overview reflects updated hostname and online health
    ov_res = client.get(f"/api/devices/{device_id}/overview", headers={"X-Admin-Token": "adm-secret"})
    assert ov_res.status_code == 200
    ov_data = ov_res.json()
    assert ov_data["device"]["hostname"] == "droplet-frankfurt-01"
    assert ov_data["device"]["os"] == "Linux 6.8.0-45-generic"
    assert ov_data["health"]["is_online"] is True
    assert ov_data["health"]["status"] == "online"


def test_overview_with_completed_telemetry_tasks(dash_setup):
    client = dash_setup["client"]
    device_id = dash_setup["device_id"]
    device_token = dash_setup["device_token"]

    # 1. Queue get_system_info and report result from agent
    q1 = client.post("/api/tasks", json={"device_id": device_id, "tool": "get_system_info", "args": {}}, headers={"X-Admin-Token": "adm-secret"})
    assert q1.status_code == 200
    t1_id = q1.json()["task_id"]
    client.post(
        f"/api/agent/tasks/{t1_id}/result",
        json={"status": "completed", "result": json.dumps({
            "system": "Linux",
            "release": "6.8.0-45-generic",
            "version": "#45-Ubuntu SMP",
            "machine": "x86_64",
            "python": "3.12.3",
            "processor": "Intel(R) Xeon(R) Gold 6138 CPU @ 2.00GHz",
        })},
        headers={"X-Device-Token": device_token},
    )

    # 2. Queue get_resource_usage and report result
    q2 = client.post("/api/tasks", json={"device_id": device_id, "tool": "get_resource_usage", "args": {}}, headers={"X-Admin-Token": "adm-secret"})
    t2_id = q2.json()["task_id"]
    client.post(
        f"/api/agent/tasks/{t2_id}/result",
        json={"status": "completed", "result": json.dumps({
            "cpu_percent": 18.5,
            "memory_percent": 42.0,
            "memory_total_bytes": 16 * 1024 * 1024 * 1024,
            "memory_available_bytes": 9 * 1024 * 1024 * 1024,
            "disk_total_bytes": 100 * 1024 * 1024 * 1024,
            "disk_used_bytes": 35 * 1024 * 1024 * 1024,
            "disk_free_bytes": 65 * 1024 * 1024 * 1024,
        })},
        headers={"X-Device-Token": device_token},
    )

    # 3. Queue list_processes and report result
    q3 = client.post("/api/tasks", json={"device_id": device_id, "tool": "list_processes", "args": {}}, headers={"X-Admin-Token": "adm-secret"})
    t3_id = q3.json()["task_id"]
    client.post(
        f"/api/agent/tasks/{t3_id}/result",
        json={"status": "completed", "result": json.dumps([
            {"pid": 1, "name": "systemd", "cpu_percent": 0.1, "memory_percent": 0.2},
            {"pid": 890, "name": "dockerd", "cpu_percent": 1.2, "memory_percent": 2.5},
            {"pid": 1420, "name": "python", "cpu_percent": 5.4, "memory_percent": 3.8},
        ])},
        headers={"X-Device-Token": device_token},
    )

    # 4. Queue list_docker_containers and report result
    q4 = client.post("/api/tasks", json={"device_id": device_id, "tool": "list_docker_containers", "args": {}}, headers={"X-Admin-Token": "adm-secret"})
    t4_id = q4.json()["task_id"]
    client.post(
        f"/api/agent/tasks/{t4_id}/result",
        json={"status": "completed", "result": json.dumps({
            "available": True,
            "containers": [
                {"id": "c1a2b3c4d5e6", "image": "nginx:alpine", "status": "Up 4 days", "name": "prod-nginx-proxy"}
            ]
        })},
        headers={"X-Device-Token": device_token},
    )

    # 5. Queue get_network_info and report result
    q5 = client.post("/api/tasks", json={"device_id": device_id, "tool": "get_network_info", "args": {}}, headers={"X-Admin-Token": "adm-secret"})
    t5_id = q5.json()["task_id"]
    client.post(
        f"/api/agent/tasks/{t5_id}/result",
        json={"status": "completed", "result": json.dumps({
            "interfaces": [{"name": "eth0", "ipv4": ["192.168.1.50"]}],
            "listening_ports": [{"protocol": "TCP", "port": 80, "address": "0.0.0.0", "process": "nginx"}]
        })},
        headers={"X-Device-Token": device_token},
    )

    # Now verify overview aggregates all telemetry accurately
    ov_res = client.get(f"/api/devices/{device_id}/overview", headers={"X-Admin-Token": "adm-secret"})
    assert ov_res.status_code == 200
    ov = ov_res.json()

    assert ov["system_info"]["processor"] == "Intel(R) Xeon(R) Gold 6138 CPU @ 2.00GHz"
    assert ov["system_info"]["python"] == "3.12.3"
    assert ov["resource_usage"]["cpu_percent"] == 18.5
    assert ov["resource_usage"]["memory_percent"] == 42.0
    assert len(ov["resource_history"]) >= 1
    assert len(ov["processes"]) == 3
    assert ov["processes"][1]["name"] == "dockerd"
    assert ov["docker"]["available"] is True
    assert len(ov["docker"]["containers"]) == 1
    assert ov["docker"]["containers"][0]["name"] == "prod-nginx-proxy"
    assert ov["network"]["listening_ports"][0]["port"] == 80
    assert len(ov["recent_tasks"]) >= 5


def test_refresh_device_telemetry_endpoint(dash_setup):
    client = dash_setup["client"]
    device_id = dash_setup["device_id"]

    # Trigger refresh
    ref_res = client.post(f"/api/devices/{device_id}/refresh", json={}, headers={"X-Admin-Token": "adm-secret"})
    assert ref_res.status_code == 200
    ref_data = ref_res.json()
    assert ref_data["device_id"] == device_id
    assert len(ref_data["queued_tasks"]) == 3
    tools_queued = [t["tool"] for t in ref_data["queued_tasks"]]
    assert "get_system_info" in tools_queued
    assert "get_resource_usage" in tools_queued
    assert "get_network_info" in tools_queued

    # Device 404 test
    not_found = client.get("/api/devices/nonexistent123/overview", headers={"X-Admin-Token": "adm-secret"})
    assert not_found.status_code == 404

