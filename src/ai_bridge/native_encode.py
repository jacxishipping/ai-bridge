"""Honest integration surface for optional `ai_bridge_native.dll` encode (Phase 9)."""
from __future__ import annotations

import os
from pathlib import Path
from typing import Any

_VALID_MODES = frozenset({"off", "auto", "prefer", "required"})


def native_encode_mode() -> str:
    raw = os.environ.get("AI_BRIDGE_NATIVE_ENCODE", "auto").strip().lower()
    if raw in _VALID_MODES:
        return raw
    if raw in ("0", "false", "no", "disabled"):
        return "off"
    if raw in ("1", "true", "yes", "on"):
        return "prefer"
    return "auto"


def native_dll_search_paths() -> list[str]:
    from ai_bridge.screen_capture import get_native_dll

    repo_root = Path(__file__).resolve().parents[2]
    paths = [
        repo_root / "windows-agent" / "build" / "Release" / "ai_bridge_native.dll",
        repo_root / "windows-agent" / "build" / "Debug" / "ai_bridge_native.dll",
        repo_root / "windows-agent" / "build" / "ai_bridge_native.dll",
    ]
    found = [str(p) for p in paths if p.exists()]
    loaded = get_native_dll()
    if loaded is not None:
        return found or ["(loaded)"]
    return [str(p) for p in paths]


def describe_native_encode() -> dict[str, Any]:
    mode = native_encode_mode()
    from ai_bridge.screen_capture import get_native_dll

    dll = get_native_dll() if mode != "off" else None
    has_encode = dll is not None and hasattr(dll, "aibridge_encode_h264_frame")
    paths = native_dll_search_paths()
    dll_present = any(Path(p).exists() for p in paths if not p.startswith("("))
    reason = ""
    if mode == "off":
        reason = "native_encode_disabled_by_env"
    elif dll is None:
        reason = "ai_bridge_native_dll_not_loaded"
    elif not has_encode:
        reason = "dll_missing_aibridge_encode_h264_frame"
    try:
        use_native_timing = should_use_native_encode_timing()
    except RuntimeError as exc:
        use_native_timing = False
        if not reason:
            reason = str(exc)
    return {
        "mode": mode,
        "dll_loaded": dll is not None,
        "dll_on_disk": dll_present,
        "encode_export_available": has_encode,
        "use_native_encode_timing": use_native_timing,
        "fallback": "pyav_screen_track",
        "search_paths": paths[:5],
        "reason": reason,
        "webrtc_path": "python_aiortc_pyav (native DLL does not replace libwebrtc)",
        "libwebrtc_e2e": os.environ.get("AI_BRIDGE_LIBWEBRTC_E2E_VERIFIED", "").strip().lower()
        in ("1", "true", "yes"),
        "libwebrtc_status": (
            "verified"
            if os.environ.get("AI_BRIDGE_LIBWEBRTC_E2E_VERIFIED", "").strip().lower()
            in ("1", "true", "yes")
            else "unverified"
        ),
        "shipping_path": "python_aiortc",
        "honesty": (
            "Fleet WebRTC uses Python aiortc/PyAV. Optional ai_bridge_native.dll only "
            "provides H.264 encode timing smoke — not a C++ libwebrtc media path. "
            "See scripts/libwebrtc_e2e_checklist.md."
        ),
    }


def should_use_native_encode_timing() -> bool:
    mode = native_encode_mode()
    if mode == "off":
        return False
    if mode == "required":
        from ai_bridge.screen_capture import get_native_dll

        dll = get_native_dll()
        if dll is None or not hasattr(dll, "aibridge_encode_h264_frame"):
            raise RuntimeError("AI_BRIDGE_NATIVE_ENCODE=required but ai_bridge_native.dll encode is unavailable")
        return True
    if mode in ("auto", "prefer"):
        from ai_bridge.screen_capture import get_native_dll

        dll = get_native_dll()
        return dll is not None and hasattr(dll, "aibridge_encode_h264_frame")
    return False


def encoder_backend_label(*, native_timing_ran: bool) -> str:
    if native_timing_ran:
        return "ai_bridge_native.dll (MF H.264 smoke timing)"
    mode = native_encode_mode()
    if mode != "off":
        return "PyAV (aiortc) — native timing unavailable"
    return "PyAV (aiortc)"