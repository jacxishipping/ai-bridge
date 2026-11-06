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

from fastapi import HTTPException, Request

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


def csrf_middleware(get_response: Callable) -> Callable:
    """Optional middleware that validates CSRF tokens on mutating requests.

    Usage: app.middleware("http")(csrf_middleware)
    """
    async def middleware(request: Request, call_next: Callable) -> None:
        if request.method in ("GET", "HEAD", "OPTIONS", "TRACE"):
            return await call_next(request)

        # Only check session-based auth (not admin-token or device-token)
        session_token = (
            request.headers.get("x-session-token")
            or request.headers.get("authorization", "").removeprefix("Bearer ")
        )
        if not session_token:
            return await call_next(request)

        csrf_token = request.headers.get("x-csrf-token")
        if not csrf_token or not validate_csrf_token(session_token, csrf_token):
            return HTTPException(
                status_code=403,
                detail="CSRF token missing or invalid. Include X-CSRF-Token header.",
            )
        return await call_next(request)

    return middleware
