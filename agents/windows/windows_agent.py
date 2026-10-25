"""Windows agent: same tool contract, Windows backends.

- Services: `sc query <name>` (fixed argv, validated name).
- Event Logs: a fixed PowerShell cmdlet string — no user-supplied script
  text is ever executed; the log name / count are validated.
- Processes/disk: psutil / shutil, same as Linux.
- Desktop automation lives in desktop_helper.py and only runs in an
  interactive logged-in session, never as SYSTEM.
This module imports cleanly on Linux for testing; Windows-only calls
return 'unavailable' there and are marked as such in docs.
"""
from __future__ import annotations

import platform
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "src"))
from ai_bridge import diagnostics


def windows_system_info() -> dict:
    info = diagnostics.system_info()
    info["windows_edition"] = platform.win32_edition() if platform.system() == "Windows" else "n/a (not Windows)"
    return info

def windows_service_status(service: str) -> dict:
    return diagnostics.service_status(service)

def windows_event_logs(log_name: str = "System", max_events: int = 50) -> str:
    if log_name not in {"System", "Application", "Security"}:
        raise ValueError("Log name must be System, Application, or Security.")
    if platform.system() != "Windows":
        return "unavailable: Windows Event Log requires Windows (this host is not Windows)."
    return diagnostics._run(["powershell", "-NoProfile", "-NonInteractive", "-Command",
                            f"Get-WinEvent -LogName {log_name} -MaxEvents {max(1, min(max_events, 200))} | "
                            "Select-Object TimeCreated,LevelDisplayName,Message | Format-List"], timeout=15)
