"""Web browser automation via Playwright for MCP tool integration.

Provides structured web browser control: navigation, element interaction,
screenshots, and JavaScript execution. The browser instance is kept alive
across tool calls for session persistence (cookies, localStorage, page state).

All tools enforce the same policy/approval model as desktop automation.
"""
from __future__ import annotations

import base64
from typing import Any

from .config import get_settings
from .policy import Policy
from .tools import _check, default_policy

# Singleton Playwright browser state
_pw = None
_browser = None
_context = None
_page = None


def _ensure_browser(headless: bool = True) -> Any:
    """Lazy-initialize Playwright browser (Chromium). Returns the active page."""
    global _pw, _browser, _context, _page
    try:
        from playwright.sync_api import sync_playwright
    except ImportError as exc:
        raise RuntimeError(
            "Playwright is required for browser automation. "
            "Install it with: pip install playwright && playwright install chromium"
        ) from exc

    if _page is not None and not _page.is_closed():
        return _page

    # Clean up stale state
    if _browser is not None:
        try:
            _browser.close()
        except Exception:
            pass
    if _pw is not None:
        try:
            _pw.stop()
        except Exception:
            pass

    _pw = sync_playwright().start()
    _browser = _pw.chromium.launch(headless=headless)
    _context = _browser.new_context(
        viewport={"width": 1280, "height": 720},
        user_agent=(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"
        ),
    )
    _page = _context.new_page()
    return _page


def _close_browser() -> None:
    """Close the browser and clean up resources."""
    global _pw, _browser, _context, _page
    if _page is not None:
        try:
            _page.close()
        except Exception:
            pass
        _page = None
    if _context is not None:
        try:
            _context.close()
        except Exception:
            pass
        _context = None
    if _browser is not None:
        try:
            _browser.close()
        except Exception:
            pass
        _browser = None
    if _pw is not None:
        try:
            _pw.stop()
        except Exception:
            pass
        _pw = None


def _page_info(page) -> dict:
    """Extract current page metadata."""
    return {
        "url": page.url,
        "title": page.title(),
    }


def _screenshot_page(page, full_page: bool = False) -> dict:
    """Capture a screenshot of the current page viewport or full page."""
    shot_bytes = page.screenshot(full_page=full_page, type="jpeg", quality=80)
    b64 = base64.b64encode(shot_bytes).decode("ascii")
    viewport = page.viewport_size or {"width": 0, "height": 0}
    return {
        "available": True,
        "image_base64": b64,
        "mime_type": "image/jpeg",
        "width": viewport.get("width", 0),
        "height": viewport.get("height", 0),
        "full_page": full_page,
    }


# ---------------------------------------------------------------------------
# Browser MCP Tools
# ---------------------------------------------------------------------------

def browser_navigate(
    url: str,
    *,
    wait_until: str = "networkidle",
    timeout: int = 30,
    approval_granted: bool = False,
    policy: Policy | None = None,
) -> dict:
    """Navigate the browser to a URL.

    url: Target URL (must be http:// or https://).
    wait_until: When to consider navigation complete ('load', 'domcontentloaded', 'networkidle').
    timeout: Maximum seconds to wait for navigation.
    """
    eff_policy = policy or default_policy()
    _check("browser_navigate", approval_granted=approval_granted, policy=eff_policy)
    page = _ensure_browser()
    page.goto(url, wait_until=wait_until, timeout=timeout * 1000)
    return {"ok": True, "action": "browser_navigate", **_page_info(page)}


def browser_screenshot(
    full_page: bool = False,
    *,
    approval_granted: bool = False,
    policy: Policy | None = None,
) -> dict:
    """Capture a screenshot of the current browser page.

    full_page: When True, captures the entire scrollable page instead of just the viewport.
    """
    eff_policy = policy or default_policy()
    _check("browser_screenshot", approval_granted=approval_granted, policy=eff_policy)
    page = _ensure_browser()
    return {"ok": True, "action": "browser_screenshot", **_screenshot_page(page, full_page=full_page)}


def browser_click(
    selector: str,
    *,
    button: str = "left",
    clicks: int = 1,
    approval_granted: bool = False,
    policy: Policy | None = None,
) -> dict:
    """Click an element on the current page matching a CSS selector.

    selector: CSS selector (e.g. 'button#submit', '.nav-link').
    button: 'left', 'right', or 'middle'.
    clicks: Number of clicks (1 for single, 2 for double).
    """
    eff_policy = policy or default_policy()
    _check("browser_click", approval_granted=approval_granted, policy=eff_policy)
    page = _ensure_browser()
    el = page.locator(selector).first
    if clicks == 2:
        el.dblclick(button=button)
    else:
        el.click(button=button, click_count=clicks)
    return {"ok": True, "action": "browser_click", "selector": selector, **_page_info(page)}


def browser_type(
    selector: str,
    text: str,
    *,
    clear_first: bool = True,
    submit: bool = False,
    approval_granted: bool = False,
    policy: Policy | None = None,
) -> dict:
    """Type text into an input element matching a CSS selector.

    selector: CSS selector for the input/textarea element.
    text: Text to type.
    clear_first: Clear existing content before typing.
    submit: Press Enter after typing.
    """
    eff_policy = policy or default_policy()
    _check("browser_type", approval_granted=approval_granted, policy=eff_policy)
    page = _ensure_browser()
    el = page.locator(selector).first
    if clear_first:
        el.fill(text)
    else:
        el.type(text)
    if submit:
        el.press("Enter")
    return {"ok": True, "action": "browser_type", "selector": selector, "text": text, **_page_info(page)}


def browser_get_text(
    selector: str = "body",
    *,
    approval_granted: bool = False,
    policy: Policy | None = None,
) -> dict:
    """Extract visible text content from elements matching a CSS selector.

    selector: CSS selector (default 'body' for full page text).
    """
    eff_policy = policy or default_policy()
    _check("browser_get_text", approval_granted=approval_granted, policy=eff_policy)
    page = _ensure_browser()
    texts = page.locator(selector).all_inner_texts()
    return {
        "ok": True,
        "action": "browser_get_text",
        "selector": selector,
        "count": len(texts),
        "texts": texts,
        **_page_info(page),
    }


def browser_evaluate(
    script: str,
    *,
    approval_granted: bool = False,
    policy: Policy | None = None,
) -> dict:
    """Execute JavaScript in the current page context and return the result.

    script: JavaScript code to execute. Use 'return' to yield a value.
    """
    eff_policy = policy or default_policy()
    _check("browser_evaluate", approval_granted=approval_granted, policy=eff_policy)
    page = _ensure_browser()
    result = page.evaluate(script)
    # Serialize safely
    try:
        serialized = result if isinstance(result, (str, int, float, bool, type(None))) else str(result)
    except Exception:
        serialized = str(result)
    return {
        "ok": True,
        "action": "browser_evaluate",
        "result": serialized,
        **_page_info(page),
    }


def browser_get_url(
    *,
    approval_granted: bool = False,
    policy: Policy | None = None,
) -> dict:
    """Return the current page URL and title."""
    eff_policy = policy or default_policy()
    _check("browser_get_url", approval_granted=approval_granted, policy=eff_policy)
    page = _ensure_browser()
    return {"ok": True, "action": "browser_get_url", **_page_info(page)}


def browser_go_back(
    *,
    approval_granted: bool = False,
    policy: Policy | None = None,
) -> dict:
    """Navigate back in browser history."""
    eff_policy = policy or default_policy()
    _check("browser_go_back", approval_granted=approval_granted, policy=eff_policy)
    page = _ensure_browser()
    page.go_back()
    return {"ok": True, "action": "browser_go_back", **_page_info(page)}


def browser_go_forward(
    *,
    approval_granted: bool = False,
    policy: Policy | None = None,
) -> dict:
    """Navigate forward in browser history."""
    eff_policy = policy or default_policy()
    _check("browser_go_forward", approval_granted=approval_granted, policy=eff_policy)
    page = _ensure_browser()
    page.go_forward()
    return {"ok": True, "action": "browser_go_forward", **_page_info(page)}


def browser_scroll(
    delta_y: int = 0,
    delta_x: int = 0,
    *,
    approval_granted: bool = False,
    policy: Policy | None = None,
) -> dict:
    """Scroll the current page by delta pixels.

    delta_y: Vertical scroll amount (positive = down, negative = up).
    delta_x: Horizontal scroll amount (positive = right, negative = left).
    """
    eff_policy = policy or default_policy()
    _check("browser_scroll", approval_granted=approval_granted, policy=eff_policy)
    page = _ensure_browser()
    page.evaluate(f"window.scrollBy({delta_x}, {delta_y})")
    return {"ok": True, "action": "browser_scroll", "delta_x": delta_x, "delta_y": delta_y, **_page_info(page)}


def browser_close(
    *,
    approval_granted: bool = False,
    policy: Policy | None = None,
) -> dict:
    """Close the browser and release all resources."""
    eff_policy = policy or default_policy()
    _check("browser_close", approval_granted=approval_granted, policy=eff_policy)
    _close_browser()
    return {"ok": True, "action": "browser_close", "note": "Browser closed."}


def browser_new_page(
    url: str | None = None,
    *,
    approval_granted: bool = False,
    policy: Policy | None = None,
) -> dict:
    """Open a new browser tab. Optionally navigate to a URL.

    url: Optional URL to navigate the new tab to.
    """
    eff_policy = policy or default_policy()
    _check("browser_new_page", approval_granted=approval_granted, policy=eff_policy)
    page = _ensure_browser()
    new_page = page.context.new_page()
    global _page
    _page = new_page
    if url:
        new_page.goto(url)
    return {"ok": True, "action": "browser_new_page", **_page_info(new_page)}


def browser_get_elements(
    selector: str,
    *,
    include_text: bool = True,
    approval_granted: bool = False,
    policy: Policy | None = None,
) -> dict:
    """List elements matching a CSS selector with tag names, counts, and optional text snippets.

    selector: CSS selector to query.
    include_text: Include visible text for each matched element.
    """
    eff_policy = policy or default_policy()
    _check("browser_get_elements", approval_granted=approval_granted, policy=eff_policy)
    page = _ensure_browser()
    loc = page.locator(selector)
    count = loc.count()
    elements: list[dict] = []
    for i in range(min(count, 50)):
        el = loc.nth(i)
        tag = el.evaluate("el => el.tagName.toLowerCase()")
        info: dict[str, Any] = {"index": i, "tag": tag}
        if include_text:
            try:
                info["text"] = el.inner_text()[:200]
            except Exception:
                info["text"] = ""
        try:
            info["id"] = el.get_attribute("id") or ""
            info["class"] = el.get_attribute("class") or ""
        except Exception:
            pass
        elements.append(info)
    return {
        "ok": True,
        "action": "browser_get_elements",
        "selector": selector,
        "count": count,
        "elements": elements,
        **_page_info(page),
    }


def browser_wait_for_selector(
    selector: str,
    timeout: int = 10,
    *,
    state: str = "visible",
    approval_granted: bool = False,
    policy: Policy | None = None,
) -> dict:
    """Wait until an element matching the CSS selector appears (or disappears) on the page.

    selector: CSS selector to wait for.
    timeout: Maximum seconds to wait.
    state: 'visible', 'hidden', 'attached', or 'detached'.
    """
    eff_policy = policy or default_policy()
    _check("browser_wait_for_selector", approval_granted=approval_granted, policy=eff_policy)
    page = _ensure_browser()
    page.locator(selector).first.wait_for(state=state, timeout=timeout * 1000)
    return {
        "ok": True,
        "action": "browser_wait_for_selector",
        "selector": selector,
        "state": state,
        **_page_info(page),
    }


def browser_select_option(
    selector: str,
    value: str | None = None,
    label: str | None = None,
    *,
    approval_granted: bool = False,
    policy: Policy | None = None,
) -> dict:
    """Select an option in a <select> dropdown by value or visible label.

    selector: CSS selector for the <select> element.
    value: Option value attribute to select.
    label: Visible text of the option to select.
    """
    eff_policy = policy or default_policy()
    _check("browser_select_option", approval_granted=approval_granted, policy=eff_policy)
    page = _ensure_browser()
    el = page.locator(selector).first
    if value is not None:
        el.select_option(value=value)
    elif label is not None:
        el.select_option(label=label)
    else:
        raise ValueError("Either 'value' or 'label' must be provided.")
    return {"ok": True, "action": "browser_select_option", "selector": selector, **_page_info(page)}


def browser_download_file(
    url: str,
    filename: str | None = None,
    *,
    approval_granted: bool = False,
    policy: Policy | None = None,
) -> dict:
    """Download a file via the browser context to the workspace data directory.

    url: Direct URL of the file to download.
    filename: Optional filename override (defaults to URL basename).
    """
    eff_policy = policy or default_policy()
    _check("browser_download_file", approval_granted=approval_granted, policy=eff_policy)
    page = _ensure_browser()
    from urllib.parse import urlparse
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"}:
        raise ValueError(f"URL must be http(s): {url}")
    fname = filename or (parsed.path.split("/")[-1] or "download")
    out_dir = get_settings().data_dir
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / fname
    # Use browser context to download (respects cookies/session)
    with page.expect_download() as download_info:
        page.evaluate(f"window.location.href = {url!r}")
    download = download_info.value
    download.save_as(str(out_path))
    return {
        "ok": True,
        "action": "browser_download_file",
        "url": url,
        "path": str(out_path),
        "filename": fname,
        **_page_info(page),
    }
