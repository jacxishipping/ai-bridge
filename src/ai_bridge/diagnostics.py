"""Read-only diagnostics, cross-platform, no shell interpolation.

All subprocess calls use argument arrays, shell=False, and timeouts.
Docker / systemctl / journalctl are probed only if present; absence is
reported as 'unavailable', never as an error that leaks paths.
"""
from __future__ import annotations

import platform
import shutil
import subprocess

from .security import truncate_output


def _run(argv: list[str], timeout: int = 10) -> str:
    try:
        c = subprocess.run(argv, shell=False, capture_output=True, text=True, timeout=timeout)
    except FileNotFoundError:
        return "unavailable: command not found"
    except subprocess.TimeoutExpired:
        return "unavailable: timed out"
    except OSError as exc:
        return f"unavailable: {type(exc).__name__}"
    return truncate_output((c.stdout + c.stderr).strip() or f"exit={c.returncode}")

def system_info() -> dict:
    return {"system": platform.system(), "release": platform.release(),
            "version": platform.version(), "machine": platform.machine(),
            "python": platform.python_version(), "processor": platform.processor()}

def resource_usage() -> dict:
    try:
        import psutil
        vm = psutil.virtual_memory(); cpu = psutil.cpu_percent(interval=0.1)
        disk = psutil.disk_usage("/")
        return {"cpu_percent": cpu, "memory_percent": vm.percent,
                "memory_total_bytes": vm.total, "memory_available_bytes": vm.available,
                "disk_total_bytes": disk.total, "disk_used_bytes": disk.used,
                "disk_free_bytes": disk.free}
    except Exception:
        total, used, free = shutil.disk_usage("/")
        return {"cpu_percent": None, "memory_percent": None,
                "disk_total_bytes": total, "disk_used_bytes": used, "disk_free_bytes": free,
                "note": "psutil unavailable; install psutil for CPU/memory detail"}

def disk_usage(path: str = "/") -> dict:
    total, used, free = shutil.disk_usage(path)
    return {"path": path, "total_bytes": total, "used_bytes": used, "free_bytes": free}

def memory_usage() -> dict:
    return resource_usage()

def list_processes(limit: int = 50) -> list[dict]:
    try:
        import psutil
        out = []
        for p in sorted(psutil.process_iter(["pid", "name", "cpu_percent", "memory_percent"]),
                        key=lambda x: (x.info.get("cpu_percent") or 0), reverse=True)[:limit]:
            out.append({"pid": p.info["pid"], "name": p.info["name"],
                        "cpu_percent": p.info["cpu_percent"], "memory_percent": p.info["memory_percent"]})
        return out
    except Exception:
        return [{"note": "psutil unavailable; process list requires psutil"}]

def service_status(service: str) -> dict:
    if not service or len(service) > 100 or any(c in service for c in ";/|&$`\\\"' \t\n"):
        raise ValueError("Invalid service name.")
    if platform.system() == "Windows":
        out = _run(["sc", "query", service])
        return {"service": service, "system": "Windows", "output": out}
    out = _run(["systemctl", "is-active", service])
    return {"service": service, "system": platform.system(), "output": out}

def recent_logs(source: str = "system", lines: int = 50) -> str:
    lines = max(1, min(lines, 200))
    if platform.system() == "Windows":
        # Fixed PowerShell cmdlet, no user script text is ever executed.
        return _run(["powershell", "-NoProfile", "-NonInteractive", "-Command",
                     f"Get-WinEvent -LogName System -MaxEvents {lines} | "
                     "Select-Object TimeCreated,LevelDisplayName,Message | Format-List"], timeout=15)
    if source == "system":
        return _run(["journalctl", "--no-pager", "-n", str(lines)], timeout=15)
    raise ValueError("Unknown log source. Use 'system'.")

def list_docker_containers() -> list[dict] | dict:
    if shutil.which("docker") is None:
        return {"available": False, "note": "Docker is not installed or not on PATH."}
    out = _run(["docker", "ps", "--format", "{{.ID}} {{.Image}} {{.Status}} {{.Names}}"], timeout=15)
    containers = []
    for line in out.splitlines():
        parts = line.split(maxsplit=3)
        if len(parts) == 4:
            containers.append({"id": parts[0], "image": parts[1], "status": parts[2], "name": parts[3]})
    return {"available": True, "containers": containers}
