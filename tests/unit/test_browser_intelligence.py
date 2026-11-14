"""Browser Intelligence: viewport, visual compare, Browserbase durable, crawl registration."""
from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

from ai_bridge import browser_tools
from ai_bridge.connectors import browserbase, firecrawl
from ai_bridge.control import dispatch
from ai_bridge.policy import TOOL_TIERS, Policy


def test_resolve_device_profile_presets():
    desk = browser_tools.resolve_device_profile("desktop")
    assert desk["viewport"]["width"] == 1280
    phone = browser_tools.resolve_device_profile("iphone")
    assert phone["is_mobile"] is True
    assert phone["viewport"]["width"] == 390
    custom = browser_tools.resolve_device_profile("desktop", width=800, height=600)
    assert custom["viewport"] == {"width": 800, "height": 600}


def test_browser_set_viewport_updates_profile(monkeypatch):
    monkeypatch.setattr(browser_tools, "_browser", None)
    monkeypatch.setattr(browser_tools, "_page", None)
    out = browser_tools.browser_set_viewport(
        "pixel",
        recreate_context=False,
        approval_granted=True,
        policy=Policy(desktop_enabled=True, allow_tier3=True, max_tier_unattended=4),
    )
    assert out["ok"] is True
    assert out["device"]["name"] == "pixel"
    assert browser_tools._device_profile["is_mobile"] is True


def test_visual_compare_image_bytes_identical():
    # Minimal valid-ish PNG payloads not required — raw compare path for non-PIL fallback
    a = b"\x00" * 100
    b = b"\x00" * 100
    res = browser_tools.compare_image_bytes(a, b, threshold=0.01)
    assert res["matched"] is True
    assert res["rmse"] == 0.0


def test_visual_compare_image_bytes_differs():
    a = bytes([0] * 64)
    b = bytes([255] * 64)
    res = browser_tools.compare_image_bytes(a, b, threshold=0.01)
    assert res["matched"] is False
    assert res["rmse"] > 0.01


def test_dispatch_registers_new_browser_tools():
    for name in (
        "browser_set_viewport",
        "browser_expect",
        "browser_wait_for_url",
        "browser_diagnostics",
        "browser_compare_screenshot",
        "browserbase_connect",
        "browserbase_screenshot",
        "firecrawl_crawl",
    ):
        assert name in TOOL_TIERS


def test_dispatch_browser_set_viewport(monkeypatch):
    called = {}

    def fake_set(device="desktop", **kw):
        called["device"] = device
        called.update(kw)
        return {"ok": True, "device": {"name": device}}

    monkeypatch.setattr(browser_tools, "browser_set_viewport", fake_set)
    out = dispatch.dispatch(
        "browser_set_viewport",
        {"device": "iphone"},
        approval_granted=True,
        policy=Policy(allow_tier3=True, max_tier_unattended=4),
    )
    assert out["ok"] is True
    assert called["device"] == "iphone"


def test_browserbase_navigate_keeps_session(monkeypatch):
    browserbase.reset_for_tests()
    fake_page = MagicMock()
    fake_page.is_closed.return_value = False
    fake_page.url = "https://example.com/"
    fake_page.title.return_value = "Example"
    fake_page.goto = MagicMock()

    def fake_connect(args=None):
        browserbase._BB.update(
            {
                "page": fake_page,
                "session_id": "sess-1",
                "connect_url": "wss://example/cdp",
                "pw": object(),
                "browser": object(),
                "context": object(),
            }
        )
        return {"ok": True, "session_id": "sess-1", "connect_url": "wss://example/cdp"}

    monkeypatch.setattr(browserbase, "browserbase_connect", fake_connect)
    out = browserbase.browserbase_navigate({"url": "https://example.com"})
    assert out["ok"] is True
    assert out["durable"] is True
    assert out["session_id"] == "sess-1"
    assert browserbase._BB["page"] is fake_page  # not cleared
    fake_page.goto.assert_called_once()


def test_firecrawl_crawl_requires_key(monkeypatch):
    monkeypatch.delenv("AI_BRIDGE_FIRECRAWL_API_KEY", raising=False)
    monkeypatch.delenv("FIRECRAWL_API_KEY", raising=False)
    with pytest.raises(firecrawl.FirecrawlError):
        firecrawl.firecrawl_crawl({"url": "https://example.com"})


def test_firecrawl_crawl_posts(monkeypatch):
    monkeypatch.setenv("FIRECRAWL_API_KEY", "fc-test")

    class FakeResp:
        status_code = 200

        def json(self):
            return {"id": "job-1", "status": "scraping"}

    class FakeClient:
        def __init__(self, *a, **k):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

        def post(self, url, json=None, headers=None):
            assert url.endswith("/crawl")
            assert json["url"] == "https://example.com"
            return FakeResp()

    monkeypatch.setattr(firecrawl.httpx, "Client", FakeClient)
    out = firecrawl.firecrawl_crawl({"url": "https://example.com", "limit": 3})
    assert out["ok"] is True
    assert out["id"] == "job-1"


def test_workflow_visual_verify_path_present():
    from pathlib import Path

    text = (Path(__file__).resolve().parents[2] / "src/ai_bridge/control/app.py").read_text(encoding="utf-8")
    assert 'v_mode in {"visual", "screenshot", "browser_compare"}' in text
    assert "browser_compare_screenshot" in text
