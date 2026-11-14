"""Production profile checklist for deploy gates and /health/ready."""
from __future__ import annotations

import json
import os
from typing import Any


def is_production_profile() -> bool:
    profile = os.environ.get("AI_BRIDGE_PROFILE", os.environ.get("RENDER", "")).strip().lower()
    return profile in ("production", "prod", "1", "true", "yes") or bool(os.environ.get("RENDER"))


def turn_credentials_configured() -> bool:
    if os.environ.get("AI_BRIDGE_TURN_SECRET", "").strip():
        return True
    if os.environ.get("AI_BRIDGE_TURN_URL", "").strip():
        return True
    raw = os.environ.get("AI_BRIDGE_ICE_SERVERS", "").strip()
    if raw:
        try:
            parsed = json.loads(raw)
            return isinstance(parsed, list) and bool(parsed)
        except json.JSONDecodeError:
            return False
    return False


def assess_production_readiness(conn: Any) -> dict[str, Any]:
    """Return checklist items; ``ok`` is False when critical prod issues exist."""
    from . import plane_state

    issues: list[dict[str, str]] = []
    prod = is_production_profile()

    if prod and not turn_credentials_configured():
        issues.append(
            {
                "code": "turn_secret_missing",
                "severity": "critical",
                "message": "Set AI_BRIDGE_TURN_SECRET, AI_BRIDGE_TURN_URL, or AI_BRIDGE_ICE_SERVERS in production.",
            }
        )

    admin = os.environ.get("AI_BRIDGE_ADMIN_TOKEN", "").strip()
    if prod and not admin:
        issues.append(
            {
                "code": "admin_token_unset",
                "severity": "warning",
                "message": "AI_BRIDGE_ADMIN_TOKEN is unset; legacy admin auth is disabled or weak.",
            }
        )

    try:
        plane_state.load_emergency_stop(conn)
        emergency_stop_durable = True
    except Exception:
        emergency_stop_durable = False
        issues.append(
            {
                "code": "emergency_stop_unreadable",
                "severity": "critical",
                "message": "Could not read durable emergency-stop flag from settings table.",
            }
        )

    critical = [i for i in issues if i["severity"] == "critical"]
    return {
        "ok": len(critical) == 0,
        "production_profile": prod,
        "turn_configured": turn_credentials_configured(),
        "emergency_stop_durable": emergency_stop_durable,
        "issues": issues,
    }