import json
import os
import platform
import time
import pytest
from fastapi.testclient import TestClient

from ai_bridge import tools
from ai_bridge.control.app import create_app
from ai_bridge.policy import Policy


def test_capture_desktop_frame_primitives(monkeypatch):
    try:
        import PIL
        has_pil = True
    except ImportError:
        has_pil = False

    if not has_pil or (platform.system() != "Windows" and "DISPLAY" not in os.environ):
        monkeypatch.setattr(tools, "capture_desktop_frame", lambda **kw: {
            "available": True,
            "width": 400,
            "height": 300,
            "orig_width": 800,
            "orig_height": 600,
            "scale": 0.5,
            "mime_type": "image/jpeg",
            "base64_data": "dGVzdA==",
            "timestamp": time.time(),
        })

    p = Policy(allow_tier3=True, desktop_enabled=True)
    frame = tools.capture_desktop_frame(scale=0.5, quality=60, approval_granted=True, policy=p)
    assert frame["available"] is True
    assert frame["width"] > 0
    assert frame["height"] > 0
    assert frame["orig_width"] >= frame["width"]
    assert frame["mime_type"] == "image/jpeg"
    assert frame["scale"] == 0.5
    assert len(frame["base64_data"]) > 0


def test_desktop_streaming_endpoint(tmp_path, monkeypatch):
    try:
        import PIL
        has_pil = True
    except ImportError:
        has_pil = False

    if not has_pil or (platform.system() != "Windows" and "DISPLAY" not in os.environ):
        monkeypatch.setattr(tools, "capture_desktop_frame", lambda **kw: {
            "available": True,
            "width": 400,
            "height": 300,
            "orig_width": 800,
            "orig_height": 600,
            "scale": 0.5,
            "mime_type": "image/jpeg",
            "base64_data": "dGVzdA==",
            "timestamp": time.time(),
        })

    admin_token = "adm-tok-p4"
    app = create_app(admin_token=admin_token, db_path=tmp_path / "control.db")
    client = TestClient(app)

    # Fetch local desktop frame
    res = client.get("/api/devices/local/desktop/frame?scale=0.5&quality=50", headers={"X-Admin-Token": admin_token})
    assert res.status_code == 200
    frame_data = res.json()
    assert frame_data["available"] is True
    assert "base64_data" in frame_data
    assert frame_data["width"] > 0


def test_dual_control_desktop_input_normalized(tmp_path, monkeypatch):
    admin_token = "adm-tok-p4"
    app = create_app(admin_token=admin_token, db_path=tmp_path / "control.db")
    client = TestClient(app)

    captured_inputs = []

    def fake_mouse_click(x, y, button="left", clicks=1, **kw):
        captured_inputs.append({"tool": "mouse_click", "x": x, "y": y, "button": button, "clicks": clicks})
        return {"action": "click", "x": x, "y": y}

    def fake_press_hotkey(combo, **kw):
        captured_inputs.append({"tool": "press_hotkey", "combo": combo})
        return {"action": "hotkey", "combo": combo}

    def fake_keyboard_type(text, **kw):
        captured_inputs.append({"tool": "keyboard_type", "text": text})
        return {"action": "type", "length": len(text)}

    monkeypatch.setattr(tools, "mouse_click", fake_mouse_click)
    monkeypatch.setattr(tools, "press_hotkey", fake_press_hotkey)
    monkeypatch.setattr(tools, "perform_approved_ui_action", lambda act, **kw: {"action": act, **kw})

    # 1. Click with normalized coordinates (0.5, 0.25 on 1920x1080 -> 960, 270)
    input_payload = {
        "action": "click",
        "x": 0.5,
        "y": 0.25,
        "normalized": True,
        "screen_width": 1920,
        "screen_height": 1080,
    }
    click_res = client.post("/api/devices/local/desktop/input", json=input_payload, headers={"X-Admin-Token": admin_token})
    assert click_res.status_code == 200
    assert click_res.json()["ok"] is True
    assert click_res.json()["x"] == 960
    assert click_res.json()["y"] == 270
    assert len(captured_inputs) == 1
    assert captured_inputs[0]["x"] == 960
    assert captured_inputs[0]["y"] == 270

    # 2. Hotkey shortcut
    hk_payload = {"action": "hotkey", "key": "win+r"}
    hk_res = client.post("/api/devices/local/desktop/input", json=hk_payload, headers={"X-Admin-Token": admin_token})
    assert hk_res.status_code == 200
    assert hk_res.json()["ok"] is True
    assert captured_inputs[-1]["tool"] == "press_hotkey"
    assert captured_inputs[-1]["combo"] == "win+r"


def test_fleet_version_endpoint(tmp_path):
    admin_token = "adm-tok-p4"
    app = create_app(admin_token=admin_token, db_path=tmp_path / "control.db")
    client = TestClient(app)

    v_res = client.get("/api/fleet/version", headers={"X-Admin-Token": admin_token})
    assert v_res.status_code == 200
    v_data = v_res.json()
    assert v_data["control_plane_version"] == "1.30.0"
    assert "git_commit" in v_data
    assert "git_branch" in v_data


def test_fleet_update_endpoints(tmp_path, monkeypatch):
    admin_token = "adm-tok-p4"
    app = create_app(admin_token=admin_token, db_path=tmp_path / "control.db")
    client = TestClient(app)

    # Enroll a device
    dev = client.post("/api/devices/enroll", json={"name": "test-node", "os": "Linux Ubuntu"}, headers={"X-Admin-Token": admin_token}).json()
    dev_id = dev["device_id"]

    # Mock tools.update_fleet_agent
    monkeypatch.setattr(tools, "update_fleet_agent", lambda **kw: {"ok": True, "returncode": 0, "stdout": "abc1234"})

    # Update remote device (queues task)
    u_res = client.post(f"/api/devices/{dev_id}/update", headers={"X-Admin-Token": admin_token})
    assert u_res.status_code == 200
    assert u_res.json()["status"] == "queued"
    assert "task_id" in u_res.json()

    # Update local control plane
    loc_res = client.post("/api/devices/local/update", headers={"X-Admin-Token": admin_token})
    assert loc_res.status_code == 200
    assert loc_res.json()["status"] == "updated"

    # Broadcast update across fleet
    b_res = client.post("/api/fleet/update", headers={"X-Admin-Token": admin_token})
    assert b_res.status_code == 200
    assert b_res.json()["device_count"] == 1
    assert "batch_id" in b_res.json()



def test_webrtc_session_endpoints(tmp_path):
    admin_token = "adm-tok-p4"
    app = create_app(admin_token=admin_token, db_path=tmp_path / "control.db")
    client = TestClient(app)

    # Enroll a device
    dev = client.post("/api/devices/enroll", json={"name": "stream-node", "os": "Windows"}, headers={"X-Admin-Token": admin_token}).json()
    dev_id = dev["device_id"]
    dev_token = dev["device_token"]

    # 1. Create WebRTC session for enrolled device
    create_res = client.post(
        f"/api/devices/{dev_id}/desktop/webrtc/session",
        json={"scale": 0.5, "fps": 15},
        headers={"X-Admin-Token": admin_token},
    )
    assert create_res.status_code == 200, f"Error: {create_res.text}"
    data = create_res.json()
    assert "session_id" in data
    sess_id = data["session_id"]
    assert data["status"] == "waiting"

    # Verify task was queued for the agent
    task_res = client.get("/api/agent/tasks/next", headers={"X-Device-Token": dev_token})
    assert task_res.status_code == 200
    task_data = task_res.json()
    assert task_data["task"]["tool"] == "start_webrtc_stream"
    assert json.loads(task_data["task"]["args_json"])["session_id"] == sess_id

    # 2. Agent fetches session
    agent_sess = client.get(f"/api/agent/webrtc/{sess_id}", headers={"X-Device-Token": dev_token})
    assert agent_sess.status_code == 200
    assert agent_sess.json()["id"] == sess_id

    # 3. Agent posts offer
    offer_res = client.post(
        f"/api/agent/webrtc/{sess_id}/offer",
        json={"sdp": "v=0\r\no=...", "type": "offer"},
        headers={"X-Device-Token": dev_token},
    )
    assert offer_res.status_code == 200

    # 4. Viewer reads session and checks offer
    viewer_sess = client.get(f"/api/devices/{dev_id}/desktop/webrtc/{sess_id}", headers={"X-Admin-Token": admin_token})
    assert viewer_sess.status_code == 200
    assert viewer_sess.json()["status"] == "offered"
    assert viewer_sess.json()["offer"]["type"] == "offer"

    # 5. Viewer posts answer
    ans_res = client.post(
        f"/api/devices/{dev_id}/desktop/webrtc/{sess_id}/answer",
        json={"sdp": "v=0\r\n...", "type": "answer"},
        headers={"X-Admin-Token": admin_token},
    )
    assert ans_res.status_code == 200

    # 6. End session
    del_res = client.delete(f"/api/devices/{dev_id}/desktop/webrtc/{sess_id}", headers={"X-Admin-Token": admin_token})
    assert del_res.status_code == 200
    assert del_res.json()["status"] == "ended"
