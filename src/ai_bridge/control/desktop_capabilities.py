"""Cross-OS desktop stream / automation honesty matrix (Phase 9)."""
from __future__ import annotations

import platform
from typing import Any

_STATIC_MATRIX: dict[str, dict[str, Any]] = {
    "Windows": {
        "agent_entrypoint": "agents/windows/agent_main.py",
        "webrtc_desktop_stream": True,
        "desktop_automation": True,
        "ocr_som": True,
        "native_capture_dll": True,
        "verified_on_target_ci": False,
        "notes": "Primary fleet path; optional ai_bridge_native.dll for DXGI/input.",
    },
    "Linux": {
        "agent_entrypoint": "agents/linux/agent_main.py",
        "webrtc_desktop_stream": False,
        "desktop_automation": "partial",
        "ocr_som": False,
        "native_capture_dll": False,
        "verified_on_target_ci": False,
        "notes": "xdotool when DISPLAY/WAYLAND present; no WebRTC desktop track.",
    },
    "Darwin": {
        "agent_entrypoint": "agents/macos/agent_main.py",
        "webrtc_desktop_stream": False,
        "desktop_automation": False,
        "ocr_som": False,
        "native_capture_dll": False,
        "verified_on_target_ci": False,
        "notes": "Entrypoint present; desktop stream/OCR not verified on macOS hardware.",
    },
}


def build_capability_matrix(*, include_host: bool = True) -> dict[str, Any]:
    from ai_bridge import tools

    host_os = platform.system()
    host_status = tools.get_desktop_status() if include_host else {}
    matrix = {os_name: {**row} for os_name, row in _STATIC_MATRIX.items()}
    return {
        "schema": "ai-bridge-desktop-capabilities/v1",
        "host_os": host_os,
        "host_live_status": host_status,
        "platforms": matrix,
        "residual_gaps": [
            "macos_on_target_verification",
            "linux_webrtc_desktop_stream",
            "native_cpp_agent_e2e_with_dashboard",
        ],
    }