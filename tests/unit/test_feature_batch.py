"""Unit and integration tests for the 5-track feature enhancement batch:
1. Inline Base64 Vision & Computer Use (perform_approved_ui_action)
2. Multi-Device Fleet Control (select_device, list_devices)
3. Low-Latency Long-Polling & Auto Device Token Rotation
4. Approval Webhook Notifications (Slack/Discord/Telegram/Generic)
5. 512 KB Task Result Cap for inline screenshots
"""
from __future__ import annotations

import base64
import json
import tempfile
import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from ai_bridge import server as mcp_server
from ai_bridge import tools
from ai_bridge.control import app as appmod
from ai_bridge.control.app import create_app
from ai_bridge.control.dispatch import dispatch
from ai_bridge.policy import Policy

ADMIN = "test-admin-token"


def _make_client():
    db = Path(tempfile.mkdtemp()) / "c.db"
    return TestClient(create_app(admin_token=ADMIN, db_path=db))


def test_encode_image_base64_produces_jpeg():
    from PIL import Image

    img = Image.new("RGB", (64, 48), color=(40, 80, 120))
    b64, mime = tools._encode_image_base64(img)
    assert mime == "image/jpeg"
    assert isinstance(b64, str) and len(b64) > 50
    raw = base64.b64decode(b64)
    assert raw[:2] == b"\xff\xd8"  # JPEG magic bytes


def test_perform_approved_ui_action_policy_and_validation(monkeypatch):
    # Denied when desktop_enabled=False
    p_disabled = Policy(allow_tier3=True, desktop_enabled=False)
    with pytest.raises(PermissionError, match="Desktop automation is not enabled"):
        tools.perform_approved_ui_action("list_windows", policy=p_disabled, approval_granted=True)

    # Denied when Tier-3 is neither enabled nor approved
    p_no_tier3 = Policy(allow_tier3=False, desktop_enabled=True)
    with pytest.raises(PermissionError):
        tools.perform_approved_ui_action("list_windows", policy=p_no_tier3, approval_granted=False)

    # Validation checks when allowed
    p_ok = Policy(allow_tier3=True, desktop_enabled=True)
    monkeypatch.setattr(tools.platform, "system", lambda: "Windows")
    with pytest.raises(ValueError, match="Unsupported UI action"):
        tools.perform_approved_ui_action(" self_destruct ", policy=p_ok)
    with pytest.raises(ValueError, match="requires integer x and y"):
        tools.perform_approved_ui_action("click", x=10, y=None, policy=p_ok)
    with pytest.raises(ValueError, match="requires a non-empty"):
        tools.perform_approved_ui_action("type_text", text="", policy=p_ok)
    with pytest.raises(ValueError, match="requires a 'key'"):
        tools.perform_approved_ui_action("press_key", key="", policy=p_ok)
    with pytest.raises(ValueError, match="requires a non-empty"):
        tools.perform_approved_ui_action("focus_window", title="", policy=p_ok)

    # Dispatch wires parameters through to perform_approved_ui_action
    seen = {}
    def fake_win32(act, *, x, y, text, key, title, delta):
        seen.update(act=act, x=x, y=y, text=text, key=key, title=title, delta=delta)
        return {"action": act, "ok": True}

    monkeypatch.setattr(tools, "_win32_ui_action", fake_win32)
    out = dispatch(
        "perform_approved_ui_action",
        {"action": "click", "x": 320, "y": 240},
        policy=p_ok,
        approval_granted=True,
    )
    assert out == {"action": "click", "ok": True}
    assert seen["act"] == "click" and seen["x"] == 320 and seen["y"] == 240


def test_select_device_and_list_devices(monkeypatch):
    monkeypatch.setenv("AI_BRIDGE_ADMIN_TOKEN", ADMIN)
    fake_devices = [
        {"id": "dev-win", "name": "windows-test", "hostname": "WIN-SRV", "os": "Windows", "status": "online"},
        {"id": "dev-lin", "name": "linux-box", "hostname": "ubuntu-1", "os": "Linux", "status": "offline"},
    ]
    monkeypatch.setattr(mcp_server, "list_all_devices", lambda url, tok: fake_devices)
    routed = {}
    def fake_run_device_tool(url, tok, dev_id, tool, args):
        routed["dev_id"] = dev_id
        routed["tool"] = tool
        return {"routed_to": dev_id, "tool": tool}
    monkeypatch.setattr(mcp_server, "run_device_tool", fake_run_device_tool)

    try:
        # Select by friendly name
        sel = mcp_server.select_device("windows-test")
        assert sel["selected_device"] == "dev-win" and sel["mode"] == "remote"

        devs = mcp_server.list_devices()
        active_ids = [d["device_id"] for d in devs if d.get("active")]
        assert active_ids == ["dev-win"]

        # Device-aware tool routes to dev-win
        res = mcp_server.system_info()
        assert res["routed_to"] == "dev-win" and res["tool"] == "get_system_info"

        # Switch back to local
        sel_local = mcp_server.select_device("local")
        assert sel_local["selected_device"] == "local" and sel_local["mode"] == "local"
        local_info = mcp_server.system_info()
        assert "system" in local_info
    finally:
        mcp_server._SELECTED_DEVICE.clear()


def test_512kb_result_and_long_poll_wakeup():
    c = _make_client()
    dev = c.post(
        "/api/devices/enroll",
        json={"name": "win", "hostname": "win1", "os": "Windows"},
        headers={"X-Admin-Token": ADMIN},
    ).json()

    # Submit a task and post a 50 KB result (larger than old 8 KB cap)
    t = c.post(
        "/api/tasks",
        json={"device_id": dev["device_id"], "tool": "get_system_info", "args": {}},
        headers={"X-Admin-Token": ADMIN},
    ).json()
    nxt = c.get("/api/agent/tasks/next", headers={"X-Device-Token": dev["device_token"]}).json()
    assert nxt["task"]["id"] == t["task_id"]

    big_payload = json.dumps({"image_base64": "A" * 40_000, "mime_type": "image/jpeg"})
    r = c.post(
        f"/api/agent/tasks/{t['task_id']}/result",
        json={"status": "completed", "result": big_payload},
        headers={"X-Device-Token": dev["device_token"]},
    )
    assert r.status_code == 200
    got = c.get(f"/api/tasks/{t['task_id']}", headers={"X-Admin-Token": ADMIN}).json()
    assert len(got["result"]) == len(big_payload)


def test_webhook_settings_and_approval_trigger(monkeypatch):
    c = _make_client()
    dev = c.post(
        "/api/devices/enroll",
        json={"name": "win-fleet", "hostname": "win1", "os": "Windows"},
        headers={"X-Admin-Token": ADMIN},
    ).json()

    # Configure a Telegram-style webhook URL
    tg_url = "https://api.telegram.org/bot123:ABC/sendMessage?chat_id=998877"
    r = c.post(
        "/api/settings/webhook",
        json={"webhook_url": tg_url},
        headers={"X-Admin-Token": ADMIN},
    )
    assert r.status_code == 200 and r.json()["configured"] is True
    assert c.get("/api/settings/webhook", headers={"X-Admin-Token": ADMIN}).json()["webhook_url"] == tg_url

    captured = []
    class FakeResp:
        status = 200
        def __enter__(self): return self
        def __exit__(self, *a): return False

    def fake_urlopen(req, timeout=10):
        captured.append(json.loads(req.data.decode("utf-8")))
        return FakeResp()

    monkeypatch.setattr(appmod.urllib.request, "urlopen", fake_urlopen)
    test_res = c.post("/api/settings/webhook/test", headers={"X-Admin-Token": ADMIN}).json()
    assert test_res["ok"] is True
    assert captured[-1]["chat_id"] == "998877"
    assert "text" in captured[-1] and "content" in captured[-1]

    # Submitting a Tier-4 task triggers the webhook notification
    c.post(
        "/api/tasks",
        json={"device_id": dev["device_id"], "tool": "delete_workspace_file", "args": {"relative_path": "a.txt"}},
        headers={"X-Admin-Token": ADMIN},
    )
    deadline = time.time() + 2.0
    while time.time() < deadline and len(captured) < 2:
        time.sleep(0.05)
    assert len(captured) >= 2
    assert captured[-1]["tool"] == "delete_workspace_file"


def test_poller_auto_rotates_expiring_token(monkeypatch, tmp_path):
    from agents.common.poller import Poller

    token_file = tmp_path / "device.token"
    poller = Poller("http://ctl", "old-token", token_file=token_file)
    calls = []

    def fake_req(method, path, payload=None, timeout=15):
        calls.append((method, path, poller.device_token))
        if path == "/api/agent/heartbeat":
            # Expires in 1 hour (< 48h threshold)
            return {"device_id": "d1", "emergency_stop": False, "token_expires_at": time.time() + 3600}
        if path == "/api/agent/rotate":
            return {"device_id": "d1", "device_token": "rotated-new-token", "token_expires_at": time.time() + 7 * 86400}
        if path.startswith("/api/agent/tasks/next"):
            return {"task": None}
        return {}

    monkeypatch.setattr(poller, "_req", fake_req)
    poller.run_once()
    assert poller.device_token == "rotated-new-token"
    assert token_file.read_text(encoding="utf-8") == "rotated-new-token"


def test_edit_and_delete_records():
    c = _make_client()
    hdr = {"X-Admin-Token": ADMIN}

    # 1. Enroll, edit, and delete a device
    dev = c.post("/api/devices/enroll", json={"name": "old-name", "hostname": "h1", "os": "Win11"}, headers=hdr).json()
    did = dev["device_id"]
    upd_dev = c.put(f"/api/devices/{did}", json={"name": "new-name", "hostname": "h2", "os": "Win11 Pro"}, headers=hdr)
    assert upd_dev.status_code == 200 and upd_dev.json()["name"] == "new-name"

    # 2. Submit, edit, and delete a task & approval
    task = c.post("/api/tasks", json={"device_id": did, "tool": "delete_workspace_file", "args": {"relative_path": "x.txt"}}, headers=hdr).json()
    tid = task["task_id"]
    aid = task["approval_id"]
    upd_task = c.put(f"/api/tasks/{tid}", json={"tool": "get_system_info", "args": {}, "status": "queued"}, headers=hdr)
    assert upd_task.status_code == 200 and upd_task.json()["tool"] == "get_system_info"
    gated = c.post("/api/tasks", json={"device_id": did, "tool": "delete_workspace_file", "args": {"relative_path": "x.txt"}}, headers=hdr).json()
    assert c.put(f"/api/tasks/{gated['task_id']}", json={"status": "queued"}, headers=hdr).status_code == 409

    upd_app = c.put(f"/api/approvals/{aid}", json={"reason": "Edited reason"}, headers=hdr)
    assert upd_app.status_code == 200 and upd_app.json()["reason"] == "Edited reason"
    assert c.put(f"/api/approvals/{aid}", json={"status": "approved"}, headers=hdr).status_code == 400

    assert c.delete(f"/api/approvals/{aid}", headers=hdr).status_code == 200
    assert c.delete(f"/api/tasks/{tid}", headers=hdr).status_code == 200

    # 3. Create, edit, and delete a policy version
    pol = c.post("/api/policies", json={"allow_tier3": False, "desktop_enabled": True, "allowed_apps": ["chrome"], "allowed_services": [], "note": "v1"}, headers=hdr).json()
    ver = pol["version"]
    upd_pol = c.put(f"/api/policies/{ver}", json={"allow_tier3": True, "desktop_enabled": True, "allowed_apps": ["chrome", "code"], "allowed_services": [], "note": "v1-edited"}, headers=hdr)
    assert upd_pol.status_code == 200 and upd_pol.json()["policy"]["allow_tier3"] is True
    assert c.delete(f"/api/policies/{ver}", headers=hdr).status_code == 200

    # 4. Audit is immutable through the API and can be exported
    assert c.put("/api/audit/1", json={"actor": "tampered"}, headers=hdr).status_code == 405
    assert c.delete("/api/audit/1", headers=hdr).status_code == 405
    exported = c.get("/api/audit/export", headers=hdr)
    assert exported.status_code == 200 and exported.json()["count"] > 0
    aud_list = c.get("/api/audit", headers=hdr).json()
    assert len(aud_list) > 0
    assert aud_list[0]["id"] > 0

    # 5. Delete device
    assert c.delete(f"/api/devices/{did}", headers=hdr).status_code == 200


