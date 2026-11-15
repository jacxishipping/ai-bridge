"""CSRF protection for session-based authentication.

Generates per-session CSRF tokens and validates them on state-changing
requests. Uses HMAC-SHA256 with a server-side secret rotated on restart.
"""
from __future__ import annotations

import hashlib
import hmac
import os
import secrets
import time
from typing import Callable

from fastapi import Request
from fastapi.responses import JSONResponse

_CSRF_SECRET = os.environ.get("AI_BRIDGE_CSRF_SECRET") or secrets.token_hex(32)
_CSRF_TTL = 86400  # 24 hours


def _csrf_key(session_token: str) -> str:
    return f"csrf:{session_token}"


def generate_csrf_token(session_token: str) -> str:
    """Generate a time-bound CSRF token for the given session token."""
    expires = int(time.time()) + _CSRF_TTL
    msg = f"{session_token}:{expires}".encode("utf-8")
    sig = hmac.new(_CSRF_SECRET.encode("utf-8"), msg, hashlib.sha256).hexdigest()[:16]
    return f"{expires}:{sig}"


def validate_csrf_token(session_token: str, token: str) -> bool:
    """Validate a CSRF token for the given session token."""
    try:
        parts = token.split(":")
        if len(parts) != 2:
            return False
        expires_str, sig = parts
        expires = int(expires_str)
        if time.time() > expires:
            return False
        expected = hmac.new(
            _CSRF_SECRET.encode("utf-8"),
            f"{session_token}:{expires}".encode("utf-8"),
            hashlib.sha256,
        ).hexdigest()[:16]
        return hmac.compare_digest(sig, expected)
    except (ValueError, IndexError):
        return False


async def csrf_middleware(request: Request, call_next: Callable):
    """FastAPI HTTP middleware that validates CSRF tokens on mutating session-auth requests.

    Usage: app.middleware("http")(csrf_middleware)
    """
    if request.method in ("GET", "HEAD", "OPTIONS", "TRACE"):
        return await call_next(request)

    # Admin-token, device-token, and auth login/logout bootstrap endpoints do not require CSRF.
    if request.headers.get("x-admin-token") or request.headers.get("x-device-token"):
        return await call_next(request)
    if request.url.path in ("/api/auth/login", "/api/auth/logout"):
        return await call_next(request)

    # Check explicit X-Session-Token when CSRF validation is active.
    session_token = request.headers.get("x-session-token")
    if not session_token:
        return await call_next(request)

    csrf_token = request.headers.get("x-csrf-token")
    if not csrf_token or not validate_csrf_token(session_token, csrf_token):
        return JSONResponse(
            status_code=403,
            content={"detail": "CSRF token missing or invalid. Include X-CSRF-Token header."},
        )
    return await call_next(request)
