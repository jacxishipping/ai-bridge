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


def _truthy_env(name: str) -> bool:
    return os.environ.get(name, "").strip().lower() in ("1", "true", "yes")


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
                "severity": "critical",
                "message": "AI_BRIDGE_ADMIN_TOKEN is required in production (legacy admin / quick-approval HMAC).",
            }
        )

    if prod and _truthy_env("AI_BRIDGE_HTTP_ALLOW_ANON"):
        issues.append(
            {
                "code": "anon_mcp_enabled",
                "severity": "critical",
                "message": "AI_BRIDGE_HTTP_ALLOW_ANON=1 is not allowed in production.",
            }
        )

    public_base = os.environ.get("AI_BRIDGE_PUBLIC_BASE_URL", "").strip()
    if prod and public_base.lower().startswith("http://"):
        issues.append(
            {
                "code": "public_base_url_http",
                "severity": "critical",
                "message": "AI_BRIDGE_PUBLIC_BASE_URL must use https:// in production (TLS at the proxy).",
            }
        )
    elif prod and not public_base:
        issues.append(
            {
                "code": "tls_termination_documented",
                "severity": "warning",
                "message": "Set AI_BRIDGE_PUBLIC_BASE_URL to your https:// public origin; TLS terminates at the reverse proxy.",
            }
        )

    browser_isolation: dict[str, Any] = {}
    chromium_sandbox = True
    try:
        from ai_bridge import browser_tools

        browser_isolation = browser_tools.browser_isolation_report()
        chromium_sandbox = not browser_tools._allow_browser_no_sandbox()
        browser_isolation = {**browser_isolation, "chromium_sandbox": chromium_sandbox}
    except Exception as exc:
        browser_isolation = {"error": str(exc), "chromium_sandbox": None}

    if prod and chromium_sandbox is False and not _truthy_env("AI_BRIDGE_ALLOW_UNSAFE_BROWSER"):
        issues.append(
            {
                "code": "browser_sandbox_disabled",
                "severity": "critical",
                "message": (
                    "Chromium sandbox is disabled (AI_BRIDGE_ALLOW_BROWSER_NO_SANDBOX). "
                    "Unset it, or set AI_BRIDGE_ALLOW_UNSAFE_BROWSER=1 to acknowledge risk."
                ),
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

    from . import durable_ratelimit as drl

    rate_backend = drl.backend_name(conn)
    if prod and str(rate_backend).lower() in ("memory", "mem", "inmemory", "local"):
        issues.append(
            {
                "code": "rate_limit_memory_backend",
                "severity": "warning",
                "message": f"Rate-limit backend is '{rate_backend}'; use Redis/DB for multi-worker production.",
            }
        )

    critical = [i for i in issues if i["severity"] == "critical"]
    return {
        "ok": len(critical) == 0,
        "production_profile": prod,
        "turn_configured": turn_credentials_configured(),
        "emergency_stop_durable": emergency_stop_durable,
        "rate_limit_backend": rate_backend,
        "browser_isolation": browser_isolation,
        "issues": issues,
    }
