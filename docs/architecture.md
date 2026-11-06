# AI Bridge Architecture (v1.0 & v2.0)

```
Browser Dashboard (React / TypeScript / WebRTC)
        │
        │  HTTPS / WebSocket (/api/v1/ws/sessions/{id}) / WebRTC (H.264 + DataChannel)
        ▼
AI Bridge Backend (FastAPI + FastMCP)
  ├── Authentication & Session Manager (/api/v1/sessions)
  ├── Device Registry & Heartbeat (/api/v1/devices, /api/v1/agents/{id}/heartbeat)
  ├── WebRTC Signaling & STUN/TURN Relay Coordination
  ├── Policy Engine & Audit Logging (/api/v1/policies, /api/v1/audit)
  └── MCP Computer-Use Gateway (desktop_* tools + TaskRunner)
        │
        │  Authenticated Agent Connection + WebRTC Media / Input Transport
        ▼
Windows Agent (windows-agent/ C++20)
  ├── Process A: Windows Service (Session 0 — ai_bridge_service.exe)
  │     └── Outbound Heartbeat, System Monitoring, Multi-Session Tracking
  │     └── ACL-Restricted Named Pipe (\\.\pipe\AIBridgeDesktopPipe)
  └── Process B: Interactive Desktop Agent (User Session — ai_bridge_desktop.exe)
        ├── DXGI Desktop Duplication / Window Capture (PrintWindow RenderFullContent)
        ├── Media Foundation H.264 Encoder (NVENC / QSV / AMF / Software Fallback)
        ├── Dynamic Adaptive Bitrate Adaptation & Multi-Monitor Switching
        ├── WebRTC Video Track + RTCDataChannel("input") + Clipboard Synchronization
        └── Windows SendInput Controller (Per-Monitor DPI v2 + Key-Release Safety)
```

## Core Architectural Principle
Separate **video transport**, **input transport**, **AI execution**, and **device management**. They share authentication and session identity (`session_id`, `device_id`, `user_id`), but do not depend on one another to function:
- **Video Transport**: DXGI Desktop Duplication / Window Capture -> GPU Texture -> H.264 Encoder with Dynamic Bitrate Adaptation -> WebRTC Video Track -> Browser `<video>` element.
- **Input Transport**: Browser DOM events -> WebRTC DataChannel (`input`) -> Windows `SendInput` API with normalized `[0.0, 1.0]` and multi-monitor virtual desktop coordinate transformation.
- **AI Execution**: MCP Gateway (`desktop_*` tools) -> Policy Engine -> Session Arbiter (respects Human Takeover) -> Target Agent.
- **Device Management**: Outbound agent heartbeat -> Device Registry -> System Telemetry (CPU, RAM, disk, active interactive sessions, encoder health).
- **Clipboard Transport**: Bidirectional clipboard synchronization across WebRTC DataChannel and REST endpoints (`desktop_clipboard_get`, `desktop_clipboard_set`).

## Key Design Decisions
- No `run_any_command`. Every executable operation is an allowlisted, argument-array task with timeout, output cap, and cancellation.
- Policy is a frozen, admin-owned object. Tool arguments cannot widen it.
- Server-side session permissions (`can_view_screen`, `can_send_mouse`, `can_send_keyboard`, `can_ let_ai_control`, `can_run_commands`, `can_transfer_files`) are derived strictly on the backend from user role, device policy, and session mode (`view_only`, `human_control`, `ai_assisted`).
- **Screen-view permission never automatically grants command execution.**
- **Human Takeover Priority**: When a human operator activates takeover (`human_control` or `human_takeover=true`), AI input (`desktop_mouse_move`, `desktop_click`, `desktop_keyboard`, `desktop_scroll`, `desktop_open_application`) is immediately revoked until control is explicitly handed back.
- All consequential writes take a backup first (delete is always recoverable from `.ai-bridge-backups/` until the admin cleans it).

## Module Map
- `shared/schemas/session.schema.json` — Canonical session data model & permission schema.
- `shared/protocols/input_protocol.json` — WebRTC DataChannel (`input`) protocol specification.
- `shared/protocols/named_pipe_protocol.json` — Local Windows Service <-> Desktop Agent Named Pipe IPC schema.
- `shared/permissions/permissions_matrix.json` — Role/mode permission derivation matrix.
- `windows-agent/` — Native C++20 Windows Agent (`ai_bridge_service.exe`, `ai_bridge_desktop.exe`, `ai_bridge_native.dll`, `ai_bridge_tests.exe`).
- `src/ai_bridge/config.py` — Environment-driven settings.
- `src/ai_bridge/security.py` — Confinement, secret-name blocking, redaction.
- `src/ai_bridge/workspace.py` — Confined file ops, atomic writes, backups.
- `src/ai_bridge/diagnostics.py` — Read-only system/docker/process/log probes.
- `src/ai_bridge/policy.py` — Risk tiers + server-side policy decisions.
- `src/ai_bridge/execution.py` — Bounded task runner, process-group kill.
- `src/ai_bridge/screen_capture.py` — Native C++ DXGI bridge (`ai_bridge_native.dll`) with `bettercam`, Win32 `BitBlt`, and PIL fallbacks.
- `src/ai_bridge/webrtc_stream.py` — WebRTC H.264 1080p@30fps streaming, STUN/TURN configuration, stage latency telemetry, and input DataChannel dispatch.
- `src/ai_bridge/tools.py` — Shared tool implementations including the 11 canonical `desktop_*` computer-use tools.
- `src/ai_bridge/server.py` — MCP server (stdio + Streamable HTTP).
- `src/ai_bridge/control/` — FastAPI control plane (`/api/*` and `/api/v1/*` routes).
- `apps/dashboard/` — React/TypeScript enterprise dashboard with live WebRTC `<video>` viewer, DataChannel input, and real-time telemetry HUD.
