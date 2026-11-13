"""Tests for device-bound MCP routing helpers."""
import json
import urllib.error

import httpx
import pytest

from ai_bridge import device_routing
from ai_bridge.device_routing import BindingError, resolve_binding, run_device_tool


class FakeResp:
    def __init__(self, payload, status=200):
        self._payload = payload
        self.status = status


class _ReqCompat:
    def __init__(self, request: httpx.Request):
        self.full_url = str(request.url)
        self._method = request.method
        self.data = request.content

    def get_method(self):
        return self._method


_ORIG_CLIENT = httpx.Client


def _patch_urlopen(monkeypatch, handler):
    calls = []

    def transport_handler(request: httpx.Request) -> httpx.Response:
        req_compat = _ReqCompat(request)
        calls.append((req_compat.full_url, req_compat.get_method(), req_compat.data))
        try:
            res = handler(req_compat, calls)
            return httpx.Response(status_code=getattr(res, "status", 200), json=res._payload)
        except urllib.error.HTTPError as exc:
            return httpx.Response(status_code=exc.code, json={"error": exc.reason})

    transport = httpx.MockTransport(transport_handler)
    monkeypatch.setattr(httpx, "Client", lambda *a, **kw: _ORIG_CLIENT(transport=transport, **kw))
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
