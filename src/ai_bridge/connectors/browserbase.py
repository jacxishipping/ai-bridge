"""Browserbase cloud browser connector with durable CDP session reuse."""
from __future__ import annotations

import os
from typing import Any

import httpx

API_BASE = "https://www.browserbase.com/v1"

# Durable CDP session (process-local)
_BB: dict[str, Any] = {
    "pw": None,
    "browser": None,
    "context": None,
    "page": None,
    "session_id": None,
    "connect_url": None,
}


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


def _http() -> httpx.Client:
    return httpx.Client(timeout=30.0)


def browserbase_create_session(args: dict | None = None) -> dict:
    """Create a remote Browserbase session and return connect URLs for automation."""
    args = args or {}
    payload: dict[str, Any] = {"projectId": _project_id()}
    if args.get("proxies"):
        payload["proxies"] = args["proxies"]
    headers = {"X-BB-API-Key": _api_key(), "Content-Type": "application/json"}
    with _http() as client:
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


def _disconnect_cdp(*, complete_remote: bool = False) -> None:
    browser = _BB.get("browser")
    pw = _BB.get("pw")
    sid = _BB.get("session_id")
    try:
        if browser is not None:
            browser.close()
    except Exception:
        pass
    try:
        if pw is not None:
            pw.stop()
    except Exception:
        pass
    _BB.update(
        {"pw": None, "browser": None, "context": None, "page": None, "connect_url": None}
    )
    if complete_remote and sid:
        try:
            browserbase_end_session({"session_id": sid})
        except Exception:
            pass
        _BB["session_id"] = None


def browserbase_connect(args: dict | None = None) -> dict:
    """Connect (or reuse) a durable CDP session; keeps the browser open for follow-up tools."""
    args = args or {}
    connect_url = str(args.get("connect_url") or _BB.get("connect_url") or "").strip()
    session_id = str(args.get("session_id") or _BB.get("session_id") or "").strip()
    force_new = bool(args.get("force_new", False))
    if force_new:
        _disconnect_cdp(complete_remote=False)
        connect_url = ""
        session_id = ""
    page = _BB.get("page")
    if page is not None and not getattr(page, "is_closed", lambda: True)():
        return {
            "ok": True,
            "provider": "browserbase",
            "reused": True,
            "session_id": _BB.get("session_id"),
            "connect_url": _BB.get("connect_url"),
            "url": page.url,
            "title": page.title(),
        }
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
            "Playwright is required for Browserbase. "
            "Install: pip install playwright && playwright install chromium"
        ) from exc
    pw = sync_playwright().start()
    try:
        browser = pw.chromium.connect_over_cdp(connect_url)
        ctx = browser.contexts[0] if browser.contexts else browser.new_context()
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
    except Exception:
        try:
            pw.stop()
        except Exception:
            pass
        raise
    _BB.update(
        {
            "pw": pw,
            "browser": browser,
            "context": ctx,
            "page": page,
            "session_id": session_id or None,
            "connect_url": connect_url,
        }
    )
    # Optionally bridge into local browser_* tools so click/type/screenshot work.
    if bool(args.get("attach_local", True)):
        from ai_bridge import browser_tools

        browser_tools.attach_external_page(pw, browser, ctx, page)
    return {
        "ok": True,
        "provider": "browserbase",
        "reused": False,
        "session_id": session_id or None,
        "connect_url": connect_url,
        "url": page.url,
        "title": page.title(),
        "attached_local": bool(args.get("attach_local", True)),
    }


def browserbase_navigate(args: dict | None = None) -> dict:
    """Navigate in a durable Browserbase session (does not close CDP afterwards)."""
    args = args or {}
    url = str(args.get("url") or "").strip()
    if not url:
        raise ValueError("url is required.")
    connected = browserbase_connect(args)
    page = _BB.get("page")
    if page is None:
        raise BrowserbaseError("Browserbase page is not connected.")
    timeout_ms = max(5000, min(int(args.get("timeout", 30)), 120)) * 1000
    page.goto(url, timeout=timeout_ms, wait_until=str(args.get("wait_until", "load")))
    out = {
        "ok": True,
        "provider": "browserbase",
        "session_id": _BB.get("session_id") or connected.get("session_id"),
        "connect_url": _BB.get("connect_url"),
        "url": page.url,
        "title": page.title(),
        "navigated_to": url,
        "durable": True,
    }
    if bool(args.get("screenshot_after_nav")):
        from ai_bridge import browser_tools

        out["screenshot"] = browser_tools._screenshot_page(page, full_page=False)
    return out


def browserbase_screenshot(args: dict | None = None) -> dict:
    args = args or {}
    browserbase_connect(args)
    page = _BB.get("page")
    if page is None:
        raise BrowserbaseError("Browserbase page is not connected.")
    from ai_bridge import browser_tools

    shot = browser_tools._screenshot_page(page, full_page=bool(args.get("full_page", False)))
    return {"ok": True, "provider": "browserbase", "session_id": _BB.get("session_id"), **shot}


def browserbase_end_session(args: dict | None = None) -> dict:
    args = args or {}
    sid = str(args.get("session_id") or _BB.get("session_id") or "").strip()
    if not sid:
        raise ValueError("session_id is required.")
    _disconnect_cdp(complete_remote=False)
    headers = {"X-BB-API-Key": _api_key()}
    with _http() as client:
        res = client.post(f"{API_BASE}/sessions/{sid}/complete", headers=headers)
        if res.status_code >= 400:
            raise BrowserbaseError(f"Browserbase API {res.status_code}: {res.text[:500]}")
    _BB["session_id"] = None
    return {"ok": True, "provider": "browserbase", "session_id": sid, "status": "completed"}


def reset_for_tests() -> None:
    _disconnect_cdp(complete_remote=False)
    _BB["session_id"] = None


TOOLS: dict[str, Any] = {
    "browserbase_create_session": browserbase_create_session,
    "browserbase_connect": browserbase_connect,
    "browserbase_navigate": browserbase_navigate,
    "browserbase_screenshot": browserbase_screenshot,
    "browserbase_end_session": browserbase_end_session,
}

TOOL_SPECS: dict[str, dict] = {
    "browserbase_create_session": {
        "description": "Create a Browserbase cloud browser session.",
        "category": "browserbase",
        "parameters": {"type": "object", "properties": {}},
    },
    "browserbase_connect": {
        "description": "Connect or reuse a durable Browserbase CDP session (keeps browser open).",
        "category": "browserbase",
        "parameters": {
            "type": "object",
            "properties": {
                "session_id": {"type": "string"},
                "connect_url": {"type": "string"},
                "force_new": {"type": "boolean"},
                "attach_local": {"type": "boolean"},
            },
        },
    },
    "browserbase_navigate": {
        "description": "Open a URL in a durable Browserbase session (creates/connects if needed).",
        "category": "browserbase",
        "parameters": {
            "type": "object",
            "properties": {
                "url": {"type": "string"},
                "connect_url": {"type": "string"},
                "session_id": {"type": "string"},
                "timeout": {"type": "integer"},
                "screenshot_after_nav": {"type": "boolean"},
            },
            "required": ["url"],
        },
    },
    "browserbase_screenshot": {
        "description": "Screenshot the active durable Browserbase page.",
        "category": "browserbase",
        "parameters": {
            "type": "object",
            "properties": {"full_page": {"type": "boolean"}},
        },
    },
    "browserbase_end_session": {
        "description": "Complete/end a Browserbase session and disconnect CDP.",
        "category": "browserbase",
        "parameters": {
            "type": "object",
            "properties": {"session_id": {"type": "string"}},
            "required": ["session_id"],
        },
    },
}
