# Security & Permissions Model (`docs/security.md`)

## 1. Local Agent Security & Secret Storage
- **DPAPI Secret Protection**: On Windows, device tokens and local secrets are encrypted at rest using Windows Data Protection API (`CryptProtectData` / `CryptUnprotectData` in `windows-agent/src/security/local_security.cpp`).
- **ACL-Restricted Named Pipe IPC**: Communication between the Session 0 Windows Service (`ai_bridge_service.exe`) and the Interactive Desktop Agent (`ai_bridge_desktop.exe`) uses `\\.\pipe\AIBridgeDesktopPipe` with a strict SDDL security descriptor (`D:(A;;GA;;;SY)(A;;GA;;;BA)(A;;GRGW;;;AU)`) and per-message HMAC-SHA256 authentication tags (`shared/protocols/named_pipe_protocol.json`).
- **UIPI & Secure Desktop Compliance**: The agent respects Windows User Interface Privilege Isolation (UIPI) and never attempts to spoof or bypass UAC or Secure Desktop (`Winlogon`) prompts.

## 2. Server-Side Session Permissions
Session permissions are derived **exclusively on the backend** (`src/ai_bridge/control/v1_routes.py` and `shared/permissions/permissions_matrix.json`) from:
1. Authenticated user role (`viewer`, `operator`, `admin`)
2. Device policy (`desktop_enabled`, `allow_tier3`, `allow_clipboard`, `allow_shell`)
3. Active session mode (`view_only`, `human_control`, `ai_assisted`)

| Permission Flag | `view_only` | `human_control` | `ai_assisted` |
| :--- | :---: | :---: | :---: |
| `can_view_screen` | Yes | Yes | Yes |
| `can_send_mouse` | No | Operator/Admin | Operator/Admin |
| `can_send_keyboard` | No | Operator/Admin | Operator/Admin |
| `clipboard_sync` | No | Only with `allow_clipboard` | Only with `allow_clipboard` |
| `can_let_ai_control` | No | No (Suppressed) | Operator/Admin |
| `can_run_commands` | No | Admin + Tier3 Policy | Admin + Tier3 Policy |
| `can_transfer_files` | No | Operator/Admin | Operator/Admin |

**Critical Invariant**: Screen-view permission (`can_view_screen`) **never** automatically grants command execution (`can_run_commands`). Desktop input also **never** automatically grants `clipboard_sync` — set policy `allow_clipboard` (or `AI_BRIDGE_ALLOW_CLIPBOARD=1`).

## 2b. Signed updates (verify + optional apply)
- Agents verify Ed25519-signed release manifests before trusting any download (`python -m ai_bridge.updates` / `agent_main.py --check-update`).
- Silent apply (`--apply-update`) requires `AI_BRIDGE_ALLOW_AUTO_UPDATE=1`, re-checks SHA-256 after download, and stages into the install root without auto-restart.
- Windows release builds should set `AIBRIDGE_REQUIRE_SIGN=1` so Authenticode-unsigned `AIBridge-*.exe` artifacts fail the build.

## 3. Human Takeover & AI Action Safety
- **Immediate Human Takeover**: Switching a session to `human_control` (or engaging Operator Takeover in the dashboard) sets `_HUMAN_TAKEOVER_STATE[device_id]["active"] = True`.
- **AI Input Revocation**: All mutating `desktop_*` MCP tools (`desktop_mouse_move`, `desktop_click`, `desktop_keyboard`, `desktop_scroll`, `desktop_open_application`) check `_require_no_human_takeover()` before executing and immediately return `{ "ok": false, "error": "human_takeover_active" }` when a human operator has taken control.
- **Disconnect Key-Release Safety**: Whenever a WebRTC session or input DataChannel disconnects, `release_all_held_keys()` immediately synthesizes `KEYEVENTF_KEYUP` / mouse-button-up events for all pressed keys so the remote machine is never left with stuck modifier keys.

## 4. Secret environment variables (control plane & agents)

Set these via the host environment or Render env groups — never commit them to the workspace.

| Variable | Purpose |
| :--- | :--- |
| `AI_BRIDGE_ADMIN_TOKEN` | Legacy admin bearer (**critical** in production readiness; also signs quick-approval HMAC) |
| `AI_BRIDGE_PUBLIC_BASE_URL` | Public https:// origin (http:// fails production readiness) |
| `AI_BRIDGE_DEVICE_TOKEN` | Agent enrollment secret (per device; rotate via `/api/agent/rotate`) |
| `AI_BRIDGE_TURN_SECRET` | HMAC secret for ephemeral TURN credentials (`webrtc_stream.py`) |
| `AI_BRIDGE_TURN_URL` / `AI_BRIDGE_TURN_USERNAME` / `AI_BRIDGE_TURN_CREDENTIAL` | Static TURN ICE entry (alternative to ephemeral secret) |
| `AI_BRIDGE_ICE_SERVERS` | JSON array override for WebRTC ICE servers |
| `AI_BRIDGE_FIRECRAWL_API_KEY` | Firecrawl connector |
| `AI_BRIDGE_BROWSERBASE_API_KEY` | Browserbase connector |
| `AI_BRIDGE_YOU_API_KEY` / `YOU_API_KEY` | You.com search connector |
| `AI_BRIDGE_PROFILE` | Set to `production` to enable fail-closed deploy gates (`/health/ready`) |
| `AI_BRIDGE_HTTP_ALLOW_ANON` | Must not be `1` in production (blocks readiness) |
| `AI_BRIDGE_ALLOW_UNSAFE_BROWSER` | Explicit ack when Chromium sandbox is disabled in production |
| `AI_BRIDGE_OIDC_*` | Enables in-tree OIDC login (`/api/auth/oidc/*`) when provider env is set |

Logs and audit entries pass through `security.redact()`; device tokens are stripped from structured JSON logs. Playwright uses an isolated profile under `{workspace}/.ai-bridge/browser-profiles/` unless `AI_BRIDGE_ALLOW_BROWSER_NO_SANDBOX=1` (Docker/CI only). TLS for the control plane terminates at the reverse proxy; device mTLS is optional at that proxy layer (not plane-native).

### Browser hard isolation (Phase 9)

| Variable | Purpose |
| :--- | :--- |
| `AI_BRIDGE_BROWSER_HARD_ISOLATION` | Extra Chromium flags (incognito, no extensions/sync). Still a Playwright child process — not a separate agent worker. |
| `AI_BRIDGE_BROWSER_NETWORK_LOCKDOWN` | Chromium `--host-resolver-rules` only; not a host firewall or Linux netns. |

Control-plane HTTP rate limits use `durable_ratelimit` (Redis → settings table → in-memory). WebRTC input rate limits share the same Redis/memory path via `AI_BRIDGE_WEBRTC_INPUT_RPS` (default 250/s per session key).

Native encode: `AI_BRIDGE_NATIVE_ENCODE` (`off` | `auto` | `prefer` | `required`) gates optional `ai_bridge_native.dll` H.264 timing smoke only — the shipping WebRTC track remains PyAV/aiortc unless a future native libwebrtc path is wired.

## 5. Risk Tiers, Approvals, and Audit Logging
- **Risk Tiers**:
  - Tier 1: Read-only (`desktop_get_screenshot`, `desktop_get_status`, `desktop_get_windows`, `desktop_wait`, `desktop_verify_action`).
  - Tier 2: Low-risk confined workspace writes.
  - Tier 3: Interactive desktop input & process launch (`desktop_mouse_move`, `desktop_click`, `desktop_keyboard`, `desktop_scroll`, `desktop_open_application`, `desktop_execute_command`).
  - Tier 4: High-risk system mutations (always require explicit human approval).
- **Append-Only Audit Trail**: Every session creation, mode transition, human takeover, policy change, and MCP tool execution is recorded in `/api/v1/audit` (and control-plane `/api/audit`) with redacted payloads. New audit rows persist `prev_hash` / `entry_hash` for a durable integrity chain. Sensitive dispatch tools (≥ tier 3, supervisor, desktop/shell mutators, connectors) also emit dispatch-time audit via `dispatch_audit.py`.
- **Production readiness**: `GET /health/ready` fails closed in production when TURN/ICE, admin token, anon-MCP, http public URL, or unsafe browser sandbox issues are critical. Full checklist is operator-only at `GET /health/production-checklist`.
