# Project: AI Bridge Enterprise Dashboard Reconstruction

## Architecture
- **Target Application**: `apps/dashboard`
- **Design System**: Exclusively `@jacxishippingorg/jx-ui-react` (v3.0.0), `motion/react` (v14.9.0), and `lucide-react` (v0.469.0)
- **Zero-Custom-UI Guarantee**: Absolutely no custom CSS files (`fluent2.css` and `jxui.css` deleted), no inline `style={{...}}` attributes, no CSS modules, SCSS, or Tailwind wrapper classes. All layout and styling handled via library layout primitives (`JXBox`, `JXGrid`, `JXGridItem`, `JXStack`, `JXContainer`, `JXCard`, `JXTabs`, `JXTable`, `JXDialog`, `JXAlert`, etc.).
- **Anti-AI Design Language**: Clean, disciplined enterprise SaaS aesthetic; dark slate/indigo palette (`#0B0F19`, `#0f131d`, `#111827`); monospace typography (`JetBrains Mono`) for all metrics, hashes, PIDs, and code; restrained semantic status colors; zero decorative gradients, blobs, emojis, or marketing fluff.
- **State Architecture**: Centralized realistic local state store (`src/state/dashboardStore.ts`) providing full operational data models (`EnrolledDevice`, `TaskInvocation`, `ApprovalRequest`, `WorkflowPlan`, `AuditEvent`, `MCPConnection`, `OAuthClient`, `LogRecord`) with reactive event dispatches across all 15 screens.

## Code Layout
```
apps/dashboard/
├── index.html                           # Clean HTML shell, Google Fonts (Plus Jakarta Sans, JetBrains Mono)
├── package.json                         # Strict dependencies: @jacxishippingorg/jx-ui-react, motion, lucide-react, react, react-dom
├── vite.config.ts                       # Vite bundler config with chunk optimization
├── tsconfig.json                        # Strict TypeScript config
└── src/
    ├── main.tsx                         # App entrypoint wrapped in JXThemeProvider
    ├── tailwind.css                     # Standard Tailwind CSS v4 compiler import
    ├── api.ts                           # Fleet REST client and SSE endpoint helpers
    ├── types/
    │   └── dashboard.ts                 # Full domain TypeScript interfaces & enums
    ├── state/
    │   └── dashboardStore.ts            # Realistic enterprise state, seed data & reactive dispatches
    ├── shell/
    │   ├── AppShell.tsx                 # Main layout: SidebarNav + TopHeader + content viewport
    │   ├── SidebarNav.tsx               # Collapsible navigation rail (Operations & Governance domains)
    │   ├── TopHeader.tsx                # Status pills, ⌘K search, 15s auto-poll, Emergency All-Stop, profile
    │   └── CommandPaletteModal.tsx      # Quick jump modal with fuzzy search across 15 screens & actions
    ├── views/
    │   ├── LoginView.tsx                # Screen 0: Zero-Trust Dual-Auth Console
    │   ├── OverviewView.tsx             # Screen 1: Command Overview & Bento Metrics
    │   ├── DevicesView.tsx              # Screen 2: Enrolled Devices & Enrollment Modal
    │   ├── Device360View.tsx            # Screen 3: Device 360 System Dashboard & Hardware Gauges
    │   ├── TaskQueueVisionView.tsx      # Screen 4: Task Queue & Vision Inspector (SoM Overlay)
    │   ├── LiveDesktopView.tsx          # Screen 5: Live Desktop Studio & Dual-Control Takeover
    │   ├── TerminalView.tsx             # Screen 6: Interactive ANSI Live Terminal & Snippets
    │   ├── WorkflowsView.tsx            # Screen 7: Autonomous Workflows & Multi-Turn DAG Stepper
    │   ├── FleetOperationsView.tsx      # Screen 8: Multi-Node Broadcast, Self-Healing & Cron Scheduler
    │   ├── AiApiHubView.tsx             # Screen 9: AI API & Custom Agents Hub with Multi-Language SDKs
    │   ├── HumanApprovalsView.tsx       # Screen 10: Human-in-the-Loop Approvals & AST Diff Inspector
    │   ├── SecurityPoliciesView.tsx     # Screen 11: Security Policies, Allowlist & Webhook Manager
    │   ├── AuditTrailView.tsx           # Screen 12: Merkle Root Ledger & Cryptographic Verifier
    │   ├── ConnectionsView.tsx          # Screen 13: MCP Server Streams & OAuth Credential Vault
    │   └── DiagnosticsLogsView.tsx      # Screen 14: Systemd Log Stream, Ring Buffer & JSON Inspector
    └── App.tsx                          # Root router binding active view state and modals
```

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| F1 | Zero-Trust Dual-Auth Console | Authenticates operators via Admin Secret Token, credentials, or Google SSO | M2 | DASHBOARD_DESIGN_SPEC.md §3 |
| F2 | mTLS Control Plane Status Bar | Displays real-time gateway latency, build version, and zero-trust sync | M1 | Reference Screens Header |
| F3 | Global Command Palette (⌘K) | Modal search for instant jumping to devices, tools, pages, and actions | M1 | DASHBOARD_DESIGN_SPEC.md §2 |
| F4 | Emergency All-Stop Killswitch | Hold-to-confirm button immediately halts all running tasks across fleet | M1 | Reference Screens Header |
| F5 | SmartDataTable Device Inventory | Paginated, filterable grid of all 40 enrolled Windows, Linux, and macOS agents | M2 | ai_bridge_enrolled_devices/code.html |
| F6 | Cross-Platform Agent Enroller | Modal providing pre-configured curl and PowerShell install scripts | M2 | ai_bridge_enrolled_devices/code.html |
| F7 | Device 360 Hardware Gauges | Real-time SVG meters for CPU (per-core), RAM (used/free), Disk, Network | M2 | ai_bridge_device_360_system_dashboard/code.html |
| F8 | Process Manager with Termination | Filterable process list with CPU/memory footprint and kill capability | M2 | ai_bridge_device_360_system_dashboard/code.html |
| F9 | Tool Dispatch Studio | Form to construct JSON arguments and execute tools on remote devices | M3 | ai_bridge_task_queue_vision_inspector/code.html |
| F10 | Set-of-Marks (SoM) Visual Inspector | Overlay rendering numbered bounding boxes on detected desktop elements | M3 | ai_bridge_task_queue_vision_inspector/code.html |
| F11 | Low-Latency Desktop Stream Canvas | WebRTC/SSE streaming remote screen at 30–60 FPS with scaling controls | M3 | ai_bridge_live_desktop_studio_dual_control/code.html |
| F12 | Dual-Control Operator Takeover | Seamless toggle between passive observation and interactive mouse/keyboard | M3 | ai_bridge_live_desktop_studio_dual_control/code.html |
| F13 | ANSI Monospace PTY Studio | Full interactive pseudo-terminal session into target node with snippets | M3 | ai_bridge_interactive_live_terminal/code.html |
| F14 | Multi-Turn DAG Pipeline Stepper | Visual progression stepper tracking agent reasoning, OCR, and actions | M3 | ai_bridge_autonomous_workflows_multi_turn_plans/code.html |
| F15 | Multi-Node Command Bus | Broadcasts shell or tool payloads across multiple tagged devices simultaneously | M4 | ai_bridge_fleet_operations_self_healing_hub/code.html |
| F16 | Reactive Self-Healing Rule Cards | Configures automated agent remediation rules based on metrics or crashes | M4 | ai_bridge_fleet_operations_self_healing_hub/code.html |
| F17 | Multi-Provider Agent Hub | Configures LLM endpoints (Claude, OpenAI, Gemini, Ollama) and generates SDK code | M4 | ai_bridge_ai_api_custom_agents_hub/code.html |
| F18 | Human-in-the-Loop Approval Modal | Airgapped approval workflow for Tier-3/4 dangerous shell and file actions | M4 | ai_bridge_human_in_the_loop_approvals/code.html |
| F19 | AST Command Diff Inspector | Formatted syntax diff highlighting dangerous parameters in requested commands | M4 | ai_bridge_human_in_the_loop_approvals/code.html |
| F20 | Executable Allowlist Matrix | Policy editor specifying permitted and blocked application binaries | M4 | ai_bridge_security_policies_webhooks/code.html |
| F21 | Webhook Dispatcher Suite | Manages outbound event webhooks to Slack, Teams, Discord, and PagerDuty | M4 | ai_bridge_security_policies_webhooks/code.html |
| F22 | Merkle Root Integrity Ledger | Append-only cryptographically verifiable audit log of every system action | M4 | ai_bridge_append_only_audit_trail/code.html |
| F23 | Multi-Format Audit Exporter | Generates immutable compliance exports of the ledger (CSV, JSON-LD, PDF) | M4 | ai_bridge_append_only_audit_trail/code.html |
| F24 | MCP Protocol Gateway Monitor | Tracks active Model Context Protocol SSE endpoints and client subscriptions | M4 | ai_bridge_mcp_oauth_connections/code.html |
| F25 | OAuth 2.0 Credential Vault | Issues, inspects, and revokes OAuth bearer tokens for AI agents | M4 | ai_bridge_mcp_oauth_connections/code.html |
| F26 | Wire Protocol Realtime Audit Drawer | Live JSON-RPC 2.0 frame inspector tailing MCP stream traffic | M4 | ai_bridge_mcp_oauth_connections/code.html |
| F27 | Monospace Systemd Log Canvas | Live streaming console for systemd journald and core microservices | M4 | ai_bridge_diagnostics_logs/code.html |
| F28 | Structured JSON Log Inspector | Side drawer parsing raw log line into interactive JSON attributes | M4 | ai_bridge_diagnostics_logs/code.html |
| F29 | Stream Pause Hotkey (Spacebar) | Keyboard shortcut to toggle live log tailing without losing position | M1 | ai_bridge_diagnostics_logs/code.html |
| F30 | Zero-Drop Ring Buffer Meter | Real-time gauge of memory ring buffer allocator utilization | M4 | ai_bridge_diagnostics_logs/code.html |
| F31 | Legacy CSS & Wrapper Elimination | Purge fluent2.css, jxui.css, ConfirmDialog, Pager, ViewLoadingSkeleton | M1 | Codebase Survey §1.4 |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Clean Slate Foundation & App Shell | Purge legacy CSS & wrappers; domain types, state store, AppShell, SidebarNav, TopHeader, CommandPaletteModal | none | DONE |
| M2 | Fleet & Hardware Observability Views | Screens 0, 1, 2, 3 (Login, Overview, Devices, Device 360) | M1 | DONE |
| M3 | Remote Execution, Vision & Interactive Control | Screens 4, 5, 6, 7 (Task Queue & Vision, Live Desktop, Terminal, Workflows) | M1 | DONE |
| M4 | Governance, Security & Ecosystem Views | Screens 8, 9, 10, 11, 12, 13, 14 (FleetOps, AI API, Approvals, Policies, Audit, MCP, Logs) | M1 | DONE |
| M5 | Full Dashboard Integration & Build Verification | Connect all views in App.tsx, unified navigation & state, verify `npm run build` with 0 errors | M2, M3, M4 | DONE |
| M6 | Final Acceptance & Adversarial Hardening | Pass 100% E2E tests (Tiers 1-4) & adversarial test hardening (Tier 5) | M5, TEST_READY.md | DONE |
| E2E | E2E Testing Track | Design test runner, Tiers 1-4 test suite, publish TEST_READY.md | M1 | DONE |

## Interface Contracts

### State Store ↔ View Components
```typescript
export interface DashboardStoreState {
  currentView: ViewId;
  setCurrentView: (view: ViewId) => void;
  devices: EnrolledDevice[];
  selectedDeviceId: string;
  setSelectedDeviceId: (id: string) => void;
  tasks: TaskInvocation[];
  dispatchTask: (params: TaskDispatchParams) => Promise<TaskInvocation>;
  approvals: ApprovalRequest[];
  resolveApproval: (id: string, verdict: 'approved' | 'denied', reason?: string) => Promise<void>;
  auditEvents: AuditEvent[];
  mcpConnections: MCPConnection[];
  oauthClients: OAuthClient[];
  logs: LogRecord[];
  isEmergencyStopActive: boolean;
  triggerEmergencyStop: () => Promise<void>;
  resumeFleet: () => Promise<void>;
  commandPaletteOpen: boolean;
  setCommandPaletteOpen: (open: boolean) => void;
  autoPollEnabled: boolean;
  setAutoPollEnabled: (enabled: boolean) => void;
}
```

### Global Shell ↔ Routing
- `SidebarNav` emits view change via `setCurrentView(id: ViewId)`.
- `TopHeader` renders gateway status, ⌘K search trigger, 15s auto-poll switch, `HoldToConfirmButton` for Emergency All-Stop, and user profile.
- All views are pure zero-custom-UI compositions using `@jacxishippingorg/jx-ui-react`, `motion/react`, and `lucide-react`.
