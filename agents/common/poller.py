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
from ai_bridge.tools import default_policy


class Poller:
    def __init__(self, control_url: str, device_token: str, *, policy: Policy | None = None):
        self.control_url = control_url.rstrip("/")
        self.device_token = device_token
        self._explicit_policy = policy
        self.policy = policy if policy is not None else default_policy()
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

    def _effective_policy(self, remote_policy: dict | None) -> Policy:
        base = self._explicit_policy if self._explicit_policy is not None else default_policy()
        if not isinstance(remote_policy, dict):
            return base
        return Policy(
            allow_writes=base.allow_writes,
            allow_tier3=base.allow_tier3 or bool(remote_policy.get("allow_tier3")),
            desktop_enabled=base.desktop_enabled or bool(remote_policy.get("desktop_enabled")),
            allowed_apps=base.allowed_apps | frozenset(remote_policy.get("allowed_apps") or []),
            allowed_services=base.allowed_services | frozenset(remote_policy.get("allowed_services") or []),
            allowed_test_commands=base.allowed_test_commands,
            max_tier_unattended=base.max_tier_unattended,
        )

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
            eff_policy = self._effective_policy(task.get("policy"))
            result = dispatch(task["tool"], args, policy=eff_policy,
                              approval_granted=bool(task.get("approval_granted")))
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
