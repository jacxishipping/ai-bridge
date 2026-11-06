# Security & Permissions Model (`docs/security.md`)

## 1. Local Agent Security & Secret Storage
- **DPAPI Secret Protection**: On Windows, device tokens and local secrets are encrypted at rest using Windows Data Protection API (`CryptProtectData` / `CryptUnprotectData` in `windows-agent/src/security/local_security.cpp`).
- **ACL-Restricted Named Pipe IPC**: Communication between the Session 0 Windows Service (`ai_bridge_service.exe`) and the Interactive Desktop Agent (`ai_bridge_desktop.exe`) uses `\\.\pipe\AIBridgeDesktopPipe` with a strict SDDL security descriptor (`D:(A;;GA;;;SY)(A;;GA;;;BA)(A;;GRGW;;;AU)`) and per-message HMAC-SHA256 authentication tags (`shared/protocols/named_pipe_protocol.json`).
- **UIPI & Secure Desktop Compliance**: The agent respects Windows User Interface Privilege Isolation (UIPI) and never attempts to spoof or bypass UAC or Secure Desktop (`Winlogon`) prompts.

## 2. Server-Side Session Permissions
Session permissions are derived **exclusively on the backend** (`src/ai_bridge/control/v1_routes.py` and `shared/permissions/permissions_matrix.json`) from:
1. Authenticated user role (`viewer`, `operator`, `admin`)
2. Device policy (`desktop_enabled`, `allow_tier3`)
3. Active session mode (`view_only`, `human_control`, `ai_assisted`)

| Permission Flag | `view_only` | `human_control` | `ai_assisted` |
| :--- | :---: | :---: | :---: |
| `can_view_screen` | Yes | Yes | Yes |
| `can_send_mouse` | No | Operator/Admin | Operator/Admin |
| `can_send_keyboard` | No | Operator/Admin | Operator/Admin |
| `can_let_ai_control` | No | No (Suppressed) | Operator/Admin |
| `can_run_commands` | No | Admin + Tier3 Policy | Admin + Tier3 Policy |
| `can_transfer_files` | No | Operator/Admin | Operator/Admin |

**Critical Invariant**: Screen-view permission (`can_view_screen`) **never** automatically grants command execution (`can_run_commands`).

## 3. Human Takeover & AI Action Safety
- **Immediate Human Takeover**: Switching a session to `human_control` (or engaging Operator Takeover in the dashboard) sets `_HUMAN_TAKEOVER_STATE[device_id]["active"] = True`.
- **AI Input Revocation**: All mutating `desktop_*` MCP tools (`desktop_mouse_move`, `desktop_click`, `desktop_keyboard`, `desktop_scroll`, `desktop_open_application`) check `_require_no_human_takeover()` before executing and immediately return `{ "ok": false, "error": "human_takeover_active" }` when a human operator has taken control.
- **Disconnect Key-Release Safety**: Whenever a WebRTC session or input DataChannel disconnects, `release_all_held_keys()` immediately synthesizes `KEYEVENTF_KEYUP` / mouse-button-up events for all pressed keys so the remote machine is never left with stuck modifier keys.

## 4. Risk Tiers, Approvals, and Audit Logging
- **Risk Tiers**:
  - Tier 1: Read-only (`desktop_get_screenshot`, `desktop_get_status`, `desktop_get_windows`, `desktop_wait`, `desktop_verify_action`).
  - Tier 2: Low-risk confined workspace writes.
  - Tier 3: Interactive desktop input & process launch (`desktop_mouse_move`, `desktop_click`, `desktop_keyboard`, `desktop_scroll`, `desktop_open_application`, `desktop_execute_command`).
  - Tier 4: High-risk system mutations (always require explicit human approval).
- **Append-Only Audit Trail**: Every session creation, mode transition, human takeover, policy change, and MCP tool execution is recorded in `/api/v1/audit` with redacted payloads.
