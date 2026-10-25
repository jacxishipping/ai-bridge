"""Local user accounts, sessions, and roles for the control plane.

Passwords are stored as PBKDF2-HMAC-SHA256 (200k iterations) with a
per-user salt — never plaintext, never reversible. Sessions are random
tokens whose SHA-256 hash is stored; the raw token is shown once at
login, like device tokens.

Roles: viewer (read) < operator (submit/cancel tasks) < admin (everything).
The legacy shared admin token (AI_BRIDGE_ADMIN_TOKEN) still works as an
admin credential for backwards compatibility, unless
AI_BRIDGE_DISABLE_LEGACY_ADMIN_TOKEN=1 is set. Local accounts are the
interim step: a real OIDC provider integration is the next item (see
docs/security.md) and is NOT claimed here — there is no fake OIDC flow.
"""
from __future__ import annotations

import hashlib
import hmac
import os
import secrets

ROLES = {"viewer": 1, "operator": 2, "admin": 3}

def hash_password(password: str, salt: str) -> str:
    return hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 200_000).hex()

def verify_password(password: str, salt: str, expected: str) -> bool:
    return hmac.compare_digest(hash_password(password, salt), expected)

def new_salt() -> str:
    return secrets.token_hex(16)

def legacy_admin_enabled() -> bool:
    return os.environ.get("AI_BRIDGE_DISABLE_LEGACY_ADMIN_TOKEN", "0") != "1"
