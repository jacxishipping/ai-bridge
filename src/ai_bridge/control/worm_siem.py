"""External WORM / SIEM audit sink (append-only export hook).

Set ``AI_BRIDGE_WORM_SIEM_URL`` to a collector that accepts POST JSON.
Optional HMAC with ``AI_BRIDGE_WORM_SIEM_HMAC_SECRET``. Failures are logged and
surfaced on the production checklist as warnings (or critical when
``AI_BRIDGE_WORM_SIEM_REQUIRED=1``).
"""
from __future__ import annotations

import hashlib
import hmac
import json
import os
import time
from typing import Any


def worm_siem_url() -> str:
    return (os.environ.get("AI_BRIDGE_WORM_SIEM_URL") or "").strip()


def worm_siem_required() -> bool:
    return os.environ.get("AI_BRIDGE_WORM_SIEM_REQUIRED", "").strip().lower() in ("1", "true", "yes")


def describe_worm_siem() -> dict[str, Any]:
    return {
        "configured": bool(worm_siem_url()),
        "required": worm_siem_required(),
        "url_set": bool(worm_siem_url()),
    }


def _sign(body: bytes) -> str | None:
    secret = (os.environ.get("AI_BRIDGE_WORM_SIEM_HMAC_SECRET") or "").encode("utf-8")
    if not secret:
        return None
    return hmac.new(secret, body, hashlib.sha256).hexdigest()


def emit_audit_event(event: dict[str, Any], *, timeout: float = 5.0) -> dict[str, Any]:
    """POST one audit event to the WORM/SIEM endpoint. Returns transport result."""
    url = worm_siem_url()
    if not url:
        return {"ok": False, "skipped": True, "reason": "AI_BRIDGE_WORM_SIEM_URL unset"}
    payload = {
        "schema": "ai-bridge.audit.v1",
        "ts": time.time(),
        "event": event,
    }
    body = json.dumps(payload, default=str, separators=(",", ":")).encode("utf-8")
    headers = {"Content-Type": "application/json"}
    sig = _sign(body)
    if sig:
        headers["X-AI-Bridge-Signature"] = sig
    try:
        import httpx

        res = httpx.post(url, content=body, headers=headers, timeout=timeout)
        ok = res.status_code < 300
        return {"ok": ok, "status_code": res.status_code, "skipped": False}
    except Exception as exc:
        if worm_siem_required():
            raise
        return {"ok": False, "skipped": False, "error": str(exc)}
