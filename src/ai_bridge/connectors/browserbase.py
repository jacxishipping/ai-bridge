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


def browserbase_navigate(args: dict | None = None) -> dict:
    """Create (if needed) a Browserbase session and navigate via Playwright CDP."""
    args = args or {}
    url = str(args.get("url") or "").strip()
    if not url:
        raise ValueError("url is required.")
    connect_url = str(args.get("connect_url") or "").strip()
    session_id = str(args.get("session_id") or "").strip()
    if not connect_url:
        created = browserbase_create_session(args)
        connect_url = str(created.get("connect_url") or "").strip()
        session_id = str(created.get("session_id") or session_id)
    if not connect_url:
        raise BrowserbaseError("Browserbase session has no connect_url for CDP.")
    try:
        from playwright.sync_api import sync_playwright
    except ImportError as exc:
        raise RuntimeError(
            "Playwright is required for Browserbase navigate. "
            "Install: pip install playwright && playwright install chromium"
        ) from exc
    timeout_ms = max(5000, min(int(args.get("timeout", 30)), 120)) * 1000
    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(connect_url)
        try:
            ctx = browser.contexts[0] if browser.contexts else browser.new_context()
            page = ctx.pages[0] if ctx.pages else ctx.new_page()
            page.goto(url, timeout=timeout_ms, wait_until=str(args.get("wait_until", "load")))
            title = page.title()
            final_url = page.url
        finally:
            try:
                browser.close()
            except Exception:
                pass
    return {
        "ok": True,
        "provider": "browserbase",
        "session_id": session_id or None,
        "url": final_url,
        "title": title,
        "navigated_to": url,
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
    "browserbase_navigate": browserbase_navigate,
    "browserbase_end_session": browserbase_end_session,
}

TOOL_SPECS: dict[str, dict] = {
    "browserbase_create_session": {
        "description": "Create a Browserbase cloud browser session.",
        "category": "browserbase",
        "parameters": {"type": "object", "properties": {}},
    },
    "browserbase_navigate": {
        "description": "Open a URL in a Browserbase cloud session (creates session if needed).",
        "category": "browserbase",
        "parameters": {
            "type": "object",
            "properties": {
                "url": {"type": "string"},
                "connect_url": {"type": "string"},
                "timeout": {"type": "integer"},
            },
            "required": ["url"],
        },
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