AI Bridge — Enterprise Fleet Control Plane & Dashboard
Functional UX & Screen Architecture Specification
Document Version: 3.1.0 • AI Bridge Enterprise UX Specification — JXUI-Aligned
1. System Overview & Core User Flows
AI Bridge is a zero-trust enterprise control plane that connects autonomous AI agents (OpenAI, Claude, Gemini, Cursor, local LLMs) to distributed edge infrastructure (Windows workstations, Linux servers, cloud nodes) with cryptographic guardrails, human approvals, and real-time vision telemetry.

This specification documents the functional requirements, information architecture, data models, interactive controls, and visual implementation direction across every screen. The visual system is defined by the companion JXUI (@jxui/react) Design System specification. JXUI is the single source of truth for tokens, components, themes, geometry, motion, and interaction behavior. Do not invent a parallel design system.
1A. Design System Contract — JXUI Is the Single Source of Truth
1A.1 Governing design system
The AI Bridge dashboard MUST be designed and implemented using the existing JXUI (@jxui/react) design system documented in Design.md.

The dashboard specification defines product-specific information architecture and workflows. Design.md defines the reusable visual language, tokens, component behavior, and component catalog. If a visual or component decision is not explicitly specified here, follow Design.md rather than inventing a new pattern.

Do not create a second, competing design system. Do not introduce unrelated colors, typography, radii, shadows, motion curves, or one-off component styles.

The intended outcome is a polished enterprise infrastructure product: visually distinctive because JXUI is applied consistently and thoughtfully, not because every available visual effect is used at once.
1A.2 JXUI foundation — use the documented values
Use the existing JXUI foundation exactly as defined in Design.md:
- Typography: Plus Jakarta Sans for interface typography; JetBrains Mono with tabular-nums for metrics, counters, timestamps, identifiers, code, logs, hashes, and data grids.
- Accent palettes: use useJXTheme() and the five documented palettes: Indigo #4f46e5, Violet #7c3aed, Emerald #059669, Rose #e11d48, and Ocean #0284c7. Do not hardcode a sixth dashboard-only accent.
- Dark mode surfaces: preserve the documented hierarchy: Canvas #0B0F19, Elevated Surfaces #111827, and Subtle Shelves #1E293B.
- Elevation: use the JXUI elevation tiers and specular border treatment from Design.md; do not add arbitrary shadow recipes per screen.
- Radius: use the documented global radius scale: Sharp (0px), Small (8px), Medium (12px), Large (16px), Ultra (24px). Select one coherent dashboard default and use larger radii only where the component's role warrants them. Do not mix radius scales randomly.
- Motion: use the JXUI tactile settling curve cubic-bezier(0.22, 1, 0.36, 1) and documented spring behavior where it improves feedback. Respect reduced-motion preferences.
- Stable geometry: use useLockGeometry for state-changing controls where label/content changes could otherwise cause layout shift. Use JXUI layout-aware skeletons and preserve component dimensions during loading.
- Accessibility: follow the JXUI keyboard, semantic ARIA, visible focus, contrast, and touch-target requirements documented in Design.md.
The light theme must use the corresponding JXUI theme tokens and palette implementation. Do not invent light-mode surface hex values if they are not defined in the JXUI implementation; use the actual exported theme tokens.
1A.3 Enterprise visual direction — how to apply JXUI
JXUI includes expressive glass, spotlight, gradient, magnetic, spring, and spatial components. These are capabilities, not a mandate to use every effect everywhere.

For AI Bridge, apply them with product judgment:
- Use quiet, stable, low-distraction surfaces for the global shell, data tables, audit records, device inventory, approvals, policy editors, and logs.
- Use JXUI glass and specular depth selectively for floating command surfaces, transient overlays, selected hero/telemetry surfaces, or live desktop controls when it improves layering and focus.
- Use tactile spring feedback for direct manipulation and important state transitions, not for every static element.
- Use magnetic, cursor-following, tilt, particle, liquid, and continuously animated effects sparingly. They must never reduce legibility, interfere with precise controls, or make an operational tool feel like a toy.
- Avoid decorative bento layouts when a table, list, split pane, or structured form is the clearer interface.
- Sound and haptic feedback must be optional, respectful, and user-configurable. Never play sounds automatically for every routine action.
- Keep the product visually calm under high information density. The interface should feel deliberate and engineered, not like a component showcase.
1A.4 JXUI component selection rules
Prefer the documented JXUI showcase components and primitives over custom-built lookalikes. Use the component that best fits the information and interaction pattern; do not select a component merely because it is visually impressive.
Dashboard need	Preferred JXUI components / patterns
Application header and navigation	JXAppBar, JXNavigationRail, JXDrawer, JXBreadcrumbs, JXMenu, JXMenuItem
Buttons and action groups	JXButton, JXButtonGroup, JXToggleButtonGroup, SplitButton, HoldToConfirmButton
Content surfaces	JXPaper, JXCard, JXBox, JXContainer, JXStack, JXGrid, PanelGroup, SplitPane
Inputs and filters	JXTextField, JXSelect, JXAutocomplete, JXNumberField, SearchInput, MultiSelect, DateRangePicker
Tabs and navigation within a page	JXTabs, JXTab, JXStepper
Tables and data grids	JXTable, JXDataGrid, SmartDataTable, VirtualizedTable, TableToolbar, ColumnManager, JXPagination
Status and labels	JXBadge, JXChip, StatusIndicator, ConnectionStatus
Dialogs and inspectors	JXDialog, JXModal, JXDrawer, JXPopper, SmartPopover, OverlayStack
Notifications and feedback	JXAlert, JXSnackbar, InlineAlert, ProgressToast, ErrorBoundaryFallback
Loading and progress	JXSkeleton, JXProgress, SkeletonTable, SkeletonText, TaskProgress, SegmentedProgress
Metrics and telemetry	MetricCard, JXCharts, Sparkline, NumberCounter, InteractiveGauge (only when a gauge is genuinely useful)
Timeline and audit activity	JXTimeline, Timeline, EventTimeline
Code and JSON	CodeEditor, JsonEditor, DiffViewer
AI and workflow surfaces	AIToolCall, AIToolTrace, AIApprovalCard, AIWorkflowBuilder, AIModelSelector
Screenshot and visual inspection	ImageLightbox, ImageComparison, JXImageList
Identity and operator presence	JXAvatar, JXAvatarGroup
Help and onboarding	JXTooltip, JXHtmlTooltip, TourGuide


This mapping is a recommended starting point. Confirm actual exported names, props, and implementation availability against the installed JXUI package before coding. Do not assume a catalog entry is implemented or importable solely because it appears in the design-system specification.
1A.5 Component composition and consistency
- Compose screens from shared JXUI components. Do not create screen-specific button, badge, input, card, or dialog variants that duplicate library functionality.
- Use JXUI component variants and theme tokens rather than inline hardcoded values.
- Keep the same button hierarchy, field height, table density, badge semantics, focus treatment, and dialog structure throughout the dashboard.
- Use JXUI layout primitives for consistent alignment and responsive composition.
- Use JXBadge / JXChip consistently for semantic states. Status must always be understandable from text or icon as well as color.
- Use JXTable / JXDataGrid for operational records; avoid turning every record into a large card.
- Use JXDialog for focused confirmations and JXDrawer for contextual detail inspection where the user needs to preserve page context.
- Use JXSkeleton / SkeletonTable patterns that match the final content geometry.
- Avoid one-off CSS overrides unless a genuine product requirement cannot be expressed with existing JXUI tokens or variants. Any new reusable pattern should be contributed to the shared component system rather than implemented as a local hack.
1A.6 AI Bridge product design quality bar
The finished dashboard must look like a mature, professionally designed enterprise control plane.
- Use a clear page title, concise description, and one obvious primary action where appropriate.
- Prioritize operational information and common tasks. Do not add oversized marketing-style hero sections to authenticated screens.
- Use meaningful whitespace and alignment, not a uniform wall of cards.
- Keep tables and technical data compact, aligned, and readable.
- Show data freshness, units, status, ownership, and risk context where relevant.
- Use charts only when they communicate a real operational pattern; do not add decorative graphs to fill space.
- Keep the emergency halt, revoke, reboot, arbitrary shell, and destructive file actions unmistakable and protected by deliberate confirmation.
- Do not fabricate live device names, metrics, task events, or connectivity states. Any mock data in design files must be visibly identified as sample data.
- Design the empty, loading, stale, offline, failed, denied, and permission-restricted states—not just the populated happy path.
- Responsive layouts must preserve task priority and action accessibility instead of simply shrinking desktop cards.
1A.7 Design review and acceptance criteria
Before implementation is approved, verify:
1. All colors, typography, radius, elevation, and motion come from JXUI tokens or documented variants.
2. useJXTheme() controls the supported accent palette and theme behavior.
3. Light and dark modes are coherent across every screen.
4. Shared JXUI components are reused consistently; no duplicate local design system has emerged.
5. Glass, glow, spring, magnetic, and animated effects are selective and never harm operational clarity.
6. Data tables, logs, code, terminal, and audit views remain readable at realistic information density.
7. Loading and state transitions preserve geometry where applicable.
8. Keyboard navigation, visible focus, semantic labels, ARIA feedback, contrast, and touch targets meet the JXUI accessibility contract.
9. All 15 screens have responsive layouts and meaningful empty/error/offline states.
10. The implementation uses real exported JXUI components and verified props—not guessed APIs or decorative placeholders.
2. Global Shell & Navigation Framework
Every authenticated screen lives inside a responsive global shell comprising:
1. Collapsible Navigation Rail / Sidebar
2. Top Header Bar with Context & Global Controls
3. Quick Jump / Command Palette Modal (Ctrl/Cmd + K)
4. Global Keyboard Shortcuts Cheat Sheet (?)
5. Emergency Halt / Kill-Switch Action
2.1 Navigation Structure
Organized into two primary domains:
- Operations Domain (Fleet Execution & Observability):
  1. overview: Command Overview (Fleet health, throughput, execution telemetry)
  2. devices: Enrolled Devices (Agent inventory, polling intervals, registration)
  3. device_detail: Device 360 System (Hardware metrics, processes, apps, ports)
  4. tasks: Task Queue & Vision (Dispatch console, payload inspector, screenshot viewer)
  5. live_studio: Live Desktop Studio (Low-latency visual stream, operator takeover)
  6. terminal: Interactive Terminal (Bidirectional shell session)
  7. workflows: Autonomous Workflows (Multi-step plans, visual verification checkpoints)
  8. fleet_ops: Fleet Operations (Cross-node command bus, cron jobs, reactive self-healing)
  9. ai_api: AI API & Agents Hub (LLM endpoint routing, code snippets, token metrics)
- Governance Domain (Security, Compliance & Audit):
  10. approvals: Human Approvals (High-risk tier operation review and authorization)
  11. policies: Security Policies (Versioned execution rules, allowlists, webhooks)
  12. audit: Append-Only Audit Trail (Immutable ledger, filtering, CSV/JSON export)
  13. connections: MCP & OAuth (Model Context Protocol server status, OAuth sessions)
  14. logs: Diagnostics & Logs (Live systemd journal / event stream, level filters)
2.2 Global Top Header Controls
- Breadcrumbs / Current View Title: Indicates current screen and scoped device (if any).
- Command Palette Button: Quick jump trigger displaying shortcut indicator.
- Gateway Status Indicator: Live round-trip latency (ms) and server build version.
- Auto-Refresh Toggle: Enable/disable automatic polling interval (default 15s).
- Data Export Action: Quick export of current dataset to CSV or JSON.
- Emergency Halt (All-Stop): Requires intentional confirmation to immediately pause all running tasks.
- Theme Toggle: Switch between Light and Dark mode.
- Operator Profile / Session Menu: Displays current username, role, and logout action.
3. Detailed Screen-by-Screen Specifications
Screen 0: Login & Authentication Console (!authed)
- Objective: Authenticate administrators or operators into the control plane.
- Layout: Centered authentication card container.
- Content & Functional Elements:
  - Header: Brand identifier, system title ("AI Bridge Fleet Gateway"), and subtitle.
  - Gateway Status: Dynamic connectivity status chip (checking, online with latency, or offline).
  - Single Sign-On (SSO): Rendered when OIDC is configured (e.g., "Continue with Google SSO").
  - Divider: Visual separator with "or authenticate directly" label.
  - Tabbed Authentication Selector:
    - Tab 1: Admin Token
      - Text input for secret bearer token with password masking and visibility toggle.
      - Fast-action triggers: "Paste from Clipboard" and "Insert Dev Token".
      - Contextual helper text explaining environment variable source.
    - Tab 2: Operator Login
      - Username text input with autocomplete attribute.
      - Password text input with built-in entropy / strength meter.
  - Session Persistence: Checkbox option ("Remember this workstation").
  - Submit Action: Primary submit button with dynamic loading feedback ("Validating...").
  - Error Feedback: Non-blocking alert container rendered on failed authentication with descriptive message.
  - Footer Metadata: Compliance and security indicators (Encryption standard, audit status).
Screen 1: Command Overview (overview)
- Objective: Executive overview of fleet health, task velocity, and security posture.
- Layout: 4-metric summary ribbon at top, 2-column analytics split below, live execution stream at bottom.
- Content & Functional Elements:
  - Summary KPI Cards:
    1. Active Fleet Nodes: Total enrolled devices, online count, offline count.
    2. Task Throughput (24h): Completed count vs failed count with completion percentage bar.
    3. Pending Approvals: Urgent count requiring human review.
    4. Fleet Heartbeat Latency: Median agent polling latency in ms.
  - Risk Tier Distribution:
    - Execution volume categorized by risk tier:
      - Tier 1 (Safe Observation): Read-only system queries.
      - Tier 2 (Workspace Modification): File edits, test runs, app launch.
      - Tier 3 (Arbitrary Shell / Deletion): Commands, deletions, package installs.
    - Visual proportion meters for each tier.
  - Task Status Breakdown:
    - Tally and percentages across statuses: Completed, Running, Pending, Failed, Denied.
  - Quick Launchpad:
    - Shortcut buttons to dispatch common tools (Capture Screenshot, List Windows, Top Processes, System Specs).
  - Live Activity Feed:
    - Recent 10 tool invocations showing device ID, tool name, actor, timestamp, status badge, and view details action.
Screen 2: Enrolled Devices (devices)
- Objective: Complete inventory and lifecycle management of connected Windows and Linux agents.
- Layout: Filterable toolbar above a data table.
- Content & Functional Elements:
  - Toolbar Controls:
    - Status filter chips: All, Online, Offline, Pending.
    - Search input: Live search filtering by Device ID, Hostname, OS version, or Architecture.
    - Enroll Device CTA: Opens modal with registration command.
  - Device Inventory Table:
    - Columns:
      1. Status indicator: Online, Offline, or Revoked.
      2. Device Identity: Hostname, UUID, CPU architecture (x86_64, arm64).
      3. Operating System: Platform icon and OS release string.
      4. Polling Cadence: Relative last heartbeat (e.g. "4s ago") and polling interval.
      5. Workspace: Configured root directory path on remote machine.
      6. Actions (Sticky column): Inspect 360, Dispatch Task, Revoke Access.
  - Device Enrollment Modal:
    - Pre-generated shell command (curl one-liner for Linux or PowerShell script for Windows).
    - Single-click copy action with visual confirmation.
Screen 3: Device 360 System Dashboard (device_detail)
- Objective: Deep-dive telemetry, diagnostic inspection, and control of a selected device.
- Layout: Breadcrumb header with device switcher, 4-gauge hardware ribbon, tabbed sub-panels.
- Content & Functional Elements:
  - Hardware Gauges:
    - CPU Utilization: Real-time percentage with per-core breakdown graph.
    - Memory (RAM): Used vs Total GB with percentage bar and swap info.
    - Storage Volumes: Mounted partitions with used/free capacity bars.
    - Network Throughput: Live RX/TX rate (KB/s) and IP address list.
  - Diagnostic Sub-Views (Tabs):
    - Tab A: Running Processes: Filterable table of active processes sorted by CPU and memory footprint with Kill Process option.
    - Tab B: Installed Applications: List of detected application executables with Launch Application shortcut.
    - Tab C: Network Sockets & Ports: Active listening TCP/UDP ports and established connections.
    - Tab D: System Services: Background systemd daemons or Windows Services with Start, Stop, and Restart controls.
  - Quick Hardware Commands:
    - Action buttons: Capture Screen, Flush DNS, Create Backup, Reboot Agent.
Screen 4: Task Queue & Vision Inspector (tasks)
- Objective: Dispatch tools to devices, inspect execution history, and view captured desktop screenshots.
- Layout: Split screen — Left: Tool Dispatch Studio; Right: Execution Queue & Vision Inspector.
- Content & Functional Elements:
  - Tool Dispatch Studio:
    - Target Device selector dropdown.
    - Tool selector dropdown annotated with Risk Tier classifications.
    - Tool Description Card explaining accessed resources and safety considerations.
    - JSON Argument editor with validation and formatting helper.
    - Preset Quick-Fill Chips (System Info, Screenshot, Top Processes, Shell Command).
    - Dispatch Action button with loading state.
  - Task Queue & Vision Table:
    - Filterable list of all submitted tasks with pagination controls.
    - Status badges (completed, running, needs_approval, failed).
    - Duration calculation (seconds elapsed).
    - CSV Export button for task history.
  - Task Inspection Modal:
    - Text/JSON result viewer with syntax highlighting and copy button.
    - Vision Screen Viewer: If the task output contains image_base64, renders an interactive full-resolution screenshot viewer with zoom and pan.
Screen 5: Live Desktop Studio & Dual-Control (live_studio)
- Objective: Real-time visual screen stream with human operator mouse and keyboard takeover.
- Layout: Workstation viewport canvas with floating floating control toolbar.
- Content & Functional Elements:
  - Live Stream Viewport:
    - Real-time canvas rendering remote screen stream at 30–60 FPS.
    - Latency indicator chip displaying network round-trip in milliseconds.
    - Resolution and scaling mode toggle (Fit to Window, 1:1 Pixel Native).
  - Dual-Control Takeover Bar:
    - Mode Switch: "Observer Only" vs "Operator Takeover (Interactive)".
    - Mouse Event Capture toggle (forwards clicks, double-clicks, drags, and scrolling).
    - Virtual Keyboard Input toggle (types keystrokes, provides shortcut buttons for Ctrl+Alt+Del, Win+R, Alt+Tab).
  - Vision AI Set-of-Marks (SoM) Overlay:
    - Toggle displaying detected bounding boxes, clickable UI element IDs, and OCR text labels over the stream.
  - Active Windows HUD:
    - Window switcher listing open desktop applications with click-to-focus action.
Screen 6: Interactive Live Terminal (terminal)
- Objective: Bidirectional pseudo-terminal (PTY) session into the target node.
- Layout: Terminal studio header with device selector, followed by high-contrast ANSI terminal canvas.
- Content & Functional Elements:
  - Console Session Header:
    - Target Device selector dropdown.
    - Shell type indicator (PowerShell Core 7 on Windows, Bash on Linux).
    - Connection status indicator (Connected, Reconnecting, Disconnected).
    - Control actions: Clear Console Buffer, Send Interrupt (Ctrl+C), Export Session Log.
  - Terminal Viewport:
    - High-contrast monospace terminal supporting ANSI color codes, text selection, and scrollback history.
  - Command Quick Bar:
    - Pre-saved common commands (e.g., ipconfig /all, docker ps, journalctl -xe).
Screen 7: Autonomous Workflows & Multi-Turn Plans (workflows)
- Objective: Design, configure, and monitor multi-step agentic workflows with visual checkpoints.
- Layout: Workflow list on left; Visual step pipeline and execution timeline on right.
- Content & Functional Elements:
  - Workflow Pipeline Graph:
    - Step sequence editor showing:
      - Step 1: Observation action (e.g. take_screenshot).
      - Step 2: Verification checkpoint (e.g. ocr_screen verifying specific text exists).
      - Step 3: Conditional execution (if text found, click button; else trigger retry).
      - Step 4: Completion or fallback.
  - Execution Stream:
    - Multi-turn progress indicator (e.g. "Step 2 of 4 Running...").
    - Step-by-step input parameters, output data, screenshots, and execution duration.
  - Workflow Builder Modal:
    - Add steps, set timeout limits, configure max retry counts, and insert approval stops.
Screen 8: Fleet Operations & Self-Healing Hub (fleet_ops)
- Objective: Cross-device command broadcasting, automated self-healing triggers, and cron scheduling.
- Layout: 3-section layout (Command Bus, Reactive Self-Healing Rules, Scheduled Cron Jobs).
- Content & Functional Elements:
  - Multi-Node Command Bus:
    - Target selector: All Devices, Devices matching Tag, or Custom Node Picker.
    - Script/Tool payload input.
    - Broadcast dispatch action with concurrent progress counter (e.g. "38/40 Succeeded").
  - Self-Healing Reactive Triggers:
    - Configurable reactive rule cards:
      - Trigger Condition: Metric threshold (e.g., CPU > 95% for 5 mins) or Service Status (e.g., Agent service stopped).
      - Automated Action: Restart service, flush cache, or notify operator.
      - Enable/Disable switch, trigger count, and last executed timestamp.
  - Cron Scheduler:
    - Table of recurring jobs with standard 5-field cron syntax (e.g., 0 2 * * *), target nodes, and last execution status.
Screen 9: AI API & Custom Agents Hub (ai_api)
- Objective: Connect custom LLMs and scripts to communicate with the fleet via standardized APIs.
- Layout: Split view — Provider configuration cards, Code snippet generator, Interactive API tester.
- Content & Functional Elements:
  - Provider Connectors:
    - Config cards for OpenAI, Anthropic Claude, Google Gemini, and Local Ollama instances.
    - Endpoint URL and API key configuration dialogs.
  - Code Snippet Generator (Tabbed):
    - Ready-to-copy integration examples:
      - Python SDK snippet.
      - TypeScript / Node.js snippet.
      - cURL / REST HTTP snippet.
  - Interactive API Tester:
    - Prompt input field with direct model query action.
    - Tool-calling payload inspector showing raw model function calls and fleet response.
Screen 10: Human-in-the-Loop Approvals (approvals)
- Objective: Airgapped human review and authorization for high-risk Tier-3 and Tier-4 operations.
- Layout: Pending requests list on top, detailed approval inspector modal below.
- Content & Functional Elements:
  - Pending Queue Cards:
    - Operation risk badge (Tier 3 Shell Execution, Tier 3 File Deletion, Tier 4 App Deployment).
    - Requester identity (Agent UUID / Client name) and Target Device ID.
    - Submission timestamp and countdown timer before auto-expiration.
  - Approval Inspector Details:
    - Exact Arguments Diff: Formatted view of the exact command or payload requested.
    - Visual Desktop Context: Embedded screenshot of the remote screen taken at the exact moment approval was requested.
    - Decision Controls:
      - Approve Button: Immediately authorizes and executes the pending task.
      - Deny Button: Requires entering an optional or mandatory rejection reason sent back to the agent.
  - Historical Decision Archive:
    - Log of previously approved and denied requests with operator attribution and decision timestamps.
Screen 11: Security Policies & Webhooks (policies)
- Objective: Configure execution guardrails, tool allowlists, and incident notification webhooks.
- Layout: 2-column layout — Left: Versioned Policy Matrix; Right: Webhook Integrations.
- Content & Functional Elements:
  - Policy Rule Editor:
    - Executable Allowlists & Blocklists: Configurable list of permitted applications (e.g., chrome.exe) and blocked binaries.
    - Restricted Filesystem Paths: Directory patterns off-limits to agent tools (e.g., C:\Windows\System32, /etc).
    - Risk Tier Reclassification Matrix: Custom overrides for tool tiers.
    - Policy version history with rollback action and "Publish New Version" button.
  - Webhook Integration Manager:
    - Channel cards for Slack, Discord, Microsoft Teams, and PagerDuty.
    - Webhook URL input and event subscription checkboxes (Approval Needed, Agent Offline, Task Failed).
    - "Send Test Ping" button with delivery verification feedback.
Screen 12: Append-Only Audit Trail (audit)
- Objective: Cryptographically verifiable, immutable compliance ledger of all system activity.
- Layout: Filter toolbar, audit summary statistics, dense data grid, export suite.
- Content & Functional Elements:
  - Filter Toolbar:
    - Date range picker.
    - Actor filter (AI Agent, Human Operator, System Cron).
    - Tool name filter.
    - Governance decision filter (Approved, Denied, Auto-Allowed).
  - Audit Event Table:
    - Columns:
      1. Timestamp: UTC and localized ISO timestamp.
      2. Actor: Agent ID or Operator username.
      3. Action / Tool: Name of tool invoked.
      4. Target Device: Hostname and Device UUID.
      5. Governance Decision: Approved, Denied, or Auto-Allowed.
      6. Audit Hash: Cryptographic SHA-256 hash verifying sequential record integrity.
  - Export Actions:
    - Single-click Export CSV and Export JSON actions.
Screen 13: MCP & OAuth Connections (connections)
- Objective: Monitor Model Context Protocol (MCP) streamable endpoints and OAuth 2.0 gateway health.
- Layout: MCP server status cards, active client session list, OAuth token management.
- Content & Functional Elements:
  - MCP Gateway Status Card:
    - Protocol endpoint URL (/mcp/v1).
    - Transport type: Streamable HTTP with Server-Sent Events (SSE).
    - Active client connections gauge.
  - Connected AI Clients:
    - Active client sessions (e.g., Claude Desktop, Cursor, OpenAI clients).
    - Client IP address, connected duration, and token usage metrics.
  - OAuth 2.0 Gateway Sessions:
    - Active bearer access tokens and authorization codes.
    - One-click session revocation buttons.
Screen 14: Service Diagnostics & Logs (logs)
- Objective: Live system logs from the host control plane, agents, and reverse proxy.
- Layout: Filter toolbar, high-contrast monospace log viewer, download manager.
- Content & Functional Elements:
  - Log Toolbar:
    - Service selector dropdown (ai-bridge-core, ai-bridge-mcp, nginx-proxy).
    - Log level filter dropdown (ALL, DEBUG, INFO, WARN, ERROR).
    - Line buffer limit selector (100, 250, 500, 1000 lines).
    - Live Auto-Scroll Toggle switch.
  - Monospace Log Viewer:
    - Syntax-highlighted log stream with timestamp, log level tag, service identifier, and message content.
    - In-buffer text search and filtering.
  - Export Actions:
    - "Download Raw Log File" and "Copy Buffer to Clipboard".
4. Component & Interactive Control Inventory
Use this structural component inventory to build your component set in Figma / Stitch:
Component Type	Functional Purpose	Interactive States Required
Container Card	Groups related content and modules	Default, Hover, Focused
Metric / Stat Card	Displays key KPI with label, number, and trend	Default, Loading skeleton
Primary Button	Submits forms, executes key actions	Default, Hover, Active, Disabled, Loading
Secondary Button	Low-emphasis secondary actions	Default, Hover, Active, Disabled
Destructive Button	High-risk irreversible actions (Reboot, Revoke, Delete)	Default, Hover, Press-and-Hold Progress
Segmented Tabs	Switches between views or modes within a panel	Default, Active tab, Hover
Text Input	Single-line text and token entry	Default, Focus ring, Filled, Error, Clearable
Password Input	Sensitive credentials entry	Default, Masked, Revealed, Entropy meter bars
Checkbox	Toggles boolean states	Unchecked, Checked, Indeterminate, Focus
Switch Toggle	Immediate on/off configuration	Off, On, Disabled
Dropdown / Select	Single and multi-option selection	Closed, Open menu, Selected, Disabled
Status Badge / Chip	Displays node health, risk tier, or category	Safe/Success, Warning/Pending, Critical/Error, Neutral
Divider	Separates sections or forms with optional center label	Solid, Dashed, or Center-labeled
Alert Banner	Contextual inline error or warning feedback	Info, Success, Warning, Error
Modal Dialog	Focused overlay for confirmations, forms, or inspection	Open overlay, Header, Body, Action footer
Data Table	Structured records with sorting and actions	Header, Hoverable row, Selected row, Sticky action column
Terminal Canvas	Monospace text output buffer with ANSI color rendering	Auto-scroll on, Auto-scroll paused, Text selected


5. Summary & Hand-Off Workflow
1. Design in Figma / Stitch: Use this AI Bridge specification for product structure and workflows, and Design.md for the JXUI visual system, components, tokens, and interaction rules. Do not invent a competing visual system.
2. Hand-Off to Antigravity: Provide your Figma or Stitch file, screenshots, or design tokens.
3. Native Implementation: Implement the approved product design using verified exports from @jacxishippingorg/jx-ui-react (@jxui/react as named in the design-system specification). Confirm the actual package entry point and component exports in the repository before importing; do not guess package paths or props.
7. Source-of-Truth Documents
This project uses two complementary specifications:
- DASHBOARD_DESIGN_SPEC.md (this document): AI Bridge product requirements, navigation, screen architecture, workflows, data presentation, and operational interactions.
- Design.md: JXUI design-system philosophy, tokens, theme palettes, typography, surfaces, elevation, radii, motion, accessibility, component catalog, and developer tooling.
Use both documents together. In case of conflict:
1. Product workflow and operational behavior are governed by this dashboard specification.
2. Visual tokens, component APIs, and shared component behavior are governed by Design.md and the actual installed JXUI implementation.
3. Security-sensitive behavior must follow the explicit confirmation, authorization, and audit requirements in this dashboard specification.