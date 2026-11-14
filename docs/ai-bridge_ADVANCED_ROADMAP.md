# AI Bridge — Phase 1 Technical Audit & Advanced Roadmap (Phases 2–9)

**Audit date:** 2025-11-14 (source-verified against `C:\Users\Administrator\ai-bridge`)  
**Phase 2–9 shipped:** 2026-11-14 — Phases 2–8 via `tests/unit/test_orchestration_phases.py` + `test_phase8_deep.py`; **Phase 9** via `tests/unit/test_phase9_deep.py`.  
**Scope:** Phase 1 audit preserved below as historical baseline; Phases 2–9 reflect **current shipped code**.

---

## Implementation status (post Phase 2–9)

| Phase | Status | Primary evidence | Regression test(s) |
|-------|--------|------------------|----------------------|
| **2** — Orchestration reliability | **SHIPPED** | `task_runtime.py`, `orchestration.sweep_stale_running_tasks`, `poller.py` execution-state poll, `dispatch._start_webrtc_from_task` (monitor/bitrate/fps), per-device lease in `app.py` `next_task` | `test_webrtc_task_dispatch_passes_monitor_and_bitrate`, `test_stale_running_task_sweeper_requeues`, `test_per_device_concurrency_lease_blocks_second_task`, `test_execution_state_reflects_cancel`, `test_task_runtime_cancel_interrupts_dispatch` |
| **3** — Trustworthy desktop autonomy | **SHIPPED** (deep) | Veto + `intent_id` on click/verify; SoM coords per-monitor (`screen_capture.normalize_bounds_for_monitor`); `click_element` uses cached SoM marks; `desktop_verify_action` post-screenshot; `AgentStreamer` applies fps/bitrate to `ScreenTrack`; Linux/macOS honest `get_desktop_status`; native encode hook when `ai_bridge_native.dll` present | `tests/unit/test_phase3_desktop_autonomy.py` |
| **4** — Fleet browser & research | **SHIPPED** (deep) | Playwright session reuse/timeouts/`screenshot_after_nav`; `connectors/firecrawl.py`; `browserbase_navigate` (CDP); fleet dispatch for Firecrawl/You/Browserbase | `test_phases_456_deep.py`, `test_dispatch_registers_browser_navigate` |
| **5** — Repo-aware builder agents | **SHIPPED** (deep) | `dev_tools.dev_workspace_plan`, `workspace.project_structure`, `git_apply_patch`, `run_project_tests_structured`; Developer role prompt + MCP `dev_workspace_plan` | `test_phases_456_deep.py` |
| **6** — Role catalog & supervisor | **SHIPPED** (deep) | `control/supervisor.py` handoff enqueue/recovery; `agent_delegate` by `role`; template `role-handoff-supervisor-planner-developer` | `test_phases_456_deep.py`, `test_role_catalog_seed_idempotent` |
| **7** — Durable memory & live activity | **SHIPPED** (deep) | `fleet_health.py`, `live_activity.py`, tagged `agent_memory` query API, `/api/fleet/health`, enriched `/api/activity/live` + SSE, `metrics.py` stale-heartbeat + phase depth gauges, dashboard Live pulse | `test_phase7_deep.py`, `test_emergency_stop_durable_across_app_state`, `test_agent_memory_chunks` |
| **8** — Security & load gates | **SHIPPED** (deep) | `production_readiness.py` + `/health/ready` prod gate; `dispatch_audit.py`; Playwright sandbox isolation; fleet health operator auth; secrets redaction in logs/connectors | `test_phase8_deep.py`, `test_turn_secret_required_in_prod_profile`, `test_orchestration_load_smoke` |
| **9** — Platform hardening & parity | **SHIPPED** (deep; residual noted) | `durable_ratelimit.py` (Redis → DB → memory); `plane_state.refresh_emergency_stop`; `plane_control_flags` + poller mirror; `native_encode.py` + `get_native_encode_status`; browser hard isolation envs; `GET /api/fleet/desktop-capabilities`; legacy WebRTC session `Deprecation` headers | `test_phase9_deep.py` |

**Residual (post Phase 9, honest — out-of-repo / on-target only):**
- Windows **full installer/service E2E** on a dedicated fleet image
- Fleet Live Desktop still defaults to Python `aiortc`; native `ai_bridge_desktop` (libdatachannel) is verified by `windows-native-webrtc` harness (ICE + track + input datachannel) when linked
- Linux netns/gVisor and Redis-required multi-host throttle are **in-tree env-gated** (`browser_isolation_os`, `AI_BRIDGE_REQUIRE_REDIS` / `AI_BRIDGE_MULTI_HOST`) — need host tooling / Redis in the deploy

**Phase 1 findings F1–F9:** addressed in code per table above — see §4 for original severity; §6 for per-phase acceptance mapping.

---

## 1. Executive summary

AI Bridge is a **FastAPI + FastMCP modular monolith** with an **outbound-only agent polling model**, a **React dashboard**, and **~95 MCP tools** (`src/ai_bridge/server.py`: 95 `@mcp.tool` registrations). The product vision in `docs/architecture.md` describes a **dual-process native C++ Windows agent** (`windows-agent/`) with DXGI capture and Media Foundation encoding; the **shipping execution path for most fleet operations today is the Python agent** (`agents/common/poller.py` → `src/ai_bridge/control/dispatch.py`).

**Mature (shipped in tree):** device enroll/revoke, hashed device tokens with TTL and rotation, task queue + long-poll, risk tiers + approvals + audit, workflows/schedules/triggers, custom agents (`AgentRunner` + `agent_delegate`), WebRTC desktop streaming (Python `webrtc_stream.py`), Playwright browser tools on **local MCP only**, dual Render host (`render.yaml`: control + static dashboard), Postgres wiring via `DATABASE_URL` with SQLite default in dev.

**Phase 1 material gaps (historical — pre–Phase 2–8):** F1–F11 in §4 described cancel orphaning, stale `running` tasks, WebRTC arg drop, missing fleet `browser_*`, in-process emergency stop/takeover, veto not on dispatch path, default TURN secret, synthetic SoM, and role catalog absent. **As of 2026-11-14, F1–F3, F4 (browser dispatch), F5 (durable emergency stop), F8 (veto in `tools` desktop path), F9 (prod TURN guard), F10 (opt-in synthetic SoM), and F6 (partial — DB-backed takeover via `plane_state`) are implemented** — see §Implementation status.

**Remaining product gaps (out-of-repo):** Windows full installer E2E. (In-repo: C++ PeerConnection harness E2E; macOS `macos-agent` CI; Linux netns/gVisor wrappers; Redis-required multi-host throttle gate; F11 audio; F12 legacy WebRTC **410** in prod + dashboard `/api/v1/sessions`; F13 native-encode honesty.)

Phase 1 verified the original claims by reading/grepping the paths cited below and cross-checking `tests/unit/test_windows_p0_p2_gaps.py` where relevant.

---

## 2. Architecture map

```mermaid
flowchart TB
  subgraph clients [Clients]
    Dash[apps/dashboard React]
    MCP[MCP stdio / HTTP clients]
    ExtMCP[External MCP via mcp_routes templates]
  end

  subgraph plane [Control plane src/ai_bridge/control]
    App[app.py FastAPI /api/*]
    V1[v1_routes.py /api/v1/*]
    Dispatch[dispatch.py agent tool router]
    Agents[custom_agents.py AgentRunner]
    AiApi[ai_api.py AI hub / streaming]
    McpRt[mcp_routes.py remote MCP registry]
    DB[(db.py SQLite or Postgres)]
  end

  subgraph agent [Outbound agents]
    Poller[agents/common/poller.py]
    WinPy[agents/windows/* Python]
    Lin[agents/linux/agent_main.py]
    Mac[agents/macos/agent_main.py]
  end

  subgraph desktop [Desktop / stream]
    Tools[tools.py desktop_* + capture]
    WebRTC[webrtc_stream.py]
    Browser[browser_tools.py Playwright]
    Native[windows-agent/ C++ capture/encode]
  end

  Dash --> App
  Dash --> V1
  MCP --> server[server.py FastMCP]
  server --> Tools
  server --> Browser
  ExtMCP --> McpRt
  App --> DB
  V1 --> DB
  Poller -->|GET /api/agent/tasks/next| App
  Poller --> Dispatch
  Dispatch --> Tools
  Dispatch --> WebRTC
  WebRTC -.->|signaling HTTP| App
  Native -.->|parallel path unverified E2E| WebRTC
```

| Surface | Primary modules | Notes |
|--------|-----------------|--------|
| Legacy REST | `src/ai_bridge/control/app.py` | Tasks, devices, workflows, WebRTC session helpers, agent poll API, emergency stop |
| v1 REST | `src/ai_bridge/control/v1_routes.py` | Sessions, devices, policies, human takeover registry, heartbeat metrics |
| MCP local | `src/ai_bridge/server.py` | Tool catalog including `browser_*` and `desktop_*` |
| MCP remote templates | `src/ai_bridge/control/mcp_routes.py` | Firecrawl OAuth template, not first-party connectors |
| Agent loop | `agents/common/poller.py` | Heartbeat, poll, `dispatch()`, result spool |
| Fleet tool enforcement | `src/ai_bridge/control/dispatch.py` | Subset of tools; policy + approval |
| Dashboard | `apps/dashboard/` | Live WebRTC, SoM overlay, approvals |
| Deploy | `render.yaml` | `ai-bridge-control` (Python) + `ai-bridge-dashboard` (static) |

---

## 3. Capability inventory

| Area | Status | Evidence |
|------|--------|----------|
| Device enroll / revoke / poll | **Shipped** | `app.py` agent routes; `poller.py` |
| Risk tiers + approvals | **Shipped** | `policy.py`; approval queue in `app.py` |
| Audit + export/retention | **Shipped** | `app.py` audit routes; v0.3 notes in `implementation-status.md` |
| Emergency stop | **Shipped** (Phase 7) | `plane_state` persisted in DB; synced on app boot (`test_emergency_stop_durable_across_app_state`) |
| Task cancellation | **Shipped** (Phase 2) | DB cancel + `GET .../execution-state`; `task_runtime` + `poller.py` cooperative abort |
| Desktop tools (Python) | **Shipped** | `dispatch.py` `desktop_*` handlers; `tools.py` |
| WebRTC streaming | **Shipped** (Phase 2 dispatch) | `dispatch._start_webrtc_from_task` forwards `monitor_index`, `bitrate_kbps`, `fps` (default 30) |
| Vision / SoM | **Shipped** (core) | Per-monitor normalization; mark-id click grounding; synthetic only if `AI_BRIDGE_SOM_SYNTHETIC_FALLBACK` enabled |
| Playwright browser | **Shipped** (Phase 4) | MCP `server.py` + fleet `dispatch._dispatch_browser_tool` |
| Workflows / schedules | **Shipped** | `app.py` workflow routes |
| Custom multi-agent | **Shipped** (Phase 6) | `AgentRunner` + `role_catalog.seed_role_catalog` presets |
| Native C++ agent | **Partial** | `windows-agent` DXGI/MF + libdatachannel PeerConnection; harness E2E verified; fleet default still Python aiortc |
| macOS / Linux agents | **Partial** | `agents/macos/`, `agents/linux/`; macOS import+honesty on `macos-agent` CI |
| Browserbase / You.com / Firecrawl first-party | **Shipped** (deep) | `connectors/browserbase.py`, `you_search.py`, `firecrawl.py`; fleet `dispatch.py` registration |
| Postgres runtime | **Partial** | `render.yaml` + `db.py` dialect; default dev SQLite |
| Prometheus metrics | **Shipped** | `GET /metrics` in `app.py`, `control/metrics.py` |
| OIDC | **Partial** | `control/oidc.py`; activation needs provider env |
| Signed updates | **Partial** | `updates.py`; verify path; install operator-step |

---

## 4. Findings (evidence table)

| ID | Severity | Finding | Evidence |
|----|----------|---------|----------|
| F1 | **P0** | Task cancel does not stop in-flight execution | `cancel_task` only `UPDATE tasks SET status='cancelled'` (`app.py` ~1485–1497); `poller.run_once` runs `dispatch()` to completion with no status poll (`poller.py` ~309–327) |
| F2 | **P0** | Stuck `running` tasks if agent dies mid-task | `next_task` sets `running` on handoff (`app.py` ~4010–4012); **no** background sweeper found (`grep` stale/orphan in `control/`) |
| F3 | **P0** | Remote WebRTC tasks ignore monitor/bitrate; fps defaults 10 *(historical)* | **Fixed** — `_start_webrtc_from_task` now passes `monitor_index` / `bitrate_kbps` and defaults **fps=30** (`dispatch.py`); v1 session create queues full args |
| F4 | **P1** | Browser automation not fleet-dispatchable | `browser_*` in `server.py` + `policy.py`; **zero** `browser` handlers in `dispatch.py` |
| F5 | **P1** | Emergency stop is process-local | `app.state.emergency_stop` (`app.py` ~633, ~1335, ~1878) |
| F6 | **P1** | Human takeover is in-memory dict | `_HUMAN_TAKEOVER_BY_DEVICE` (`v1_routes.py` ~44–70) |
| F7 | **P1** | WebRTC input rate limit per streamer instance | `_check_input_rate_limit` (`webrtc_stream.py` ~481, ~787) |
| F8 | **P1** | Operator veto not wired into dispatch | `desktop_veto_action` / `desktop_is_action_vetoed` (`tools.py`); **not referenced** by `dispatch.py` or desktop tool entrypoints (grep) |
| F9 | **P2** | Default TURN secret fallback | `AI_BRIDGE_TURN_SECRET` default `"aibridge_turn_shared_secret_2026"` (`webrtc_stream.py` ~47); `docker-compose.prod.yml` ~144 |
| F10 | **P2** | Synthetic SoM misleads models when capture fails | `tools.py` ~2095–2128 placeholder elements |
| F11 | **P2** | Desktop audio off by default | **Documented + tested** — `desktop_audio_opt_in()` / `_attach_desktop_audio_if_enabled`; silent PCM until WASAPI; `docs/streaming.md` §2b; tests in `test_phase9_deep.py` |
| F12 | **P2** | Dual API stacks drift | **Closed** — legacy create returns **410** in production (`AI_BRIDGE_ALLOW_LEGACY_WEBRTC` opt-in); dashboard Live Desktop uses `/api/v1/sessions` |
| F13 | **P2** | Architecture doc ahead of verified integration | **Closed (honesty)** — `native_encode` / capability matrix clarify Python `aiortc` vs optional native DLL; C++ PeerConnection dashboard-path harness E2E verified |

**§4 resolution (post Phase 2–9):** F1→`task_runtime`/`poller`; F2→`orchestration.sweep_stale_running_tasks`; F3→`dispatch._start_webrtc_from_task` (fps=30 + monitor/bitrate); F4→`dispatch._dispatch_browser_tool`; F5→`plane_state` DB emergency stop; F6→`plane_state` human takeover persistence; F7→`durable_ratelimit` + WebRTC session keys (Phase 9); F8→`tools.desktop_is_action_vetoed`; F9→prod profile fail-fast in `webrtc_stream.py`; F10→`AI_BRIDGE_SOM_SYNTHETIC_FALLBACK`. **F11** documented + unit-tested (opt-in audio, silent frames); **F12** prod 410 + dashboard v1; **F13** native_encode honesty + C++ PeerConnection harness E2E.

---

## 5. Doc / code drift

| Document | Claim | Code reality | Action (Phase 2+ doc) |
|----------|-------|--------------|------------------------|
| `docs/implementation-status.md` | Windows/macOS **not executed** on target OS | Still accurate for **this CI host**; Windows Python agent + installer exist (`deployment/windows/`, `agents/windows/`) | Clarify “verified on Windows host” vs “code present” |
| `docs/implementation-status.md` | Silent auto-install **not** implemented | Consistent with `updates.py` operator-step model | Keep |
| `docs/architecture.md` | C++ agent is primary desktop stack | Python `screen_capture` + `webrtc_stream` path is what fleet dispatch uses; C++ in `windows-agent/` | Label C++ as **optional native acceleration** until wired to poller |
| `docs/streaming.md` | Env vars `AI_BRIDGE_WEBRTC_STUN_URLS` / `TURN_URLS` | **Aligned** — §2 lists `AI_BRIDGE_ICE_SERVERS`, `AI_BRIDGE_TURN_URL` / `TURN_USERNAME` / `TURN_CREDENTIAL`, `AI_BRIDGE_TURN_HOST` + `AI_BRIDGE_TURN_SECRET` matching `get_configured_ice_servers` | Keep in sync |
| `docs/streaming.md` | 30 FPS default + F11 audio | **Aligned** — dispatch fps=30; §2b documents `AI_BRIDGE_DESKTOP_AUDIO` default-off | Keep in sync with `webrtc_stream.py` |
| `docs/ROADMAP.md` | Milestone 4 Windows “NOT executed” | Align with advanced roadmap verification matrix | Linked from short roadmap |

---

## 6. Advanced roadmap — Phases 2–8

### Phase 2 — Orchestration reliability & API hygiene

**Status: SHIPPED** (2026-11-14) — `src/ai_bridge/control/task_runtime.py`, `orchestration.py`, `agents/common/poller.py`, `dispatch.py`, `app.py` (lease + execution-state route). Tests: `test_orchestration_phases.py` (cancel, sweeper, WebRTC args, lease).

**Goals:** Trustworthy task lifecycle; fewer stuck/orphan states; reduce `/api` vs `/api/v1` duplication for sessions/tasks.

**Prerequisites:** None beyond current plane DB.

| Work item | Module touchpoints | Acceptance evidence |
|-----------|-------------------|---------------------|
| Cooperative cancel / timeout | `poller.py`, `app.py` cancel, optional `execution.py` hooks | Agent aborts long `run_shell`/`dispatch` when task → `cancelled`; integration test |
| Stale `running` reaper | New scheduler in `app.py` or `custom_agents` tick | Tasks `running` > N minutes → `timed_out` or `queued`; metric + test |
| Per-device concurrency lease | `next_task`, DB column or lease table | Second task not handed off while lease held |
| Unify WebRTC queue args | `dispatch._start_webrtc_from_task`, `_queue_webrtc_task` | Remote agent receives `monitor_index`, `bitrate_kbps`, requested `fps` |
| Deprecation table for legacy session routes | `app.py`, dashboard API client | Dashboard uses v1; legacy routes documented deprecated | **Partial** — code paths coexist; doc drift item in §5 |

**Risks:** Cancel requires thread/process awareness for blocking tools; multi-worker emergency stop needs Redis/DB flag (Phase 8). **Mitigated:** DB-backed emergency stop (Phase 7); cooperative cancel via `task_runtime` for dispatch path.

---

### Phase 3 — Trustworthy desktop autonomy

**Status: SHIPPED** (deep) — veto + `intent_id` on `perform_approved_ui_action`, `desktop_click`, `click_element`, `desktop_verify_action`; per-monitor SoM normalization; cached mark-id grounding; closed-loop verify with post-action screenshot; runtime fps/bitrate applied to `ScreenTrack`; `switch_monitor` syncs track + telemetry; Linux/macOS `available`/`reason` honesty; optional native H.264 encode timing via `ai_bridge_native.dll` (PyAV path unchanged).

**Goals:** Grounding and veto that actually block automation; honest multi-monitor SoM; platform honesty.

| Work item | Modules | Acceptance |
|-----------|---------|------------|
| Wire veto into desktop tool path | `tools.py`, `dispatch.py`, `webrtc_stream.py` DataChannel | **Done** — veto on UI actions + verify |
| Remove or flag synthetic SoM | `tools.py` | **Done** — explicit error unless `AI_BRIDGE_SOM_SYNTHETIC_FALLBACK=1` |
| Multi-monitor SoM normalization | `tools.py`, `screen_capture.py` | **Done** — `normalize_bounds_for_monitor`, `monitor_index` filter |
| Pass monitor index end-to-end | `dispatch.py`, `webrtc_stream.py`, `screen_capture.py` | **Done** (Phase 2 stream + Phase 3 SoM/input) |
| Trustworthy mark click | `tools.py` | **Done** — `click_element` → cached SoM before OCR |
| Closed-loop verify | `tools.py`, `dispatch.py` | **Done** — `wait_seconds`, `capture_after`, `intent_id` |
| ABR fps on frame timing | `webrtc_stream.py` | **Done** — `apply_stream_params` on quality update |
| Linux/macOS capability matrix | `tools.get_desktop_status` | **Done** — `stream_available`/`ocr_available`/`reason` |
| Native encode bridge optional | `webrtc_stream.py`, `screen_capture.py` | **Partial** — bitrate hook + encode smoke; full native WebRTC path still unverified E2E |

---

### Phase 4 — Fleet browser & external research

**Status: SHIPPED** (deep) — Full `browser_*` fleet dispatch with `browser_session_info`, env `AI_BRIDGE_BROWSER_NAV_TIMEOUT_SEC`, optional `screenshot_after_nav`, clearer `BrowserToolError` messages; first-party `connectors/firecrawl.py` (`firecrawl_scrape|search|map_site`); `browserbase_navigate` via Playwright CDP; policy tiers on all connector tools. Tests: `tests/unit/test_phases_456_deep.py`.

**Goals:** Playwright on dispatched tasks; optional cloud browser; first-class research connectors.

| Work item | Modules | Acceptance |
|-----------|---------|------------|
| Register `browser_*` in `dispatch.py` | `browser_tools.py`, `policy.py` | Task `browser_navigate` runs on agent with `[browser]` extra |
| Browser sandbox policy | `policy.py`, agent env | Deny by default; approval for evaluate |
| Browserbase connector (new) | `connectors/` pattern | Config + MCP or dispatch tool | **SHIPPED** module `connectors/browserbase.py` (env-gated) |
| Firecrawl/You.com beyond template | `mcp_routes.py` → dedicated connector modules | Same audit/rate-limit as internal tools |

**Prerequisites:** Phase 2 concurrency + cancel for long browser sessions.

---

### Phase 5 — Repo-aware builder agents

**Status: SHIPPED** (deep) — `dev_workspace_plan`, `workspace_project_structure`, `git_apply_patch`, `run_project_tests_structured` on dispatch + MCP (`dev_workspace_plan`, `browser_session_info`); Developer custom-agent system prompt cites git/test workflow. Tests: `test_dev_workspace_plan_and_structure`, `test_run_project_tests_structured_parses_summary`.

**Goals:** Safer git/test/edit loops for “developer” style custom agents.

| Work item | Modules | Acceptance |
|-----------|---------|------------|
| Extend workspace/git tools in delegate loops | `custom_agents.py`, `workspace.py`, `git_ops.py` | Custom agent runs tests with policy-bound command allowlist |
| PR/checkpoint workflow tool | `git_ops.py`, `app.py` workflows | Documented recipe; no new framework required |

---

### Phase 6 — Role catalog on shared task system

**Status: SHIPPED** (deep) — `control/supervisor.py` (`enqueue_role_task`, `run_supervisor_handoff_enqueue`, `recover_failed_role_tasks`, `supervisor_delegate_role` dispatch tool); `agent_delegate` accepts `role`; seeded workflow `role-handoff-supervisor-planner-developer`. Tests: `test_supervisor_handoff_enqueue_role_tags`, `test_recover_failed_role_tasks`, `test_role_catalog_handoff_template_seed`.

**Goals:** Named roles (Supervisor, Planner, Researcher, Developer, Computer, Browser, Tester, Security, Recovery) as **custom agent presets** + workflow templates, not new orchestration kernel.

| Work item | Modules | Acceptance |
|-----------|---------|------------|
| Role template JSON | `workflow_templates` seed, docs | Each role maps to tool allowlist + `agent_delegate` targets |
| Supervisor policy | `custom_agents.py` | One agent can pause others via `enabled` + audit |
| Researcher | MCP + `mcp_routes` | Uses external MCP with policy simulation |

**Note (Phase 1):** Grep showed **no** `Supervisor`/`Planner` symbols in `src/` — **superseded** by `role_catalog.ROLES` + seeded `custom_agents` rows.

---

### Phase 7 — Durable memory, health, live activity

**Status: SHIPPED** (deep) — `plane_state.py`, `migrations/011_orchestration_plane_state.sql`, `agent_memory.py` (project/task tags + `/api/agents/{id}/memory/chunks`), `fleet_health.py` + `GET /api/fleet/health`, `live_activity.py` (role-tagged tasks, running agents, recent failures) on `/api/activity/live` + SSE; Prometheus `aibridge_stale_heartbeat_devices` + `aibridge_advanced_phase_depth`; dashboard **Live fleet pulse** on `LiveControlView`.

**Goals:** Survive restarts; fleet health beyond demo metrics.

| Work item | Modules | Acceptance |
|-----------|---------|------------|
| Persist human takeover + emergency stop | DB tables, `v1_routes.py`, `app.py` | Restart plane → state restored | **Done** |
| Agent memory export | `custom_agents` `memory` column + chunks | Backup/restore in tenant export | **Done** — tagged chunk query |
| Device health SLO view | `metrics.py`, dashboard | Stale heartbeat alert | **Done** — `/api/fleet/health` + Live pulse |
| Live activity stream | `live_activity.py`, `app.py` SSE | Operator sees active tools per device | **Done** — roles, agents, failures |

---

### Phase 8 — Security, sandbox, audit completeness, load gates

**Status: SHIPPED** (deep) — `production_readiness.py` fail-closed `/health/ready` when `AI_BRIDGE_PROFILE=production`: TURN/ICE, **admin token**, **anon MCP blocked**, **https public URL** (`AI_BRIDGE_PUBLIC_BASE_URL` or alias `AI_BRIDGE_PUBLIC_URL`), **browser sandbox** (or explicit `AI_BRIDGE_ALLOW_UNSAFE_BROWSER`), durable emergency stop; unauthenticated 503 returns `{ok,status,codes}` only — full checklist on operator `GET /health/production-checklist`; Playwright Chromium sandbox + isolated profile; durable audit `prev_hash`/`entry_hash`; broadened `dispatch_audit.py` (sensitive tiers + supervisor/shell/desktop mutators); operator auth on fleet health/frames and production `/metrics`; `security.redact` / `refuse_device_token_log`; concurrent claim+cancel load smoke in `test_phase8_deep.py`.

**Goals:** Production-grade authz, secrets, browser isolation, stress coverage.

| Work item | Modules | Acceptance |
|-----------|---------|------------|
| Remove default TURN secret in prod | `webrtc_stream.py`, `production_readiness.py` | Fail fast if secret unset in prod profile | **Done** |
| Durable emergency stop | DB + poll check in `poller.py` | All workers respect stop | **Done** (Phase 7; verified in readiness checklist) |
| Browser isolation | `browser_tools.py`, `browser_isolation_os.py` | Sandbox + isolated user-data dir; optional Linux netns/gVisor | **Done** (Playwright + env-gated OS wrappers) |
| Load/stress CI gate | `tests/unit/test_phase8_deep.py`, `scripts/k6/`, `scripts/locust/` | Concurrent claim + cancel smoke + cluster soak scripts | **Done** (unit smoke + k6/locust harnesses) |
| Authz hardening | `app.py` fleet/supervisor routes | Operator+ on sensitive fleet views | **Done** |
| Audit completeness | `dispatch_audit.py`, supervisor API | Connector + handoff in audit | **Done** |

### Phase 9 — Platform hardening & parity

**Status: SHIPPED** (deep; residual above) — 2026-11-14 on branch `d9671a6` + Phase 9 delta.

**Goals:** Close multi-worker parity gaps without a native libwebrtc rewrite; honest cross-OS matrix; stricter optional browser isolation.

| Work item | Modules | Acceptance |
|-----------|---------|------------|
| Durable rate limits (HTTP + WebRTC input) | `durable_ratelimit.py`, `app.py` middleware, `webrtc_stream.py` | Redis → DB settings → memory; shared WebRTC key per session |
| Emergency stop parity | `plane_state.refresh_emergency_stop`, `plane_control_flags.py`, `poller.py`, `webrtc_stream.py` | Agents mirror stop; WebRTC input blocked; workers re-read DB ≤1s |
| Native encode honesty | `native_encode.py`, `webrtc_stream.py`, `dispatch.py` | `AI_BRIDGE_NATIVE_ENCODE`; `get_native_encode_status`; telemetry `native_encode_timing` |
| Browser hard isolation | `browser_tools.py`, `docs/security.md` | `AI_BRIDGE_BROWSER_HARD_ISOLATION`, optional network lockdown flags + limitation docs |
| Cross-OS capability endpoint | `desktop_capabilities.py`, `GET /api/fleet/desktop-capabilities` | Static Win/Linux/macOS matrix + live host status |
| Legacy API hygiene | `app.py` legacy WebRTC session route | `Deprecation` + `Link` to `/api/v1/sessions` |
| Human takeover DB fallback | `v1_routes.bind_control_connection`, `plane_state.is_human_takeover_active` | MCP desktop path sees DB takeover without in-process cache |
| Metrics | `metrics.py` | `aibridge_advanced_phase_depth{phase="9"}=2` |

**Residual (out-of-repo):** native C++ libwebrtc E2E; macOS on-target CI; Linux netns browser egress; Redis-required multi-host WebRTC throttle. (In-repo: dashboard prefers `/api/v1/sessions`; legacy routes still serve with `Deprecation` headers.)

---

## 7. Priority order (P0 / P1 / P2)

**Original Phase 1 queue (for audit traceability):**

| Item | Finding | Post Phase 2–8 |
|------|---------|------------------|
| P0 | F1 cancel | **Done** — `task_runtime`, poller execution-state |
| P0 | F2 stale running | **Done** — `orchestration.sweep_stale_running_tasks` |
| P0 | F3 WebRTC args | **Done** — `dispatch._start_webrtc_from_task` |
| P1 | F4 browser dispatch | **Done** — `dispatch._dispatch_browser_tool` |
| P1 | F5/F6 stop/takeover | **Done** (Phase 9 deepens) — DB + `refresh_emergency_stop`; takeover DB fallback via `bind_control_connection` |
| P1 | F8 veto | **Done** — `tools.py` desktop path |
| P1 | F7 rate limits | **Done** (Phase 9) — `durable_ratelimit` + WebRTC session keys |
| P2 | F9 TURN | **Done** — prod fail-fast |
| P2 | F10 SoM | **Done** — opt-in synthetic |
| P2 | F11–F13 | **F11 done** (documented + `test_phase9_deep` audio gate/silent PCM); **F12 partial** (Deprecation + dashboard v1); **F13 honesty** (`native_encode` / capabilities; C++ E2E residual) |

---

## 8. Verification appendix

### Phase 1 baseline (historical)

| Claim | Method | Paths / tests |
|-------|--------|----------------|
| Cancel does not interrupt agent | Read poller + cancel route | **Superseded** — execution-state + `task_runtime` |
| No stale running sweeper | Repo grep | **Superseded** — `orchestration.py` |
| WebRTC dispatch arg drop | Compare v1 vs dispatch | **Superseded** — `dispatch.py` ~24–42 |
| Browser not in dispatch | Grep `browser` in `dispatch.py` | **Superseded** — `_dispatch_browser_tool` |
| MCP tool count ~95 | Count `@mcp.tool` | `server.py` → 95 |
| TURN default secret | Read `generate_ephemeral_turn_credentials` | `webrtc_stream.py` ~46–48, `docker-compose.prod.yml` |
| Synthetic SoM | Read fallback block | `tools.py` ~2095–2128 |
| Emergency stop in-process | Read `app.state.emergency_stop` | `app.py` |
| Human takeover in-process | Read module dict | `v1_routes.py` ~44–70 |
| AgentRunner exists | Read class | `custom_agents.py` ~681+ |
| Veto not on dispatch | Grep `desktop_is_action_vetoed` | **Superseded** — used in `tools.py` ~606+; `desktop_veto_action` in `dispatch.py` |
| Windows P0–P2 regressions | Unit tests | `tests/unit/test_windows_p0_p2_gaps.py` |
| Render dual service | Read blueprint | `render.yaml` |
| C++ agent scope | File listing | `windows-agent/src/capture`, `encoder`, `webrtc` |

**Unverified in this pass (honest unknowns):**

- End-to-end **native C++ agent** streaming with production dashboard (code present, not exercised on Windows in this environment).  
- **Live MCP-over-HTTP** round-trip in CI (`implementation-status.md` note).  
- **Windows-on-Windows** full installer + service run.  
- **Postgres** multi-worker concurrency under load on Render.

---

### Post Phase 2–8 regression suite

Run: `pytest tests/unit/test_orchestration_phases.py tests/unit/test_phases_456_deep.py -q`

| Test | Phase |
|------|-------|
| `test_webrtc_task_dispatch_passes_monitor_and_bitrate` | 2 |
| `test_stale_running_task_sweeper_requeues` | 2 |
| `test_per_device_concurrency_lease_blocks_second_task` | 2 |
| `test_execution_state_reflects_cancel`, `test_task_runtime_cancel_interrupts_dispatch` | 2 |
| `test_dispatch_registers_browser_navigate` | 4 |
| `test_phases_456_deep.py` (connectors, dev plan, supervisor handoff) | 4–6 |
| `test_role_catalog_seed_idempotent` | 6 |
| `test_phase7_deep.py`, `test_emergency_stop_durable_across_app_state`, `test_agent_memory_chunks` | 7 |
| `test_turn_secret_required_in_prod_profile`, `test_orchestration_load_smoke` | 8 |
| `test_phase9_deep.py` (rate limit, emergency stop, native encode, browser isolation, capabilities) | 9 |

Run Phase 9 focused: `pytest tests/unit/test_phase9_deep.py -q`

*Phase 1 deliverable preserved for audit traceability. Phases 2–9 implementation complete per §Implementation status and regression suite above.*