"""Agent poller: outbound-only loop with long-polling, auto token rotation,
and bounded exponential backoff.

The agent never listens on a port. It heartbeats, asks for the next
queued task, executes it through ai_bridge.control.dispatch
(policy-enforced), and posts the result. On transient errors it backs
off 2s -> 4s -> ... capped at 60s, resetting on the next success.
"""
from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "src"))
from ai_bridge.control.dispatch import dispatch
from ai_bridge.policy import Policy
from ai_bridge.tools import default_policy

MAX_RESULT_CHARS = 512_000
ROTATE_THRESHOLD_SECONDS = 2 * 86400  # Rotate when < 48h remaining


class Poller:
    def __init__(
        self,
        control_url: str,
        device_token: str,
        *,
        policy: Policy | None = None,
        token_file: Path | None = None,
    ):
        self.control_url = control_url.rstrip("/")
        self.device_token = device_token
        self._explicit_policy = policy
        self.policy = policy if policy is not None else default_policy()
        self.token_file = token_file or (Path.home() / ".ai-bridge" / "device.token")
        self.backoff = 2.0

    def _req(self, method: str, path: str, payload: dict | None = None, timeout: int = 15) -> dict:
        data = json.dumps(payload).encode() if payload is not None else None
        req = urllib.request.Request(
            self.control_url + path,
            data=data,
            method=method,
            headers={
                "X-Device-Token": self.device_token,
                "Content-Type": "application/json",
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return json.loads(resp.read() or b"{}")
        except urllib.error.HTTPError as exc:
            raise RuntimeError(f"Control plane returned HTTP {exc.code}")

    def _save_token(self, token: str) -> None:
        try:
            self.token_file.parent.mkdir(parents=True, exist_ok=True)
            tmp_file = self.token_file.with_name(f"{self.token_file.name}.tmp")
            tmp_file.write_text(token, encoding="utf-8")
            try:
                os.chmod(tmp_file, 0o600)
            except OSError:
                pass
            tmp_file.replace(self.token_file)
            try:
                os.chmod(self.token_file, 0o600)
            except OSError:
                pass
        except OSError:
            pass

    def _load_saved_token(self) -> str | None:
        try:
            if self.token_file.exists():
                tok = self.token_file.read_text(encoding="utf-8").strip()
                return tok or None
        except OSError:
            pass
        return None

    def rotate_token(self) -> str:
        res = self._req("POST", "/api/agent/rotate", {})
        new_tok = res.get("device_token")
        if new_tok:
            self.device_token = new_tok
            self._save_token(new_tok)
        return self.device_token

    def heartbeat(self) -> dict:
        try:
            hb = self._req("POST", "/api/agent/heartbeat", {})
        except RuntimeError as exc:
            if "HTTP 401" in str(exc):
                saved = self._load_saved_token()
                if saved and saved != self.device_token:
                    self.device_token = saved
                    hb = self._req("POST", "/api/agent/heartbeat", {})
                else:
                    raise
            else:
                raise
        expires = hb.get("token_expires_at")
        if isinstance(expires, (int, float)) and expires - time.time() < ROTATE_THRESHOLD_SECONDS:
            try:
                self.rotate_token()
            except Exception:
                pass
        return hb

    def _effective_policy(self, remote_policy: dict | None) -> Policy:
        base = self._explicit_policy if self._explicit_policy is not None else default_policy()
        if not isinstance(remote_policy, dict):
            return base
        remote_apps = remote_policy.get("allowed_apps")
        if remote_apps:
            allowed_apps = base.allowed_apps & frozenset(remote_apps) if base.allowed_apps else frozenset(remote_apps)
        else:
            allowed_apps = base.allowed_apps
        return Policy(
            allow_writes=base.allow_writes and bool(remote_policy.get("allow_writes", True)),
            allow_tier3=base.allow_tier3 or bool(remote_policy.get("allow_tier3")),
            desktop_enabled=base.desktop_enabled and bool(remote_policy.get("desktop_enabled", True)),
            allowed_apps=allowed_apps,
            allowed_services=base.allowed_services | frozenset(remote_policy.get("allowed_services") or []),
            allowed_test_commands=base.allowed_test_commands,
            max_tier_unattended=base.max_tier_unattended,
        )

    def run_once(self, wait: int = 0) -> dict:
        self.heartbeat()
        path = f"/api/agent/tasks/next?wait={wait}" if wait > 0 else "/api/agent/tasks/next"
        nxt = self._req("GET", path, timeout=max(15, wait + 5))
        task = nxt.get("task")
        if not task:
            self.backoff = 2.0
            return {"task": None, "emergency_stop": nxt.get("emergency_stop", False)}
        task_id = task["id"]
        try:
            args = json.loads(task.get("args_json") or "{}")
            eff_policy = self._effective_policy(task.get("policy"))
            result = dispatch(
                task["tool"],
                args,
                policy=eff_policy,
                approval_granted=bool(task.get("approval_granted")),
            )
            status, text = "completed", json.dumps(result, default=str)[:MAX_RESULT_CHARS]
        except PermissionError as exc:
            status, text = "failed", f"denied: {exc}"
        except Exception as exc:
            status, text = "failed", f"{type(exc).__name__}: {exc}"
        self._req("POST", f"/api/agent/tasks/{task_id}/result", {"status": status, "result": text})
        print(f"[{time.strftime('%H:%M:%S')}] Task {task_id} ({task['tool']}) -> {status}", flush=True)
        self.backoff = 2.0
        return {"task": task_id, "status": status}

    def run_forever(self) -> None:
        print(f"[{time.strftime('%H:%M:%S')}] AI Bridge Agent polling {self.control_url} ...", flush=True)
        had_error = False
        while True:
            try:
                out = self.run_once(wait=15)
                if had_error:
                    print(f"[{time.strftime('%H:%M:%S')}] Agent reconnected to control plane (OK).", flush=True)
                    had_error = False
                time.sleep(0.1 if out.get("task") else 0.5)
            except Exception as exc:
                had_error = True
                print(f"[{time.strftime('%H:%M:%S')}] Agent error (retry in {self.backoff:.0f}s): {exc}", flush=True)
                time.sleep(self.backoff)
                self.backoff = min(self.backoff * 2, 60.0)
