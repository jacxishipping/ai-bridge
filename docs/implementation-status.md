# Implementation status — v0.3.0 (honest report)

## v0.3.0 — security batch (this release)
- Short-lived device tokens (7 days by default, `AI_BRIDGE_DEVICE_TOKEN_TTL_DAYS`), checked on every agent call, with a rotation endpoint that invalidates the old token immediately.
- Local users with PBKDF2 password hashes, 8-hour sessions, and roles (viewer/operator/admin). The legacy shared admin token still works unless `AI_BRIDGE_DISABLE_LEGACY_ADMIN_TOKEN=1`.
- Versioned policies via `/api/policies` (audited); Tier-3 tasks now need approval unless the current versioned policy allows Tier 3.
- Signed releases: Ed25519 manifest signing/verification in `src/ai_bridge/updates.py` + agent `--check-update` (verifies before any download; installation remains an operator step).
- Sandboxed task execution: minimal env (secrets dropped), workspace cwd, CPU/memory/file-size rlimits.
- Dashboard: username/password login alongside the admin token, plus a Policies view.
- Control-plane hardening follow-up: approval context includes task args,
  device, tier, and policy version; decisions record the authenticated actor
  and expire after a configurable TTL. Audit records are append-only through
  the API, with export and explicit retention pruning. Session logout revokes
  the server-side session; policy simulation previews proposed tier gates.
- Implemented since v0.3 (needs activation or a machine to verify):
  OIDC login (provider-gated via AI_BRIDGE_OIDC_*; crypto verified offline,
  full flow needs a registered provider app), network-namespace egress
  control for the bounded task runner (AI_BRIDGE_TASK_NETNS=1, fail-closed),
  reverse-proxy mTLS plus plane-side device fingerprint gate
  (`AI_BRIDGE_DEVICE_MTLS` / `control/device_mtls.py`), macOS agent code +
  launchd unit (import + honesty exercised on `macos-agent` CI). Still NOT
  verified end-to-end: Windows full installer/service E2E on a dedicated
  fleet image.

Implemented and tested on Linux (this environment, pytest run — see CHANGELOG):
- MCP stdio server + Streamable HTTP entrypoint; tools list/call verified
  by an MCP stdio test; live HTTP round-trip in
  `tests/integration/test_mcp_http_roundtrip.py` + `deployment/smoke_check.py`.
- Workspace confinement (traversal, absolute, NUL, symlink escape),
  secret-name blocking, redaction, atomic writes, backups.
- Risk tiers 1-4 with server-side enforcement, approval queue, emergency stop.
- Control plane: enrollment (hashed token, shown once), revocation,
  task queue, agent polling with bounded backoff, audit, tenant filtering.
- Linux agent (systemd unit, unprivileged), Docker/process/service/log/git
  diagnostics, allowlisted tests/linter, staging deploy with backup.
- Dashboard (React/TS/Vite): login, devices, tasks, approvals,
  audit, emergency stop, policies. Built output IS included in the release ZIP
  (`apps/dashboard/dist/`); rebuild with `npm install && npm run build`.
Honest residuals / gated paths:
- Signed agent updates: verification in v0.3; silent auto-install is
  **gated** behind `AI_BRIDGE_ALLOW_AUTO_UPDATE=1` (default off — verify then apply).
- OIDC login is **in-tree and env-activated** (`control/oidc.py` + `/api/auth/oidc/*`
  when `AI_BRIDGE_OIDC_*` is set). Local password accounts remain the default
  interim path when OIDC provider env is unset.
- Postgres is required by production readiness when `AI_BRIDGE_PROFILE=production`
  (`DATABASE_URL`); SQLite remains the local/dev default. Redis is required for
  multi-host WebRTC throttle in production when
  `AI_BRIDGE_REQUIRE_REDIS` / `AI_BRIDGE_MULTI_HOST` is set (`durable_ratelimit` + readiness).
- macOS agent entrypoints under `agents/macos/` run on GitHub `macos-agent` CI
  (import + desktop status honesty + residual unit smoke).
- Windows: Python agent + installer exist; full installer E2E remains
  documented-but-unverified on a dedicated host.
- Plane-side device mTLS, Vault/AWS SM secrets, Linux netns/gVisor wrappers,
  and WORM SIEM sinks are in-tree (env-gated). C++ PeerConnection path
  (libdatachannel) is verified by `windows-native-webrtc` +
  `scripts/libwebrtc_e2e_harness.py` (offer/answer, ICE connected, track,
  input datachannel). Fleet Live Desktop still defaults to Python aiortc
  until devices run `ai_bridge_desktop`.

## WebRTC / desktop streaming (Phases 2–9, current)
- Dispatch defaults **fps=30** and forwards `monitor_index` / `bitrate_kbps` (`dispatch._start_webrtc_from_task`).
- ICE servers from `webrtc_stream.get_configured_ice_servers`: `AI_BRIDGE_ICE_SERVERS`,
  `AI_BRIDGE_TURN_URL` (+ username/credential), or ephemeral TURN via `AI_BRIDGE_TURN_HOST` +
  `AI_BRIDGE_TURN_SECRET` (required when `AI_BRIDGE_PROFILE=production`). See `docs/streaming.md` §2.
- Desktop audio (**F11**) is **off by default**; opt in with `AI_BRIDGE_DESKTOP_AUDIO=1` (silent PCM
  frames until WASAPI loopback is production-ready). Covered by `tests/unit/test_phase9_deep.py`.
- Canonical session API is `POST /api/v1/sessions`; legacy device WebRTC create returns
  **410** in production (`AI_BRIDGE_ALLOW_LEGACY_WEBRTC` opt-in). Native C++ PeerConnection
  dashboard-path E2E is covered by the harness checklist.

## Browser Intelligence (Phase 4 deepen)
- Playwright device presets via `browser_set_viewport` (`desktop`, `desktop_1080`, `iphone`, `pixel`, `tablet`) with viewport metadata on screenshots/session info.
- Website test helpers: `browser_expect`, `browser_wait_for_url`, `browser_diagnostics`, `browser_compare_screenshot` (workspace baselines under `.ai-bridge/visual-baselines/`).
- Workflow verify supports `mode: visual` → `browser_compare_screenshot` (in addition to text/`desktop_verify_action`).
- Browserbase durable CDP: `browserbase_connect` / navigate without closing; `browserbase_screenshot`; optional attach into local `browser_*` tools; `end_session` on Browser Operator allowlist.
- Research: `firecrawl_crawl` plus Firecrawl/You tools exposed on MCP `server.py`. Tests: `tests/unit/test_browser_intelligence.py`.

## ServerAI MCP + orchestration (latency / reliability)
- MCP → control plane uses a **process-wide keep-alive `httpx.Client`** in `device_routing.py`
  (no per-call client); `run_device_tool` relies on `?wait=` long-poll (no extra sleep) and can
  abort via `should_abort` → `cancel_device_task`. Responses include `queue_ms` / `exec_ms`.
- Short TTL cache on OAuth verify (token hash → device_id) when not using the in-process verify hook.
- Agents keep HTTP claim (`GET /api/agent/tasks/next`) as lease source of truth; optional
  **`WS /api/agent/ws`** side-channel pushes `task_available` / `cancel` / `emergency_stop`
  (`agent_channel.py` + poller `start_side_channel`). HTTP long-poll remains the fallback.
- Cooperative cancel deepened on shell (`_run_argv`), `wait_for_text`, and sliced
  `browser_wait_for_selector` waits. Tests: `tests/unit/test_serverai_mcp_orchestration.py`.
