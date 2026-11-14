"""Firecrawl web scrape/search connector (first-party, env-gated)."""
from __future__ import annotations

import os
from typing import Any

import httpx

from ..security import redact

API_BASE = "https://api.firecrawl.dev/v1"


class FirecrawlError(RuntimeError):
    pass


def _api_key() -> str:
    key = (
        os.environ.get("AI_BRIDGE_FIRECRAWL_API_KEY", "")
        or os.environ.get("FIRECRAWL_API_KEY", "")
    ).strip()
    if not key:
        raise FirecrawlError(
            "Firecrawl is not configured. Set AI_BRIDGE_FIRECRAWL_API_KEY or FIRECRAWL_API_KEY."
        )
    return key


def _headers() -> dict[str, str]:
    return {"Authorization": f"Bearer {_api_key()}", "Content-Type": "application/json"}


def firecrawl_scrape(args: dict | None = None) -> dict:
    """Scrape a single URL to markdown via Firecrawl."""
    args = args or {}
    url = str(args.get("url") or "").strip()
    if not url:
        raise ValueError("url is required.")
    payload: dict[str, Any] = {"url": url}
    if args.get("formats"):
        payload["formats"] = args["formats"]
    else:
        payload["formats"] = ["markdown"]
    with httpx.Client(timeout=60.0) as client:
        res = client.post(f"{API_BASE}/scrape", json=payload, headers=_headers())
        if res.status_code >= 400:
            raise FirecrawlError(f"Firecrawl API {res.status_code}: {redact(res.text[:500])}")
        data = res.json()
    inner = data.get("data") or data
    return {
        "ok": True,
        "provider": "firecrawl",
        "url": url,
        "markdown": inner.get("markdown") or inner.get("content"),
        "metadata": inner.get("metadata") or {},
    }


def firecrawl_search(args: dict | None = None) -> dict:
    """Search the web via Firecrawl and return result entries."""
    args = args or {}
    query = str(args.get("query") or "").strip()
    if not query:
        raise ValueError("query is required.")
    limit = max(1, min(int(args.get("limit", 5)), 25))
    payload = {"query": query, "limit": limit}
    with httpx.Client(timeout=45.0) as client:
        res = client.post(f"{API_BASE}/search", json=payload, headers=_headers())
        if res.status_code >= 400:
            raise FirecrawlError(f"Firecrawl API {res.status_code}: {redact(res.text[:500])}")
        data = res.json()
    hits = data.get("data") or data.get("results") or []
    return {"ok": True, "provider": "firecrawl", "query": query, "count": len(hits), "results": hits}


def firecrawl_map_site(args: dict | None = None) -> dict:
    """Map discoverable URLs for a site root via Firecrawl."""
    args = args or {}
    url = str(args.get("url") or "").strip()
    if not url:
        raise ValueError("url is required.")
    payload: dict[str, Any] = {"url": url}
    if args.get("search"):
        payload["search"] = args["search"]
    with httpx.Client(timeout=90.0) as client:
        res = client.post(f"{API_BASE}/map", json=payload, headers=_headers())
        if res.status_code >= 400:
            raise FirecrawlError(f"Firecrawl API {res.status_code}: {redact(res.text[:500])}")
        data = res.json()
    links = data.get("links") or data.get("data") or []
    return {"ok": True, "provider": "firecrawl", "url": url, "count": len(links), "links": links[:500]}


def firecrawl_crawl(args: dict | None = None) -> dict:
    """Start a Firecrawl crawl (multi-page) and return job id / status payload."""
    args = args or {}
    url = str(args.get("url") or "").strip()
    if not url:
        raise ValueError("url is required.")
    payload: dict[str, Any] = {"url": url}
    if args.get("limit") is not None:
        payload["limit"] = max(1, min(int(args["limit"]), 100))
    if args.get("maxDepth") is not None:
        payload["maxDepth"] = max(0, min(int(args["maxDepth"]), 5))
    if args.get("includePaths"):
        payload["includePaths"] = args["includePaths"]
    if args.get("excludePaths"):
        payload["excludePaths"] = args["excludePaths"]
    with httpx.Client(timeout=120.0) as client:
        res = client.post(f"{API_BASE}/crawl", json=payload, headers=_headers())
        if res.status_code >= 400:
            raise FirecrawlError(f"Firecrawl API {res.status_code}: {redact(res.text[:500])}")
        data = res.json()
    return {
        "ok": True,
        "provider": "firecrawl",
        "url": url,
        "id": data.get("id") or data.get("jobId"),
        "status": data.get("status") or "started",
        "raw": {k: data.get(k) for k in ("id", "jobId", "status", "url") if k in data},
    }


TOOLS: dict[str, Any] = {
    "firecrawl_scrape": firecrawl_scrape,
    "firecrawl_search": firecrawl_search,
    "firecrawl_map_site": firecrawl_map_site,
    "firecrawl_crawl": firecrawl_crawl,
}

TOOL_SPECS: dict[str, dict] = {
    "firecrawl_scrape": {
        "description": "Scrape a page to markdown via Firecrawl.",
        "category": "research",
        "parameters": {
            "type": "object",
            "properties": {"url": {"type": "string"}},
            "required": ["url"],
        },
    },
    "firecrawl_search": {
        "description": "Web search via Firecrawl.",
        "category": "research",
        "parameters": {
            "type": "object",
            "properties": {"query": {"type": "string"}, "limit": {"type": "integer"}},
            "required": ["query"],
        },
    },
    "firecrawl_map_site": {
        "description": "Discover URLs on a site via Firecrawl map.",
        "category": "research",
        "parameters": {
            "type": "object",
            "properties": {"url": {"type": "string"}, "search": {"type": "string"}},
            "required": ["url"],
        },
    },
    "firecrawl_crawl": {
        "description": "Start a multi-page Firecrawl crawl job.",
        "category": "research",
        "parameters": {
            "type": "object",
            "properties": {
                "url": {"type": "string"},
                "limit": {"type": "integer"},
                "maxDepth": {"type": "integer"},
            },
            "required": ["url"],
        },
    },
}