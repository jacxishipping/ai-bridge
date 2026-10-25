"""Bounded, cancellable execution of allowlisted operations only.

There is deliberately NO run_any_command() in this module. Callers pass a
task name from TASK_REGISTRY; the registry maps it to a fixed argv
template plus a strict argument validator. Unknown names are rejected.
Cancellation kills the whole process group.
"""
from __future__ import annotations

import os
import signal
import subprocess
import threading
import time
import uuid
from dataclasses import dataclass
from pathlib import Path as _Path

from .config import get_settings
from .security import truncate_output


def _validate_test_command(command: str) -> list[str]:
    # Only exact, well-known test invocations; no flags that run code
    # outside the workspace (e.g. no -k injection beyond a safe token).
    allowed = {"pytest": ["pytest", "-q"], "npm test": ["npm", "test", "--silent"],
               "go test": ["go", "test", "./..."]}
    if command not in allowed:
        raise ValueError(f"Test command not allowlisted: {command!r}")
    return allowed[command]

TASK_REGISTRY: dict[str, str] = {
    "uptime": "uptime", "disk_usage": "disk_usage", "memory_summary": "memory_summary",
    "cpu_summary": "cpu_summary", "run_project_tests": "run_project_tests",
    "run_linter": "run_linter",
}

@dataclass
class TaskResult:
    task_id: str
    name: str
    status: str  # pending|running|completed|failed|cancelled|timed_out
    output: str = ""
    started_at: float = 0.0
    finished_at: float | None = None
    returncode: int | None = None

class TaskRunner:
    """In-process runner used by the local MCP server and the control plane
    for the *local* device. Remote devices are executed by their agent
    polling the control plane (see agents/common)."""
    def __init__(self) -> None:
        self._tasks: dict[str, TaskResult] = {}
        self._procs: dict[str, subprocess.Popen] = {}
        self._lock = threading.Lock()
        self._sem = threading.Semaphore(get_settings().max_concurrent_tasks)

    def submit(self, name: str, *, timeout: int = 30, cwd: str | None = None,
               test_command: str = "pytest") -> TaskResult:
        if name not in TASK_REGISTRY:
            raise ValueError(f"Task not allowed. Choose one of: {', '.join(sorted(TASK_REGISTRY))}")
        timeout = max(1, min(timeout, get_settings().max_timeout_s))
        task_id = uuid.uuid4().hex[:12]
        result = TaskResult(task_id=task_id, name=name, status="pending", started_at=time.time())
        with self._lock:
            self._tasks[task_id] = result
        threading.Thread(target=self._run, args=(result, name, timeout, cwd, test_command),
                         daemon=True).start()
        return result

    def _argv(self, name: str, test_command: str) -> list[str] | None:
        # None means "implemented in Python, not a subprocess".
        if name == "run_project_tests":
            return _validate_test_command(test_command)
        if name == "run_linter":
            return ["python", "-m", "ruff", "check", "."]
        if name == "uptime":
            return ["uptime"]
        if name == "memory_summary":
            return ["free", "-h"]
        return None  # disk_usage / cpu_summary handled by diagnostics

    def _run(self, result: TaskResult, name: str, timeout: int, cwd: str | None, test_command: str) -> None:
        result.status = "running"
        try:
            argv = self._argv(name, test_command)
            if argv is None:
                from . import diagnostics
                if name == "disk_usage":
                    d = diagnostics.disk_usage("/")
                    result.output = str(d)
                else:
                    result.output = str(diagnostics.resource_usage())
                result.status = "completed"; result.returncode = 0
                return
            with self._sem:
                # Sandbox: minimal env, workspace cwd, hard resource limits.
                # No network namespace is enforced here (see docs/security.md:
                # use a container or proxy egress allowlist for that layer).
                def _limits():
                    try:
                        import resource
                        resource.setrlimit(resource.RLIMIT_CPU, (timeout + 10, timeout + 30))
                        resource.setrlimit(resource.RLIMIT_AS, (2 * 1024**3, 2 * 1024**3))
                        resource.setrlimit(resource.RLIMIT_FSIZE, (100 * 1024**2, 100 * 1024**2))
                    except Exception:
                        pass
                run_cwd = cwd or str(_Path(os.environ.get("AI_BRIDGE_WORKSPACE", "/tmp")).expanduser())
                # PATH is inherited so venv tools (pytest) resolve; all other env
                # vars (which may carry secrets) are deliberately dropped.
                clean_env = {"PATH": os.environ.get("PATH", "/usr/local/bin:/usr/bin:/bin"), "HOME": run_cwd, "LANG": "C.UTF-8"}
                proc = subprocess.Popen(argv, shell=False, stdout=subprocess.PIPE,
                                        stderr=subprocess.STDOUT, text=True,
                                        cwd=run_cwd, start_new_session=True,
                                        env=clean_env, preexec_fn=_limits)
                with self._lock:
                    self._procs[result.task_id] = proc
                try:
                    out, _ = proc.communicate(timeout=timeout)
                    result.output = truncate_output(out or "")
                    result.returncode = proc.returncode
                    result.status = "completed" if proc.returncode == 0 else "failed"
                except subprocess.TimeoutExpired:
                    self._kill(proc)
                    result.output = f"Task timed out after {timeout}s."
                    result.status = "timed_out"
        except Exception as exc:  # keep the runner alive; record the failure
            result.output = truncate_output(f"{type(exc).__name__}: {exc}")
            result.status = "failed"
        finally:
            result.finished_at = time.time()
            with self._lock:
                self._procs.pop(result.task_id, None)

    @staticmethod
    def _kill(proc: subprocess.Popen) -> None:
        try:
            os.killpg(proc.pid, signal.SIGTERM)
        except Exception:
            try:
                proc.kill()
            except Exception:
                pass

    def cancel(self, task_id: str) -> bool:
        with self._lock:
            proc = self._procs.get(task_id)
            result = self._tasks.get(task_id)
        if proc is not None:
            self._kill(proc)
            if result is not None:
                result.status = "cancelled"
            return True
        if result is not None and result.status in {"pending", "running"}:
            result.status = "cancelled"
            return True
        return False

    def get(self, task_id: str) -> TaskResult | None:
        return self._tasks.get(task_id)

RUNNER = TaskRunner()
