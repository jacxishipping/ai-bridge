"""You.com search/content connector for fleet research tools."""
from __future__ import annotations

import os
from typing import Any

import httpx

API_BASE = "https://api.ydc-index.io/v1"


class YouSearchError(RuntimeError):
    pass


def _api_key() -> str:
    key = os.environ.get("YOU_API_KEY", os.environ.get("AI_BRIDGE_YOU_API_KEY", "")).strip()
    if not key:
        raise YouSearchError("You.com API key missing. Set YOU_API_KEY or AI_BRIDGE_YOU_API_KEY.")
    return key


def you_web_search(args: dict | None = None) -> dict:
    """Run a You.com live web search and return summarized results."""
    args = args or {}
    query = str(args.get("query") or "").strip()
    if not query:
        raise ValueError("query is required.")
    count = max(1, min(int(args.get("count", 5)), 20))
    headers = {"X-API-Key": _api_key()}
    params = {"query": query, "count": count}
    with httpx.Client(timeout=45.0) as client:
        res = client.get(f"{API_BASE}/search", params=params, headers=headers)
        if res.status_code >= 400:
            raise YouSearchError(f"You.com API {res.status_code}: {res.text[:500]}")
        data = res.json()
    hits = data.get("hits") or data.get("results") or []
    return {
        "ok": True,
        "provider": "you.com",
        "query": query,
        "count": len(hits),
        "results": hits[:count],
    }


def you_fetch_contents(args: dict | None = None) -> dict:
    """Fetch page contents for one or more URLs via You.com."""
    args = args or {}
    urls = args.get("urls") or args.get("url")
    if isinstance(urls, str):
        urls = [urls]
    if not urls:
        raise ValueError("url or urls is required.")
    headers = {"X-API-Key": _api_key(), "Content-Type": "application/json"}
    payload = {"urls": list(urls)[:10]}
    with httpx.Client(timeout=60.0) as client:
        res = client.post(f"{API_BASE}/contents", json=payload, headers=headers)
        if res.status_code >= 400:
            raise YouSearchError(f"You.com API {res.status_code}: {res.text[:500]}")
        data = res.json()
    return {"ok": True, "provider": "you.com", "contents": data}


TOOLS: dict[str, Any] = {
    "you_web_search": you_web_search,
    "you_fetch_contents": you_fetch_contents,
}

TOOL_SPECS: dict[str, dict] = {
    "you_web_search": {
        "description": "Search the live web via You.com.",
        "category": "research",
        "parameters": {
            "type": "object",
            "properties": {
                "query": {"type": "string"},
                "count": {"type": "integer", "default": 5},
            },
            "required": ["query"],
        },
    },
    "you_fetch_contents": {
        "description": "Extract readable page content via You.com.",
        "category": "research",
        "parameters": {
            "type": "object",
            "properties": {
                "urls": {"type": "array", "items": {"type": "string"}},
                "url": {"type": "string"},
            },
        },
    },
}