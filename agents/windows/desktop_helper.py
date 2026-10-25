"""Interactive-session desktop helper.

MUST run as the logged-in user in that user's session — never as a
Windows service running as SYSTEM, which cannot see the user's desktop.
Enablement is explicit: AI_BRIDGE_DESKTOP_ENABLED=1, plus the app must be
on the admin-approved list (AI_BRIDGE_ALLOWED_APPS). Without Pillow or an
interactive session, screenshot() returns available=False honestly.
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "src"))
from ai_bridge import tools


def status() -> dict:
    return tools.get_desktop_status()

def screenshot() -> dict:
    return tools.capture_desktop_screenshot()

def launch(app_name: str) -> dict:
    return tools.launch_approved_application(app_name)
