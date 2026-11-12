"""Headless support report for the AI Bridge desktop app (``--diagnose``).

Runs anywhere Python does: no Tkinter, no Windows APIs. Produces a JSON document
covering the platform, where the app keeps its state, whether the device token is
present/readable and how it is protected, the non-secret configuration, and
whether the control plane answers ``/health``.

The device token is reported only as a masked hint (``tok-de…3456``) — never in
full, because this output is meant to be pasted into support tickets.
"""
from __future__ import annotations

import json
import platform
import time
import urllib.error
import urllib.request
from collections.abc import Callable
from pathlib import Path
from typing import Any

import app_runtime as runtime

APP_NAME = "ai-bridge-windows-agent"
DEFAULT_CONFIG_FILE = runtime.DEFAULT_TOKEN_FILE.parent / "agent_gui.json"
SAFE_CONFIG_KEYS = (
    "control_url",
    "theme",
    "auto_start",
    "minimize_to_tray",
    "desktop_notifications",
    "poll_wait_s",
    "desktop_enabled",
    "allow_tier3",
    "max_tier_unattended",
    "allow_writes",
    "allow_shell",
)


def health_url(control_url: str) -> str:
    """Turn a control-plane URL into its health endpoint."""
    base = (control_url or "").strip()
    if not base:
        return ""
    if "://" not in base:
        base = "https://" + base
    base = base.rstrip("/")
    if base.endswith("/health"):
        return base
    return base + "/health"


def probe_control_plane(control_url: str, *, timeout: float = 5.0) -> dict[str, Any]:
    """GET ``<control_url>/health``; return a structured result, never raise."""
    url = health_url(control_url)
    result: dict[str, Any] = {
        "url": url or None,
        "ok": False,
        "http_status": None,
        "health_status": None,
        "latency_ms": None,
        "error": None,
    }
    if not url:
        result["error"] = "control_url is not configured"
        return result

    started = time.monotonic()
    try:
        request = urllib.request.Request(url, headers={"User-Agent": f"{APP_NAME}/diagnose"})
        with urllib.request.urlopen(request, timeout=timeout) as response:
            status = int(getattr(response, "status", 0) or 0)
            result["http_status"] = status
            result["ok"] = 200 <= status < 400
            body = response.read(4096)
        try:
            payload = json.loads(body.decode("utf-8"))
            if isinstance(payload, dict):
                result["health_status"] = payload.get("status")
        except (UnicodeDecodeError, ValueError):
            pass
    except urllib.error.HTTPError as exc:
        result["http_status"] = exc.code
        result["error"] = f"HTTP {exc.code}"
    except Exception as exc:
        result["error"] = f"{type(exc).__name__}: {exc}"
    finally:
        result["latency_ms"] = round((time.monotonic() - started) * 1000, 1)
    return result


def _read_config_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}
    return payload if isinstance(payload, dict) else {}


def _config_section(config: dict[str, Any], config_file: Path) -> dict[str, Any]:
    on_disk = _read_config_json(config_file)
    return {
        "path": str(config_file),
        "file_exists": config_file.exists(),
        "control_url": config.get("control_url", ""),
        "device_token_in_json": runtime.CONFIG_TOKEN_KEY in on_disk,
        "settings": {key: config.get(key) for key in SAFE_CONFIG_KEYS if key in config},
    }


def _token_section(token_file: Path) -> dict[str, Any]:
    section: dict[str, Any] = {
        "path": str(token_file),
        "file_exists": token_file.exists(),
        "present": False,
        "readable": True,
        "backend": "file",
        "masked": "(unset)",
        "error": None,
    }
    if not token_file.exists():
        return section

    section["backend"] = runtime.token_backend(token_file)
    try:
        token = runtime.load_token(token_file)
    except runtime.TokenStoreError as exc:
        section["readable"] = False
        section["error"] = str(exc)
        return section
    section["present"] = bool(token)
    section["masked"] = runtime.mask_secret(token)
    return section


def _checks(token: dict[str, Any], config: dict[str, Any], connectivity: dict[str, Any]) -> list[dict[str, Any]]:
    return [
        {"name": "device_token_present", "ok": bool(token["present"]), "detail": token["masked"]},
        {"name": "device_token_readable", "ok": bool(token["readable"]), "detail": token["error"] or token["backend"]},
        {"name": "control_url_configured", "ok": bool((config.get("control_url") or "").strip()), "detail": config.get("control_url") or "(unset)"},
        {"name": "control_plane_reachable", "ok": bool(connectivity["ok"]), "detail": connectivity["error"] or f"HTTP {connectivity['http_status']}"},
    ]


def build_report(
    load_config: Callable[[], dict[str, Any]] | None = None,
    *,
    config_file: Path | None = None,
    token_file: Path | None = None,
    gui_available: bool | None = None,
    timeout: float = 5.0,
) -> dict[str, Any]:
    """Collect the diagnostic document. Never raises for a normal bad state."""
    cfg_path = Path(config_file) if config_file is not None else DEFAULT_CONFIG_FILE
    tok_path = Path(token_file) if token_file is not None else runtime.DEFAULT_TOKEN_FILE

    errors: list[str] = []
    config: dict[str, Any] = {}
    try:
        config = load_config() if load_config is not None else _read_config_json(cfg_path)
    except Exception as exc:  # a broken config must not defeat the report
        errors.append(f"config: {type(exc).__name__}: {exc}")
        config = {}

    token = _token_section(tok_path)
    config_section = _config_section(config, cfg_path)
    connectivity = probe_control_plane(config.get("control_url", ""), timeout=timeout)
    checks = _checks(token, config, connectivity)
    if token["error"]:
        errors.append(f"token: {token['error']}")

    return {
        "app": APP_NAME,
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
        "ok": all(check["ok"] for check in checks),
        "platform": {
            "system": platform.system(),
            "release": platform.release(),
            "machine": platform.machine(),
            "python": platform.python_version(),
            "implementation": platform.python_implementation(),
            "is_windows": runtime.is_windows(),
        },
        "capabilities": {
            "dpapi_available": runtime.dpapi_available(),
            "gui_available": gui_available,
        },
        "paths": {
            "config_file": str(cfg_path),
            "token_file": str(tok_path),
            "log_dir": str(cfg_path.parent / "logs"),
        },
        "token": token,
        "config": config_section,
        "connectivity": connectivity,
        "checks": checks,
        "errors": errors,
    }
