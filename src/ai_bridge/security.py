"""Workspace confinement, secret redaction, output limits.

Hardened vs the starter:
- workspace_root() no longer creates directories as a side effect of a
  read-only check; callers that need the directory use ensure_workspace().
- confined_path() rejects NUL bytes, Windows drive/UNC forms, and
  symlink escapes, and resolves against a *resolved* root.
- Secret-named files are never readable through workspace tools.
- All tool output passes through redact() / truncate_output().
"""
from __future__ import annotations

import re
from pathlib import Path
from typing import Any

from .config import get_settings

MAX_READ_BYTES = 128_000
MAX_OUTPUT_BYTES = 64_000
# Names/patterns that look like credentials. Blocked from workspace reads.
_SECRET_NAME_RE = re.compile(
    r"(^|\.)env(\..+)?$|(^|\.)(pem|key|pfx|p12|kdbx|npmrc|netrc)$|"
    r"id_(rsa|ed25519|ecdsa|dsa)|agent_gui\.json$|"
    r"credentials|secret|private[_-]?key|token",
    re.IGNORECASE,
)
_BEARER_RE = re.compile(
    r"(?i)(authorization[\"']?\s*[:=]\s*[\"']?bearer\s+)([^\s\"',;}{]+)"
)
_REDACT_RE = re.compile(
    r"(?i)(api[_-]?key|password|passwd|token|secret|client_secret|authorization)"
    r"([\"']?\s*[:=]\s*[\"']?)([^\s\"',;}{]{4,})"
)
_SECRET_KEY_RE = re.compile(
    r"(?i)^(api[_-]?key|password|passwd|.*token|.*secret|authorization|credential.*)$"
)
_PRESERVE_KEYS = frozenset({"image_base64", "mime_type"})


def workspace_root() -> Path:
    return get_settings().workspace.resolve()


def ensure_workspace() -> Path:
    root = workspace_root()
    root.mkdir(parents=True, exist_ok=True)
    return root


def confined_path(relative_path: str, root: Path | None = None) -> Path:
    """Resolve a relative path, rejecting traversal and symlink escape."""
    if not isinstance(relative_path, str) or not relative_path.strip():
        raise ValueError("A non-empty relative path is required.")
    if "\x00" in relative_path:
        raise ValueError("Path contains a NUL byte.")
    candidate = Path(relative_path)
    if candidate.is_absolute() or candidate.drive:
        raise ValueError("Absolute paths are not allowed.")
    # Reject Windows UNC / drive-like prefixes even on Linux hosts.
    if relative_path.startswith(("\\\\", "//")) or re.match(r"^[A-Za-z]:", relative_path):
        raise ValueError("Absolute paths are not allowed.")
    base = (root or workspace_root()).resolve()
    resolved = (base / candidate).resolve()
    if resolved != base and base not in resolved.parents:
        raise ValueError("Path escapes the configured workspace.")
    return resolved


def is_secret_name(path: Path) -> bool:
    return bool(_SECRET_NAME_RE.search(path.name))


def read_workspace_text(relative_path: str, max_bytes: int | None = None) -> str:
    path = confined_path(relative_path)
    if is_secret_name(path):
        raise ValueError("Refusing to read a file whose name suggests it holds secrets.")
    if not path.is_file():
        raise ValueError("Path is not a regular file.")
    limit = max_bytes if max_bytes is not None else get_settings().max_read_bytes
    if path.stat().st_size > limit:
        raise ValueError(f"File exceeds the {limit}-byte read limit.")
    return path.read_text(encoding="utf-8", errors="replace")


def redact(text: str) -> str:
    """Replace secret-looking values; never leak tokens into logs/results."""
    if not isinstance(text, str):
        text = str(text)
    out = _BEARER_RE.sub(lambda m: f"{m.group(1)}***REDACTED***", text)
    return _REDACT_RE.sub(lambda m: f"{m.group(1)}{m.group(2)}***REDACTED***", out)


def redact_obj(value: Any) -> Any:
    """Recursively redact secret keys and inline secret patterns in JSON-like structures."""
    if isinstance(value, dict):
        cleaned: dict[Any, Any] = {}
        for k, v in value.items():
            key_str = str(k)
            if key_str in _PRESERVE_KEYS:
                cleaned[k] = v
            elif _SECRET_KEY_RE.match(key_str):
                cleaned[k] = "***REDACTED***" if v not in (None, "") else v
            else:
                cleaned[k] = redact_obj(v)
        return cleaned
    if isinstance(value, list):
        return [redact_obj(item) for item in value]
    if isinstance(value, tuple):
        return [redact_obj(item) for item in value]
    if isinstance(value, str):
        return redact(value)
    return value


def truncate_output(text: str, limit: int | None = None) -> str:
    lim = limit if limit is not None else get_settings().max_output_bytes
    text = redact(text)
    encoded = text.encode("utf-8", "replace")
    if len(encoded) > lim:
        clipped = encoded[:lim].decode("utf-8", "ignore")
        return clipped + f"\n[output truncated at {lim} bytes]"
    return text
