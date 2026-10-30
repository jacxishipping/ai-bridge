"""Unit tests for Advanced Features: Multi-Monitor DXGI, WebRTC DataChannel, Terminal Streaming, and Standalone EXE Builder."""
import json
import time
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from ai_bridge.control.app import create_app
from ai_bridge.screen_capture import capture_desktop, get_monitors
from ai_bridge.terminal_manager import (
    close_terminal_session,
    create_terminal_session,
    get_terminal_session,
    list_terminal_sessions,
)
from ai_bridge.webrtc_stream import AgentStreamer


# --- Test 1: Screen Capture & Multi-Monitor ---

def test_screen_capture_get_monitors():
    mons = get_monitors()
    assert isinstance(mons, list)
    assert len(mons) >= 1
    m0 = mons[0]
    assert "index" in m0
    assert "width" in m0
    assert "height" in m0
    assert m0["width"] > 0
    assert m0["height"] > 0


def test_screen_capture_desktop_dimensions():
    img = capture_desktop(scale=0.5)
    assert img is not None
    # Codec requirement: dimensions must be even
    assert img.width % 2 == 0
    assert img.height % 2 == 0
    assert img.mode == "RGB"


# --- Test 2: WebRTC DataChannel Input Injection ---

def test_webrtc_datachannel_input_handling(monkeypatch):
    executed_actions = []

    def mock_perform(action, **kwargs):
        executed_actions.append((action, kwargs))
        return {"action": action, "status": "executed"}

    monkeypatch.setattr("ai_bridge.tools.perform_approved_ui_action", mock_perform)

    streamer = AgentStreamer("test_sess", MagicMock(), scale=0.75, fps=10)

    # 2a. Click with normalized coordinates
    streamer._handle_input_payload(json.dumps({
        "action": "click",
        "x": 0.5,
        "y": 0.5,
        "screen_width": 1920,
        "screen_height": 1080,
    }))
    assert len(executed_actions) == 1
    assert executed_actions[0][0] == "click"
    assert executed_actions[0][1]["x"] == 960
    assert executed_actions[0][1]["y"] == 540

    # 2b. Mouse Move
    streamer._handle_input_payload(json.dumps({
        "action": "move_mouse",
        "x": 0.1,
        "y": 0.2,
        "screen_width": 1000,
        "screen_height": 1000,
    }))
    assert len(executed_actions) == 2
    assert executed_actions[1][0] == "move_mouse"
    assert executed_actions[1][1]["x"] == 100
    assert executed_actions[1][1]["y"] == 200

    # 2c. Type Text & Key Press
    streamer._handle_input_payload(json.dumps({"action": "type_text", "text": "hello"}))
    streamer._handle_input_payload(json.dumps({"action": "press_key", "key": "Enter"}))
    assert len(executed_actions) == 4
    assert executed_actions[2][0] == "type_text"
    assert executed_actions[2][1]["text"] == "hello"
    assert executed_actions[3][0] == "press_key"
    assert executed_actions[3][1]["key"] == "Enter"


# --- Test 3: Interactive Live Terminal ---

def test_terminal_session_lifecycle():
    sess = create_terminal_session(device_id="test_dev", cols=80, rows=24)
    assert sess.session_id is not None
    assert sess.is_alive is True

    # Test write
    sess.write("echo TEST_OUTPUT\r\n")
    time.sleep(0.3)

    # Test retrieval
    found = get_terminal_session(sess.session_id)
    assert found is not None
    assert found.session_id == sess.session_id

    # Test listing
    listed = list_terminal_sessions("test_dev")
    assert any(s["session_id"] == sess.session_id for s in listed)

    # Test close
    ok = close_terminal_session(sess.session_id)
    assert ok is True
    assert get_terminal_session(sess.session_id) is None


# --- Test 4: Control Plane Terminal & Monitor Endpoints ---

@pytest.fixture
def fresh_client(tmp_path):
    app = create_app(db_path=tmp_path / "test.db", admin_token="admin-secret-token")
    return TestClient(app)


def test_control_plane_monitors_endpoint(fresh_client):
    headers = {"X-Admin-Token": "admin-secret-token"}
    resp = fresh_client.get("/api/devices/local/desktop/monitors", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "monitors" in data
    assert len(data["monitors"]) >= 1


def test_control_plane_terminal_api(fresh_client):
    headers = {"X-Admin-Token": "admin-secret-token"}

    # Create session
    resp = fresh_client.post("/api/devices/local/terminal/sessions", json={"cols": 100, "rows": 30}, headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "session_id" in data
    sid = data["session_id"]

    # List sessions
    l_resp = fresh_client.get("/api/devices/local/terminal/sessions", headers=headers)
    assert l_resp.status_code == 200
    assert any(s["session_id"] == sid for s in l_resp.json()["sessions"])

    # Write input
    i_resp = fresh_client.post(f"/api/devices/local/terminal/{sid}/input", json={"input": "echo 1\r\n"}, headers=headers)
    assert i_resp.status_code == 200

    # Resize
    r_resp = fresh_client.post(f"/api/devices/local/terminal/{sid}/resize", json={"cols": 120, "rows": 40}, headers=headers)
    assert r_resp.status_code == 200

    # Close session
    c_resp = fresh_client.delete(f"/api/devices/local/terminal/{sid}", headers=headers)
    assert c_resp.status_code == 200
    assert c_resp.json()["ok"] is True
