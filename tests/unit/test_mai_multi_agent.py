"""Multi-Agent Intelligence: gated handoffs, profiles, recover API, queue delegate."""
from __future__ import annotations

import json
import time

from fastapi.testclient import TestClient

from ai_bridge.control import dispatch, role_catalog, supervisor
from ai_bridge.control.app import create_app
from ai_bridge.policy import Policy, TOOL_TIERS


def _open_policy() -> Policy:
    return Policy(
        allow_writes=True,
        allow_tier3=True,
        desktop_enabled=True,
        max_tier_unattended=4,
        unrestricted=True,
    )


def _seed_device(conn, device_id: str = "dev-mai") -> None:
    now = time.time()
    conn.execute(
        "INSERT INTO devices (id, name, hostname, os, token_hash, created_at, status, last_seen) "
        "VALUES (?, 'n', 'h', 'Linux', 'x', ?, 'online', ?)",
        (device_id, now, now),
    )
    conn.commit()


def test_handoff_profiles_cover_all_nine_roles():
    seen: set[str] = set()
    for profile in supervisor.HANDOFF_PROFILES:
        for step in supervisor.supervisor_handoff_plan("goal", profile=profile):
            seen.add(step["role"])
    seen.add(supervisor.RECOVERY_STEP["role"])
    # Supervisor coordinates via API/MCP; the other eight appear in profiles or Recovery.
    assert {
        "planner",
        "developer",
        "tester",
        "researcher",
        "browser_operator",
        "computer_operator",
        "security_auditor",
        "recovery",
    } <= seen
    assert "supervisor" in role_catalog.ROLES


def test_gated_advance_enqueues_next_and_recovery(tmp_path):
    app = create_app(admin_token="adm-mai", db_path=tmp_path / "mai.db")
    conn = app.state.conn
    _seed_device(conn)
    res = supervisor.run_supervisor_handoff_enqueue(
        conn, device_id="dev-mai", tenant="default", goal="ship", profile="code", mode="gated"
    )
    assert len(res["queued"]) == 1
    first_id = res["queued"][0]["task_id"]
    handoff_id = res["handoff_id"]

    row = conn.execute("SELECT * FROM tasks WHERE id=?", (first_id,)).fetchone()
    advanced = supervisor.advance_handoff(conn, row, status="completed")
    assert advanced and advanced["advanced"] is True
    assert advanced["next_step"] == 1
    next_id = advanced["queued"]["task_id"]
    next_row = conn.execute("SELECT args_json FROM tasks WHERE id=?", (next_id,)).fetchone()
    next_args = json.loads(next_row["args_json"])
    assert next_args["_role"] == "developer"
    assert next_args["_parent_task_id"] == first_id
    assert next_args["_handoff_id"] == handoff_id

    # Fail developer step → Recovery
    failed = conn.execute("SELECT * FROM tasks WHERE id=?", (next_id,)).fetchone()
    rec = supervisor.advance_handoff(conn, failed, status="failed")
    assert rec and rec.get("recovery") is True
    rec_args = json.loads(
        conn.execute("SELECT args_json FROM tasks WHERE id=?", (rec["queued"]["task_id"],)).fetchone()["args_json"]
    )
    assert rec_args["_role"] == "recovery"

    status = supervisor.handoff_status(conn, handoff_id)
    assert status["count"] >= 3
    assert status["handoff_id"] == handoff_id


def test_computer_operator_tools_in_dispatch_and_tiers():
    tools = role_catalog.ROLES["computer_operator"]["allowed_tools"]
    for name in tools:
        assert name in TOOL_TIERS, name
    # Resolve a few through dispatch handlers (policy open).
    for name in ("capture_desktop_screenshot", "desktop_click", "set_of_marks_screenshot", "desktop_verify_action"):
        assert name in TOOL_TIERS
    out = dispatch.dispatch("supervisor_delegate_role", {"role": "computer_operator"}, policy=_open_policy())
    assert out["target_agent"] == "agent-role-computer_operator"
    assert "capture_desktop_screenshot" in out["allowed_tools"]


def test_supervisor_enqueue_handoff_dispatch_with_plane_conn(tmp_path):
    app = create_app(admin_token="adm-mai2", db_path=tmp_path / "mai2.db")
    conn = app.state.conn
    _seed_device(conn, "dev-mai2")
    tok = supervisor.set_plane_conn(conn)
    try:
        out = dispatch.dispatch(
            "supervisor_enqueue_handoff",
            {"device_id": "dev-mai2", "goal": "via dispatch", "profile": "research", "mode": "gated"},
            policy=_open_policy(),
            approval_granted=True,
        )
    finally:
        supervisor.reset_plane_conn(tok)
    assert out["ok"] is True
    assert out["profile"] == "research"
    assert len(out["queued"]) == 1
    assert out["queued"][0]["role"] == "planner"


def test_recover_api_and_roles_api(tmp_path):
    admin = "adm-mai3"
    app = create_app(admin_token=admin, db_path=tmp_path / "mai3.db")
    client = TestClient(app)
    headers = {"X-Admin-Token": admin}
    reg = client.post("/api/devices/enroll", json={"name": "node", "os": "Linux"}, headers=headers).json()
    dev_id = reg["device_id"]
    now = time.time()
    args = json.dumps({"_role": "developer", "_handoff_id": "h1"})
    app.state.conn.execute(
        "INSERT INTO tasks (id, device_id, tenant, tool, args_json, tier, status, created_at, updated_at) "
        "VALUES ('fail-mai', ?, 'default', 'git_status', ?, 1, 'failed', ?, ?)",
        (dev_id, args, now, now),
    )
    app.state.conn.commit()
    rec = client.post(
        "/api/supervisor/recover",
        json={"role": "developer", "device_id": dev_id},
        headers=headers,
    )
    assert rec.status_code == 200
    assert rec.json()["count"] == 1
    st = app.state.conn.execute("SELECT status FROM tasks WHERE id='fail-mai'").fetchone()
    assert st["status"] == "queued"

    roles = client.get("/api/roles", headers=headers)
    assert roles.status_code == 200
    body = roles.json()
    assert len(body["roles"]) == len(role_catalog.ROLES)
    assert "code" in body["profiles"]
    enabled = {r["id"]: r["enabled"] for r in body["roles"]}
    assert enabled.get("supervisor") is True
    assert enabled.get("planner") is True

    handoff = client.post(
        "/api/supervisor/handoff",
        json={"device_id": dev_id, "goal": "api gated", "profile": "browser", "mode": "gated"},
        headers=headers,
    )
    assert handoff.status_code == 200
    hid = handoff.json()["handoff_id"]
    status = client.get(f"/api/supervisor/handoffs/{hid}", headers=headers)
    assert status.status_code == 200
    assert status.json()["count"] >= 1


def test_queue_delegate_creates_child_task(tmp_path):
    app = create_app(admin_token="adm-mai4", db_path=tmp_path / "mai4.db")
    conn = app.state.conn
    role_catalog.seed_role_catalog(conn)
    _seed_device(conn, "dev-mai4")
    queued = supervisor.enqueue_agent_run_role(
        conn,
        device_id="dev-mai4",
        tenant="default",
        role="developer",
        prompt="implement feature X",
        parent_task_id="parent1",
    )
    assert queued["ok"] is True
    row = conn.execute("SELECT tool, args_json, status FROM tasks WHERE id=?", (queued["task_id"],)).fetchone()
    assert row["tool"] == "agent_run_role"
    assert row["status"] == "queued"
    args = json.loads(row["args_json"])
    assert args["_role"] == "developer"
    assert args["_parent_task_id"] == "parent1"
    assert "implement feature X" in args["prompt"]


def test_tag_task_args_lineage():
    tagged = supervisor.tag_task_args(
        {"relative_directory": "."},
        role="tester",
        handoff_id="abc",
        parent_task_id="p1",
        goal="g",
        step_index=2,
        profile="code",
        mode="gated",
    )
    assert tagged["_role"] == "tester"
    assert tagged["_role_agent"] == "agent-role-tester"
    assert tagged["_handoff_id"] == "abc"
    assert tagged["_parent_task_id"] == "p1"
    assert tagged["_step_index"] == 2
    assert tagged["_profile"] == "code"
    assert tagged["_mode"] == "gated"
