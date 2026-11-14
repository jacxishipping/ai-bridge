"""Locust soak for concurrent claim/cancel.

  locust -f scripts/locust/claim_cancel_soak.py --host https://control.example \\
    --users 20 --spawn-rate 5 --run-time 5m --headless \\
    -e ADMIN_TOKEN=...
"""
from __future__ import annotations

import os
import time

from locust import HttpUser, between, task


class ClaimCancelUser(HttpUser):
    wait_time = between(0.1, 0.4)

    def on_start(self) -> None:
        admin = os.environ.get("ADMIN_TOKEN") or os.environ.get("AI_BRIDGE_ADMIN_TOKEN") or ""
        self.admin_headers = {"X-Admin-Token": admin, "Content-Type": "application/json"}
        res = self.client.post(
            "/api/devices/enroll",
            json={"name": f"locust-{id(self)}", "os": "Linux"},
            headers=self.admin_headers,
            name="enroll",
        )
        body = res.json()
        self.device_id = body["device_id"]
        self.device_token = body["device_token"]
        self.device_headers = {"X-Device-Token": self.device_token, "Content-Type": "application/json"}

    @task
    def claim_and_finish(self) -> None:
        self.client.post(
            "/api/tasks",
            json={"device_id": self.device_id, "tool": "get_system_info", "args": {}},
            headers=self.admin_headers,
            name="create_task",
        )
        t0 = time.perf_counter()
        nxt = self.client.get(
            "/api/agent/tasks/next?wait=0",
            headers={"X-Device-Token": self.device_token},
            name="claim_next",
        )
        _ = time.perf_counter() - t0
        task = (nxt.json() or {}).get("task")
        if not task:
            return
        if hash(task["id"]) % 3 == 0:
            self.client.post(
                f"/api/tasks/{task['id']}/cancel",
                headers=self.admin_headers,
                name="cancel_task",
            )
        else:
            self.client.post(
                f"/api/agent/tasks/{task['id']}/result",
                json={"status": "completed", "result": "{}"},
                headers=self.device_headers,
                name="complete_task",
            )
