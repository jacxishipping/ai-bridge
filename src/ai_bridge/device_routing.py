"""Device-bound MCP routing.

When an MCP session is bound to a device (via the OAuth gateway's
device binding or select_device), tool calls for that session are executed as
control-plane tasks on the device instead of running on the droplet.
Unbound sessions keep the previous behavior (droplet-local tools).

Secrets are never logged; tokens travel only in request headers.
"""
from __future__ import annotations

import atexit
import hashlib
import json
import threading
import time
from collections.abc import Callable

import httpx


class BindingError(RuntimeError):
    """The session's device binding could not be resolved (fail closed)."""


# Optional in-process verifier used when MCP + OAuth share one ASGI process
# (e.g. Render). Avoids HTTP self-calls that deadlock a single worker.
_VERIFY_HOOK: Callable[[str], dict] | None = None

_CLIENT_LOCK = threading.Lock()
_HTTP_CLIENT: httpx.Client | None = None
_HTTP_CLIENT_FACTORY: object = None

# Short-lived OAuth verify cache (token hash -> (device_id_or_None, expires_at)).
_VERIFY_CACHE: dict[str, tuple[str | None, float]] = {}
_VERIFY_CACHE_LOCK = threading.Lock()
_VERIFY_CACHE_FACTORY: tuple[object, object] | None = None
_VERIFY_CACHE_TTL_SEC = 15.0
_VERIFY_CACHE_MAX = 256


def set_verify_hook(hook: Callable[[str], dict] | None) -> None:
    global _VERIFY_HOOK
    _VERIFY_HOOK = hook


def get_http_client() -> httpx.Client:
    """Process-wide keep-alive httpx client for MCP → control-plane calls."""
    global _HTTP_CLIENT, _HTTP_CLIENT_FACTORY
    current_factory = httpx.Client
    with _CLIENT_LOCK:
        if _HTTP_CLIENT is None or _HTTP_CLIENT.is_closed or _HTTP_CLIENT_FACTORY is not current_factory:
            old_client = _HTTP_CLIENT
            factory_changed = _HTTP_CLIENT_FACTORY is not None and _HTTP_CLIENT_FACTORY is not current_factory
            if old_client is not None and not old_client.is_closed:
                try:
                    old_client.close()
                except Exception:
                    pass
            _HTTP_CLIENT = current_factory(
                timeout=httpx.Timeout(30.0, connect=10.0),
                limits=httpx.Limits(max_connections=32, max_keepalive_connections=16, keepalive_expiry=30.0),
                follow_redirects=True,
            )
            _HTTP_CLIENT_FACTORY = current_factory
            if factory_changed:
                clear_verify_cache()
        return _HTTP_CLIENT


def close_http_client() -> None:
    global _HTTP_CLIENT, _HTTP_CLIENT_FACTORY
    with _CLIENT_LOCK:
        if _HTTP_CLIENT is not None and not _HTTP_CLIENT.is_closed:
            _HTTP_CLIENT.close()
        _HTTP_CLIENT = None
        _HTTP_CLIENT_FACTORY = None


atexit.register(close_http_client)


def clear_verify_cache() -> None:
    with _VERIFY_CACHE_LOCK:
        _VERIFY_CACHE.clear()


def _token_cache_key(bearer_token: str) -> str:
    return hashlib.sha256(bearer_token.encode("utf-8")).hexdigest()


def resolve_binding(verify_url: str, bearer_token: str, timeout: int = 10) -> str | None:
    """Return the device_id bound to a bearer token, or None if unbound.
    Raises BindingError when the binding cannot be resolved: callers
    must fail closed rather than silently run droplet tools for a
    session that was meant to be device-scoped."""
    global _VERIFY_CACHE_FACTORY
    if _VERIFY_HOOK is not None and (
        not verify_url or verify_url.startswith("inprocess:") or verify_url == "inprocess"
    ):
        try:
            data = _VERIFY_HOOK(bearer_token)
        except BindingError:
            raise
        except Exception as exc:  # noqa: BLE001
            raise BindingError(f"gateway verify failed: {exc}") from exc
        if not isinstance(data, dict) or not data.get("ok"):
            raise BindingError("gateway verify rejected the token")
        return data.get("device_id") or None

    cache_key = _token_cache_key(bearer_token)
    now = time.time()
    current_pair = (httpx.Client, get_http_client)
    with _VERIFY_CACHE_LOCK:
        if _VERIFY_CACHE_FACTORY is not None and _VERIFY_CACHE_FACTORY != current_pair:
            _VERIFY_CACHE.clear()
        _VERIFY_CACHE_FACTORY = current_pair
        cached = _VERIFY_CACHE.get(cache_key)
        if cached is not None and cached[1] > now:
            return cached[0]

    try:
        client = get_http_client()
        resp = client.get(
            verify_url,
            headers={"Authorization": f"Bearer {bearer_token}"},
            timeout=timeout,
        )
        resp.raise_for_status()
        data = resp.json()
    except httpx.HTTPStatusError as exc:
        raise BindingError(f"gateway verify returned HTTP {exc.response.status_code}")
    except Exception as exc:  # noqa: BLE001 - surfaced as a binding failure
        raise BindingError(f"gateway verify failed: {exc}")
    if not data.get("ok"):
        raise BindingError("gateway verify rejected the token")
    device_id = data.get("device_id") or None
    with _VERIFY_CACHE_LOCK:
        if len(_VERIFY_CACHE) >= _VERIFY_CACHE_MAX:
            # Drop expired / oldest-ish entries cheaply.
            expired = [k for k, (_d, exp) in _VERIFY_CACHE.items() if exp <= now]
            for k in expired[:64] or list(_VERIFY_CACHE.keys())[:32]:
                _VERIFY_CACHE.pop(k, None)
        _VERIFY_CACHE[cache_key] = (device_id, now + _VERIFY_CACHE_TTL_SEC)
    return device_id


def _api(method: str, url: str, admin_token: str, payload: dict | None = None, timeout: int = 20) -> dict | list:
    try:
        client = get_http_client()
        resp = client.request(
            method,
            url,
            json=payload,
            headers={"X-Admin-Token": admin_token, "Content-Type": "application/json"},
            timeout=timeout,
        )
        resp.raise_for_status()
        return resp.json()
    except httpx.HTTPStatusError as exc:
        raise RuntimeError(f"control plane returned HTTP {exc.response.status_code} for {method} {url}")


def _parse_result(text: str):
    try:
        return json.loads(text)
    except Exception:
        return text


def run_device_tool(
    control_url: str,
    admin_token: str,
    device_id: str,
    tool: str,
    args: dict,
    wait_seconds: int = 100,
    *,
    should_abort: Callable[[], bool] | None = None,
) -> dict:
    """Submit a tool task to a device and wait for its result.

    Tier-3 tools (e.g. install_package) come back as needs_approval:
    the caller must approve them in the dashboard, then re-check with
    get_device_task. Long tasks that outlast wait_seconds come back as
    running with the task_id for a later check.

    Relies on control-plane ``?wait=`` long-poll; does not add extra sleeps
    between polls. Optional ``should_abort`` cancels the device task when true.
    """
    base = control_url.rstrip("/")
    t0 = time.time()
    task = _api(
        "POST",
        f"{base}/api/tasks",
        admin_token,
        {"device_id": device_id, "tool": tool, "args": args or {}},
    )
    queue_ms = int((time.time() - t0) * 1000)
    task_id = task.get("task_id") if isinstance(task, dict) else None
    if isinstance(task, dict) and task.get("status") == "needs_approval":
        return {
            "status": "needs_approval",
            "task_id": task_id,
            "approval_id": task.get("approval_id"),
            "queue_ms": queue_ms,
            "note": "This operation needs approval in the dashboard (Approvals tab). "
            "Approve it, then check the result with get_task_result.",
        }
    if not task_id:
        return {
            "status": "failed",
            "queue_ms": queue_ms,
            "note": f"could not submit task to device: {task}",
        }
    deadline = time.time() + wait_seconds
    exec_t0 = time.time()
    while time.time() < deadline:
        if should_abort is not None:
            try:
                if should_abort():
                    cancel_device_task(control_url, admin_token, task_id)
                    return {
                        "status": "cancelled",
                        "task_id": task_id,
                        "queue_ms": queue_ms,
                        "exec_ms": int((time.time() - exec_t0) * 1000),
                        "note": "Aborted by MCP client.",
                    }
            except Exception:
                pass
        rem = max(0.0, deadline - time.time())
        wait = int(min(10, max(1, rem)))
        cur = get_device_task(control_url, admin_token, task_id, wait=wait)
        st = cur.get("status")
        if st in {"completed", "failed", "cancelled"}:
            return {
                "status": st,
                "task_id": task_id,
                "result": _parse_result(cur.get("result") or ""),
                "queue_ms": queue_ms,
                "exec_ms": int((time.time() - exec_t0) * 1000),
            }
        # Long-poll already blocked; loop immediately for remaining time.
    return {
        "status": "running",
        "task_id": task_id,
        "queue_ms": queue_ms,
        "exec_ms": int((time.time() - exec_t0) * 1000),
        "note": "Still running on the device; check the result with get_task_result.",
    }


def get_device_task(control_url: str, admin_token: str, task_id: str, wait: int = 0) -> dict:
    url = f"{control_url.rstrip('/')}/api/tasks/{task_id}"
    if wait > 0:
        url += f"?wait={wait}"
    res = _api("GET", url, admin_token, timeout=max(15, wait + 5))
    return res if isinstance(res, dict) else {}


def cancel_device_task(control_url: str, admin_token: str, task_id: str) -> dict:
    res = _api("POST", f"{control_url.rstrip('/')}/api/tasks/{task_id}/cancel", admin_token)
    return res if isinstance(res, dict) else {}


def list_all_devices(control_url: str, admin_token: str) -> list[dict]:
    devices = _api("GET", f"{control_url.rstrip('/')}/api/devices", admin_token)
    if isinstance(devices, list):
        return [d for d in devices if isinstance(d, dict) and not d.get("revoked")]
    return []


def get_device(control_url: str, admin_token: str, device_id: str) -> dict | None:
    devices = list_all_devices(control_url, admin_token)
    for d in devices:
        if d.get("id") == device_id:
            return d
    return None
