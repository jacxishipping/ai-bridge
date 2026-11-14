"""Phases 4–6 deep implementation tests (connectors, dev tools, supervisor)."""
from __future__ import annotations

import json
import os
import time
from unittest.mock import MagicMock, patch

import pytest

from ai_bridge import dev_tools
from ai_bridge.connectors import browserbase, firecrawl, you_search
from ai_bridge.control import dispatch, role_catalog, supervisor
from ai_bridge.policy import Policy


def _open_policy() -> Policy:
    return Policy(
        allow_writes=True,
        allow_tier3=True,
        desktop_enabled=True,
        max_tier_unattended=4,
        unrestricted=True,
    )


def test_connectors_fail_without_api_key(monkeypatch):
    monkeypatch.delenv("AI_BRIDGE_BROWSERBASE_API_KEY", raising=False)
    monkeypatch.delenv("AI_BRIDGE_BROWSERBASE_PROJECT_ID", raising=False)
    with pytest.raises(browserbase.BrowserbaseError):
        browserbase.browserbase_create_session({})
    monkeypatch.delenv("YOU_API_KEY", raising=False)
    monkeypatch.delenv("AI_BRIDGE_YOU_API_KEY", raising=False)
    with pytest.raises(you_search.YouSearchError, match="API key"):
        you_search.you_web_search({"query": "ai bridge"})
    monkeypatch.delenv("FIRECRAWL_API_KEY", raising=False)
    monkeypatch.delenv("AI_BRIDGE_FIRECRAWL_API_KEY", raising=False)
    with pytest.raises(firecrawl.FirecrawlError, match="Firecrawl"):
        firecrawl.firecrawl_scrape({"url": "https://example.com"})


def test_dispatch_registers_firecrawl_and_browserbase_tools():
    with pytest.raises(firecrawl.FirecrawlError):
        dispatch.dispatch("firecrawl_search", {"query": "test"}, policy=_open_policy())
    with pytest.raises(browserbase.BrowserbaseError):
        dispatch.dispatch("browserbase_create_session", {}, policy=_open_policy(), approval_granted=True)
    plan = dispatch.dispatch("dev_workspace_plan", {}, policy=_open_policy())
    assert plan["ok"] is True
    out = dispatch.dispatch("supervisor_delegate_role", {"role": "developer"}, policy=_open_policy())
    assert out["target_agent"] == "agent-role-developer"


def test_dispatch_browser_navigate_passes_screenshot_flag():
    with patch.object(dispatch.browser_tools, "browser_navigate", return_value={"ok": True}) as nav:
        dispatch.dispatch(
            "browser_navigate",
            {"url": "https://example.com", "screenshot_after_nav": True},
            policy=_open_policy(),
            approval_granted=True,
        )
        assert nav.call_args.kwargs.get("screenshot_after_nav") is True


def test_dev_workspace_plan_and_structure(tmp_path, monkeypatch):
    from ai_bridge.config import get_settings

    monkeypatch.setenv("AI_BRIDGE_WORKSPACE", str(tmp_path))
    if hasattr(get_settings, "cache_clear"):
        get_settings.cache_clear()
    (tmp_path / "src").mkdir()
    (tmp_path / "src" / "main.py").write_text("print(1)\n", encoding="utf-8")
    plan = dev_tools.dev_workspace_plan(".", max_depth=2)
    assert plan["ok"] is True
    assert plan["structure"]["entry_count"] >= 1


def test_run_project_tests_structured_parses_summary(monkeypatch):
    fake = {"task_id": "t1", "status": "completed", "output": "===== 3 passed in 0.1s ====="}
    with patch("ai_bridge.dev_tools.run_project_tests", return_value=fake):
        out = dev_tools.run_project_tests_structured("pytest -q", 10, policy=_open_policy())
    assert out["summary"]["passed"] == 3
    assert out["ok"] is True


def test_supervisor_handoff_enqueue_role_tags(tmp_path):
    from ai_bridge.control.app import create_app

    app = create_app(admin_token="adm", db_path=tmp_path / "sup.db")
    conn = app.state.conn
    role_catalog.seed_role_catalog(conn)
    now = time.time()
    conn.execute(
        "INSERT INTO devices (id, name, hostname, os, token_hash, created_at, status, last_seen) "
        "VALUES ('dev-sup', 'n', 'h', 'Linux', 'x', ?, 'online', ?)",
        (now, now),
    )
    conn.commit()
    res = supervisor.run_supervisor_handoff_enqueue(conn, device_id="dev-sup", tenant="default", goal="ship phase 6")
    assert res["ok"] is True
    assert res["mode"] == "gated"
    assert len(res["queued"]) == 1
    assert res["handoff_id"]
    row = conn.execute("SELECT args_json FROM tasks WHERE id=?", (res["queued"][0]["task_id"],)).fetchone()
    args = json.loads(row["args_json"])
    assert args.get("_role") == "planner"
    assert args.get("_handoff_id") == res["handoff_id"]
    assert args.get("_mode") == "gated"

    fan = supervisor.run_supervisor_handoff_enqueue(
        conn, device_id="dev-sup", tenant="default", goal="ship phase 6", mode="fanout"
    )
    assert len(fan["queued"]) == 3
    for item in fan["queued"]:
        row = conn.execute("SELECT args_json FROM tasks WHERE id=?", (item["task_id"],)).fetchone()
        args = json.loads(row["args_json"])
        assert args.get("_role") in {"planner", "developer", "tester"}


def test_recover_failed_role_tasks(tmp_path):
    from ai_bridge.control.app import create_app

    app = create_app(admin_token="adm", db_path=tmp_path / "rec.db")
    conn = app.state.conn
    now = time.time()
    conn.execute(
        "INSERT INTO devices (id, name, hostname, os, token_hash, created_at, status, last_seen) "
        "VALUES ('dev-r', 'n', 'h', 'Linux', 'x', ?, 'online', ?)",
        (now, now),
    )
    args = json.dumps({"_role": "developer"})
    conn.execute(
        "INSERT INTO tasks (id, device_id, tenant, tool, args_json, tier, status, created_at, updated_at) "
        "VALUES ('fail1', 'dev-r', 'default', 'git_status', ?, 1, 'failed', ?, ?)",
        (args, now, now),
    )
    conn.commit()
    out = supervisor.recover_failed_role_tasks(conn, role="developer")
    assert out["count"] == 1
    st = conn.execute("SELECT status FROM tasks WHERE id='fail1'").fetchone()
    assert st["status"] == "queued"


def test_role_catalog_handoff_template_seed(tmp_path):
    from ai_bridge.control.app import create_app

    app = create_app(admin_token="adm", db_path=tmp_path / "handoff.db")
    conn = app.state.conn
    role_catalog.seed_role_catalog(conn)
    row = conn.execute(
        "SELECT steps_json FROM workflow_templates WHERE id='role-handoff-supervisor-planner-developer'"
    ).fetchone()
    assert row is not None
    steps = json.loads(row["steps_json"])
    assert len(steps) >= 3
    assert steps[0]["tool"] == "dev_workspace_plan"