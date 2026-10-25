"""Tests for device-bound MCP routing helpers (stdlib-only module)."""
import json
import urllib.error

import pytest

from ai_bridge import device_routing
from ai_bridge.device_routing import BindingError, resolve_binding, run_device_tool


class FakeResp:
    def __init__(self, payload, status=200):
        self._payload = payload
        self.status = status

    def read(self):
        return json.dumps(self._payload).encode()

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


def _patch_urlopen(monkeypatch, handler):
    calls = []

    def fake_urlopen(req, timeout=None):
        calls.append((req.full_url, req.get_method(), req.data))
        return handler(req, calls)

    monkeypatch.setattr(urllib.request, "urlopen", fake_urlopen)
    return calls


def test_resolve_binding_device_and_unbound(monkeypatch):
    _patch_urlopen(monkeypatch, lambda req, c: FakeResp({"ok": True, "device_id": "dev-1"}))
    assert resolve_binding("http://x/internal/verify", "tok") == "dev-1"
    _patch_urlopen(monkeypatch, lambda req, c: FakeResp({"ok": True, "device_id": None}))
    assert resolve_binding("http://x/internal/verify", "tok") is None


def test_resolve_binding_rejects(monkeypatch):
    _patch_urlopen(monkeypatch, lambda req, c: FakeResp({"ok": False}))
    with pytest.raises(BindingError):
        resolve_binding("http://x/internal/verify", "tok")

    def http_error(req, c):
        raise urllib.error.HTTPError(req.full_url, 401, "unauthorized", {}, None)

    _patch_urlopen(monkeypatch, http_error)
    with pytest.raises(BindingError):
        resolve_binding("http://x/internal/verify", "tok")


def test_run_device_tool_needs_approval(monkeypatch):
    calls = _patch_urlopen(
        monkeypatch,
        lambda req, c: FakeResp({"task_id": "t1", "status": "needs_approval", "approval_id": "a1"}),
    )
    out = run_device_tool("http://ctl", "adm", "dev-1", "install_package", {"package_id": "A.B"})
    assert out["status"] == "needs_approval" and out["task_id"] == "t1"
    assert len(calls) == 1  # no polling for approval-gated tasks


def test_run_device_tool_completed_and_failed(monkeypatch):
    def handler(req, c):
        if req.get_method() == "POST":
            return FakeResp({"task_id": "t2", "status": "queued"})
        return FakeResp({"id": "t2", "status": "completed", "result": '{"installed": "A.B"}'})

    _patch_urlopen(monkeypatch, handler)
    out = run_device_tool("http://ctl", "adm", "dev-1", "install_package", {"package_id": "A.B"})
    assert out["status"] == "completed" and out["result"] == {"installed": "A.B"}

    def handler_fail(req, c):
        if req.get_method() == "POST":
            return FakeResp({"task_id": "t3", "status": "queued"})
        return FakeResp({"id": "t3", "status": "failed", "result": "denied: nope"})

    _patch_urlopen(monkeypatch, handler_fail)
    out = run_device_tool("http://ctl", "adm", "dev-1", "install_package", {"package_id": "A.B"})
    assert out["status"] == "failed" and out["result"] == "denied: nope"


def test_run_device_tool_timeout_returns_running(monkeypatch):
    def handler(req, c):
        if req.get_method() == "POST":
            return FakeResp({"task_id": "t4", "status": "queued"})
        return FakeResp({"id": "t4", "status": "queued"})

    _patch_urlopen(monkeypatch, handler)
    out = run_device_tool("http://ctl", "adm", "dev-1", "get_system_info", {}, wait_seconds=0)
    assert out["status"] == "running" and out["task_id"] == "t4"


def test_get_device_filters_list(monkeypatch):
    _patch_urlopen(
        monkeypatch,
        lambda req, c: FakeResp([{"id": "d1", "name": "one"}, {"id": "d2", "name": "two"}]),
    )
    assert device_routing.get_device("http://ctl", "adm", "d2")["name"] == "two"
    assert device_routing.get_device("http://ctl", "adm", "d9") is None
