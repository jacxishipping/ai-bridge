"""Plane-side device mTLS helpers (optional PKI beyond reverse-proxy only).

When ``AI_BRIDGE_DEVICE_MTLS=1``:
- Agent routes may require a verified client certificate fingerprint registered
  on the device row (``mtls_fingerprint`` column, lazy-added).
- Proxy-forwarded cert headers (``X-Client-Cert-Fingerprint`` / ``X-SSL-Client-Fingerprint``)
  are accepted when the edge already terminated TLS.

This does not replace terminating TLS at nginx; it binds a device identity to a
certificate fingerprint checked by the plane.
"""
from __future__ import annotations

import hashlib
import os
import re
from typing import Any

from fastapi import Header, HTTPException, Request


def device_mtls_enabled() -> bool:
    return os.environ.get("AI_BRIDGE_DEVICE_MTLS", "").strip().lower() in ("1", "true", "yes")


def normalize_fingerprint(value: str | None) -> str:
    if not value:
        return ""
    return re.sub(r"[^0-9a-fA-F]", "", value).lower()


def fingerprint_from_pem(pem: str) -> str:
    """SHA-256 fingerprint of DER bytes extracted from a PEM certificate body."""
    body = re.sub(r"-----BEGIN CERTIFICATE-----|-----END CERTIFICATE-----|\s+", "", pem or "")
    if not body:
        return ""
    import base64

    der = base64.b64decode(body)
    return hashlib.sha256(der).hexdigest()


def extract_request_fingerprint(
    request: Request | None = None,
    *,
    x_client_cert_fingerprint: str | None = None,
    x_ssl_client_fingerprint: str | None = None,
    x_client_cert: str | None = None,
) -> str:
    for candidate in (x_client_cert_fingerprint, x_ssl_client_fingerprint):
        fp = normalize_fingerprint(candidate)
        if fp:
            return fp
    if x_client_cert:
        return fingerprint_from_pem(x_client_cert.replace("\t", "\n"))
    if request is not None:
        for header in ("x-client-cert-fingerprint", "x-ssl-client-fingerprint", "x-forwarded-tls-client-cert-info"):
            fp = normalize_fingerprint(request.headers.get(header))
            if fp:
                return fp
    return ""


def ensure_mtls_column(conn: Any) -> None:
    dialect = getattr(conn, "dialect", "sqlite")
    try:
        if dialect == "postgres":
            rows = conn.execute(
                "SELECT column_name FROM information_schema.columns WHERE table_name = 'devices'"
            ).fetchall()
            cols = {r[0] for r in rows}
        else:
            cols = {r[1] for r in conn.execute("PRAGMA table_info(devices)").fetchall()}
    except Exception:
        cols = set()
    if "mtls_fingerprint" not in cols:
        try:
            conn.execute("ALTER TABLE devices ADD COLUMN mtls_fingerprint TEXT")
            conn.commit()
        except Exception:
            if dialect == "postgres":
                try:
                    conn.rollback()
                except Exception:
                    pass


def set_device_fingerprint(conn: Any, device_id: str, fingerprint: str) -> None:
    ensure_mtls_column(conn)
    fp = normalize_fingerprint(fingerprint)
    conn.execute("UPDATE devices SET mtls_fingerprint=? WHERE id=?", (fp or None, device_id))
    conn.commit()


def require_device_mtls(conn: Any, device_id: str, request_fingerprint: str) -> None:
    if not device_mtls_enabled():
        return
    ensure_mtls_column(conn)
    row = conn.execute(
        "SELECT mtls_fingerprint FROM devices WHERE id=? AND revoked=0",
        (device_id,),
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Device not found.")
    expected = ""
    try:
        expected = normalize_fingerprint(row["mtls_fingerprint"] if row["mtls_fingerprint"] else "")
    except Exception:
        expected = normalize_fingerprint(row[0] if row else "")
    if not expected:
        raise HTTPException(
            status_code=403,
            detail="Device mTLS fingerprint not enrolled. Register mtls_fingerprint before enabling AI_BRIDGE_DEVICE_MTLS.",
        )
    got = normalize_fingerprint(request_fingerprint)
    if not got or got != expected:
        raise HTTPException(status_code=403, detail="Device mTLS fingerprint mismatch.")


def describe_device_mtls() -> dict[str, Any]:
    return {
        "enabled": device_mtls_enabled(),
        "plane_side": True,
        "proxy_headers": [
            "X-Client-Cert-Fingerprint",
            "X-SSL-Client-Fingerprint",
            "X-Client-Cert",
        ],
        "note": "Enable AI_BRIDGE_DEVICE_MTLS=1 and enroll per-device fingerprints; edge TLS termination still recommended.",
    }
