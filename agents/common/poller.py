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
import platform
import sys
import threading
import time
import urllib.error
import urllib.request
from collections.abc import Callable
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "src"))
from ai_bridge.control.dispatch import dispatch
from ai_bridge.control.task_runtime import TaskCancelled, clear_execution_context, set_execution_context
from ai_bridge.policy import Policy
from ai_bridge.tools import default_policy

from .spool import TaskSpooler

MAX_RESULT_CHARS = 512_000
ROTATE_THRESHOLD_SECONDS = 2 * 86400  # Rotate when < 48h remaining

# Operators sometimes paste the static dashboard URL; agents must hit the control plane API.
_DASHBOARD_TO_CONTROL = {
    "https://ai-bridge-dashboard.onrender.com": "https://ai-bridge-control.onrender.com",
    "http://ai-bridge-dashboard.onrender.com": "https://ai-bridge-control.onrender.com",
}


def normalize_control_url(url: str) -> str:
    """Strip trailing slash and remap known dashboard hosts to the control plane."""
    cleaned = (url or "").strip().rstrip("/")
    mapped = _DASHBOARD_TO_CONTROL.get(cleaned.lower()) or _DASHBOARD_TO_CONTROL.get(cleaned)
    if mapped:
        return mapped
    lower = cleaned.lower()
    if "ai-bridge-dashboard.onrender.com" in lower:
        return "https://ai-bridge-control.onrender.com"
    return cleaned


def _collect_metrics() -> dict:
    metrics: dict = {}
    try:
        import socket
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        try:
            s.connect(("8.8.8.8", 80))
            metrics["ip_address"] = s.getsockname()[0]
        finally:
            s.close()
    except Exception:
        pass

    try:
        import psutil
        vm = psutil.virtual_memory()
        cpu = psutil.cpu_percent(interval=None)
        root = os.path.splitdrive(os.getcwd())[0] or "/"
        if not root.endswith(os.sep):
            root += os.sep
        disk = psutil.disk_usage(root)
        metrics["cpu_percent"] = round(float(cpu), 1)
        metrics["memory_percent"] = round(float(vm.percent), 1)
        metrics["memory_total_gb"] = round(float(vm.total) / (1024 ** 3), 1)
        metrics["disk_percent"] = round(float(disk.percent), 1)
        metrics["disk_total_gb"] = round(float(disk.total) / (1024 ** 3), 1)
        boot_ts = psutil.boot_time()
        if boot_ts:
            metrics["uptime_hours"] = round(max(0.0, time.time() - float(boot_ts)) / 3600.0, 1)
    except Exception:
        try:
            import shutil
            root = os.path.splitdrive(os.getcwd())[0] or "/"
            if not root.endswith(os.sep):
                root += os.sep
            tot, used, free = shutil.disk_usage(root)
            if tot > 0:
                metrics["disk_percent"] = round((used / tot) * 100.0, 1)
                metrics["disk_total_gb"] = round(float(tot) / (1024 ** 3), 1)
        except Exception:
            pass
        if os.path.exists("/proc/uptime"):
            try:
                with open("/proc/uptime", encoding="utf-8") as f:
                    up_sec = float(f.read().split()[0])
                    metrics["uptime_hours"] = round(up_sec / 3600.0, 1)
            except Exception:
                pass
    return metrics


class Poller:
    def __init__(
        self,
        control_url: str,
        device_token: str,
        *,
        policy: Policy | None = None,
        token_file: Path | None = None,
        token_saver: Callable[[str], None] | None = None,
        token_loader: Callable[[], str | None] | None = None,
    ):
        self.control_url = normalize_control_url(control_url)
        self.device_token = device_token
        # WebRTC streaming tasks need these to signal back to the plane.
        try:
            from ai_bridge import webrtc_stream

            webrtc_stream.set_agent_context(self.control_url, self.device_token)
        except Exception:
            pass
        self._explicit_policy = policy
        self.policy = policy if policy is not None else default_policy()
        self.token_file = token_file or (Path.home() / ".ai-bridge" / "device.token")
        # Optional persistence hooks: the Windows desktop app uses these to keep
        # rotated tokens DPAPI-sealed instead of writing plaintext.
        self._token_saver = token_saver
        self._token_loader = token_loader
        spool_path = self.token_file.parent / "agent_spool.db" if self.token_file else None
        self.spooler = TaskSpooler(spool_path)
        self.backoff = 2.0
        self._wake = threading.Event()
        self._ws_cancel_task_id: str | None = None
        self._ws_cancel_lock = threading.Lock()
        self._ws_connected = threading.Event()
        self._ws_stop = threading.Event()
        self._active_cancel_event: threading.Event | None = None
        self._ws_thread: threading.Thread | None = None

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
                raw = resp.read() or b"{}"
                ctype = (resp.headers.get("Content-Type") or "").lower()
                try:
                    return json.loads(raw)
                except json.JSONDecodeError as exc:
                    snippet = raw[:120].decode("utf-8", errors="replace").replace("\n", " ")
                    hint = ""
                    if "text/html" in ctype or snippet.lstrip().startswith("<!"):
                        hint = (
                            " Got HTML instead of JSON — control_url is probably the dashboard. "
                            "Use https://ai-bridge-control.onrender.com (not *-dashboard.*)."
                        )
                    raise RuntimeError(
                        f"Control plane at {self.control_url} returned non-JSON for {path}.{hint} "
                        f"Parse error: {exc}. Body starts: {snippet!r}"
                    ) from exc
        except urllib.error.HTTPError as exc:
            body = ""
            try:
                body = (exc.read() or b"")[:200].decode("utf-8", errors="replace")
            except Exception:
                pass
            detail = f" body={body!r}" if body else ""
            raise RuntimeError(f"Control plane returned HTTP {exc.code} for {path}.{detail}") from exc

    def _save_token(self, token: str) -> None:
        if self._token_saver is not None:
            try:
                self._token_saver(token)
                return
            except Exception:
                pass
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
        if self._token_loader is not None:
            try:
                tok = self._token_loader()
                if tok and tok.startswith("aib-dpapi-v1:"):
                    return self._unseal_if_dpapi(tok)
                return tok
            except Exception:
                return None
        try:
            if self.token_file.exists():
                tok = self.token_file.read_text(encoding="utf-8").strip()
                if tok.startswith("aib-dpapi-v1:"):
                    tok = self._unseal_if_dpapi(tok)
                return tok or None
        except OSError:
            pass
        return None

    @staticmethod
    def _unseal_if_dpapi(tok: str) -> str:
        try:
            from windows.app_runtime import unseal_token
            return unseal_token(tok)
        except Exception:
            try:
                from app_runtime import unseal_token
                return unseal_token(tok)
            except Exception:
                return tok

    def rotate_token(self) -> str:
        res = self._req("POST", "/api/agent/rotate", {})
        new_tok = res.get("device_token")
        if new_tok:
            self.device_token = new_tok
            self._save_token(new_tok)
        return self.device_token

    def heartbeat(self) -> dict:
        hb_body = {
            "hostname": platform.node(),
            "os": f"{platform.system()} {platform.release()}".strip(),
            "metrics": _collect_metrics(),
        }
        try:
            hb = self._req("POST", "/api/agent/heartbeat", hb_body)
            from ai_bridge.plane_control_flags import set_emergency_stop

            set_emergency_stop(bool(hb.get("emergency_stop")))
        except RuntimeError as exc:
            if "HTTP 401" in str(exc):
                saved = self._load_saved_token()
                if saved and saved != self.device_token:
                    self.device_token = saved
                    hb = self._req("POST", "/api/agent/heartbeat", hb_body)
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

        unrestricted = bool(remote_policy.get("unrestricted", getattr(base, "unrestricted", False))) or getattr(base, "unrestricted", False)
        remote_denied = set(remote_policy.get("denied_tools") or [])
        if remote_policy.get("allow_shell") is False:
            remote_denied.update({"run_shell", "terminal_exec", "desktop_execute_command"})
        if remote_policy.get("allow_package_install") is False:
            remote_denied.add("install_package")
        remote_allowed = frozenset(remote_policy.get("allowed_tools") or []) if "allowed_tools" in remote_policy and remote_policy["allowed_tools"] is not None else None

        if unrestricted:
            return Policy(
                allow_writes=True,
                allow_tier3=True,
                desktop_enabled=True,
                max_tier_unattended=4,
                unrestricted=True,
                allowed_apps=base.allowed_apps or frozenset({"*"}),
                allowed_services=base.allowed_services or frozenset({"*"}),
                allowed_test_commands=frozenset({"*"}),
                allowed_tools=remote_allowed,
                denied_tools=base.denied_tools | frozenset(remote_denied),
            )

        remote_apps = remote_policy.get("allowed_apps")
        if remote_apps is not None:
            if self._explicit_policy and self._explicit_policy.allowed_apps:
                allowed_apps = frozenset(remote_apps) | self._explicit_policy.allowed_apps
            else:
                allowed_apps = frozenset(remote_apps) | base.allowed_apps
        else:
            allowed_apps = base.allowed_apps

        if self._explicit_policy is not None:
            allow_writes = bool(remote_policy.get("allow_writes", base.allow_writes)) or base.allow_writes
            allow_tier3 = bool(remote_policy.get("allow_tier3", base.allow_tier3)) or base.allow_tier3
            desktop_enabled = bool(remote_policy.get("desktop_enabled", base.desktop_enabled)) or base.desktop_enabled
            max_tier_unattended = max(int(remote_policy.get("max_tier_unattended", base.max_tier_unattended)), base.max_tier_unattended)
        else:
            allow_writes = bool(remote_policy.get("allow_writes", base.allow_writes))
            allow_tier3 = bool(remote_policy.get("allow_tier3", base.allow_tier3))
            desktop_enabled = bool(remote_policy.get("desktop_enabled", base.desktop_enabled))
            max_tier_unattended = int(remote_policy.get("max_tier_unattended", base.max_tier_unattended))
        return Policy(
            allow_writes=allow_writes,
            allow_tier3=allow_tier3,
            desktop_enabled=desktop_enabled,
            allowed_apps=allowed_apps,
            allowed_services=base.allowed_services | frozenset(remote_policy.get("allowed_services") or []),
            allowed_test_commands=base.allowed_test_commands,
            max_tier_unattended=max_tier_unattended,
            allowed_tools=remote_allowed,
            denied_tools=base.denied_tools | frozenset(remote_denied),
            unrestricted=False,
        )

    def _try_post_result(self, task_id: str, status: str, result: str) -> bool:
        try:
            self._req("POST", f"/api/agent/tasks/{task_id}/result", {"status": status, "result": result})
            return True
        except Exception:
            return False

    def run_once(self, wait: int = 0) -> dict:
        try:
            self.spooler.flush(self._try_post_result)
        except Exception:
            pass
        self.heartbeat()
        path = f"/api/agent/tasks/next?wait={wait}" if wait > 0 else "/api/agent/tasks/next"
        nxt = self._req("GET", path, timeout=max(15, wait + 5))
        task = nxt.get("task")
        from ai_bridge.plane_control_flags import set_emergency_stop

        set_emergency_stop(bool(nxt.get("emergency_stop")))
        if not task:
            self.backoff = 2.0
            return {"task": None, "emergency_stop": nxt.get("emergency_stop", False)}
        task_id = task["id"]
        cancel_stop = threading.Event()
        self._active_cancel_event = cancel_stop
        with self._ws_cancel_lock:
            if self._ws_cancel_task_id == task_id:
                cancel_stop.set()
                self._ws_cancel_task_id = None

        def _cancelled() -> bool:
            if cancel_stop.is_set():
                return True
            with self._ws_cancel_lock:
                if self._ws_cancel_task_id == task_id:
                    cancel_stop.set()
                    self._ws_cancel_task_id = None
                    return True
            try:
                st = self._req("GET", f"/api/agent/tasks/{task_id}/execution-state", timeout=8)
                if st.get("emergency_stop"):
                    set_emergency_stop(True)
                    return True
                set_emergency_stop(bool(st.get("emergency_stop")))
                return str(st.get("status") or "") in {"cancelled", "timed_out"}
            except Exception:
                return False

        def _cancel_poller() -> None:
            while not cancel_stop.is_set():
                if _cancelled():
                    cancel_stop.set()
                    return
                time.sleep(0.5)

        poll_thread = threading.Thread(target=_cancel_poller, daemon=True)
        set_execution_context(task_id, _cancelled, device_id=str(task.get("device_id") or ""))
        poll_thread.start()
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
        except TaskCancelled:
            status, text = "cancelled", json.dumps({"error": "Task cancelled or timed out."})
        except PermissionError as exc:
            status, text = "failed", f"denied: {exc}"
        except Exception as exc:
            status, text = "failed", f"{type(exc).__name__}: {exc}"
        finally:
            cancel_stop.set()
            self._active_cancel_event = None
            poll_thread.join(timeout=2.0)
            clear_execution_context()
        # Persist locally in spool before transmission
        self.spooler.spool(task_id, status, text)
        if self._try_post_result(task_id, status, text):
            self.spooler.mark_flushed(task_id)
        else:
            print(f"[{time.strftime('%H:%M:%S')}] Task {task_id} result spooled offline (will flush upon reconnect).", flush=True)
        print(f"[{time.strftime('%H:%M:%S')}] Task {task_id} ({task['tool']}) -> {status}", flush=True)
        self.backoff = 2.0
        return {"task": task_id, "status": status}

    def _handle_ws_message(self, msg: dict) -> None:
        from ai_bridge.plane_control_flags import set_emergency_stop

        mtype = str(msg.get("type") or "")
        if mtype == "task_available":
            self._wake.set()
        elif mtype == "cancel":
            tid = str(msg.get("task_id") or "")
            with self._ws_cancel_lock:
                self._ws_cancel_task_id = tid or self._ws_cancel_task_id
            if self._active_cancel_event is not None:
                self._active_cancel_event.set()
            if msg.get("emergency_stop"):
                set_emergency_stop(True)
            self._wake.set()
        elif mtype == "emergency_stop":
            set_emergency_stop(bool(msg.get("active")))
            if msg.get("active") and self._active_cancel_event is not None:
                self._active_cancel_event.set()
            self._wake.set()
        elif mtype == "hello":
            set_emergency_stop(bool(msg.get("emergency_stop")))

    def _ws_loop(self) -> None:
        """Best-effort wake/cancel side-channel; HTTP claim remains authoritative."""
        try:
            from websockets.sync.client import connect as ws_connect
        except Exception:
            print(f"[{time.strftime('%H:%M:%S')}] Agent WS unavailable (install websockets); HTTP poll only.", flush=True)
            return
        base = self.control_url
        if base.startswith("https://"):
            ws_url = "wss://" + base[len("https://") :] + "/api/agent/ws"
        elif base.startswith("http://"):
            ws_url = "ws://" + base[len("http://") :] + "/api/agent/ws"
        else:
            ws_url = base.rstrip("/") + "/api/agent/ws"
        backoff = 2.0
        while not self._ws_stop.is_set():
            try:
                with ws_connect(
                    ws_url,
                    additional_headers={"X-Device-Token": self.device_token},
                    open_timeout=15,
                    close_timeout=5,
                    ping_interval=20,
                    ping_timeout=20,
                ) as ws:
                    self._ws_connected.set()
                    backoff = 2.0
                    print(f"[{time.strftime('%H:%M:%S')}] Agent WS connected ({ws_url})", flush=True)
                    while not self._ws_stop.is_set():
                        try:
                            raw = ws.recv(timeout=30)
                        except TimeoutError:
                            try:
                                ws.send(json.dumps({"type": "heartbeat"}))
                            except Exception:
                                break
                            continue
                        if raw is None:
                            break
                        try:
                            msg = json.loads(raw) if isinstance(raw, (str, bytes, bytearray)) else {}
                        except Exception:
                            continue
                        if isinstance(msg, dict):
                            if msg.get("type") == "ping":
                                try:
                                    ws.send(json.dumps({"type": "pong"}))
                                except Exception:
                                    break
                            self._handle_ws_message(msg)
            except Exception as exc:
                self._ws_connected.clear()
                if self._ws_stop.is_set():
                    break
                print(f"[{time.strftime('%H:%M:%S')}] Agent WS reconnect in {backoff:.0f}s: {exc}", flush=True)
                time.sleep(backoff)
                backoff = min(backoff * 2, 60.0)
        self._ws_connected.clear()

    def start_side_channel(self) -> None:
        if self._ws_thread and self._ws_thread.is_alive():
            return
        self._ws_stop.clear()
        self._ws_thread = threading.Thread(target=self._ws_loop, name="ai-bridge-agent-ws", daemon=True)
        self._ws_thread.start()

    def stop_side_channel(self) -> None:
        self._ws_stop.set()
        self._wake.set()

    def run_forever(self) -> None:
        print(f"[{time.strftime('%H:%M:%S')}] AI Bridge Agent polling {self.control_url} ...", flush=True)
        self.start_side_channel()
        had_error = False
        while True:
            try:
                # Shorter long-poll when WS wake channel is up; full wait as fallback.
                wait = 5 if self._ws_connected.is_set() else 15
                self._wake.clear()
                out = self.run_once(wait=wait)
                if had_error:
                    print(f"[{time.strftime('%H:%M:%S')}] Agent reconnected to control plane (OK).", flush=True)
                    had_error = False
                if out.get("task"):
                    time.sleep(0.05)
                elif self._wake.wait(timeout=0.5):
                    self._wake.clear()
                else:
                    time.sleep(0.1)
            except Exception as exc:
                had_error = True
                print(f"[{time.strftime('%H:%M:%S')}] Agent error (retry in {self.backoff:.0f}s): {exc}", flush=True)
                time.sleep(self.backoff)
                self.backoff = min(self.backoff * 2, 60.0)
