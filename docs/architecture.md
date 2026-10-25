# Architecture

```
AI client (Claude / Codex / Gemini CLI / ChatGPT via remote MCP)
        │  MCP stdio (local) or Streamable HTTP (remote, TLS + bearer)
        ▼
ai_bridge.server (FastMCP) ── policy.decide() ── tools.py / workspace.py
        │                          │  confined_path(), atomic writes, backups
        ▼                          ▼
TaskRunner (allowlisted, bounded, cancellable)
        │
        │  (remote devices)
        ▼
Control plane (FastAPI, SQLite dev / Postgres prod)
  devices (hashed tokens) │ tasks │ approvals │ audit │ emergency stop
        ▲  outbound polling only (agent -> plane, never plane -> device shell)
        │
Linux agent (systemd, unprivileged) / Windows agent (service account)
        └─ interactive desktop helper (logged-in session only, opt-in)
Dashboard (React + TypeScript, Vite) -> control-plane API only
```

Key decisions (see docs/security.md and docs/threat-model.md):
- No `run_any_command`. Every executable operation is an allowlisted,
  argument-array task with timeout, output cap, and cancellation.
- Policy is a frozen, admin-owned object. Tool arguments cannot widen it.
- Devices authenticate with hashed tokens, shown once at enrollment.
- The plane never dials into a device; agents poll outbound, so NAT /
  firewalls need no inbound ports on the device.
- All consequential writes take a backup first (delete is always recoverable
  from `.ai-bridge-backups/` until the admin cleans it).

## Module map
- `src/ai_bridge/config.py` — env-only settings.
- `src/ai_bridge/security.py` — confinement, secret-name blocking, redaction.
- `src/ai_bridge/workspace.py` — confined file ops, atomic writes, backups.
- `src/ai_bridge/diagnostics.py` — read-only system/docker/process/log probes.
- `src/ai_bridge/policy.py` — risk tiers + server-side decisions.
- `src/ai_bridge/execution.py` — bounded task runner, process-group kill.
- `src/ai_bridge/tools.py` — shared tool implementations (backup, staging deploy, desktop).
- `src/ai_bridge/server.py` — MCP server (stdio + Streamable HTTP).
- `src/ai_bridge/control/` — FastAPI control plane (devices, tasks, approvals, audit).
- `agents/linux/agent_main.py` — Linux poller entrypoint.
- `agents/windows/` — Windows diagnostics + interactive desktop helper.
- `apps/dashboard/` — React/TypeScript dashboard (login, devices, tasks, approvals, audit, emergency stop).
- `apps/control-api/main.py` — thin uvicorn entrypoint for the plane.
