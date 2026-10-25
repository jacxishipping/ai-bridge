"""Agent poller: outbound-only loop with bounded exponential backoff.

The agent never listens on a port. It heartbeats, asks for the next
queued task, executes it through ai_bridge.control.dispatch
(policy-enforced), and posts the result. On transient errors it backs
off 2s -> 4s -> ... capped at 60s, resetting on the next success.
"""
from __future__ import annotations

import json
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "src"))
from ai_bridge.control.dispatch import dispatch
from ai_bridge.policy import Policy


class Poller:
    def __init__(self, control_url: str, device_token: str, *, policy: Policy | None = None):
        self.control_url = control_url.rstrip("/")
        self.device_token = device_token
        self.policy = policy or Policy()
        self.backoff = 2.0

    def _req(self, method: str, path: str, payload: dict | None = None) -> dict:
        data = json.dumps(payload).encode() if payload is not None else None
        req = urllib.request.Request(self.control_url + path, data=data, method=method,
                                     headers={"X-Device-Token": self.device_token,
                                              "Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                return json.loads(resp.read() or b"{}")
        except urllib.error.HTTPError as exc:
            raise RuntimeError(f"Control plane returned HTTP {exc.code}")

    def heartbeat(self) -> dict:
        return self._req("POST", "/api/agent/heartbeat", {})

    def run_once(self) -> dict:
        self.heartbeat()
        nxt = self._req("GET", "/api/agent/tasks/next")
        task = nxt.get("task")
        if not task:
            self.backoff = 2.0
            return {"task": None, "emergency_stop": nxt.get("emergency_stop", False)}
        task_id = task["id"]
        try:
            args = json.loads(task.get("args_json") or "{}")
            result = dispatch(task["tool"], args, policy=self.policy)
            status, text = "completed", json.dumps(result, default=str)[:8000]
        except PermissionError as exc:
            status, text = "failed", f"denied: {exc}"
        except Exception as exc:
            status, text = "failed", f"{type(exc).__name__}: {exc}"
        self._req("POST", f"/api/agent/tasks/{task_id}/result", {"status": status, "result": text})
        self.backoff = 2.0
        return {"task": task_id, "status": status}

    def run_forever(self) -> None:
        while True:
            try:
                out = self.run_once()
                time.sleep(1.0 if out.get("task") else 5.0)
            except Exception as exc:
                print(f"Agent error (retry in {self.backoff:.0f}s): {exc}")
                time.sleep(self.backoff)
                self.backoff = min(self.backoff * 2, 60.0)
