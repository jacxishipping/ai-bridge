"""Browserbase cloud browser connector (session create + connect URL)."""
from __future__ import annotations

import os
from typing import Any

import httpx

API_BASE = "https://www.browserbase.com/v1"


class BrowserbaseError(RuntimeError):
    pass


def _api_key() -> str:
    key = os.environ.get("AI_BRIDGE_BROWSERBASE_API_KEY", "").strip()
    if not key:
        raise BrowserbaseError(
            "Browserbase is not configured. Set AI_BRIDGE_BROWSERBASE_API_KEY."
        )
    return key


def _project_id() -> str:
    pid = os.environ.get("AI_BRIDGE_BROWSERBASE_PROJECT_ID", "").strip()
    if not pid:
        raise BrowserbaseError(
            "Browserbase project id missing. Set AI_BRIDGE_BROWSERBASE_PROJECT_ID."
        )
    return pid


def browserbase_create_session(args: dict | None = None) -> dict:
    """Create a remote Browserbase session and return connect URLs for automation."""
    args = args or {}
    payload: dict[str, Any] = {"projectId": _project_id()}
    if args.get("proxies"):
        payload["proxies"] = args["proxies"]
    headers = {"X-BB-API-Key": _api_key(), "Content-Type": "application/json"}
    with httpx.Client(timeout=30.0) as client:
        res = client.post(f"{API_BASE}/sessions", json=payload, headers=headers)
        if res.status_code >= 400:
            raise BrowserbaseError(f"Browserbase API {res.status_code}: {res.text[:500]}")
        data = res.json()
    return {
        "ok": True,
        "provider": "browserbase",
        "session_id": data.get("id"),
        "connect_url": data.get("connectUrl") or data.get("seleniumRemoteUrl"),
        "status": data.get("status"),
        "raw": {k: data.get(k) for k in ("id", "status", "createdAt") if k in data},
    }


def browserbase_end_session(args: dict | None = None) -> dict:
    args = args or {}
    sid = str(args.get("session_id") or "").strip()
    if not sid:
        raise ValueError("session_id is required.")
    headers = {"X-BB-API-Key": _api_key()}
    with httpx.Client(timeout=30.0) as client:
        res = client.post(f"{API_BASE}/sessions/{sid}/complete", headers=headers)
        if res.status_code >= 400:
            raise BrowserbaseError(f"Browserbase API {res.status_code}: {res.text[:500]}")
    return {"ok": True, "provider": "browserbase", "session_id": sid, "status": "completed"}


TOOLS: dict[str, Any] = {
    "browserbase_create_session": browserbase_create_session,
    "browserbase_end_session": browserbase_end_session,
}

TOOL_SPECS: dict[str, dict] = {
    "browserbase_create_session": {
        "description": "Create a Browserbase cloud browser session.",
        "category": "browserbase",
        "parameters": {"type": "object", "properties": {}},
    },
    "browserbase_end_session": {
        "description": "Complete/end a Browserbase session.",
        "category": "browserbase",
        "parameters": {
            "type": "object",
            "properties": {"session_id": {"type": "string"}},
            "required": ["session_id"],
        },
    },
}