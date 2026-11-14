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
        "notes": "X11 + xdotool only; Wayland-only sessions are not automated; no WebRTC desktop track.",
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


def normalize_platform_family(os_value: str | None) -> str:
    """Map a device/host OS string to Windows | Linux | Darwin | Unknown.

    Never use bare ``\"win\" in raw`` — that falsely matches Darwin (``\"win\" in \"darwin\"``).
    """
    raw = (os_value or "").strip().lower()
    if not raw:
        return "Unknown"
    # Darwin / macOS first (before any Windows token checks).
    if (
        raw == "darwin"
        or "darwin" in raw
        or "macos" in raw
        or raw.startswith("mac os")
        or raw.startswith("macos")
        or raw in {"mac", "osx", "os x"}
    ):
        return "Darwin"
    # Windows: explicit tokens only (win32 / windows / WinNT) — not the substring "win".
    if (
        raw in {"win32", "win64", "winnt", "windows"}
        or raw.startswith("windows")
        or raw.startswith("win32")
        or raw.startswith("win64")
        or raw.startswith("winnt")
    ):
        return "Windows"
    if (
        "linux" in raw
        or "ubuntu" in raw
        or "debian" in raw
        or "fedora" in raw
        or "centos" in raw
        or "rhel" in raw
    ):
        return "Linux"
    return "Unknown"


def platform_supports_webrtc_desktop_stream(os_value: str | None) -> bool:
    """True only for Windows desktop stream hosts (case-insensitive win32/Windows)."""
    return normalize_platform_family(os_value) == "Windows"


def stream_gate_for_os(os_value: str | None) -> dict[str, Any]:
    """Return an honesty gate decision for Live Desktop session create."""
    family = normalize_platform_family(os_value)
    row = _STATIC_MATRIX.get(family)
    # Only Windows is a desktop WebRTC stream host — ignore accidental matrix flips.
    if family == "Windows" and platform_supports_webrtc_desktop_stream(os_value):
        return {
            "allowed": True,
            "platform": family,
            "stream_available": True,
            "reason": "",
        }
    notes = (row or {}).get("notes") if row else "Unknown or unreported device OS."
    if family == "Linux":
        reason = "linux_webrtc_desktop_stream_unavailable"
    elif family == "Darwin":
        reason = "macos_webrtc_desktop_stream_unavailable"
    elif family == "Unknown":
        reason = "device_os_unknown_stream_unavailable"
    else:
        reason = "webrtc_desktop_stream_unavailable"
    return {
        "allowed": False,
        "platform": family,
        "stream_available": False,
        "reason": reason,
        "detail": notes or "WebRTC desktop streaming is only available on Windows desktop hosts.",
    }


def build_capability_matrix(*, include_host: bool = True) -> dict[str, Any]:
    from ai_bridge import tools
    from ai_bridge import webrtc_stream

    host_os = platform.system()
    host_status = tools.get_desktop_status() if include_host else {}
    matrix = {os_name: {**row} for os_name, row in _STATIC_MATRIX.items()}
    audio_opt_in = bool(webrtc_stream.desktop_audio_opt_in())
    capture_ok = bool(webrtc_stream.desktop_audio_capture_implemented())
    try:
        from ai_bridge import desktop_audio as desktop_audio_mod

        probe = desktop_audio_mod.probe_wasapi_loopback()
    except Exception:
        probe = {"available": False, "reason": "probe_unavailable"}
    residuals = [
        "macos_on_target_verification",
        "linux_webrtc_desktop_stream",
        "native_cpp_agent_e2e_with_dashboard",
    ]
    if not capture_ok:
        residuals.append("wasapi_live_desktop_audio_capture")
    if audio_opt_in and capture_ok:
        audio_reason = "AI_BRIDGE_DESKTOP_AUDIO opted in; WASAPI loopback capture available"
    elif audio_opt_in:
        audio_reason = (
            "AI_BRIDGE_DESKTOP_AUDIO opted in; live loopback unavailable "
            f"({probe.get('reason')}) — emitting silent PCM"
        )
    else:
        audio_reason = "desktop audio off by default (set AI_BRIDGE_DESKTOP_AUDIO=1 to attach track)"
    return {
        "schema": "ai-bridge-desktop-capabilities/v1",
        "host_os": host_os,
        "host_live_status": {
            **host_status,
            # Explicit: this block is the control-plane process host, not a fleet device.
            "scope": "control_plane_host",
        },
        "platforms": matrix,
        "desktop_audio": {
            "opt_in": audio_opt_in,
            "capture_implemented": capture_ok,
            "probe": probe,
            "scope": "control_plane_host",
            "reason": audio_reason,
        },
        "residual_gaps": residuals,
    }