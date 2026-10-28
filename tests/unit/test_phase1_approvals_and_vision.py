"""Unit tests for Phase 1: OCR/Vision Grounding & Multi-Channel 1-Click Mobile Approvals."""
from __future__ import annotations

import hashlib
import hmac
import time
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

from ai_bridge import tools, vision
from ai_bridge.control.app import create_app, make_quick_sig, send_webhook_notification
from ai_bridge.control.dispatch import dispatch
from ai_bridge.policy import Policy, decide


def test_quick_sig_generation():
    token = "admin-secret-token"
    app_id = "app-12345"
    sig_app = make_quick_sig(token, app_id, "approved")
    sig_den = make_quick_sig(token, app_id, "denied")

    assert len(sig_app) == 32
    assert len(sig_den) == 32
    assert sig_app != sig_den

    # Consistent HMAC
    expected = hmac.new(token.encode("utf-8"), f"{app_id}:approved".encode("utf-8"), hashlib.sha256).hexdigest()[:32]
    assert sig_app == expected


def test_quick_mobile_approval_lifecycle(tmp_path):
    admin_token = "phase1-test-token"
    app = create_app(admin_token=admin_token, db_path=tmp_path / "control.db")
    client = TestClient(app)

    # 1. Enroll device
    dev_res = client.post(
        "/api/devices/enroll",
        json={"name": "Workstation-Win11", "hostname": "win-box", "os": "Windows 11"},
        headers={"X-Admin-Token": admin_token},
    ).json()
    device_id = dev_res["device_id"]

    # 2. Submit tier-4 task that requires approval
    task_res = client.post(
        "/api/tasks",
        json={"device_id": device_id, "tool": "delete_workspace_file", "args": {"relative_path": "secret.txt"}},
        headers={"X-Admin-Token": admin_token},
    ).json()
    assert task_res["status"] == "needs_approval"
    approval_id = task_res["approval_id"]
    task_id = task_res["task_id"]

    # 3. Test Invalid Signature -> 403 Forbidden HTML
    bad_resp = client.get(f"/api/approvals/quick/{approval_id}?decision=approved&sig=bad-signature")
    assert bad_resp.status_code == 403
    assert "Signature Verification Failed" in bad_resp.text

    # Approval still pending
    appr = client.get("/api/approvals", headers={"X-Admin-Token": admin_token}).json()
    assert appr[0]["status"] == "pending"

    # 4. Valid Quick Approve -> 200 OK HTML
    valid_sig = make_quick_sig(admin_token, approval_id, "approved")
    ok_resp = client.get(f"/api/approvals/quick/{approval_id}?decision=approved&sig={valid_sig}")
    assert ok_resp.status_code == 200
    assert "OPERATION APPROVED" in ok_resp.text
    assert "Execution Authorized" in ok_resp.text
    assert task_id in ok_resp.text

    # Task now queued and approval decided
    appr_after = client.get("/api/approvals", headers={"X-Admin-Token": admin_token}).json()
    assert appr_after[0]["status"] == "approved"
    assert appr_after[0]["decided_by"] == "mobile_quick_approval"

    task_after = client.get(f"/api/tasks/{task_id}", headers={"X-Admin-Token": admin_token}).json()
    assert task_after["status"] == "queued"

    # 5. Subsequent click -> 200 OK HTML with "Already Decided"
    repeat_resp = client.get(f"/api/approvals/quick/{approval_id}?decision=approved&sig={valid_sig}")
    assert repeat_resp.status_code == 200
    assert "Request Already Decided" in repeat_resp.text


def test_quick_mobile_approval_deny_lifecycle(tmp_path):
    admin_token = "phase1-test-token"
    app = create_app(admin_token=admin_token, db_path=tmp_path / "control.db")
    client = TestClient(app)

    # Enroll device
    dev_res = client.post(
        "/api/devices/enroll",
        json={"name": "Workstation-Win11", "hostname": "win-box", "os": "Windows 11"},
        headers={"X-Admin-Token": admin_token},
    ).json()
    device_id = dev_res["device_id"]

    # Submit task requiring approval
    task_res = client.post(
        "/api/tasks",
        json={"device_id": device_id, "tool": "delete_workspace_file", "args": {"relative_path": "data.csv"}},
        headers={"X-Admin-Token": admin_token},
    ).json()
    approval_id = task_res["approval_id"]
    task_id = task_res["task_id"]

    # Quick Deny
    deny_sig = make_quick_sig(admin_token, approval_id, "denied")
    deny_resp = client.get(f"/api/approvals/quick/{approval_id}?decision=denied&sig={deny_sig}")
    assert deny_resp.status_code == 200
    assert "OPERATION DENIED" in deny_resp.text
    assert "Execution Blocked" in deny_resp.text

    # Verify task cancelled and approval denied
    task_after = client.get(f"/api/tasks/{task_id}", headers={"X-Admin-Token": admin_token}).json()
    assert task_after["status"] == "cancelled"

    appr_after = client.get("/api/approvals", headers={"X-Admin-Token": admin_token}).json()
    assert appr_after[0]["status"] == "denied"


def test_send_webhook_notification_formatting():
    # Discord formatting
    discord_url = "https://discord.com/api/webhooks/12345/abcdef"
    event = {
        "event": "approval_requested",
        "approval_id": "app-disc",
        "task_id": "tsk-disc",
        "device_id": "dev-01",
        "device_name": "Studio-Desktop",
        "tool": "delete_workspace_file",
        "tier": 4,
        "args": {"path": "test.txt"},
    }

    # Intercept urllib
    captured = []
    class FakeResp:
        status = 204
        def __enter__(self): return self
        def __exit__(self, *a): return False

    def fake_urlopen(req, timeout=10):
        import json
        captured.append(json.loads(req.data.decode("utf-8")))
        return FakeResp()

    import urllib.request
    orig = urllib.request.urlopen
    urllib.request.urlopen = fake_urlopen
    try:
        res = send_webhook_notification(
            discord_url,
            event,
            admin_token="my-token",
            public_base_url="https://jxiptvplayer.app",
        )
        assert res["ok"] is True
        assert len(captured) == 1
        d_payload = captured[-1]
        assert "embeds" in d_payload
        assert len(d_payload["embeds"]) == 1
        assert "Quick Approve (1-Click)" in d_payload["embeds"][0]["fields"][0]["name"]
        assert "https://jxiptvplayer.app/api/approvals/quick/app-disc?decision=approved" in d_payload["embeds"][0]["fields"][0]["value"]
    finally:
        urllib.request.urlopen = orig


def test_click_text_with_mocked_ocr(monkeypatch):
    mock_coord = {
        "found": True,
        "x": 380,
        "y": 220,
        "match": {"text": "Confirm & Submit", "bounds": [300, 200, 460, 240]},
    }
    monkeypatch.setattr(tools, "capture_desktop_screenshot", lambda **kw: {"available": False, "path": ""})
    monkeypatch.setattr(vision, "find_text_coordinates", lambda *a, **kw: mock_coord)

    performed = []
    def fake_perform(action, *, x=None, y=None, **kw):
        performed.append({"action": action, "x": x, "y": y})
        return {"action": action, "status": "ok"}

    monkeypatch.setattr(tools, "perform_approved_ui_action", fake_perform)

    p = Policy(allow_tier3=True, max_tier_unattended=3, desktop_enabled=True)
    res = tools.click_text("Confirm", policy=p)
    assert res["ok"] is True
    assert res["matched_text"] == "Confirm & Submit"
    assert res["x"] == 380
    assert res["y"] == 220
    assert performed[-1]["action"] == "click"
    assert performed[-1]["x"] == 380 and performed[-1]["y"] == 220


def test_click_element_with_som(monkeypatch):
    mock_coord = {
        "found": True,
        "x": 125,
        "y": 20,
        "match": {"text": "[2] Save Button", "bounds": [90, 10, 160, 30]},
    }
    monkeypatch.setattr(tools, "capture_desktop_screenshot", lambda **kw: {"available": False, "path": ""})
    monkeypatch.setattr(vision, "find_text_coordinates", lambda *a, **kw: mock_coord)

    performed = []
    monkeypatch.setattr(tools, "perform_approved_ui_action", lambda action, *, x=None, y=None, **kw: performed.append({"action": action, "x": x, "y": y}))

    p = Policy(allow_tier3=True, max_tier_unattended=3, desktop_enabled=True)
    res = tools.click_element(mark_id="2", button="left", policy=p)
    assert res["ok"] is True
    assert res["x"] == 125
    assert res["y"] == 20
    assert performed[-1]["x"] == 125
