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


def env_public_base_url() -> str:
    """Canonical public origin from env.

    Prefers ``AI_BRIDGE_PUBLIC_BASE_URL``; ``AI_BRIDGE_PUBLIC_URL`` remains a
    supported alias so deploy configs and readiness share one resolution order.
    """
    for key in ("AI_BRIDGE_PUBLIC_BASE_URL", "AI_BRIDGE_PUBLIC_URL"):
        value = os.environ.get(key, "").strip()
        if value:
            return value.rstrip("/")
    return ""


def legacy_webrtc_routes_allowed() -> bool:
    """Legacy ``/api/devices/.../desktop/webrtc/*`` create path.

    Disabled by default in production unless ``AI_BRIDGE_ALLOW_LEGACY_WEBRTC=1``.
    Non-production keeps the routes for compatibility tests.
    """
    if _truthy_env("AI_BRIDGE_ALLOW_LEGACY_WEBRTC"):
        return True
    return not is_production_profile()


def require_redis_for_multi_host() -> bool:
    return _truthy_env("AI_BRIDGE_REQUIRE_REDIS") or _truthy_env("AI_BRIDGE_MULTI_HOST")


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

    public_base = env_public_base_url()
    if prod and public_base.lower().startswith("http://"):
        issues.append(
            {
                "code": "public_base_url_http",
                "severity": "critical",
                "message": (
                    "Public base URL must use https:// in production "
                    "(AI_BRIDGE_PUBLIC_BASE_URL or alias AI_BRIDGE_PUBLIC_URL)."
                ),
            }
        )
    elif prod and not public_base:
        issues.append(
            {
                "code": "tls_termination_documented",
                "severity": "warning",
                "message": (
                    "Set AI_BRIDGE_PUBLIC_BASE_URL (or AI_BRIDGE_PUBLIC_URL) to your "
                    "https:// public origin; TLS terminates at the reverse proxy."
                ),
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

    db_url = (os.environ.get("DATABASE_URL") or "").strip()
    dialect = getattr(conn, "dialect", "sqlite")
    if prod and not db_url and str(dialect).lower() == "sqlite":
        issues.append(
            {
                "code": "postgres_required_in_production",
                "severity": "critical",
                "message": "Set DATABASE_URL to PostgreSQL in production (SQLite remains the local/dev default).",
            }
        )

    if prod and legacy_webrtc_routes_allowed() and _truthy_env("AI_BRIDGE_ALLOW_LEGACY_WEBRTC"):
        issues.append(
            {
                "code": "legacy_webrtc_enabled",
                "severity": "warning",
                "message": "AI_BRIDGE_ALLOW_LEGACY_WEBRTC=1 keeps dual WebRTC stacks; prefer /api/v1/sessions only.",
            }
        )

    from . import durable_ratelimit as drl

    rate_backend = drl.backend_name(conn)
    backend_l = str(rate_backend).lower()
    if prod and require_redis_for_multi_host() and backend_l != "redis":
        issues.append(
            {
                "code": "redis_required_for_multi_host",
                "severity": "critical",
                "message": (
                    "AI_BRIDGE_REQUIRE_REDIS / AI_BRIDGE_MULTI_HOST requires Redis "
                    "(REDIS_URL or AI_BRIDGE_REDIS_URL) for shared WebRTC/HTTP throttles."
                ),
            }
        )
    elif prod and backend_l in ("memory", "mem", "inmemory", "local"):
        issues.append(
            {
                "code": "rate_limit_memory_backend",
                "severity": "warning",
                "message": f"Rate-limit backend is '{rate_backend}'; use Redis/DB for multi-worker production.",
            }
        )

    from . import secrets_backend, worm_siem, device_mtls
    from ai_bridge import browser_isolation_os

    secrets_info = secrets_backend.describe_secrets_backend()
    worm_info = worm_siem.describe_worm_siem()
    mtls_info = device_mtls.describe_device_mtls()
    os_browser = browser_isolation_os.describe_os_browser_isolation()

    if prod and worm_siem.worm_siem_required() and not worm_siem.worm_siem_url():
        issues.append(
            {
                "code": "worm_siem_required",
                "severity": "critical",
                "message": "AI_BRIDGE_WORM_SIEM_REQUIRED=1 but AI_BRIDGE_WORM_SIEM_URL is unset.",
            }
        )
    backend_name = secrets_backend.secrets_backend_name()
    if prod and backend_name in ("vault", "hashicorp_vault") and not os.environ.get("AI_BRIDGE_VAULT_ADDR"):
        issues.append(
            {
                "code": "vault_backend_misconfigured",
                "severity": "critical",
                "message": "AI_BRIDGE_SECRETS_BACKEND=vault requires AI_BRIDGE_VAULT_ADDR.",
            }
        )
    if prod and browser_isolation_os.browser_netns_requested():
        if os_browser.get("mode") in ("unsupported_platform", "none"):
            issues.append(
                {
                    "code": "browser_netns_unavailable",
                    "severity": "warning",
                    "message": "AI_BRIDGE_BROWSER_NETNS=1 but no usable unshare/bwrap/runsc wrapper on this host.",
                }
            )

    critical = [i for i in issues if i["severity"] == "critical"]
    return {
        "ok": len(critical) == 0,
        "production_profile": prod,
        "turn_configured": turn_credentials_configured(),
        "emergency_stop_durable": emergency_stop_durable,
        "rate_limit_backend": rate_backend,
        "database_dialect": dialect,
        "legacy_webrtc_allowed": legacy_webrtc_routes_allowed(),
        "browser_isolation": browser_isolation,
        "os_browser_isolation": os_browser,
        "secrets_backend": secrets_info,
        "worm_siem": worm_info,
        "device_mtls": mtls_info,
        "issues": issues,
    }
