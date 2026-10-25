"""Generic OIDC login for the control plane (dormant unless configured).

Configure with environment variables:
  AI_BRIDGE_OIDC_ISSUER        e.g. https://accounts.google.com
  AI_BRIDGE_OIDC_CLIENT_ID
  AI_BRIDGE_OIDC_CLIENT_SECRET
  AI_BRIDGE_OIDC_REDIRECT_URI e.g. https://your-domain/api/auth/oidc/callback
  AI_BRIDGE_OIDC_DASHBOARD_URL e.g. https://your-domain/ (login landing page)

Flow: dashboard -> GET /api/auth/oidc/login -> provider -> callback ->
ID-token verified against the provider JWKS (RS256, iss/aud/exp/nonce) ->
local user matched by email (auto-provisioned as viewer on first login) ->
session token -> redirect to the dashboard with ?session_token=.

Only SHA-256 hashes of session tokens are stored. No provider secrets are
logged. Without all four variables set, OIDC is disabled and the login
route returns 400.
"""

from __future__ import annotations

import base64
import json
import os
import secrets
import time
import urllib.request

_DISCOVERY_CACHE: dict = {"at": 0.0, "doc": None}
_PENDING: dict[str, dict] = {}


def oidc_config() -> dict | None:
    issuer = os.environ.get("AI_BRIDGE_OIDC_ISSUER", "").rstrip("/")
    client_id = os.environ.get("AI_BRIDGE_OIDC_CLIENT_ID", "")
    client_secret = os.environ.get("AI_BRIDGE_OIDC_CLIENT_SECRET", "")
    redirect_uri = os.environ.get("AI_BRIDGE_OIDC_REDIRECT_URI", "")
    if not (issuer and client_id and client_secret and redirect_uri):
        return None
    return {
        "issuer": issuer,
        "client_id": client_id,
        "client_secret": client_secret,
        "redirect_uri": redirect_uri,
        "dashboard_url": os.environ.get("AI_BRIDGE_OIDC_DASHBOARD_URL", "/"),
    }


def discovery() -> dict:
    cfg = oidc_config()
    assert cfg is not None
    now = time.time()
    if _DISCOVERY_CACHE["doc"] and now - _DISCOVERY_CACHE["at"] < 3600:
        return _DISCOVERY_CACHE["doc"]
    url = cfg["issuer"] + "/.well-known/openid-configuration"
    with urllib.request.urlopen(url, timeout=15) as resp:
        doc = json.loads(resp.read().decode())
    _DISCOVERY_CACHE["at"] = now
    _DISCOVERY_CACHE["doc"] = doc
    return doc


def new_login() -> tuple[str, str, str]:
    """Return (authorize_url, state, nonce) for a fresh login attempt."""
    cfg = oidc_config()
    assert cfg is not None
    doc = discovery()
    state = secrets.token_urlsafe(24)
    nonce = secrets.token_urlsafe(24)
    _PENDING[state] = {"nonce": nonce, "at": time.time()}
    # Prune stale attempts.
    for key in [k for k, v in _PENDING.items() if time.time() - v["at"] > 600]:
        _PENDING.pop(key, None)
    params = {
        "client_id": cfg["client_id"],
        "redirect_uri": cfg["redirect_uri"],
        "response_type": "code",
        "scope": "openid email profile",
        "state": state,
        "nonce": nonce,
    }
    from urllib.parse import urlencode

    return doc["authorization_endpoint"] + "?" + urlencode(params), state, nonce


def _b64url(data: bytes) -> bytes:
    return base64.urlsafe_b64decode(data + b"=" * (-len(data) % 4))


def verify_id_token(id_token: str, expected_nonce: str) -> dict:
    """Verify an RS256 ID token against the provider JWKS. Returns claims."""
    from cryptography.exceptions import InvalidSignature
    from cryptography.hazmat.primitives import hashes
    from cryptography.hazmat.primitives.asymmetric import padding, rsa

    cfg = oidc_config()
    assert cfg is not None
    header_b64, payload_b64, sig_b64 = id_token.split(".")
    header = json.loads(_b64url(header_b64.encode()))
    claims = json.loads(_b64url(payload_b64.encode()))
    if header.get("alg") != "RS256":
        raise ValueError("unsupported ID token alg")
    doc = discovery()
    with urllib.request.urlopen(doc["jwks_uri"], timeout=15) as resp:
        jwks = json.loads(resp.read().decode())
    key = None
    for candidate in jwks.get("keys", []):
        if candidate.get("kid") == header.get("kid") and candidate.get("kty") == "RSA":
            key = candidate
            break
    if key is None:
        raise ValueError("signing key not found")
    numbers = rsa.RSAPublicNumbers(
        int.from_bytes(_b64url(key["e"].encode()), "big"),
        int.from_bytes(_b64url(key["n"].encode()), "big"),
    )
    public_key = numbers.public_key()
    signing_input = (header_b64 + "." + payload_b64).encode()
    try:
        public_key.verify(
            _b64url(sig_b64.encode()),
            signing_input,
            padding.PKCS1v15(),
            hashes.SHA256(),
        )
    except InvalidSignature:
        raise ValueError("bad ID token signature")
    now = time.time()
    if claims.get("iss") != cfg["issuer"]:
        raise ValueError("bad issuer")
    if claims.get("aud") != cfg["client_id"]:
        raise ValueError("bad audience")
    if claims.get("exp", 0) < now:
        raise ValueError("ID token expired")
    if claims.get("nonce") != expected_nonce:
        raise ValueError("bad nonce")
    return claims


def pop_pending(state: str) -> dict | None:
    record = _PENDING.pop(state, None)
    if record is None or time.time() - record["at"] > 600:
        return None
    return record
