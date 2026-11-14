"""ACI slices 1–4: WASAPI audio, UIA grounding, multi-monitor capture, workflow verify."""
from __future__ import annotations

from unittest.mock import MagicMock

import pytest

from ai_bridge import desktop_audio, screen_capture, tools, webrtc_stream
from ai_bridge.control import desktop_capabilities
from ai_bridge.policy import Policy


def test_wasapi_probe_without_soundcard(monkeypatch):
    desktop_audio.reset_probe_cache()
    import builtins

    real_import = builtins.__import__

    def _block_soundcard(name, *args, **kwargs):
        if name == "soundcard" or (isinstance(name, str) and name.startswith("soundcard.")):
            raise ImportError("blocked")
        return real_import(name, *args, **kwargs)

    monkeypatch.setattr(builtins, "__import__", _block_soundcard)
    monkeypatch.setattr(desktop_audio.platform if hasattr(desktop_audio, "platform") else __import__("platform"), "system", lambda: "Windows")
    # Force Windows path inside probe
    import platform as platform_mod

    monkeypatch.setattr(platform_mod, "system", lambda: "Windows")
    desktop_audio.reset_probe_cache()
    info = desktop_audio.probe_wasapi_loopback()
    assert info["available"] is False
    assert "soundcard" in str(info.get("reason", ""))


def test_desktop_audio_capture_implemented_follows_probe(monkeypatch):
    monkeypatch.setattr(desktop_audio, "wasapi_capture_available", lambda: True)
    assert webrtc_stream.desktop_audio_capture_implemented() is True
    monkeypatch.setattr(desktop_audio, "wasapi_capture_available", lambda: False)
    assert webrtc_stream.desktop_audio_capture_implemented() is False


def test_capability_matrix_audio_reflects_probe(monkeypatch):
    monkeypatch.setattr(webrtc_stream, "desktop_audio_opt_in", lambda: True)
    monkeypatch.setattr(webrtc_stream, "desktop_audio_capture_implemented", lambda: True)
    monkeypatch.setattr(
        desktop_audio,
        "probe_wasapi_loopback",
        lambda: {"available": True, "backend": "soundcard_wasapi_loopback", "reason": "ok"},
    )
    monkeypatch.setattr(tools, "get_desktop_status", lambda: {"available": True})
    matrix = desktop_capabilities.build_capability_matrix(include_host=True)
    assert matrix["desktop_audio"]["capture_implemented"] is True
    assert matrix["desktop_audio"]["opt_in"] is True
    assert "wasapi_live_desktop_audio_capture" not in matrix["residual_gaps"]


def test_uia_collector_missing_comtypes(monkeypatch):
    monkeypatch.setattr("sys.platform", "win32")
    import builtins

    real_import = builtins.__import__

    def _block_comtypes(name, *args, **kwargs):
        if name == "comtypes" or (isinstance(name, str) and name.startswith("comtypes.")):
            raise ImportError("blocked")
        return real_import(name, *args, **kwargs)

    monkeypatch.setattr(builtins, "__import__", _block_comtypes)
    els, status = tools._collect_uia_elements(mons=[], max_elements=10, monitor_index=None)
    assert els == []
    assert status == "comtypes_missing"


def test_desktop_get_ui_elements_prefers_uia(monkeypatch):
    monkeypatch.setattr("sys.platform", "win32")
    monkeypatch.setattr(
        screen_capture,
        "get_monitors",
        lambda: [{"index": 0, "left": 0, "top": 0, "right": 1000, "bottom": 800, "width": 1000, "height": 800}],
    )
    monkeypatch.setattr(
        screen_capture,
        "get_virtual_desktop_bounds",
        lambda mons: {"left": 0, "top": 0, "width": 1000, "height": 800},
    )
    fake_uia = [
        {
            "id": 1,
            "label": "OK",
            "type": "button",
            "source": "uia",
            "confidence": 0.9,
            "monitor_index": 0,
            "center_x": 0.5,
            "center_y": 0.5,
            "bounds": [10, 10, 40, 20],
            "norm_x": 0.01,
            "norm_y": 0.01,
            "norm_width": 0.04,
            "norm_height": 0.025,
            "hwnd": 0,
        }
    ]
    monkeypatch.setattr(tools, "_collect_uia_elements", lambda **kw: (list(fake_uia), "uia_ok"))

    # Make EnumWindows path fail closed without crashing.
    import ctypes

    class Boom:
        def __getattr__(self, name):
            raise RuntimeError("no win32 enum in unit test")

    monkeypatch.setattr(ctypes, "windll", Boom(), raising=False)

    res = tools.desktop_get_ui_elements(
        include_controls=True,
        max_elements=5,
        policy=Policy(desktop_enabled=True, allow_tier3=True),
    )
    assert res["ok"] is True
    assert res["grounding_source"] == "uia"
    assert res["elements"][0]["label"] == "OK"
    assert res["elements"][0]["confidence"] == 0.9


def test_capture_desktop_bettercam_uses_monitor_index(monkeypatch):
    created: list[int] = []

    class FakeCam:
        def grab(self):
            return object()

    class FakeBettercam:
        @staticmethod
        def create(output_idx=0):
            created.append(int(output_idx))
            return FakeCam()

    class FakeImg:
        def __init__(self, w=30, h=20):
            self.width = w
            self.height = h
            self.mode = "RGB"

        def resize(self, size, _resample=None):
            return FakeImg(size[0], size[1])

        def convert(self, mode):
            self.mode = mode
            return self

    monkeypatch.setattr(screen_capture, "_DXGI_CAMERAS", {})
    monkeypatch.setattr(screen_capture, "_DXGI_FAILED_INDEXES", set())
    monkeypatch.setattr(screen_capture, "_capture_native_cpp", lambda monitor_index=0: None)
    monkeypatch.setattr(screen_capture.platform, "system", lambda: "Windows")
    monkeypatch.setitem(__import__("sys").modules, "bettercam", FakeBettercam)
    monkeypatch.setattr(screen_capture.Image, "fromarray", staticmethod(lambda frame, mode="RGB": FakeImg()))
    monkeypatch.setattr(
        screen_capture,
        "get_monitors",
        lambda: [
            {"index": 0, "left": 0, "top": 0, "right": 100, "bottom": 80, "width": 100, "height": 80},
            {"index": 1, "left": 100, "top": 0, "right": 200, "bottom": 80, "width": 100, "height": 80},
        ],
    )

    img = screen_capture.capture_desktop(monitor_index=1, scale=1.0)
    assert created == [1]
    assert img.width >= 30
    assert screen_capture._LAST_CAPTURE_METRICS.get("monitor_index") == 1
    assert screen_capture._LAST_CAPTURE_METRICS.get("backend") == "dxgi_bettercam"


def test_workflow_verify_prefers_desktop_verify_action():
    from pathlib import Path

    src = Path(__file__).resolve().parents[2] / "src" / "ai_bridge" / "control" / "app.py"
    text = src.read_text(encoding="utf-8")
    assert 'v_mode in {"wait", "poll", "wait_for_text"}' in text
    assert '"desktop_verify_action"' in text
    assert "Step verification failed via desktop_verify_action" in text
