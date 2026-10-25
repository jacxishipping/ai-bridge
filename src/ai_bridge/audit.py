"""Structured, append-only audit logging. Secrets are redacted before write."""
from __future__ import annotations

import json
import time
from pathlib import Path

from .security import redact


def audit_event(log_path: Path, *, actor: str, device_id: str, tool: str,
                arguments: dict, decision: str, result: str = "", tenant: str = "default") -> dict:
    event = {
        "ts": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "tenant": tenant, "actor": actor, "device_id": device_id,
        "tool": tool, "arguments": json.loads(redact(json.dumps(arguments, default=str))),
        "decision": decision, "result": redact(result)[:2000],
    }
    log_path.parent.mkdir(parents=True, exist_ok=True)
    with log_path.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(event) + "\n")
    return event
