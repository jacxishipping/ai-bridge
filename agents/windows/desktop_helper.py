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

def ocr() -> dict:
    return tools.ocr_screen()

def click_text(text: str, occurrence: int = 1, button: str = "left", clicks: int = 1) -> dict:
    return tools.click_text(text, occurrence=occurrence, button=button, clicks=clicks)

def click_element(mark_id: str | None = None, name: str | None = None, button: str = "left", clicks: int = 1) -> dict:
    return tools.click_element(mark_id=mark_id, name=name, button=button, clicks=clicks)

def list_elements() -> dict:
    return tools.list_ui_elements()

def set_of_marks(max_marks: int = 40) -> dict:
    return tools.set_of_marks_screenshot(max_marks=max_marks)


if __name__ == "__main__":
    import json

    cmd = sys.argv[1] if len(sys.argv) > 1 else "status"
    if cmd == "status":
        print(json.dumps(status(), indent=2))
    elif cmd == "screenshot":
        print(json.dumps(screenshot(), indent=2))
    elif cmd == "ocr":
        print(json.dumps(ocr(), indent=2))
    elif cmd == "list_elements":
        print(json.dumps(list_elements(), indent=2))
    elif cmd == "set_of_marks":
        print(json.dumps(set_of_marks(), indent=2))
    elif cmd == "click_text" and len(sys.argv) > 2:
        print(json.dumps(click_text(sys.argv[2]), indent=2))
    elif cmd == "click_element" and len(sys.argv) > 2:
        print(json.dumps(click_element(mark_id=sys.argv[2]), indent=2))
    elif cmd == "launch" and len(sys.argv) > 2:
        print(json.dumps(launch(sys.argv[2]), indent=2))
    else:
        print(f"Unknown or incomplete command: {cmd}")
