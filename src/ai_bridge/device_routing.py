"""Device-bound MCP routing.

When an MCP session is bound to a device (via the OAuth gateway's
device binding), tool calls for that session are executed as
control-plane tasks on the device instead of running on the droplet.
Unbound sessions keep the previous behavior (droplet-local tools).

Stdlib only (urllib), so this module is testable without the MCP SDK.
Secrets are never logged; tokens travel only in request headers.
"""
from __future__ import annotations

import json
import time
import urllib.error
import urllib.request


class BindingError(RuntimeError):
    """The session's device binding could not be resolved (fail closed)."""


def resolve_binding(verify_url: str, bearer_token: str, timeout: int = 10) -> str | None:
    """Return the device_id bound to a bearer token, or None if unbound.
    Raises BindingError when the binding cannot be resolved: callers
    must fail closed rather than silently run droplet tools for a
    session that was meant to be device-scoped."""
    req = urllib.request.Request(
        verify_url, headers={"Authorization": f"Bearer {bearer_token}"}
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            data = json.loads(resp.read() or b"{}")
    except urllib.error.HTTPError as exc:
        raise BindingError(f"gateway verify returned HTTP {exc.code}")
    except Exception as exc:  # noqa: BLE001 - surfaced as a binding failure
        raise BindingError(f"gateway verify failed: {exc}")
    if not data.get("ok"):
        raise BindingError("gateway verify rejected the token")
    return data.get("device_id") or None


def _api(method: str, url: str, admin_token: str, payload: dict | None = None) -> dict:
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(
        url, data=data, method=method,
        headers={"X-Admin-Token": admin_token, "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return json.loads(resp.read() or b"{}")
    except urllib.error.HTTPError as exc:
        raise RuntimeError(f"control plane returned HTTP {exc.code} for {method} {url}")


def _parse_result(text: str):
    try:
        return json.loads(text)
    except Exception:
        return text


def run_device_tool(control_url: str, admin_token: str, device_id: str,
                    tool: str, args: dict, wait_seconds: int = 100) -> dict:
    """Submit a tool task to a device and wait for its result.

    Tier-3 tools (e.g. install_package) come back as needs_approval:
    the caller must approve them in the dashboard, then re-check with
    get_device_task. Long tasks that outlast wait_seconds come back as
    running with the task_id for a later check."""
    base = control_url.rstrip("/")
    task = _api("POST", f"{base}/api/tasks", admin_token,
                {"device_id": device_id, "tool": tool, "args": args or {}})
    task_id = task.get("task_id")
    if task.get("status") == "needs_approval":
        return {"status": "needs_approval", "task_id": task_id,
                "note": "This operation needs approval in the dashboard (Approvals tab). "
                        "Approve it, then check the result with get_task_result."}
    if not task_id:
        return {"status": "failed", "note": f"could not submit task to device: {task}"}
    deadline = time.time() + wait_seconds
    while time.time() < deadline:
        cur = get_device_task(control_url, admin_token, task_id)
        st = cur.get("status")
        if st in {"completed", "failed", "cancelled"}:
            return {"status": st, "task_id": task_id, "result": _parse_result(cur.get("result") or "")}
        time.sleep(2)
    return {"status": "running", "task_id": task_id,
            "note": "Still running on the device; check the result with get_task_result."}


def get_device_task(control_url: str, admin_token: str, task_id: str) -> dict:
    return _api("GET", f"{control_url.rstrip('/')}/api/tasks/{task_id}", admin_token)


def cancel_device_task(control_url: str, admin_token: str, task_id: str) -> dict:
    return _api("POST", f"{control_url.rstrip('/')}/api/tasks/{task_id}/cancel", admin_token)


def get_device(control_url: str, admin_token: str, device_id: str) -> dict | None:
    devices = _api("GET", f"{control_url.rstrip('/')}/api/devices", admin_token)
    if isinstance(devices, list):
        for d in devices:
            if d.get("id") == device_id:
                return d
    return None
