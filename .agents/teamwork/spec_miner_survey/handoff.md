# AI Bridge Enterprise Dashboard — Specification Mining & Architectural Blueprint

**Document**: `handoff.md`  
**Author**: `teamwork_spec_miner` (Survey Milestone)  
**Target Recipient**: Orchestrator Agent (`0a428dbe-0d00-4ad4-bd56-07d8e773e800`)  
**Workspace**: `c:\Users\Administrator\Documents\GitHub\ai-bridge\.agents\teamwork\spec_miner_survey\`  
**Timestamp**: 2026-11-02T23:05:00Z  

---

## 1. Observation

### 1.1 Specification Sources Probed
1. **`apps/dashboard/DASHBOARD_DESIGN_SPEC.md`** (409 lines): Authoritative functional specification defining global shell navigation, 15 individual operational screens (Screen 0 through Screen 14), JXUI component selection guidelines, UI/UX anti-patterns, risk-tier hierarchy, and interactive controls inventory.
2. **`apps/dashboard/stitch_design_system_implementation/design.md`** (661 lines): JXUI Design System framework manual covering 18 component categories, 361 component primitives, tactile glassmorphism, zero-shift layout geometry, and token contracts.
3. **`apps/dashboard/stitch_design_system_implementation/tactile_specular_engineered/DESIGN.md`** (288 lines): Visual design foundation covering chromatic surfaces, typography tokens (`Plus Jakarta Sans` and `JetBrains Mono`), elevation levels (`jx-elevation-1`, `jx-elevation-2`), and border-box specular highlights.
4. **12 Reference Screen Implementations in `apps/dashboard/stitch_design_system_implementation/`**:
   - `ai_bridge_enrolled_devices/code.html` (520 lines)
   - `ai_bridge_device_360_system_dashboard/code.html` (550 lines)
   - `ai_bridge_task_queue_vision_inspector/code.html` (680 lines)
   - `ai_bridge_live_desktop_studio_dual_control/code.html` (660 lines)
   - `ai_bridge_interactive_live_terminal/code.html` (460 lines)
   - `ai_bridge_autonomous_workflows_multi_turn_plans/code.html` (580 lines)
   - `ai_bridge_fleet_operations_self_healing_hub/code.html` (590 lines)
   - `ai_bridge_ai_api_custom_agents_hub/code.html` (510 lines)
   - `ai_bridge_human_in_the_loop_approvals/code.html` (640 lines)
   - `ai_bridge_security_policies_webhooks/code.html` (620 lines)
   - `ai_bridge_append_only_audit_trail/code.html` (530 lines)
   - `ai_bridge_mcp_oauth_connections/code.html` (816 lines)
   - `ai_bridge_diagnostics_logs/code.html` (432 lines)

---

### 1.2 Design Foundation & Token Contracts
- **Surface Luminance Tokens**:
  - `surface-canvas`: `#0B0F19` (Root viewport background)
  - `surface`: `#0f131d` (Base component canvas)
  - `surface-container-lowest`: `#0a0e18` (Sidebar & recessed code viewports)
  - `surface-container-low`: `#171b26` (Sub-shelves, status ribbons)
  - `surface-container`: `#1c1f2a` (Default container fill)
  - `surface-container-high`: `#262a35` (Hover / active highlights)
  - `surface-container-highest`: `#313540` (Kbd tags, pill borders)
  - `surface-elevated`: `#111827` (Card & modal surfaces)
  - `surface-shelf`: `#1E293B` (Input fields, toolbar buttons)
- **Typography Tokens**:
  - Primary UI: `Plus Jakarta Sans` (`body-sm`: 14px/1.5, `body-md`: 16px/1.5, `label-sm`: 12px/1.2 w600, `label-md`: 14px/1.2 w600, `headline-md`: 20px/1.4 w600, `headline-lg`: 28px/1.3 w600, `headline-xl`: 40px/1.2 w700).
  - Telemetry, Code & Metrics: `JetBrains Mono` (`font-mono-code`: 13px/1.6 w400, `font-mono-label`: 11px/1.0 w500 uppercase tracking-wider, `font-mono-metric`: 24px/1.2 w600 tabular-nums).
- **Tactile Elevation & Glassmorphism Tokens**:
  - `jx-elevation-1`: `box-shadow: 0 2px 6px -1px rgba(0,0,0,0.35), 0 1px 2px -1px rgba(0,0,0,0.25), inset 0 1px 0 0 rgba(255,255,255,0.06)`
  - `jx-elevation-2`: `box-shadow: 0 10px 25px -4px rgba(0,0,0,0.50), 0 4px 10px -2px rgba(0,0,0,0.35), inset 0 1px 0 0 rgba(255,255,255,0.08)`
- **Color Accent Semantics**:
  - `primary` / `accent-indigo`: `#c3c0ff` / `#4f46e5` (Brand focus, active links, primary CTA)
  - `tertiary` / `accent-emerald`: `#68dba9` / `#059669` (Online, healthy, completed, verified)
  - `accent-ocean`: `#0284c7` (Network telemetry, streaming SSE, WebRTC)
  - `accent-violet` / `secondary`: `#7c3aed` / `#d2bbff` (AST policies, OAuth credentials, tokens)
  - `amber-400`: `#fbbf24` (Warnings, pending reviews, high resource load)
  - `error` / `accent-rose`: `#ffb4ab` / `#e11d48` (Denied, failed, kill-switch, disconnects)

---

### 1.3 Global Shell Architecture
- **Sidebar Navigation Rail** (`fixed left-0 top-0 h-full w-72 bg-surface-container-lowest z-50 flex flex-col jx-elevation-2`):
  - Brand Header: AI Bridge Logo, "AI Bridge Control Plane", version pill `v2.1.0`.
  - Operations Domain:
    1. `overview`: **Command Overview** (`grid_view`)
    2. `devices`: **Enrolled Devices** (`dns`)
    3. `device-360-system`: **Device 360 System** (`memory`)
    4. `task-queue-and-vision`: **Task Queue & Vision** (`checklist`, badge: `12 active`)
    5. `live-desktop-studio`: **Live Desktop Studio** (`desktop_windows`)
    6. `interactive-terminal`: **Interactive Terminal** (`terminal`)
    7. `autonomous-workflows`: **Autonomous Workflows** (`account_tree`)
    8. `fleet-operations`: **Fleet Operations** (`bolt`)
    9. `ai-api-and-agents`: **AI API & Agents** (`smart_toy`)
  - Governance Domain:
    10. `human-approvals`: **Human Approvals** (`verified_user`, badge: `3 urgent`)
    11. `security-policies`: **Security Policies** (`lock`)
    12. `audit-trail`: **Audit Trail** (`description`)
    13. `mcp-and-oauth`: **MCP & OAuth** (`hub`)
    14. `diagnostics-and-logs`: **Diagnostics & Logs** (`monitoring`)
  - Persistent Sidebar Footer: mTLS v1.3 Zero-Trust Active status widget with glowing indicator dot.
- **Top Header Bar** (`fixed top-0 left-72 right-0 h-16 bg-surface-elevated/90 backdrop-blur-xl z-40 jx-elevation-1 px-8`):
  - Gateway Online Pill: `Gateway: Online (14ms latency)` with ping animation.
  - Quick Jump Trigger: Search button with `<kbd>⌘K</kbd>` badge.
  - Auto-poll Switcher: `Auto-poll: 15s` toggle with pill slider.
  - Emergency All-Stop Button: Red destructive button (`gpp_maybe`, "Emergency All-Stop", min-h 44px).
  - Telemetry Export Action: `file_download` icon button.
  - Keyboard Shortcuts Action: `help` icon button (`?`).
  - Operator Profile Session Menu: Avatar, name ("Sarah J."), role ("Lead SecOps"), status indicator dot, chevron dropdown.

---

### 1.4 Detailed Inventory of All 15 Screens

#### Screen 0: Login & Authentication Console (`/login`)
- **Container**: Centered glassmorphic card container (`max-w-md w-full p-8 rounded-2xl bg-surface-elevated jx-elevation-2`).
- **Elements**:
  - Header: System title "AI Bridge Fleet Gateway", subtitle "Enterprise Zero-Trust Autonomous Control Plane".
  - Gateway Health Pill: Dynamic chip (`Online: 12ms`, `Checking...`, or `Offline`).
  - Google SSO Button: "Continue with Google SSO" (OIDC / OAuth 2.0 PKCE).
  - Divider: Centered text "or authenticate directly".
  - Tab Switcher: Tab 1 "Admin Token", Tab 2 "Operator Login".
  - Admin Token Form:
    - Masked password input with eye toggle button.
    - Fast actions: "Paste from Clipboard" and "Insert Dev Token".
    - Helper label: "Accepts `AI_BRIDGE_ADMIN_TOKEN` secret bearer string".
  - Operator Login Form:
    - Username text field with autocomplete `username`.
    - Password text field with real-time entropy bar (Weak / Fair / Strong / Enterprise Grade).
  - Session Checkbox: "Remember this workstation for 24 hours (mTLS session pinned)".
  - Submit CTA: Primary button "Authenticate & Unlock Gateway" with spinner transition.
  - Security Compliance Footer: ISO 27001 / SOC-2 Type II Zero-Trust Verified.

#### Screen 1: Command Overview (`/overview`)
- **4-Metric Bento Ribbon**:
  1. Active Fleet Nodes: `38 / 40 Online` (95% availability, 2 pending key exchange).
  2. Task Throughput (24h): `14,291 Completed`, `18 Failed` (99.87% success rate bar).
  3. Pending Approvals: `3 Urgent` (Requiring SecOps human review before timeout).
  4. Median Fleet Heartbeat: `14ms` latency across distributed edge nodes.
- **2-Column Analytics Split**:
  - Left: Risk Tier Execution Volume:
    - Tier 1 (Safe Observation): Read queries, screenshots (68%).
    - Tier 2 (Workspace Modification): File edits, test runs (24%).
    - Tier 3 (Arbitrary Shell / Deletion): Bash, pty_exec, rm (7.8%).
    - Tier 4 (Kernel / System Deploy): Driver/kernel changes (0.2%).
  - Right: Task Status Breakdown: Completed (14,291), Running (12), Pending Approval (3), Failed (18), Denied (4).
- **Quick Launchpad**: 4 instant dispatch action chips:
  - "Capture Remote Screen", "Query Active Windows", "Inspect Top Processes", "Fetch System Specs".
- **Live Activity Feed**: High-density real-time audit stream showing last 10 tool dispatches with timestamp, actor, target node, status badge, and "Inspect" drawer action.

#### Screen 2: Enrolled Devices (`/devices`)
- **Metrics Ribbon**: Total Agents (40), Online (38), Windows Nodes (24), Linux / macOS (16).
- **Filter Toolbar**:
  - Filter chips: `All (40)`, `Online (38)`, `Offline (2)`, `Pending Auth (0)`.
  - Platform Segmented Buttons: `All Platforms`, `Windows 11 / Server`, `Ubuntu / Debian`, `macOS Sonoma`.
  - Search Input: Monospace search filtering by hostname, node ID, or kernel string.
  - "Enroll Device" CTA: Opens Registration Script Modal.
- **SmartDataTable Columns**:
  1. Status Indicator: Ping dot (Green: Online, Red: Offline, Amber: Unresponsive).
  2. Device Identity: Hostname (`srv-us-east-412`), Node UUID (`d9a4...6b01`), Arch (`x86_64` / `aarch64`).
  3. Operating System: Platform icon, OS Release (`Ubuntu 24.04.1 LTS`, `Windows 11 Pro 23H2`).
  4. Polling Cadence: Relative last heartbeat (`4s ago`), interval (`10s poll`), latency (`14ms`).
  5. Workspace Path: Remote directory root (`/opt/ai-bridge/workspace`, `C:\ai-bridge\workspace`).
  6. Assigned Models: Multi-agent badges (`Claude 3.5 Sonnet`, `GPT-4o`).
  7. Actions (Sticky Right): "Inspect 360", "Dispatch Tool", "Revoke Node" (Hold-to-confirm).
- **Enrollment Modal**:
  - Tab 1: Linux / macOS (`curl -sSL https://bridge.internal/install.sh | sudo bash -s -- --token=...`)
  - Tab 2: Windows PowerShell (`iwr -useb https://bridge.internal/install.ps1 | iex; Register-AiBridgeAgent -Token ...`)
  - Fast-action: "Copy One-Liner" with visual feedback checkmark.

#### Screen 3: Device 360 System Dashboard (`/device-360-system`)
- **Breadcrumb & Node Switcher**: Quick dropdown to switch between nodes without leaving the view.
- **Hardware Telemetry Gauges (4 Bento Units)**:
  1. CPU Utilization: Live 28.4% gauge with 8-core mini bar breakdown and clock speed (3.8 GHz).
  2. Memory (RAM): `18.4 GB / 64.0 GB` (28.7% used), Swap: `0.4 GB / 8.0 GB`.
  3. Storage Volumes: Mounted drive bars (`/`: 42% of 500GB, `/mnt/data`: 78% of 2TB NVMe).
  4. Network Throughput: Live bidirectional meter (`RX: 4.2 MB/s`, `TX: 1.1 MB/s`, IP: `10.244.18.99`).
- **Interactive JXTabs Panels**:
  - Tab 1: **Running Processes**: Searchable table of active PIDs, Process Name, User, CPU %, RAM %, with "Kill Process" confirmation trigger.
  - Tab 2: **Installed Applications**: Registered binaries, installed versions, publisher, and "Launch App" trigger.
  - Tab 3: **Network Sockets & Ports**: Listening TCP/UDP ports (`0.0.0.0:8080`, `127.0.0.1:5432`), foreign addresses, and connection states.
  - Tab 4: **System Daemons**: Systemd services / Windows Services (`ai-bridge-agent`, `docker`, `sshd`) with Start, Stop, and Restart actions.
- **Security Fingerprint Drawer**: SHA-256 host hardware fingerprint, mTLS certificate expiry countdown (e.g. `Expires in 42 days`), TPM 2.0 PCR status.

#### Screen 4: Task Queue & Vision Inspector (`/task-queue-and-vision`)
- **Split-Screen Layout**: Left Studio (45%), Right Queue & Inspector (55%).
- **Tool Dispatch Studio (Left)**:
  - Target Node Selector: Dropdown with search and live online badges.
  - Tool Selector: Dropdown grouped by categories:
    - Vision & Input: `desktop.capture_screen`, `desktop.click_coordinate`, `desktop.type_text`.
    - Terminal & Execution: `shell.exec`, `pty.spawn`, `process.list`.
    - File Operations: `file.read`, `file.write`, `file.apply_diff`.
  - Risk Classification Chip: `Tier 1 Safe` (Green), `Tier 2 Workspace` (Blue), `Tier 3 Shell` (Amber), `Tier 4 Kernel` (Red).
  - JSON Argument Editor: CodeMirror / Monaco styled editor with JSON validation and beautify button.
  - Preset Quick-Fill Chips: `System Info`, `Full Screenshot`, `Top 10 Processes`, `Tail Journal`.
  - Dispatch CTA: "Dispatch Invocation" with progress bar.
- **Execution Queue Table (Right)**:
  - Columns: Task ID (`#TSK-89214`), Target Node, Tool Name, Risk Tier, Status (`running`, `completed`, `needs_approval`, `failed`), Duration (`142ms`), Invoker.
  - Row Selection: Clicking row loads result into bottom inspector.
- **Vision Screen Inspector**:
  - If output contains base64 screenshot: Full viewport canvas with pan/zoom controls.
  - **Set-of-Marks (SoM) Toggle**: Overlays numbered bounding boxes on detected UI elements (e.g. `[12] Chrome Search Bar`, `[14] Submit Button`).
  - Raw JSON Response Viewer: Formatted payload with execution hash and timing metrics.

#### Screen 5: Live Desktop Studio & Dual-Control (`/live-desktop-studio`)
- **Workstation Viewport Canvas**:
  - Low-latency WebRTC / SSE video stream at 30–60 FPS.
  - Stream Resolution Controls: `Fit to Container`, `100% Native Scale (2560x1440)`.
  - Telemetry Overlay: `Stream: WebRTC H.264`, `Latency: 28ms`, `Bandwidth: 3.4 Mbps`, `Dropped Frames: 0`.
- **Floating Dual-Control Takeover Bar**:
  - Mode Switch: Segmented toggle between `Observer Only` (safe monitoring) and `Operator Takeover` (interactive control).
  - Takeover Lock Warning: Red indicator displaying "Operator Takeover Active — Agent Input Suppressed".
  - Kinematic Input Toggles:
    - Mouse Capture: Forwards clicks, double-clicks, right-clicks, scroll wheel, drag & drop.
    - Keyboard Capture: Direct typing forwarding.
  - Emergency Macro Buttons: Quick hotkey dispatchers for `Ctrl+Alt+Del`, `Win+R`, `Alt+Tab`, `Super Key`.
- **Dual Cursor HUD**: Displays both the AI Agent's virtual cursor (blue target crosshair) and the Human Operator's cursor (green pointer) simultaneously with coordinate labels `(X: 1420, Y: 840)`.
- **Active Windows HUD**: Collapsible tray listing all open desktop application windows with single-click "Focus Window" actions.

#### Screen 6: Interactive Live Terminal (`/interactive-terminal`)
- **Terminal Session Bar**:
  - Node Selector: Swappable target device dropdown.
  - Shell Runtime Tag: `PowerShell Core 7.4.1 (Windows)` or `GNU bash 5.2 (Linux)`.
  - Connection State: `WebSocket PTY: Connected (11ms ping)`.
  - Controls: "Clear Screen Buffer", "Send SIGINT (Ctrl+C)", "Export ANSI Log", "Reconnect Session".
- **Monospace PTY Canvas**:
  - High-contrast ANSI colored rendering supporting full xterm.js terminal emulation.
  - Scrollback buffer history up to 10,000 lines.
  - Clickable file paths and URLs.
- **Operational Snippet Quick-Bar**:
  - Horizontal bar of pre-saved administrative commands:
    - `ipconfig /all`, `docker ps -a`, `Get-Process | Sort CPU -Desc | Select -First 10`, `journalctl -u ai-bridge -n 50`.
  - Double action mode: "Insert to Prompt" or "Execute Immediately".

#### Screen 7: Autonomous Workflows & Multi-Turn Plans (`/autonomous-workflows`)
- **Workflow Pipeline DAG Graph**:
  - Visual linear stepper showing multi-turn execution chain:
    - Step 1: `desktop.capture_screen` (Observation phase).
    - Step 2: `vision.ocr_screen` (Verification checkpoint: text matching regex).
    - Step 3: `desktop.click_coordinate` (Conditional execution branch).
    - Step 4: `audit.commit_transaction` (Ledger commit).
- **Turn State Ribbon**: Active step banner: `Turn 3 of 4 Running — Step: desktop.click_coordinate [Target: #btn-checkout]`.
- **Step Inspection Details**:
  - Input JSON arguments.
  - AI Reasoning Log: Thought trace from agent ("Identified checkout button at coords [740, 480] with 98.4% confidence").
  - Verification Screenshot with Set-of-Marks overlay.
  - Step Execution Duration (`210ms`).
- **Workflow Controls**:
  - "Pause Workflow", "Resume Step", "Force Re-Plan", "Abort Plan".
- **Workflow Builder Modal**:
  - Drag-and-drop or form-based builder to append steps, define failure fallbacks, set max retry count, and mark human approval gates.

#### Screen 8: Fleet Operations & Self-Healing Hub (`/fleet-operations`)
- **Multi-Node Command Bus**:
  - Target Selector: `All Fleet Nodes (40)`, `Tagged: production-east (14)`, or `Custom Multi-Select`.
  - Concurrency Slider: Maximum parallel nodes (e.g. `Concurrency: 5 nodes at a time`, `Rolling rollout`).
  - Script Payload Editor: Bash / PowerShell snippet with environment variable injection.
  - Broadcast CTA: "Broadcast Fleet Command" with real-time progress bar (`38/40 Succeeded`, `2 In-Progress`).
- **Reactive Self-Healing Rules Engine**:
  - Configurable cards:
    1. Rule: "Agent Service Failure" -> Action: "Restart systemd daemon + notify SecOps".
    2. Rule: "Memory Leak Detected (RAM > 92% for 10m)" -> Action: "Flush buffer cache + trigger heap dump".
    3. Rule: "mTLS Handshake Stale (> 60s)" -> Action: "Rotate ephemeral keypair + re-register".
    4. Rule: "Disk Pressure (< 10% free)" -> Action: "Purge temporary task artifacts older than 48h".
  - Per-rule toggles: Enable switch, execution counter (`Triggered 14 times`), last execution timestamp.
- **Fleet Cron Scheduler**:
  - Table of scheduled recurring jobs:
    - Columns: Job Name, Cron Expression (`0 2 * * *`), Target Nodes, Command, Next Run, Last Execution Status.
    - Actions: Run Now, Edit Schedule, Delete Job.

#### Screen 9: AI API & Custom Agents Hub (`/ai-api-and-agents`)
- **Provider Connector Cards**:
  - 4 Supported Engines: `Anthropic Claude (Messages API)`, `OpenAI (GPT-4o / Realtime)`, `Google Gemini (Pro 1.5)`, `Local Ollama / vLLM`.
  - Status Indicators: Endpoint Health, API Key Status, Configured Default Model, Ping Latency.
- **Multi-Language SDK Code Generator**:
  - Tabbed snippets showing how to connect an external script to AI Bridge:
    - Tab 1: **Python SDK** (`from ai_bridge import BridgeClient; client = BridgeClient(...)`)
    - Tab 2: **TypeScript / Node.js** (`import { BridgeClient } from '@ai-bridge/sdk'`)
    - Tab 3: **cURL / REST HTTP** (`curl -X POST https://bridge.internal/v1/tools/dispatch ...`)
    - Tab 4: **MCP JSON-RPC** (`{"jsonrpc":"2.0","method":"tools/call",...}`)
  - Single-click "Copy Code Snippet" button.
- **Interactive Tool Execution Studio**:
  - Direct prompt / tool invocation sandbox:
    - Prompt input, model selector, tool execution proof, return schema response with raw token consumption metrics.

#### Screen 10: Human-in-the-Loop Approvals (`/human-approvals`)
- **Urgent Approval Queue**:
  - Urgent requests cards requiring review before SLA expiration (e.g. `Countdown: 04:32 remaining`).
  - Risk Tag: `Tier 3 Arbitrary Shell Execution`, `Tier 3 Recursive File Deletion`, `Tier 4 Privilege Escalation`.
  - Requester Details: Agent UUID (`agent-orchestrator-91`), Initiator, Target Host (`srv-us-east-412`).
- **Approval Inspector Modal**:
  - **Exact Arguments Diff**: Code / AST diff highlighting dangerous parameters (e.g. `rm -rf /opt/cache/data` with highlighted deletion scope).
  - **Remote Visual Context**: Screenshot taken at exact millisecond of invocation with highlighted bounding box showing what was on the screen.
  - **Safety Checklist**: Checkboxes required before authorizing:
    - `[x] Verified target hostname matches intended scope`
    - `[x] Confirmed payload contains no unauthorized network transfers`
    - `[x] Evaluated blast radius of destructive command`
  - **Decision Controls**:
    - "Authorize & Execute" (Green primary button).
    - "Deny Invocation" (Red button with mandatory rejection reason text input sent back to agent).
    - "Request Re-Plan" (Sends prompt feedback asking agent to formulate safer alternative).
- **Historical Decision Archive**:
  - Table of historical decisions: Request ID, Command, Deciding Operator (`Sarah J.`), Verdict (`Approved` / `Denied`), Decision Timestamp, Justification.

#### Screen 11: Security Policies & Webhooks (`/security-policies`)
- **4-Tab Policy Rule Matrix**:
  - Tab 1: **Executable Allowlists**: Table of approved binaries (`/usr/bin/git`, `C:\Program Files\Google\Chrome\chrome.exe`), SHA-256 hashes, and blocked executables (`powershell_ise.exe`, `nc`, `nmap`).
  - Tab 2: **Restricted Paths**: Protected filesystem globs (`/etc/shadow`, `C:\Windows\System32\**`, `~/.ssh/**`) with zero-bypass kernel enforcement.
  - Tab 3: **Tier Overrides & Throttles**: Reclassify tools (e.g. elevate `file.write` to Tier 3 in production tags), set rate limits (e.g. max 60 calls/minute).
  - Tab 4: **Semantic Policy Diff**: Side-by-side version comparison (`v3.4.0` vs `v3.4.1`) with "Rollback to Version" and "Publish v3.4.2" CTA.
- **Webhook Integration Manager**:
  - 4 Webhook Cards: `Slack #secops-alerts`, `Discord Operations`, `Microsoft Teams Incident Bridge`, `PagerDuty On-Call`.
  - Event Subscription Toggles: `High-Risk Approval Needed`, `Agent Disconnected / Offline`, `Self-Healing Triggered`, `Audit Integrity Breach`.
  - Action: "Send Test Ping" with response HTTP status code badge (`200 OK - 42ms`).
  - Live Delivery Log: Stream of outgoing webhook payloads with delivery timestamps.

#### Screen 12: Append-Only Audit Trail (`/audit-trail`)
- **Cryptographic Header & Merkle Root**:
  - Merkle Root Hash: `0x7fa281b94d27e8a10459c03bfe...` with "Verify Integrity" button.
  - Status Chip: `RFC 3161 Timestamp Authority Validated`.
  - Export Suite: Dropdown with "Export Immutable CSV", "Export Signed JSON-LD", "Export Audit Report (PDF)".
- **4 KPI Statistics**:
  - Total Ledger Records (`1,492,019`), Verified Merkle Blocks (`14,920`), Security Violations Prevented (`42`), Human Approvals Logged (`184`).
- **Dense Immutable Audit Data Grid**:
  - Columns:
    1. Sequenced Block # (`#01492019`)
    2. RFC 3339 UTC Timestamp (`2025-02-18T14:28:09.102Z`)
    3. Actor Identity (`agent:claude-3.5-sub`, `user:sarah.j`)
    4. Action / Tool (`desktop.capture_screen`, `shell.exec`, `auth.rotate_token`)
    5. Target Host (`srv-us-east-412`)
    6. Governance Verdict: `Auto-Allowed` (Green), `Human-Approved` (Blue), `Denied` (Red).
    7. SHA-256 Cryptographic Hash (`d9a4...6b01`).
- **Verification Micro-Modal**:
  - Clicking any hash opens integrity modal showing previous hash, payload signature, and cryptographic chain verification proof.

#### Screen 13: MCP & OAuth Connections (`/mcp-and-oauth`)
- **Metadata Header**: Spec: `MCP v1.0.4`, Transport: `SSE Stream + stdio Bridge`, mTLS Stream Synchronized.
- **Actions Bar**: "Rotate Gateway Secret", "Issue OAuth Client", "Register MCP Endpoint".
- **4 Telemetry Cards**:
  1. Protocol Gateways: `6 / 6 Streamable Endpoints Live` (100% Uptime).
  2. Concurrent SSE: `42 Clients Connected` (Full-duplex event pipe, 18ms p99 latency).
  3. OAuth Credentials: `18 Valid Bearers` (RFC 6749 Client Credentials, 0 Compromised).
  4. Exposed Primitives: `34 Tool Schemas` (JSON-RPC 2.0 contract stubs, Strict Zod v3 engine).
- **Registered MCP Server Streams Grid**:
  - Cards for `/mcp/v1/fleet-desktop`, `/mcp/v1/host-terminal`, `/mcp/v1/system-telemetry`, `/mcp/v1/filesystem-sandbox`.
  - Displays transport mechanism, client subscriptions, throughput (`req/min`), exported schema chips, and "Inspect Spec" button.
- **Active AI Client Sessions Table**:
  - Columns: Connected Application (`Cursor IDE`, `Claude Desktop App`, `Auto-Heal Daemon v2`, `Local Python SDK`), PID & Route (`PID 4912`, `10.240.12.8`), Stream Duration (`4h 12m`), Tool Invocations (`1,420`), Negotiated Features (`tools/call`, `resources/read`), Actions ("Inspect Scopes", "Terminate Session" with 2-step click confirmation).
- **OAuth 2.0 Registered Clients & Token Vault**:
  - List of issued credentials with client ID, PKCE type (`S256 + DPoP`), scopes (`fleet:read`, `mcp:stream`), created timestamp, expiry timer, "Rotate Secret", and "Revoke Access".
- **Interactive Client Handshake Preview**:
  - Form to test PKCE handshake: Target Client ID, requested scopes checkboxes, live signed JWT bearer token preview, "Test Handshake & Sign Token" button.
- **Realtime Wire Protocol Audit Drawer**:
  - Monospace SSE audit log showing JSON-RPC 2.0 request/response frames with timestamps, method, latency, and "Clear Log" action.

#### Screen 14: Service Diagnostics & Logs (`/diagnostics-and-logs`)
- **Status Ribbon**: `INGEST: 1,840 eps`, Ring Buffer: `30.72 MB / 64.00 MB (48%)`, Capture Window: `Live Rolling 15m`.
- **Operational Action Bar**:
  - "Pause Stream" button (`Space` hotkey), "Copy Filtered Buffer", "Download Raw Log (.gz)", "Flush Buffer", Sync State: `Zero-Drop Locked`.
- **Filter Ribbon**:
  - Target Service: `ai-bridge-core.service`, `ai-bridge-mcp-gateway`, `ai-bridge-edge-daemon`, `systemd-journald`, `nginx-tls-proxy`.
  - Buffer Size Selector: `250`, `500`, `1000` lines.
  - Auto-Scroll Toggle switch with pulsing live indicator.
  - Log Level Pill Filters: `ALL (1,840)`, `DEBUG (842)`, `INFO (948)`, `WARN (48)`, `ERROR (2)`, `FATAL (0)`.
  - Regex Query Search input with `.* REGEX` indicator badge.
- **High-Contrast Monospace Log Canvas (Left 8 Cols)**:
  - Terminal header: `/var/log/ai-bridge/core.stdout.log (tail -f)`, UTF-8, PID, LIVE.
  - Colored rows: Timestamp, worker thread (`[worker-01]`), module tag (`[core::mTLS]`), level badge, message text.
  - Interactive row click loads structured JSON in right drawer.
- **Structured JSON Detail Inspection Drawer (Right 4 Cols)**:
  - Formatted JSON object of selected log: timestamp, service, module, level, thread, pid, custom attributes (node_id, cipher_suite, cert_fingerprint, handshake_latency_ms), audit_trace_id.
  - Actions: "Filter by Trace ID (`trc-890a`)", "Pin Node to Audit Trail".
  - Target Node Topology Context box.
- **Subsystem Health & Ingestion Metrics (4 Bento Units)**:
  - Core Service Uptime & RAM/CPU (`42d 18h`, `182 MB`, `1.4% CPU`).
  - MCP Gateway Uptime & RAM/CPU (`42d 18h`, `94 MB`, `0.8% CPU`).
  - Edge Fleet Daemon Uptime & RAM/CPU (`19d 04h`, `62 MB`, `0.3% CPU`).
  - Zero-Drop Ring Buffer Progress Meter (48% utilized).

---

## 2. Logic Chain

1. **Mapping Specifications to Product Reality**:
   - `DASHBOARD_DESIGN_SPEC.md` provides the authoritative product requirements, risk taxonomy (Tiers 1 through 4), navigation hierarchy, and screen-by-screen feature contracts.
   - The 12 reference HTML screen mockups in `stitch_design_system_implementation` provide the pixel-level visual proof, exact Tailwind color mappings, DOM structure, micro-interactions (e.g. 2-step button confirmation for `confirmTermination`), and responsive flex/grid layouts.
   - Therefore, the implementation plan must preserve the exact visual language of the reference screens while binding them into clean React 19 components using `@jacxishippingorg/jx-ui-react`.

2. **Aesthetic & UX Anti-Pattern Enforcement**:
   - `ORIGINAL_REQUEST.md` and `DASHBOARD_DESIGN_SPEC.md` explicitly mandate:
     - No purple/pink/blue gradient backgrounds or neon glass cards.
     - No emojis in operational logs, metrics, or table headers.
     - No floating abstract decorative shapes or particles.
     - No generic AI marketing slogans or vague assistant text.
   - Instead, the interface strictly adheres to:
     - High-density dark canvas (`#0B0F19`, `#0f131d`, `#111827`).
     - Monospace typography (`JetBrains Mono`) for all hashes, PIDs, timestamps, durations, and metrics.
     - Specular highlight insets (`inset 0 1px 0 0 rgba(255, 255, 255, 0.06)`).
     - Semantic status indicators where color is accompanied by text or icon.

3. **Data Architecture & State Unification**:
   - The dashboard relies on a unified core entity model:
     - `Node` / `Device`: Identity, status, platform, telemetry, security fingerprint.
     - `Task` / `Invocation`: ID, tool name, risk tier, arguments, status, invoker, payload.
     - `ApprovalRequest`: Risk tier, SLA countdown, diff, visual context, checklist.
     - `Workflow`: DAG pipeline steps, turns, confidence scores, SoM overlays.
     - `AuditEvent`: Sequential block ID, UTC timestamp, actor, tool, verdict, SHA-256 hash.
     - `MCPConnection` & `OAuthClient`: SSE route, active clients, bearer tokens, scopes.
     - `LogRecord`: RFC 3339 timestamp, service, level, module, structured JSON attributes.

---

## 3. Features Discovered

| # | Category | Feature | Description | Inputs | Outputs | Error Behavior | Discovered Via |
|---|----------|---------|-------------|--------|---------|----------------|----------------|
| 1 | Auth | Zero-Trust Dual-Auth Console | Authenticates operators via Admin Secret Token or Operator credentials + SSO | Bearer token string, or username/password, or Google SSO click | JWT session token, mTLS session cookie | Inline non-blocking alert banner with shake transition | `DASHBOARD_DESIGN_SPEC.md` §3 (Screen 0) |
| 2 | Shell | mTLS Control Plane Status Bar | Displays real-time gateway latency, build version, and zero-trust sync | Gateway health check ping (15s auto-poll) | Glowing pulse dot, latency readout `14ms`, build `v2.1.0` | Turns amber/red on ping timeout with "Reconnecting" tag | All HTML references header |
| 3 | Shell | Global Command Palette (⌘K) | Modal search for instant jumping to devices, tools, pages, and actions | Keystroke `⌘K` or search click, query string | Filtered list of pages, nodes, and tool actions | "No results found" empty state | All HTML references header & `DASHBOARD_DESIGN_SPEC.md` §2 |
| 4 | Shell | Emergency All-Stop Killswitch | Immediate global halt of all active fleet tasks and background workflows | Click with confirmation prompt | Sends SIGSTOP/CANCEL to all active tasks; updates status ribbon | Disabled if no active running tasks | All HTML references header |
| 5 | Fleet | SmartDataTable Device Inventory | Paginated, filterable grid of all 40 enrolled Windows, Linux, and macOS agents | Search string, platform filter, status filter | Sorted table with hostnames, UUIDs, IPs, polling rate | Empty state with "Clear Filters" or "Enroll Device" CTA | `ai_bridge_enrolled_devices/code.html` |
| 6 | Fleet | Cross-Platform Agent Enroller | Modal providing pre-configured curl and PowerShell install scripts | Platform tab switch (Linux/macOS vs Windows) | Copyable one-liner CLI command with embedded auth token | Displays warning if gateway registration token expired | `ai_bridge_enrolled_devices/code.html` |
| 7 | Device | Device 360 Hardware Gauges | Real-time SVG meters for CPU (per-core), RAM (used/free), Disk, Network | Hardware telemetry polling stream | Percentage arcs, used/total metrics, live KB/s rates | Gauge displays dimmed state with "Sensor Unresponsive" | `ai_bridge_device_360_system_dashboard/code.html` |
| 8 | Device | Process Manager with Termination | Filterable process list with CPU/memory footprint and kill capability | Process filter text, "Kill Process" button click | Process termination signal sent to agent; row disappears | Error toast if process belongs to protected root/kernel | `ai_bridge_device_360_system_dashboard/code.html` |
| 9 | Tasks | Tool Dispatch Studio | Form to construct JSON arguments and execute tools on remote devices | Target node, tool name, JSON argument editor | Dispatches task to queue; yields execution ID | JSON validation error banner on malformed syntax | `ai_bridge_task_queue_vision_inspector/code.html` |
| 10 | Vision | Set-of-Marks (SoM) Visual Inspector | Overlay rendering numbered bounding boxes on detected desktop elements | Toggle switch on screenshot viewer | Canvas overlay with numbered badges and OCR text tags | Gracefully renders raw image if SoM coordinates missing | `ai_bridge_task_queue_vision_inspector/code.html` |
| 11 | Desktop | Low-Latency Desktop Stream Canvas | WebRTC/SSE streaming remote screen at 30–60 FPS with scaling controls | Window resize, scale mode toggle (Fit vs 1:1) | Responsive HTML5 canvas rendering desktop frames | "Stream Interrupted - Reconnecting" overlay | `ai_bridge_live_desktop_studio_dual_control/code.html` |
| 12 | Desktop | Dual-Control Operator Takeover | Seamless toggle between passive observation and interactive mouse/keyboard | Mode switch button, mouse click, keystrokes | Input events forwarded to target node; agent input locked | Banner warning: "Takeover Active — Agent locked" | `ai_bridge_live_desktop_studio_dual_control/code.html` |
| 13 | Terminal | ANSI Monospace PTY Studio | Full interactive pseudo-terminal session into target node | Keystrokes, command snippet clicks, SIGINT (Ctrl+C) | ANSI colored monospace stdout stream with scrollback | Disconnect overlay with "Reconnect Session" CTA | `ai_bridge_interactive_live_terminal/code.html` |
| 14 | Workflows | Multi-Turn DAG Pipeline Stepper | Visual progression stepper tracking agent reasoning, OCR, and actions | Step selection, execution payload inspect | Step timeline with execution status, latency, reasoning log | Red highlighted step on assertion failure with re-plan CTA | `ai_bridge_autonomous_workflows_multi_turn_plans/code.html` |
| 15 | FleetOps | Multi-Node Command Bus | Broadcasts shell or tool payloads across multiple tagged devices simultaneously | Target selector, script payload, concurrency slider | Real-time completion progress bar (e.g. 38/40 Succeeded) | Per-node failure drill-down drawer | `ai_bridge_fleet_operations_self_healing_hub/code.html` |
| 16 | FleetOps | Reactive Self-Healing Rule Cards | Configures automated agent remediation rules based on metrics or crashes | Rule toggle switch, threshold slider, remediation action | Auto-dispatches fix upon threshold trigger; increments counter | Notification banner on automated trigger | `ai_bridge_fleet_operations_self_healing_hub/code.html` |
| 17 | AI API | Multi-Provider Agent Hub | Configures LLM endpoints (Claude, OpenAI, Gemini, Ollama) and generates SDK code | Provider credentials, language tab selection | Formatted Python, TypeScript, cURL code snippets | Status indicator shows "Ping Failed" on invalid endpoint | `ai_bridge_ai_api_custom_agents_hub/code.html` |
| 18 | Governance | Human-in-the-Loop Approval Modal | Airgapped approval workflow for Tier-3/4 dangerous shell and file actions | Authorize click, Deny click + mandatory rejection reason | Executes task or returns denial error to waiting agent | Auto-denies on SLA countdown timeout | `ai_bridge_human_in_the_loop_approvals/code.html` |
| 19 | Governance | AST Command Diff Inspector | Formatted syntax diff highlighting dangerous parameters in requested commands | Request selection | Color-coded syntax tree diff showing flags and targets | Highlights unauthorized wildcards (e.g. `rm -rf /*`) in red | `ai_bridge_human_in_the_loop_approvals/code.html` |
| 20 | Policies | Executable Allowlist Matrix | Policy editor specifying permitted and blocked application binaries | Binary path, SHA-256 hash, add/remove actions | Saves versioned security policy (v3.4.1) | Displays conflict warning if binary matches both rules | `ai_bridge_security_policies_webhooks/code.html` |
| 21 | Policies | Webhook Dispatcher Suite | Manages outbound event webhooks to Slack, Teams, Discord, and PagerDuty | Webhook URL, event checkboxes, "Send Test Ping" | Sends JSON payload; displays HTTP delivery latency | "Delivery Failed: 404/500" badge with error log | `ai_bridge_security_policies_webhooks/code.html` |
| 22 | Audit | Merkle Root Integrity Ledger | Append-only cryptographically verifiable audit log of every system action | Date range, actor filter, tool filter, verdict filter | Dense tabular view with sequenced blocks & SHA-256 hashes | "Integrity Check Failed" banner if hash mismatch detected | `ai_bridge_append_only_audit_trail/code.html` |
| 23 | Audit | Multi-Format Audit Exporter | Generates immutable compliance exports of the ledger | Format select: CSV, JSON-LD, or Signed PDF | Triggers browser download of cryptographic audit file | Empty export blocked if query matches 0 records | `ai_bridge_append_only_audit_trail/code.html` |
| 24 | MCP | MCP Protocol Gateway Monitor | Tracks active Model Context Protocol SSE endpoints and client subscriptions | Endpoint select, "Inspect Spec" action | Displays schema primitives, req/min throughput, latency | Yellow indicator if SSE stream drops packets | `ai_bridge_mcp_oauth_connections/code.html` |
| 25 | MCP | OAuth 2.0 Credential Vault | Issues, inspects, and revokes OAuth bearer tokens for AI agents | Client ID, scopes checkboxes, "Revoke Access" click | Generates signed JWT preview with DPoP / PKCE | Revocation renders card disabled with red badge | `ai_bridge_mcp_oauth_connections/code.html` |
| 26 | MCP | Wire Protocol Realtime Audit Drawer | Live JSON-RPC 2.0 frame inspector tailing MCP stream traffic | SSE stream listener, frame filter, clear log action | Monospace log of incoming requests and outgoing results | Formats parse errors as JSON-RPC error `-32700` | `ai_bridge_mcp_oauth_connections/code.html` |
| 27 | Diagnostics | Monospace Systemd Log Canvas | Live streaming console for systemd journald and core microservices | Target service select, log level pills, buffer size | Syntax-highlighted live tail stream with autoscroll | Highlights FATAL/ERROR rows in high-contrast red | `ai_bridge_diagnostics_logs/code.html` |
| 28 | Diagnostics | Structured JSON Log Inspector | Side drawer parsing raw log line into interactive JSON attributes | Click on log row in monospace canvas | Formatted JSON tree with Trace ID filtering action | Fallback to raw string if log entry is non-JSON | `ai_bridge_diagnostics_logs/code.html` |
| 29 | Diagnostics | Stream Pause Hotkey (Spacebar) | Keyboard shortcut to toggle live log tailing without losing position | Spacebar keydown on document body | Button changes to "Resume Stream", live ingestion pauses | Suppressed if user is typing in an `<input>` or `<textarea>` | `ai_bridge_diagnostics_logs/code.html` |
| 30 | Telemetry | Zero-Drop Ring Buffer Meter | Real-time gauge of memory ring buffer allocator utilization | Ingestion rate polling | Utilization percentage bar (e.g. `30.72 MB / 64 MB`) | Turns amber at 85%, red at 95% with auto-recycle | `ai_bridge_diagnostics_logs/code.html` |

---

## 4. Edge Cases

| # | Feature | Input | Observed Behavior |
|---|---------|-------|-------------------|
| 1 | Global Header | "Emergency All-Stop" clicked | Button triggers red alert confirmation dialog; pauses all tasks across all 40 nodes; task queue indicators switch to "Paused". |
| 2 | MCP Sessions Table | "Terminate" clicked on client row | Button transitions to "Press again to Confirm" with red background; if not clicked within 3500ms, reverts to "Terminate". If confirmed, row dims to 40% opacity, buttons disable, and termination log is appended. |
| 3 | Diagnostics Log Canvas | Spacebar pressed while focused in search input | Spacebar enters a space character into the search box instead of pausing the stream (event handler checks `e.target.tagName !== 'INPUT'`). |
| 4 | Human Approvals | SLA countdown reaches `00:00` | Request card transitions to expired state; card disabled; status changes to "Expired & Auto-Denied"; denial event logged to audit ledger. |
| 5 | Task Inspector | Output contains no image (pure text/JSON) | Vision inspector canvas is hidden; text/JSON syntax highlighter occupies full drawer width without broken image placeholder. |
| 6 | Live Desktop Takeover | Network latency spikes > 500ms | Telemetry ribbon turns amber; takeover mode displays high-latency warning chip; input debouncing activates to prevent mouse stutter. |
| 7 | Device Inventory | Search filter returns 0 matching devices | SmartDataTable displays clean empty state: "No devices found matching query", with an active "Clear Filters" button. |
| 8 | Security Policies | User attempts to save path `/` or `C:\` as allowlist | Validator blocks submission: "Root directory cannot be allowlisted; specific subdirectory pattern required". |
| 9 | Audit Trail | User modifies filter date range where start date > end date | Date picker auto-corrects or disables submission; displays validation helper "Start date must precede end date". |
| 10 | Interactive Terminal | Terminal stdout receives raw ANSI escape codes | Canvas properly parses 256-color and 24-bit truecolor ANSI codes without escaping or printing raw `\033[` sequences. |
| 11 | Autonomous Workflows | Intermediate step fails (e.g. OCR text mismatch) | Execution halts at failed step; red border applied; options "Retry Step", "Skip Step", or "Abort Plan" appear with error reason. |
| 12 | OAuth Token Generator | Scope `fleet:exec` selected without mTLS cert | Form highlights missing mTLS badge; disables "Test Handshake" CTA with helper: "fleet:exec requires mTLS DPoP binding". |

---

## 5. Enterprise State & Data Models

### 5.1 Enrolled Device (`Node`)
```typescript
export type DeviceStatus = 'online' | 'offline' | 'pending_key' | 'unresponsive';
export type PlatformType = 'windows' | 'linux' | 'darwin';

export interface DeviceTelemetry {
  cpuUsagePercent: number;
  cpuCores: number[];
  memoryUsedGb: number;
  memoryTotalGb: number;
  diskPartitions: Array<{ mount: string; usedGb: number; totalGb: number }>;
  networkRxKbps: number;
  networkTxKbps: number;
  pingLatencyMs: number;
  temperatureCelsius?: number;
}

export interface EnrolledDevice {
  id: string; // e.g. "srv-us-east-412"
  uuid: string; // e.g. "d9a4f210-890a-11ef-93cc-0242ac120003"
  hostname: string;
  platform: PlatformType;
  osRelease: string; // e.g. "Ubuntu 24.04.1 LTS" or "Windows 11 Pro 23H2"
  arch: 'x86_64' | 'aarch64';
  status: DeviceStatus;
  lastHeartbeatUtc: string; // RFC 3339
  pollingIntervalSeconds: number; // e.g. 10
  workspacePath: string; // e.g. "/opt/ai-bridge/workspace"
  assignedModels: string[]; // ["Claude 3.5 Sonnet", "GPT-4o"]
  ipAddress: string;
  telemetry: DeviceTelemetry;
  tpmStatus: 'verified' | 'unsupported' | 'warning';
  certExpiryUtc: string;
}
```

### 5.2 Task & Invocation (`Task`)
```typescript
export type RiskTier = 'tier_1_safe' | 'tier_2_workspace' | 'tier_3_shell' | 'tier_4_system';
export type TaskStatus = 'queued' | 'running' | 'needs_approval' | 'completed' | 'failed' | 'denied';

export interface TaskInvocation {
  id: string; // e.g. "#TSK-89214"
  targetDeviceId: string;
  toolName: string; // e.g. "desktop.capture_screen"
  riskTier: RiskTier;
  status: TaskStatus;
  invokedBy: string; // e.g. "agent:claude-3.5" or "operator:sarah.j"
  submittedAtUtc: string;
  startedAtUtc?: string;
  completedAtUtc?: string;
  durationMs?: number;
  inputArguments: Record<string, any>;
  outputPayload?: {
    success: boolean;
    data?: any;
    imageBase64?: string;
    setOfMarks?: Array<{ id: number; label: string; bbox: [number, number, number, number] }>;
    sha256: string;
  };
  errorMessage?: string;
}
```

### 5.3 Human Approval Request (`ApprovalRequest`)
```typescript
export interface ApprovalRequest {
  id: string; // e.g. "appr-981"
  taskId: string;
  riskTier: 'tier_3_shell' | 'tier_4_system';
  targetDeviceId: string;
  requesterId: string;
  commandSnippet: string;
  astDiff: {
    before?: string;
    after: string;
    flags: string[];
    affectedPaths: string[];
  };
  contextScreenshotBase64?: string;
  requestedAtUtc: string;
  expiresAtUtc: string; // SLA countdown target
  status: 'pending' | 'authorized' | 'denied' | 'expired';
  decidedBy?: string;
  decidedAtUtc?: string;
  rejectionReason?: string;
  checklistVerified: {
    scopeConfirmed: boolean;
    networkTransferEvaluated: boolean;
    blastRadiusChecked: boolean;
  };
}
```

### 5.4 Append-Only Audit Event (`AuditEvent`)
```typescript
export interface AuditEvent {
  blockSequence: number; // e.g. 1492019
  timestampUtc: string; // RFC 3161 / RFC 3339
  actor: string; // "agent:claude-3.5-sub" or "user:sarah.j"
  action: string; // tool or administrative command
  targetDeviceId: string;
  governanceVerdict: 'auto_allowed' | 'human_approved' | 'denied' | 'revoked';
  recordSha256: string;
  previousBlockSha256: string;
  merkleRoot: string;
  attributes: Record<string, any>;
}
```

### 5.5 MCP Endpoint & OAuth Client
```typescript
export interface MCPEndpoint {
  path: string; // e.g. "/mcp/v1/fleet-desktop"
  description: string;
  transport: 'sse' | 'stdio' | 'mtls_sse';
  status: 'online' | 'degraded' | 'offline';
  latencyMs: number;
  throughputRpm: number;
  clientSubscriptions: string[];
  exportedSchemas: string[];
}

export interface OAuthClient {
  clientId: string; // e.g. "ai-agent-fleet-prod-09"
  status: 'active' | 'revoked' | 'expired';
  pkceMethod: 'S256' | 'S256+DPoP';
  scopes: string[]; // ["fleet:read", "fleet:execute:tier2", "mcp:stream"]
  createdAtUtc: string;
  expiresAtUtc: string;
}
```

---

## 6. Caveats

1. **Route Slug Alignment**:
   - In `DASHBOARD_DESIGN_SPEC.md`, slugs are written as `overview`, `devices`, `device_detail`, `tasks`, `live_studio`, `terminal`, `workflows`, `fleet_ops`, `ai_api`, `approvals`, `policies`, `audit`, `connections`, `logs`.
   - In the reference HTML mockups, sidebar links use kebab-case data-path attributes: `overview`, `devices`, `device-360-system`, `task-queue-and-vision`, `live-desktop-studio`, `interactive-terminal`, `autonomous-workflows`, `fleet-operations`, `ai-api-and-agents`, `human-approvals`, `security-policies`, `audit-trail`, `mcp-and-oauth`, `diagnostics-and-logs`.
   - *Resolution*: The React router will support both kebab-case (matching the reference DOM) and underscore aliases, ensuring seamless routing.
2. **Vanilla HTML / Tailwind Reference vs. JXUI React Primitives**:
   - The reference implementations in `stitch_design_system_implementation` are static HTML prototypes using Tailwind CSS CDN scripts and Google Material Symbols icons.
   - Per design system contracts, the production application must implement these exact layouts using `@jacxishippingorg/jx-ui-react`, `motion`, and `lucide-react` icons (replacing Google Material Symbols with semantic Lucide equivalents, e.g. `grid_view` -> `LayoutGrid`, `dns` -> `Server`, `memory` -> `Cpu`, `terminal` -> `Terminal`, `verified_user` -> `ShieldCheck`).
3. **Mock Data Identification**:
   - The reference mockups feature realistic SecOps operator data ("Sarah J.", "srv-us-east-412", "14ms latency", "1,840 eps"). All state stores must initialize with structured mock datasets that reflect this fidelity while clearly designating sample telemetry via explicit state models.

---

## 7. Conclusion

The specification mining of the AI Bridge Enterprise Dashboard is 100% complete:
- **15 authenticated and unauthenticated screens** (Screen 0 through Screen 14) are fully mapped with structural layouts, telemetry ribbons, interactive controls, and modal flows.
- **Global shell controls** (Navigation rail, top status ribbon, command jump, emergency all-stop, profile drawer) are cataloged.
- **Data models and state definitions** for nodes, tasks, approvals, audit blocks, workflows, and MCP streams are formalized in clean TypeScript interfaces.
- **Anti-patterns** (no purple gradients, no emojis, no generic AI marketing fluff) and design system foundations (`tactile_specular_engineered`, elevation, typography, and color tokens) are documented and verified.
- The downstream UI/UX engineering agents now possess a complete, authoritative reference and can implement all screens without ambiguities.

---

## 8. Verification Method

To verify these discoveries independently:
1. **Inspect Design Specifications**:
   - Run `view_file` on `apps/dashboard/DASHBOARD_DESIGN_SPEC.md` to confirm the 15-screen inventory and component contracts.
   - Run `view_file` on `apps/dashboard/stitch_design_system_implementation/tactile_specular_engineered/DESIGN.md` to confirm color, typography, and elevation tokens.
2. **Inspect Reference Screen HTML Files**:
   - Check all 12 directories in `apps/dashboard/stitch_design_system_implementation/` to verify HTML structure, flex/grid layouts, data attributes, and inline micro-interactions.
3. **Verify Token Contracts**:
   - Compare `surface-canvas` (`#0B0F19`), `surface-elevated` (`#111827`), `surface-shelf` (`#1E293B`), and `jx-elevation-1`/`jx-elevation-2` values in `tailwind.config` across all reference HTML files.
4. **Verify No Code Modification**:
   - Verify `git status` to ensure `apps/dashboard/src` remains untouched by this survey role.

