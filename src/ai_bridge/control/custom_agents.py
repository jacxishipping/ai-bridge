"""Persistent custom AI agents with a 24/7 runner.

Each agent binds a natural-language objective to an already-configured AI
provider (or a custom OpenAI-compatible endpoint) and a set of enrolled
devices. The runner executes every enabled agent on its own interval for as
long as the control-plane process is alive, recording each run and its
tool actions in the main audit log alongside the per-agent run history.
"""
from __future__ import annotations

import json
import os
import threading
import time
import urllib.error
import urllib.request
import uuid
from typing import Any, Callable

from fastapi import Header, HTTPException
from pydantic import BaseModel, Field

from .ai_api import (
    ANTHROPIC_VERSION,
    _drop_images,
    _extract_image,
    _has_image_parts,
    _image_user_message,
    _post_anthropic,
    _strip_image_fields,
    build_tool_specs,
)

PROVIDERS = ("openai", "anthropic", "gemini", "groq", "deepseek", "ollama", "custom")
DEFAULT_INTERVAL_S = 300
MIN_INTERVAL_S = 30
MAX_INTERVAL_S = 86400
RUNNER_TICK_S = 5.0
MAX_CONCURRENT_RUNS = 2
MAX_STEPS = 8
MAX_CONSECUTIVE_FAILURES = 5
RETRY_DELAY_S = 2.0
DEVICE_ONLINE_WINDOW_S = 120.0

ToolExecutor = Callable[[str, dict[str, Any], str | None, str, str], dict[str, Any]]


def _now() -> float:
    return time.time()


def _setting(conn: Any, key: str) -> str:
    row = conn.execute("SELECT value FROM settings WHERE key=?", (key,)).fetchone()
    return str(row["value"]).strip() if row and row["value"] else ""


def provider_key(conn: Any, provider: str) -> str:
    """API key already connected for a provider (settings, then environment)."""
    prefix = provider.upper()
    return (
        _setting(conn, f"ai_{provider}_key")
        or os.environ.get(f"AI_BRIDGE_{prefix}_API_KEY", "")
        or os.environ.get(f"{prefix}_API_KEY", "")
    )


def resolve_llm(conn: Any, provider: str, model: str | None, base_url: str | None) -> tuple[str, str, str, str]:
    """Return (provider, base_url, api_key, model) for an agent run."""
    p = (provider or "openai").lower().strip()
    if p not in PROVIDERS:
        raise RuntimeError(f"Unsupported AI provider: {provider}")
    if p == "custom":
        url = (
            base_url
            or _setting(conn, "ai_custom_base_url")
            or os.environ.get("AI_BRIDGE_CUSTOM_BASE_URL", "")
        ).rstrip("/")
        if not url:
            raise RuntimeError("Custom AI provider needs a base URL.")
        resolved_model = (model or _setting(conn, "ai_custom_model") or "default").strip()
        return p, url, provider_key(conn, "custom"), resolved_model

    defaults = {
        "anthropic": ("https://api.anthropic.com/v1", "claude-3-5-sonnet-20241022"),
        "groq": ("https://api.groq.com/openai/v1", "llama-3.1-70b-versatile"),
        "deepseek": ("https://api.deepseek.com/v1", "deepseek-chat"),
        "gemini": ("https://generativelanguage.googleapis.com/v1beta/openai", "gemini-1.5-pro"),
        "ollama": ("http://localhost:11434/v1", "llama3.1:8b"),
    }
    default_url, default_model = defaults.get(p, ("https://api.openai.com/v1", "gpt-4o"))
    return p, default_url, provider_key(conn, p), (model or default_model).strip()


def _bound_devices(conn: Any, agent: dict[str, Any]) -> list[dict[str, Any]]:
    try:
        device_ids = json.loads(agent.get("device_ids_json") or "[]")
    except Exception:
        device_ids = []
    devices: list[dict[str, Any]] = []
    for device_id in device_ids:
        row = conn.execute(
            "SELECT id, name, hostname, os, status, last_seen FROM devices WHERE id=? AND revoked=0",
            (device_id,),
        ).fetchone()
        if row:
            devices.append(dict(row))
    return devices


def _online_bound_devices(devices: list[dict[str, Any]]) -> list[dict[str, Any]]:
    now = _now()
    out: list[dict[str, Any]] = []
    for d in devices:
        status = str(d.get("status") or "").lower()
        last_seen = d.get("last_seen")
        if status == "online":
            out.append(d)
            continue
        try:
            if last_seen is not None and (now - float(last_seen)) <= DEVICE_ONLINE_WINDOW_S:
                out.append(d)
        except (TypeError, ValueError):
            pass
    return out


def _resolve_device(devices: list[dict[str, Any]], requested: Any) -> str | None:
    """Map a model-supplied device name/id onto the agent's bound devices."""
    if not devices:
        return None
    if requested:
        wanted = str(requested).strip().lower()
        for device in devices:
            names = {
                str(device.get("id") or "").lower(),
                str(device.get("name") or "").lower(),
                str(device.get("hostname") or "").lower(),
            }
            if wanted in names:
                return str(device["id"])
    return str(devices[0]["id"])


def _system_prompt(agent: dict[str, Any], devices: list[dict[str, Any]]) -> str:
    listing = "\n".join(
        f"- {d.get('name')} (id {d['id']}, {d.get('os') or 'unknown OS'}, {d.get('status') or 'unknown'})"
        for d in devices
    ) or "- local (the control-plane host)"
    memory = str(agent.get("memory") or "").strip()
    memory_block = f"\nMemory from previous cycles (most recent last):\n{memory}\n" if memory else ""
    return (
        f"You are '{agent.get('name')}', an autonomous operator agent managed by AI Bridge.\n"
        f"Objective:\n{agent.get('instruction')}\n\n"
        f"Bound devices (pass one of these ids in the `device` argument):\n{listing}\n\n"
        f"{memory_block}"
        "Rules:\n"
        "1. Move the objective forward every cycle; do not repeat work already completed.\n"
        "2. Prefer read-only inspection before changes, and verify what you changed.\n"
        "3. For GUI work, call take_screenshot first and act on the returned image; "
        "screenshot coordinates are native screen pixels.\n"
        "4. Stay inside the objective's scope and use only the bound devices.\n"
        "5. When the objective is satisfied, or it needs a human, reply in plain text "
        "starting with DONE and explain why."
    )


def _is_transient_http_error(exc: Exception) -> bool:
    code = getattr(exc, "code", None)
    if code is None and isinstance(exc, urllib.error.HTTPError):
        code = exc.code
    if code is not None:
        try:
            c = int(code)
            return c == 429 or 500 <= c < 600
        except (TypeError, ValueError):
            pass
    # Transport-level failures are also worth one retry.
    return isinstance(exc, (urllib.error.URLError, TimeoutError, ConnectionError))


def execute_agent(
    conn: Any,
    agent: dict[str, Any],
    tool_executor: ToolExecutor,
    *,
    max_steps: int = MAX_STEPS,
) -> dict[str, Any]:
    """Run one reasoning cycle for an agent. Raises on provider/transport errors."""
    provider, base_url, api_key, model = resolve_llm(
        conn, agent.get("provider") or "openai", agent.get("model"), agent.get("base_url")
    )
    devices = _bound_devices(conn, agent)
    if not devices:
        raise RuntimeError("The agent has no bound devices. Assign at least one device.")

    tools_spec = build_tool_specs(tool_format="openai")
    messages: list[dict[str, Any]] = [
        {"role": "system", "content": _system_prompt(agent, devices)},
        {
            "role": "user",
            "content": (
                "Run one work cycle now "
                f"({time.strftime('%Y-%m-%d %H:%M:%S', time.gmtime())} UTC). "
                "Act on the objective, then summarise what you did."
            ),
        },
    ]
    steps: list[dict[str, Any]] = []
    tenant = str(agent.get("tenant") or "default")
    actor = f"agent:{agent.get('name') or agent.get('id')}"
    vision_enabled = True
    is_anthropic = provider == "anthropic"

    for _ in range(max(1, min(int(max_steps), 20))):
        headers = {"Content-Type": "application/json", "User-Agent": "AI-Bridge/0.3"}
        if is_anthropic:
            headers["x-api-key"] = api_key
            headers["anthropic-version"] = ANTHROPIC_VERSION
        elif api_key:
            headers["Authorization"] = f"Bearer {api_key}"
        elif provider == "ollama":
            headers["Authorization"] = "Bearer ollama"

        message = None
        last_exc: Exception | None = None
        for attempt in range(2):  # initial + one retry (transient error or image fallback)
            payload_messages = messages if vision_enabled else _drop_images(messages)
            try:
                if is_anthropic:
                    message = _post_anthropic(base_url, api_key, model, payload_messages, tools_spec, 0.2, timeout=90)
                else:
                    request = urllib.request.Request(
                        f"{base_url}/chat/completions",
                        data=json.dumps({
                            "model": model,
                            "messages": payload_messages,
                            "tools": tools_spec,
                            "tool_choice": "auto",
                            "temperature": 0.2,
                        }).encode("utf-8"),
                        headers=headers,
                        method="POST",
                    )
                    with urllib.request.urlopen(request, timeout=90) as response:
                        body = json.loads(response.read().decode("utf-8"))
                    message = (body.get("choices") or [{}])[0].get("message") or {}
                last_exc = None
                break
            except urllib.error.HTTPError as exc:
                detail = exc.read().decode("utf-8") if exc.fp else str(exc)
                last_exc = RuntimeError(f"LLM provider returned HTTP {exc.code}: {detail[:300]}")
                if attempt == 0 and vision_enabled and _has_image_parts(messages):
                    # Text-only model: retry without image parts.
                    vision_enabled = False
                    continue
                if attempt == 0 and _is_transient_http_error(exc):
                    time.sleep(RETRY_DELAY_S)
                    continue
                raise last_exc from exc
            except Exception as exc:  # noqa: BLE001 - surface transport failures to the run log
                last_exc = RuntimeError(f"Could not reach LLM provider at {base_url}: {exc}")
                if attempt == 0 and _is_transient_http_error(exc):
                    time.sleep(RETRY_DELAY_S)
                    continue
                raise last_exc from exc
        if message is None:
            if last_exc is not None:
                raise last_exc
            raise RuntimeError("Empty LLM response.")

        tool_calls = message.get("tool_calls") or []
        if not tool_calls:
            return {
                "provider": provider,
                "model": model,
                "response": message.get("content") or "",
                "steps": steps,
                "devices": [d["id"] for d in devices],
                "actor": actor,
            }

        messages.append(message)
        images: list[tuple[str, str, int | None, int | None, str]] = []
        for call in tool_calls:
            function = call.get("function") or {}
            tool_name = function.get("name") or ""
            try:
                tool_args = json.loads(function.get("arguments") or "{}")
            except Exception:
                tool_args = {}
            requested_device = tool_args.pop("device", None)
            device_id = _resolve_device(devices, requested_device)
            try:
                result = tool_executor(tool_name, tool_args, device_id, tenant, actor)
            except Exception as exc:  # noqa: BLE001 - tool errors feed back to the model
                result = {"ok": False, "error": str(exc)}
            steps.append(
                {
                    "tool": tool_name,
                    "device": device_id or "local",
                    "args": tool_args,
                    "result": result,
                }
            )
            image = _extract_image(result) if isinstance(result, dict) else None
            if image:
                images.append((image[0], image[1], image[2], image[3], tool_name))
            messages.append(
                {
                    "role": "tool",
                    "tool_call_id": call.get("id"),
                    "name": tool_name,
                    "content": json.dumps(_strip_image_fields(result), default=str)[:20000],
                }
            )
        if images and vision_enabled:
            messages.append(_image_user_message(images))

    return {
        "provider": provider,
        "model": model,
        "response": "Step limit reached before the objective completed.",
        "steps": steps,
        "devices": [d["id"] for d in devices],
        "actor": actor,
    }


class AgentRunner:
    """Background scheduler that keeps enabled agents running 24/7."""

    def __init__(
        self,
        conn: Any,
        tool_executor: ToolExecutor,
        is_paused: Callable[[], bool] | None = None,
        get_webhook_url: Callable[[], str] | None = None,
        failure_notifier: Callable[[dict[str, Any]], None] | None = None,
    ) -> None:
        self._conn = conn
        self._tool_executor = tool_executor
        self._is_paused = is_paused
        self._get_webhook_url = get_webhook_url
        self._failure_notifier = failure_notifier
        self._running: set[str] = set()
        self._lock = threading.Lock()
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None

    def start(self) -> "AgentRunner":
        if self._thread is None:
            self._thread = threading.Thread(target=self._loop, name="custom-agent-runner", daemon=True)
            self._thread.start()
        return self

    def stop(self) -> None:
        self._stop.set()

    def _loop(self) -> None:
        while not self._stop.wait(RUNNER_TICK_S):
            try:
                if self._is_paused and self._is_paused():
                    continue
                now = _now()
                due = self._conn.execute(
                    "SELECT * FROM custom_agents WHERE enabled=1 AND next_run_at<=? "
                    "ORDER BY next_run_at ASC LIMIT 10",
                    (now,),
                ).fetchall()
                for row in due:
                    agent = dict(row)
                    with self._lock:
                        if agent["id"] in self._running or len(self._running) >= MAX_CONCURRENT_RUNS:
                            continue
                        self._running.add(agent["id"])
                    interval = min(MAX_INTERVAL_S, max(MIN_INTERVAL_S, int(agent.get("interval_seconds") or DEFAULT_INTERVAL_S)))
                    self._conn.execute(
                        "UPDATE custom_agents SET status='running', next_run_at=?, updated_at=? WHERE id=?",
                        (now + interval, now, agent["id"]),
                    )
                    self._conn.commit()
                    threading.Thread(
                        target=self._run_one, args=(agent,), name=f"agent-run-{agent['id']}", daemon=True
                    ).start()
            except Exception:  # noqa: BLE001 - the runner must survive transient DB errors
                time.sleep(1)

    def _run_one(self, agent: dict[str, Any]) -> None:
        agent_id = str(agent["id"])
        run_id = uuid.uuid4().hex[:16]
        started = _now()
        tenant = str(agent.get("tenant") or "default")
        self._conn.execute(
            "INSERT INTO agent_runs (id, agent_id, tenant, status, started_at) VALUES (?,?,?,'running',?)",
            (run_id, agent_id, tenant, started),
        )
        self._conn.commit()
        try:
            fresh = self._conn.execute("SELECT * FROM custom_agents WHERE id=?", (agent_id,)).fetchone()
            if not fresh:
                self._conn.execute("UPDATE agent_runs SET status='skipped', finished_at=? WHERE id=?", (_now(), run_id))
                self._conn.commit()
                return
            fresh = dict(fresh)
            if not fresh.get("enabled"):
                self._conn.execute("UPDATE custom_agents SET status='paused' WHERE id=?", (agent_id,))
                self._conn.execute("UPDATE agent_runs SET status='skipped', finished_at=? WHERE id=?", (_now(), run_id))
                self._conn.commit()
                return

            devices = _bound_devices(self._conn, fresh)
            online = _online_bound_devices(devices)
            if not online:
                finished = _now()
                reason = "Skipped: no bound device is online."
                self._conn.execute(
                    "UPDATE custom_agents SET status='idle', last_run_at=?, last_error=?, last_skip_reason=?, updated_at=? WHERE id=?",
                    (finished, reason, reason, finished, agent_id),
                )
                self._conn.execute(
                    "UPDATE agent_runs SET status='skipped', finished_at=?, duration_ms=?, error=? WHERE id=?",
                    (finished, int((finished - started) * 1000), reason, run_id),
                )
                self._prune_runs(agent_id)
                self._conn.commit()
                return

            # Reuse the full bound list for execution; online subset is only the gate.
            result = execute_agent(self._conn, fresh, self._tool_executor)
            finished = _now()
            response_text = str(result.get("response") or "")
            steps = result.get("steps") or []
            actor = str(result.get("actor") or f"agent:{fresh.get('name') or fresh.get('id')}")
            model_used = str(result.get("model") or fresh.get("model") or "").strip() or "default"
            provider_used = str(result.get("provider") or fresh.get("provider") or "").strip() or "unknown"
            device_ids_json = fresh.get("device_ids_json")

            # Audit each tool action.
            for step in steps:
                try:
                    step_args = json.dumps(step.get("args"), default=str)
                except Exception:
                    step_args = str(step.get("args") or "")
                try:
                    step_result = json.dumps(step.get("result"), default=str)
                except Exception:
                    step_result = str(step.get("result") or "")
                _audit(
                    actor,
                    str(step.get("device") or "") or "",
                    str(step.get("tool") or "") or "",
                    {"agent_id": agent_id, "agent_name": fresh.get("name"), "args": step_args[:2000]},
                    "executed",
                    step_result[:2000],
                    tenant=tenant,
                )

            # Summary audit entry.
            _audit(
                actor,
                "",
                "custom_agent_run",
                {"agent_id": agent_id, "agent_name": fresh.get("name"), "device_ids_json": device_ids_json},
                "executed",
                json.dumps(
                    {
                        "provider": provider_used,
                        "model": model_used,
                        "response": response_text[:2000],
                        "step_count": len(steps),
                        "duration_ms": int((finished - started) * 1000),
                    },
                    default=str,
                ),
                tenant=tenant,
            )

            existing_memory = str(fresh.get("memory") or "").strip()
            entry = f"[{time.strftime('%Y-%m-%d %H:%M UTC', time.gmtime(finished))}] {response_text[:1500].strip()}"
            new_memory = (existing_memory + "\n" + entry).strip() if existing_memory else entry
            if len(new_memory) > 8000:
                new_memory = new_memory[-8000:]
            self._conn.execute(
                "UPDATE custom_agents SET status='idle', last_run_at=?, last_result=?, last_error='', "
                "last_skip_reason='', memory=?, consecutive_failures=0, run_count=run_count+1, updated_at=? WHERE id=?",
                (finished, response_text[:4000], new_memory, finished, agent_id),
            )
            self._conn.execute(
                "UPDATE agent_runs SET status='completed', finished_at=?, duration_ms=?, response=?, "
                "steps_json=? WHERE id=?",
                (finished, int((finished - started) * 1000), response_text[:20000], json.dumps(steps, default=str), run_id),
            )
            self._prune_runs(agent_id)
            self._conn.commit()
        except Exception as exc:  # noqa: BLE001 - record the failure and keep the schedule
            finished = _now()
            actor = f"agent:{agent.get('name') or agent.get('id')}"
            _audit(
                actor,
                "",
                "custom_agent_run",
                {"agent_id": agent_id, "agent_name": agent.get("name"), "device_ids_json": agent.get("device_ids_json")},
                "rejected",
                str(exc)[:2000],
                tenant=tenant,
            )

            # Consecutive-failure tracking + auto-pause.
            try:
                row = self._conn.execute(
                    "SELECT consecutive_failures FROM custom_agents WHERE id=?", (agent_id,)
                ).fetchone()
                prev = int((dict(row).get("consecutive_failures") if row else 0) or 0)
            except Exception:
                prev = 0
            failures = prev + 1
            auto_paused = failures >= MAX_CONSECUTIVE_FAILURES

            if auto_paused:
                self._conn.execute(
                    "UPDATE custom_agents SET status='paused', enabled=0, last_run_at=?, last_error=?, "
                    "consecutive_failures=?, updated_at=? WHERE id=?",
                    (finished, f"Auto-paused after {failures} consecutive failures: {str(exc)[:900]}", failures, finished, agent_id),
                )
            else:
                self._conn.execute(
                    "UPDATE custom_agents SET status='error', last_run_at=?, last_error=?, "
                    "consecutive_failures=?, updated_at=? WHERE id=?",
                    (finished, str(exc)[:1000], failures, finished, agent_id),
                )

            self._conn.execute(
                "UPDATE agent_runs SET status='failed', finished_at=?, duration_ms=?, error=? WHERE id=?",
                (finished, int((finished - started) * 1000), str(exc)[:2000], run_id),
            )
            self._prune_runs(agent_id)
            self._conn.commit()

            # Failure notification via webhook if configured.
            try:
                if self._failure_notifier is not None:
                    self._failure_notifier(
                        {
                            "event": "agent_failed",
                            "agent_id": agent_id,
                            "agent_name": agent.get("name"),
                            "error": str(exc)[:500],
                            "consecutive_failures": failures,
                            "auto_paused": auto_paused,
                        }
                    )
            except Exception:
                pass
        finally:
            with self._lock:
                self._running.discard(agent_id)

    def _prune_runs(self, agent_id: str) -> None:
        """Keep the newest 200 runs per agent so 24/7 schedules do not grow forever."""
        self._conn.execute(
            "DELETE FROM agent_runs WHERE agent_id=? AND id NOT IN "
            "(SELECT id FROM agent_runs WHERE agent_id=? ORDER BY started_at DESC LIMIT 200)",
            (agent_id, agent_id),
        )

    def _audit_helper(self) -> None:
        pass


# Module-level audit indirection: routes install `audit` into app; runner needs it.
# We resolve lazily from a module global set by install_custom_agent_routes.
_AUDIT: Callable[..., None] | None = None


def _audit(*args: Any, **kwargs: Any) -> None:
    global _AUDIT
    if _AUDIT is None:
        # Try to import from app module state is not available; no-op.
        return
    try:
        _AUDIT(*args, **kwargs)
    except Exception:
        pass


def install_custom_agent_routes(app: Any, conn: Any, require_role: Any, audit: Any, runner: AgentRunner) -> None:
    """Register /api/agents CRUD, manual run and run-history endpoints."""
    global _AUDIT
    _AUDIT = audit

    @app.get("/api/agents")
    def list_agents(
        tenant: str = "default",
        x_admin_token: str | None = Header(default=None),
        x_session_token: str | None = Header(default=None),
    ):
        require_role("viewer", x_admin_token, x_session_token)
        rows = conn.execute(
            "SELECT * FROM custom_agents WHERE tenant=? ORDER BY created_at DESC", (tenant,)
        ).fetchall()
        return {"ok": True, "agents": [_serialize(conn, dict(r)) for r in rows]}

    @app.post("/api/agents")
    def create_agent(
        body: AgentIn,
        x_admin_token: str | None = Header(default=None),
        x_session_token: str | None = Header(default=None),
    ):
        actor = require_role("admin", x_admin_token, x_session_token)
        if not body.name.strip() or not body.instruction.strip():
            raise HTTPException(status_code=400, detail="Name and objective cannot be empty.")
        _validate(conn, body.provider, body.base_url, body.device_ids)
        agent_id = uuid.uuid4().hex[:12]
        now = _now()
        interval = min(MAX_INTERVAL_S, max(MIN_INTERVAL_S, int(body.interval_seconds)))
        conn.execute(
            "INSERT INTO custom_agents (id, name, instruction, tenant, provider, model, base_url, "
            "device_ids_json, interval_seconds, enabled, status, next_run_at, created_at, updated_at) "
            "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (
                agent_id,
                body.name.strip(),
                body.instruction.strip(),
                "default",
                body.provider.lower().strip(),
                (body.model or "").strip() or None,
                (body.base_url or "").strip() or None,
                json.dumps(body.device_ids),
                interval,
                1 if body.enabled else 0,
                "idle",
                now if body.enabled else now + interval,
                now,
                now,
            ),
        )
        conn.commit()
        audit(actor, "", "create_custom_agent", {"agent_id": agent_id, "name": body.name}, "allowed")
        row = conn.execute("SELECT * FROM custom_agents WHERE id=?", (agent_id,)).fetchone()
        return {"ok": True, "agent": _serialize(conn, dict(row))}

    @app.patch("/api/agents/{agent_id}")
    def update_agent(
        agent_id: str,
        body: AgentPatch,
        x_admin_token: str | None = Header(default=None),
        x_session_token: str | None = Header(default=None),
    ):
        actor = require_role("admin", x_admin_token, x_session_token)
        row = conn.execute("SELECT * FROM custom_agents WHERE id=?", (agent_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Agent not found.")
        if body.name is not None and not body.name.strip():
            raise HTTPException(status_code=400, detail="Name cannot be empty.")
        if body.instruction is not None and not body.instruction.strip():
            raise HTTPException(status_code=400, detail="Objective cannot be empty.")
        current = dict(row)
        provider = (body.provider or current["provider"]).lower().strip()
        base_url = body.base_url if body.base_url is not None else current.get("base_url")
        device_ids = body.device_ids if body.device_ids is not None else json.loads(current.get("device_ids_json") or "[]")
        if body.provider is not None or body.base_url is not None or body.device_ids is not None:
            _validate(conn, provider, base_url, device_ids)
        interval = (
            min(MAX_INTERVAL_S, max(MIN_INTERVAL_S, int(body.interval_seconds)))
            if body.interval_seconds is not None
            else int(current["interval_seconds"])
        )
        enabled = current["enabled"] if body.enabled is None else (1 if body.enabled else 0)
        next_run = current["next_run_at"]
        if body.enabled is True and not current["enabled"]:
            next_run = _now()
        # Reset failure counter on manual resume.
        reset_failures = 0 if (body.enabled is True) else current.get("consecutive_failures", 0)
        memory = current.get("memory") if body.memory is None else body.memory
        conn.execute(
            "UPDATE custom_agents SET name=?, instruction=?, provider=?, model=?, base_url=?, "
            "device_ids_json=?, interval_seconds=?, enabled=?, status=?, next_run_at=?, "
            "memory=?, consecutive_failures=?, updated_at=? WHERE id=?",
            (
                (body.name or current["name"]).strip(),
                (body.instruction or current["instruction"]).strip(),
                provider,
                body.model if body.model is not None else current.get("model"),
                base_url,
                json.dumps(device_ids),
                interval,
                enabled,
                "idle" if enabled else "paused",
                next_run,
                memory,
                reset_failures,
                _now(),
                agent_id,
            ),
        )
        conn.commit()
        audit(actor, "", "update_custom_agent", {"agent_id": agent_id, "enabled": bool(enabled)}, "allowed")
        updated = conn.execute("SELECT * FROM custom_agents WHERE id=?", (agent_id,)).fetchone()
        return {"ok": True, "agent": _serialize(conn, dict(updated))}

    @app.delete("/api/agents/{agent_id}")
    def delete_agent(
        agent_id: str,
        x_admin_token: str | None = Header(default=None),
        x_session_token: str | None = Header(default=None),
    ):
        actor = require_role("admin", x_admin_token, x_session_token)
        row = conn.execute("SELECT * FROM custom_agents WHERE id=?", (agent_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Agent not found.")
        conn.execute("DELETE FROM agent_runs WHERE agent_id=?", (agent_id,))
        conn.execute("DELETE FROM custom_agents WHERE id=?", (agent_id,))
        conn.commit()
        audit(actor, "", "delete_custom_agent", {"agent_id": agent_id}, "allowed")
        return {"ok": True, "agent_id": agent_id, "status": "deleted"}

    @app.post("/api/agents/{agent_id}/run")
    def run_agent_now(
        agent_id: str,
        x_admin_token: str | None = Header(default=None),
        x_session_token: str | None = Header(default=None),
    ):
        actor = require_role("admin", x_admin_token, x_session_token)
        row = conn.execute("SELECT * FROM custom_agents WHERE id=?", (agent_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Agent not found.")
        if not row["enabled"]:
            raise HTTPException(status_code=400, detail="Start the agent before running it.")
        conn.execute(
            "UPDATE custom_agents SET next_run_at=?, updated_at=? WHERE id=?", (_now(), _now(), agent_id)
        )
        conn.commit()
        audit(actor, "", "run_custom_agent", {"agent_id": agent_id}, "allowed")
        return {"ok": True, "agent_id": agent_id, "status": "queued"}

    @app.get("/api/agents/{agent_id}/runs")
    def agent_runs(
        agent_id: str,
        limit: int = 20,
        x_admin_token: str | None = Header(default=None),
        x_session_token: str | None = Header(default=None),
    ):
        require_role("viewer", x_admin_token, x_session_token)
        limit = min(100, max(1, int(limit)))
        rows = conn.execute(
            "SELECT * FROM agent_runs WHERE agent_id=? ORDER BY started_at DESC LIMIT ?",
            (agent_id, limit),
        ).fetchall()
        out = []
        for row in rows:
            item = dict(row)
            try:
                item["steps"] = json.loads(item.pop("steps_json", "[]") or "[]")
            except Exception:
                item["steps"] = []
            out.append(item)
        return {"ok": True, "agent_id": agent_id, "runs": out}


class AgentIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    instruction: str = Field(min_length=1, max_length=8000)
    provider: str = "openai"
    model: str | None = None
    base_url: str | None = None
    device_ids: list[str] = Field(default_factory=list)
    interval_seconds: int = DEFAULT_INTERVAL_S
    enabled: bool = True


class AgentPatch(BaseModel):
    name: str | None = None
    instruction: str | None = None
    provider: str | None = None
    model: str | None = None
    base_url: str | None = None
    device_ids: list[str] | None = None
    interval_seconds: int | None = None
    enabled: bool | None = None
    memory: str | None = None


def _serialize(conn: Any, agent: dict[str, Any]) -> dict[str, Any]:
    out = dict(agent)
    try:
        device_ids = json.loads(out.pop("device_ids_json", "[]") or "[]")
    except Exception:
        device_ids = []
    out["device_ids"] = device_ids
    out["enabled"] = bool(out.get("enabled"))
    devices = []
    for device_id in device_ids:
        row = conn.execute(
            "SELECT id, name, hostname, os, status FROM devices WHERE id=?", (device_id,)
        ).fetchone()
        devices.append(dict(row) if row else {"id": device_id, "name": device_id, "status": "missing"})
    out["devices"] = devices
    return out


def _validate(conn: Any, provider: str, base_url: str | None, device_ids: list[str]) -> None:
    p = (provider or "").lower().strip()
    if p not in PROVIDERS:
        raise HTTPException(status_code=400, detail=f"Unknown provider '{provider}'.")
    if p == "custom":
        url = (base_url or _setting(conn, "ai_custom_base_url") or os.environ.get("AI_BRIDGE_CUSTOM_BASE_URL", "")).strip()
        if not url:
            raise HTTPException(status_code=400, detail="Custom AI needs a base URL. Connect it in AI providers first.")
    elif p != "ollama" and not provider_key(conn, p):
        raise HTTPException(
            status_code=400,
            detail=f"No API key is connected for {p}. Save one in AI providers before creating the agent.",
        )
    if not device_ids:
        raise HTTPException(status_code=400, detail="Assign at least one device to the agent.")
    for device_id in device_ids:
        if not conn.execute("SELECT id FROM devices WHERE id=? AND revoked=0", (device_id,)).fetchone():
            raise HTTPException(status_code=400, detail=f"Device not found: {device_id}")
