import { Fragment, useEffect, useState, useRef, useCallback, Suspense, lazy, type MouseEvent as ReactMouseEvent } from "react";
import {
  JXCard,
  JXCardHeader,
  JXCardContent,
  JXCardActions,
  JXButton,
  JXSwitch,
  JXChip,
  JXAlert,
  JXDivider,
  JXTypography,
  InteractiveCard,
  GlassModal,
  JXTextField,
  JXSelect,
  useJXTheme,
  TiltCard,
  SpotlightCard,
  MetricCard,
  PulseIndicator,
  StatusIndicator,
  MagneticButton,
  LiquidButton,
  HoldToConfirmButton,
  KineticBarChart,
  BentoGrid,
  JXTabs,
  JXPaper,
  JXCheckbox,
  AdaptiveGlass,
  FrostedGlass,
  ContentGlassCard,
} from "@jacxishippingorg/jx-ui-react";
import { api, token, sessionToken } from "./api";
import { ViewLoadingSkeleton } from "./ViewLoadingSkeleton";

const DevicePolicyEditor = lazy(() => import("./DevicePolicyEditor"));
const DeviceDetailDashboard = lazy(() => import("./DeviceDetailDashboard"));
const AiApiHub = lazy(() => import("./AiApiHub"));
const WorkflowPlanner = lazy(() => import("./WorkflowPlanner"));
const FleetOperations = lazy(() => import("./FleetOperations"));
const LiveDesktopStudio = lazy(() => import("./LiveDesktopStudio"));
const TerminalStudio = lazy(() => import("./TerminalStudio"));
const HumanApprovals = lazy(() => import("./HumanApprovals"));
const SecurityPolicies = lazy(() => import("./SecurityPolicies"));
const AuditTrail = lazy(() => import("./AuditTrail"));
const ConnectionsHub = lazy(() => import("./ConnectionsHub"));
const DiagnosticsLogs = lazy(() => import("./DiagnosticsLogs"));
import { ConfirmDialog, type ConfirmRequest } from "./ConfirmDialog";
import { Pager } from "./Pager";

type View = "overview" | "devices" | "device_detail" | "tasks" | "approvals" | "audit" | "policies" | "connections" | "ai_api" | "workflows" | "fleet_ops" | "live_studio" | "terminal" | "logs";
type Theme = "light" | "dark";


const TOOL_DESCRIPTIONS: Record<string, { tier: number; label: string; tone: "green" | "amber" | "red"; desc: string }> = {
  get_system_info: { tier: 1, label: "Tier 1 — Safe Observation", tone: "green", desc: "Collects hardware specs, OS version, CPU cores, and memory capacity." },
  get_resource_usage: { tier: 1, label: "Tier 1 — Safe Observation", tone: "green", desc: "Reads real-time CPU, RAM, and disk utilization percentages." },
  get_network_info: { tier: 1, label: "Tier 1 — Safe Observation", tone: "green", desc: "Queries network adapters, IP interfaces, and DNS settings." },
  get_disk_usage: { tier: 1, label: "Tier 1 — Safe Observation", tone: "green", desc: "Inspects mounted drive partitions and available disk space." },
  get_memory_usage: { tier: 1, label: "Tier 1 — Safe Observation", tone: "green", desc: "Reads memory stats, active buffers, and swap allocation." },
  list_workspace: { tier: 1, label: "Tier 1 — Safe Observation", tone: "green", desc: "Enumerates directories and file listings in the active workspace." },
  read_workspace_file: { tier: 1, label: "Tier 1 — Safe Observation", tone: "green", desc: "Reads text/code contents of a specified workspace file." },
  search_workspace: { tier: 1, label: "Tier 1 — Safe Observation", tone: "green", desc: "Performs full-text ripgrep/regex search across project files." },
  create_workspace_file: { tier: 2, label: "Tier 2 — Workspace Modification", tone: "amber", desc: "Creates or overwrites a file inside the device workspace." },
  edit_workspace_file: { tier: 2, label: "Tier 2 — Workspace Modification", tone: "amber", desc: "Modifies targeted lines in an existing workspace code file." },
  move_workspace_file: { tier: 2, label: "Tier 2 — Workspace Modification", tone: "amber", desc: "Renames or relocates a file within the workspace tree." },
  delete_workspace_file: { tier: 3, label: "Tier 3 — High Risk Deletion", tone: "red", desc: "Permanently deletes a file from the workspace filesystem." },
  get_service_status: { tier: 1, label: "Tier 1 — Safe Observation", tone: "green", desc: "Checks systemd / Windows Service status and uptime." },
  get_recent_logs: { tier: 1, label: "Tier 1 — Safe Observation", tone: "green", desc: "Streams recent system journal and application log buffers." },
  list_processes: { tier: 1, label: "Tier 1 — Safe Observation", tone: "green", desc: "Gathers snapshot of all running processes and memory footprint." },
  list_docker_containers: { tier: 1, label: "Tier 1 — Safe Observation", tone: "green", desc: "Lists active and exited Docker containers on the host." },
  git_status: { tier: 1, label: "Tier 1 — Safe Observation", tone: "green", desc: "Inspects Git working tree clean/dirty status and branch head." },
  git_diff: { tier: 1, label: "Tier 1 — Safe Observation", tone: "green", desc: "Generates unified diff of uncommitted workspace changes." },
  run_project_tests: { tier: 2, label: "Tier 2 — Test Execution", tone: "amber", desc: "Runs automated test harnesses (pytest, vitest, cargo test)." },
  run_linter: { tier: 1, label: "Tier 1 — Safe Observation", tone: "green", desc: "Executes static analysis / lint check on project sources." },
  create_backup: { tier: 2, label: "Tier 2 — Backup Creation", tone: "amber", desc: "Creates an archival backup archive of workspace state." },
  deploy_application: { tier: 3, label: "Tier 3 — Deployment Action", tone: "red", desc: "Deploys code changes and triggers service reload." },
  run_shell: { tier: 3, label: "Tier 3 — Arbitrary Shell Execution", tone: "red", desc: "Executes arbitrary terminal / PowerShell commands on host machine." },
  take_screenshot: { tier: 1, label: "Tier 1 — Safe Observation", tone: "green", desc: "Captures visual desktop screen frame of target device." },
  capture_desktop_screenshot: { tier: 1, label: "Tier 1 — Safe Observation", tone: "green", desc: "Captures full-resolution desktop screen frame with window HUD." },
  mouse_click: { tier: 2, label: "Tier 2 — Desktop Input", tone: "amber", desc: "Simulates hardware mouse click at specified coordinates." },
  keyboard_type: { tier: 2, label: "Tier 2 — Desktop Input", tone: "amber", desc: "Types text keystrokes into active focused window." },
  launch_approved_application: { tier: 2, label: "Tier 2 — App Launch", tone: "amber", desc: "Launches an allowlisted native application executable." },
  install_package: { tier: 3, label: "Tier 3 — Package Installation", tone: "red", desc: "Installs system package via apt, choco, or winget." },
};

const TOOLS = [
  "get_system_info", "get_resource_usage", "get_network_info", "get_disk_usage", "get_memory_usage",
  "list_workspace", "read_workspace_file", "search_workspace", "create_workspace_file",
  "edit_workspace_file", "move_workspace_file", "delete_workspace_file",
  "get_service_status", "get_recent_logs", "list_processes", "list_docker_containers",
  "git_status", "git_diff", "run_project_tests", "run_linter",
  "create_backup", "deploy_application", "get_desktop_status",
  "capture_desktop_screenshot", "launch_approved_application", "perform_approved_ui_action",
  "install_package", "run_shell",
];

const TASK_PRESETS: Array<{ label: string; tool: string; args: string }> = [
  { label: "Capture Screenshot", tool: "capture_desktop_screenshot", args: "{}" },
  { label: "List Open Windows", tool: "perform_approved_ui_action", args: '{"action": "list_windows"}' },
  { label: "System Info", tool: "get_system_info", args: "{}" },
  { label: "Resource Usage", tool: "get_resource_usage", args: "{}" },
  { label: "Network Sockets", tool: "get_network_info", args: "{}" },
  { label: "Top Processes", tool: "list_processes", args: '{"limit": 20}' },
  { label: "Launch Chrome", tool: "launch_approved_application", args: '{"app_name": "chrome"}' },
  { label: "Run Shell", tool: "run_shell", args: '{"command": "echo hello"}' },
];

const VIEW_META: Record<View, { title: string; subtitle: string; group: "ops" | "gov" }> = {
  overview: {
    title: "Command Overview",
    subtitle: "Real-time fleet telemetry, task throughput, and security posture across enrolled devices.",
    group: "ops",
  },
  devices: {
    title: "Enrolled Devices",
    subtitle: "Manage outbound-polling Windows and Linux agents, inspect heartbeat status, and issue tokens.",
    group: "ops",
  },
  device_detail: {
    title: "Device 360 System Dashboard",
    subtitle: "Full-fidelity hardware telemetry, running servers, installed applications, and real-time execution stream.",
    group: "ops",
  },
  tasks: {
    title: "Task Queue & Vision Inspector",
    subtitle: "Dispatch policy-governed tools, inspect JSON payloads, and view captured desktop screenshots.",
    group: "ops",
  },
  approvals: {
    title: "Human-in-the-Loop Approvals",
    subtitle: "Review and authorize Tier-3 and Tier-4 operations requested by AI agents.",
    group: "ops",
  },
  audit: {
    title: "Append-only Audit Trail",
    subtitle: "Every tool invocation, policy change, and approval decision recorded with actor and tenant context.",
    group: "gov",
  },
  policies: {
    title: "Security Policies & Webhooks",
    subtitle: "Configure versioned execution guardrails, desktop automation permissions, and instant approval alerts.",
    group: "gov",
  },
  connections: {
    title: "MCP & OAuth Connections",
    subtitle: "Monitor Streamable HTTP MCP endpoints, OAuth 2.0 gateway health, and connected AI clients.",
    group: "gov",
  },
  ai_api: {
    title: "AI API & Custom Agents Hub",
    subtitle: "Connect your custom AI, LLMs (OpenAI, Claude, Gemini, Ollama), and scripts to communicate with your fleet.",
    group: "ops",
  },
  workflows: {
    title: "Autonomous Workflows & Multi-Turn Plans",
    subtitle: "Compose and execute multi-step agentic plans with visual OCR verification, retry, and execution streaming.",
    group: "ops",
  },
  fleet_ops: {
    title: "Fleet Operations & Self-Healing Hub",
    subtitle: "Cross-device telemetry graphs, multi-node command bus, self-healing reactive triggers, and cron scheduler.",
    group: "ops",
  },
  live_studio: {
    title: "Live Desktop Studio & Dual-Control",
    subtitle: "Real-time visual screen stream, direct human operator mouse/keyboard takeover, and fleet software updater.",
    group: "ops",
  },
  terminal: {
    title: "Interactive Live Terminal",
    subtitle: "Real-time pseudo-terminal shell (PowerShell / Bash) with ANSI colors and bi-directional I/O.",
    group: "ops",
  },
  logs: {
    title: "Service Diagnostics & Logs",
    subtitle: "Live systemd journal and reverse-proxy telemetry from the control plane.",
    group: "gov",
  },
};

function fmt(ts: any): string {
  if (!ts) return "—";
  const d = new Date(ts * 1000);
  return d.toLocaleString();
}

function rel(ts: any): string {
  if (!ts) return "never";
  const diff = Date.now() / 1000 - ts;
  if (diff < 0) {
    const rem = -diff;
    if (rem < 3600) return `in ${Math.ceil(rem / 60)}m`;
    if (rem < 86400) return `in ${Math.ceil(rem / 3600)}h`;
    return `in ${Math.ceil(rem / 86400)}d`;
  }
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

/* Fluent 2 20px SVG Icons */
function FluentIcon({ name }: { name: string }) {
  const props = { width: 18, height: 18, viewBox: "0 0 20 20", fill: "currentColor" };
  switch (name) {
    case "overview":
      return <svg {...props}><path d="M3 4.5A1.5 1.5 0 0 1 4.5 3h4A1.5 1.5 0 0 1 10 4.5v4A1.5 1.5 0 0 1 8.5 10h-4A1.5 1.5 0 0 1 3 8.5v-4ZM11.5 3A1.5 1.5 0 0 0 10 4.5v4A1.5 1.5 0 0 0 11.5 10h4A1.5 1.5 0 0 0 17 8.5v-4A1.5 1.5 0 0 0 15.5 3h-4ZM3 11.5A1.5 1.5 0 0 1 4.5 10h4A1.5 1.5 0 0 1 10 11.5v4A1.5 1.5 0 0 1 8.5 17h-4A1.5 1.5 0 0 1 3 15.5v-4ZM11.5 10a1.5 1.5 0 0 0-1.5 1.5v4a1.5 1.5 0 0 0 1.5 1.5h4a1.5 1.5 0 0 0 1.5-1.5v-4a1.5 1.5 0 0 0-1.5-1.5h-4Z"/></svg>;
    case "devices":
      return <svg {...props}><path d="M4 4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h4v1.5H5.5a.5.5 0 0 0 0 1h9a.5.5 0 0 0 0-1H12V14h4a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2H4Zm0 1h12a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z"/></svg>;
    case "tasks":
      return <svg {...props}><path d="M6 3a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2H6Zm1.85 5.15a.5.5 0 0 1 .7 0l.95.94 2.65-2.64a.5.5 0 0 1 .7.7l-3 3a.5.5 0 0 1-.7 0l-1.3-1.3a.5.5 0 0 1 0-.7ZM7.5 13h5a.5.5 0 0 1 0 1h-5a.5.5 0 0 1 0-1Z"/></svg>;
    case "approvals":
      return <svg {...props}><path d="M10 2a.75.75 0 0 1 .33.08l6 3A.75.75 0 0 1 16.75 6v3.5c0 4.08-2.74 7.57-6.53 8.46a.98.98 0 0 1-.44 0C5.99 17.07 3.25 13.58 3.25 9.5V6a.75.75 0 0 1 .42-.67l6-3A.75.75 0 0 1 10 2Zm3.35 6.35a.5.5 0 0 0-.7-.7L9 11.29 7.35 9.65a.5.5 0 0 0-.7.7l2 2a.5.5 0 0 0 .7 0l4-4Z"/></svg>;
    case "audit":
      return <svg {...props}><path d="M4 4.5A1.5 1.5 0 0 1 5.5 3h6.88a1.5 1.5 0 0 1 1.06.44l2.12 2.12c.28.28.44.66.44 1.06V15.5A1.5 1.5 0 0 1 14.5 17h-9A1.5 1.5 0 0 1 4 15.5v-11Zm3 .5a.5.5 0 0 0 0 1h6a.5.5 0 0 0 0-1H7Zm0 3a.5.5 0 0 0 0 1h6a.5.5 0 0 0 0-1H7Zm0 3a.5.5 0 0 0 0 1h4a.5.5 0 0 0 0-1H7Z"/></svg>;
    case "policies":
      return <svg {...props}><path d="M10 2.5a3.5 3.5 0 0 0-3.5 3.5V8H5.5A1.5 1.5 0 0 0 4 9.5v6A1.5 1.5 0 0 0 5.5 17h9a1.5 1.5 0 0 0 1.5-1.5v-6A1.5 1.5 0 0 0 14.5 8h-1V6A3.5 3.5 0 0 0 10 2.5ZM7.5 6a2.5 2.5 0 0 1 5 0v2h-5V6Zm2.5 5.5a1 1 0 1 1 0 2 1 1 0 0 1 0-2Z"/></svg>;
    case "connections":
      return <svg {...props}><path d="M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm-5.91 6.5h2.96c.05-1.92.54-3.65 1.32-4.8A6.01 6.01 0 0 0 4.09 9.5Zm2.96 1H4.09a6.01 6.01 0 0 0 4.28 4.8c-.78-1.15-1.27-2.88-1.32-4.8Zm1 0c.06 1.88.58 3.55 1.38 4.6a2.6 2.6 0 0 0 1.14 0c.8-1.05 1.32-2.72 1.38-4.6H8.05Zm3.9-1c-.06-1.88-.58-3.55-1.38-4.6a2.6 2.6 0 0 0-1.14 0c-.8 1.05-1.32 2.72-1.38 4.6h3.9Zm1 0h2.96a6.01 6.01 0 0 0-4.28-4.8c.78 1.15 1.27 2.88 1.32 4.8Zm0 1c-.05 1.92-.54 3.65-1.32 4.8a6.01 6.01 0 0 0 4.28-4.8h-2.96Z"/></svg>;
    case "ai_api":
      return <svg {...props}><path d="M10 2a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-1.5 0v-1.5A.75.75 0 0 1 10 2ZM4.5 4.5a.75.75 0 0 1 1.06 0l1.06 1.06a.75.75 0 0 1-1.06 1.06L4.5 5.56a.75.75 0 0 1 0-1.06Zm11 0a.75.75 0 0 1 0 1.06l-1.06 1.06a.75.75 0 0 1-1.06-1.06l1.06-1.06a.75.75 0 0 1 1.06 0ZM5 10a5 5 0 1 1 10 0 5 5 0 0 1-10 0Zm3.5-1.5a1.25 1.25 0 1 0 0 2.5 1.25 1.25 0 0 0 0-2.5Zm4.25 0a1.25 1.25 0 1 0 0 2.5 1.25 1.25 0 0 0 0-2.5ZM7.5 13a.75.75 0 0 0 0 1.5h5a.75.75 0 0 0 0-1.5h-5Z"/></svg>;
    case "workflows":
      return <svg {...props}><path d="M4.5 3A1.5 1.5 0 0 0 3 4.5v3A1.5 1.5 0 0 0 4.5 9h2A1.5 1.5 0 0 0 8 7.5v-3A1.5 1.5 0 0 0 6.5 3h-2ZM12 6.5a.5.5 0 0 1 .5-.5h4a.5.5 0 0 1 0 1h-4a.5.5 0 0 1-.5-.5ZM8 6h3v1H8V6Zm5.5 4.5a1.5 1.5 0 0 0-1.5 1.5v3a1.5 1.5 0 0 0 1.5 1.5h2a1.5 1.5 0 0 0 1.5-1.5v-3a1.5 1.5 0 0 0-1.5-1.5h-2ZM5.5 10a.5.5 0 0 1 .5.5V13h1a.5.5 0 0 1 0 1H5.5A.5.5 0 0 1 5 13.5v-3a.5.5 0 0 1 .5-.5Z"/></svg>;
    case "fleet_ops":
      return <svg {...props}><path d="M10 2a8 8 0 1 0 8 8 8 8 0 0 0-8-8Zm0 1.5a6.5 6.5 0 0 1 6.45 5.75H13.5a1.5 1.5 0 0 0-1.5-1.5V4.79A6.5 6.5 0 0 1 10 3.5Zm-1 1.29V7.75a1.5 1.5 0 0 0-1.5 1.5H3.55A6.5 6.5 0 0 1 9 4.79Zm-5.45 6.46H6.5a1.5 1.5 0 0 0 1.5 1.5v2.96A6.5 6.5 0 0 1 3.55 11.25Zm8.45 4.46V12.75a1.5 1.5 0 0 0 1.5-1.5h2.95a6.5 6.5 0 0 1-4.45 4.46Z"/></svg>;
    case "live_studio":
      return <svg {...props}><path d="M4 3a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h4l-1 2H5.5a.5.5 0 0 0 0 1h9a.5.5 0 0 0 0-1H13l-1-2h4a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2H4Zm-1 2a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5Z"/></svg>;
    case "terminal":
      return <svg {...props}><path d="M3 4.5A1.5 1.5 0 0 1 4.5 3h11A1.5 1.5 0 0 1 17 4.5v11a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 3 15.5v-11Zm2.85 2.15a.5.5 0 0 0 0 .7L8.29 10l-2.44 2.65a.5.5 0 1 0 .74.68l2.76-3a.5.5 0 0 0 0-.66l-2.76-3a.5.5 0 0 0-.74 0ZM10.5 13h4a.5.5 0 0 0 0-1h-4a.5.5 0 0 0 0 1Z"/></svg>;
    case "logs":
      return <svg {...props}><path d="M3.5 4A1.5 1.5 0 0 0 2 5.5v9A1.5 1.5 0 0 0 3.5 16h13a1.5 1.5 0 0 0 1.5-1.5v-9A1.5 1.5 0 0 0 16.5 4h-13Zm1.85 3.15 2.5 2.5a.5.5 0 0 1 0 .7l-2.5 2.5a.5.5 0 0 1-.7-.7L6.79 10 4.65 7.85a.5.5 0 0 1 .7-.7ZM9.5 12h4a.5.5 0 0 1 0 1h-4a.5.5 0 0 1 0-1Z"/></svg>;
    case "theme":
      return <svg {...props}><path d="M10 3.5a6.5 6.5 0 1 0 5.79 9.48.5.5 0 0 0-.64-.69A5.5 5.5 0 0 1 8.81 4.15a.5.5 0 0 0-.23-.96A6.5 6.5 0 0 0 10 3.5Z"/></svg>;
        case "copy":
      return <svg {...props}><path d="M4 4.5A1.5 1.5 0 0 1 5.5 3h6A1.5 1.5 0 0 1 13 4.5v1h1.5A1.5 1.5 0 0 1 16 7v8.5a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 6 15.5V14H5.5A1.5 1.5 0 0 1 4 12.5v-8ZM7 14h1.5a1.5 1.5 0 0 1 1.5 1.5V16h4.5a.5.5 0 0 0 .5-.5V7a.5.5 0 0 0-.5-.5H13v6a1.5 1.5 0 0 1-1.5 1.5H7Zm-1.5-1H11a.5.5 0 0 0 .5-.5v-8a.5.5 0 0 0-.5-.5H5.5a.5.5 0 0 0-.5.5v8a.5.5 0 0 0 .5.5Z"/></svg>;
    case "search":
      return <svg {...props}><path d="M8.5 3a5.5 5.5 0 0 1 4.38 8.82l3.65 3.65a.5.5 0 0 1-.7.7l-3.65-3.65A5.5 5.5 0 1 1 8.5 3Zm0 1a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9Z"/></svg>;
    case "dispatch":
      return <svg {...props}><path d="M4.5 3.5a.75.75 0 0 1 1.15-.64l10 6.5a.75.75 0 0 1 0 1.28l-10 6.5A.75.75 0 0 1 4.5 16.5v-13Z"/></svg>;
    case "edit":
      return <svg {...props}><path d="M13.85 2.15a1.2 1.2 0 0 1 1.7 0l1.3 1.3a1.2 1.2 0 0 1 0 1.7L6.5 15.5 3 16.5l1-3.5 9.85-10.85ZM13 4.2 4.7 12.5l-.5 1.8 1.8-.5L14.3 5.5 13 4.2Z"/></svg>;
    case "delete":
      return <svg {...props}><path d="M7.5 3a1.5 1.5 0 0 1 1.5-1.5h2a1.5 1.5 0 0 1 1.5 1.5H15a.5.5 0 0 1 0 1h-.55l-.83 11.2A2 2 0 0 1 11.63 18H8.37a2 2 0 0 1-1.99-1.8L5.55 4H5a.5.5 0 0 1 0-1h2.5ZM9 2.5a.5.5 0 0 0-.5.5h3a.5.5 0 0 0-.5-.5H9ZM7.37 16.13A1 1 0 0 0 8.37 17h3.26a1 1 0 0 0 1-.87L13.44 4H6.56l.81 12.13Z"/></svg>;
    case "revoke":
      return <svg {...props}><path d="M10 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16Zm-6.9 8a6.9 6.9 0 0 1 1.88-4.7l9.72 9.72A6.9 6.9 0 0 1 3.1 10Zm13.8 0a6.9 6.9 0 0 1-1.88 4.7L5.3 4.98A6.9 6.9 0 0 1 16.9 10Z"/></svg>;
    case "inspect":
      return <svg {...props}><path d="M10 4.5C5.5 4.5 2 10 2 10s3.5 5.5 8 5.5 8-5.5 8-5.5-3.5-5.5-8-5.5Zm0 9a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7Zm0-2a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z"/></svg>;
    case "cancel":
      return <svg {...props}><path d="M10 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16Zm2.83 5.76a.5.5 0 0 1 0 .7L10.7 10.5l2.13 2.12a.5.5 0 1 1-.7.71L10 11.2l-2.12 2.13a.5.5 0 1 1-.71-.7L9.3 10.5 7.17 8.37a.5.5 0 0 1 .7-.71L10 9.8l2.12-2.13a.5.5 0 0 1 .71.09Z"/></svg>;
    case "approve":
      return <svg {...props}><path d="M7.35 13.65a.5.5 0 0 1-.7 0l-3-3a.5.5 0 0 1 .7-.7L7 12.6l8.65-8.65a.5.5 0 0 1 .7.7l-9 9Z"/></svg>;
    case "deny":
      return <svg {...props}><path d="M5.35 4.65a.5.5 0 0 0-.7.7L8.29 9 4.65 12.65a.5.5 0 1 0 .7.7L9 9.71l3.65 3.64a.5.5 0 0 0 .7-.7L9.71 9l3.64-3.65a.5.5 0 0 0-.7-.7L9 8.29 5.35 4.65Z"/></svg>;
    case "more":
      return <svg {...props}><path d="M4.5 10a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Zm7 0a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Zm7 0a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Z"/></svg>;
    case "dashboard":
      return <svg {...props}><path d="M3 4a1.5 1.5 0 0 1 1.5-1.5h11A1.5 1.5 0 0 1 17 4v9a1.5 1.5 0 0 1-1.5 1.5h-4v1.5h1.75a.75.75 0 0 1 0 1.5h-6.5a.75.75 0 0 1 0-1.5H8.5V14.5h-4A1.5 1.5 0 0 1 3 13V4Zm1.5 0v9h11V4h-11Zm2 2a.75.75 0 0 1 .75-.75h1.5a.75.75 0 0 1 .75.75v5a.75.75 0 0 1-.75.75h-1.5A.75.75 0 0 1 6.5 11V6Zm4 2a.75.75 0 0 1 .75-.75h1.5a.75.75 0 0 1 .75.75v3a.75.75 0 0 1-.75.75h-1.5A.75.75 0 0 1 10.5 11V8Z"/></svg>;
    case "shortcuts":
      return <svg {...props}><path d="M4.5 5A2.5 2.5 0 0 0 2 7.5v5A2.5 2.5 0 0 0 4.5 15h11a2.5 2.5 0 0 0 2.5-2.5v-5A2.5 2.5 0 0 0 15.5 5h-11ZM3 7.5a1.5 1.5 0 0 1 1.5-1.5h11a1.5 1.5 0 0 1 1.5 1.5v5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 3 12.5v-5Zm2 1a.5.5 0 0 1 .5-.5h1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-1a.5.5 0 0 1-.5-.5v-1Zm3 0a.5.5 0 0 1 .5-.5h1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-1a.5.5 0 0 1-.5-.5v-1Zm3 0a.5.5 0 0 1 .5-.5h1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-1a.5.5 0 0 1-.5-.5v-1Zm3 0a.5.5 0 0 1 .5-.5h1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-1a.5.5 0 0 1-.5-.5v-1Zm-8 3a.5.5 0 0 1 .5-.5h6a.5.5 0 0 1 .5.5v.5a.5.5 0 0 1-.5.5h-6a.5.5 0 0 1-.5-.5v-.5Z"/></svg>;
    default:
      return null;
  }
}

function downloadBlob(content: string, filename: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function exportTasksCsv(tasks: any[]) {
  const headers = ["Task ID", "Device ID", "Tool", "Status", "Created At", "Duration (s)", "Error"];
  const rows = tasks.map(t => [
    t.task_id || t.id || "",
    t.device_id || "",
    t.tool || "",
    t.status || "",
    t.created_at ? new Date(t.created_at * 1000).toISOString() : "",
    t.duration_s ?? "",
    (t.error || "").replace(/"/g, '""'),
  ]);
  const csvContent = [headers.join(","), ...rows.map(r => r.map(c => `"${c}"`).join(","))].join("\n");
  downloadBlob(csvContent, `ai-bridge-tasks-${new Date().toISOString().slice(0, 10)}.csv`, "text/csv;charset=utf-8;");
}

function exportAuditCsv(events: any[]) {
  const headers = ["Timestamp", "Actor", "Action", "Tool", "Device ID", "Decision", "Reason"];
  const rows = events.map(e => [
    e.ts ? new Date(e.ts * 1000).toISOString() : (e.timestamp || ""),
    e.actor || "",
    e.action || "",
    e.tool || "",
    e.device_id || "",
    e.decision || "",
    (e.reason || "").replace(/"/g, '""'),
  ]);
  const csvContent = [headers.join(","), ...rows.map(r => r.map(c => `"${c}"`).join(","))].join("\n");
  downloadBlob(csvContent, `ai-bridge-audit-${new Date().toISOString().slice(0, 10)}.csv`, "text/csv;charset=utf-8;");
}

function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <JXButton
      size="sm"
      variant="soft"
      onClick={e => {
        e.stopPropagation();
        navigator.clipboard?.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      }}
      title="Copy to clipboard"
    >
      {copied ? "✓ Copied" : label}
    </JXButton>
  );
}

interface RowAction {
  id: string;
  label: string;
  title?: string;
  icon: string;
  onClick: () => void | Promise<void>;
  tone?: "primary" | "subtle" | "danger" | "success";
  danger?: boolean;
}

function TableRowActions({ actions }: { actions: (RowAction | null | undefined | false)[] }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const valid = actions.filter(Boolean) as RowAction[];

  useEffect(() => {
    if (!menuOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  if (valid.length === 0) return null;

  const hasOverflow = valid.length > 2;
  const direct = hasOverflow ? valid.slice(0, 2) : valid;
  const overflow = hasOverflow ? valid.slice(2) : [];

  return (
    <div className="f2-action-group" ref={containerRef}>
      {direct.map(act => {
        let cls = "f2-icon-btn";
        if (act.tone === "primary") cls += " f2-icon-btn-primary";
        else if (act.tone === "danger" || act.danger) cls += " f2-icon-btn-danger";
        else if (act.tone === "success") cls += " f2-icon-btn-success";

        return (
          <JXButton
            key={act.id}
            size="sm"
            variant="soft"
            color={(act.tone === "danger" || act.danger) ? "error" : act.tone === "success" ? "success" : act.tone === "primary" ? "primary" : "neutral"}
            onClick={e => {
              e.stopPropagation();
              act.onClick();
            }}
            title={act.title || act.label}
            aria-label={act.title || act.label}
            style={{ minWidth: 36, minHeight: 36, padding: 0, display: "inline-flex", alignItems: "center", justifyContent: "center" }}
          >
            <FluentIcon name={act.icon} />
          </JXButton>
        );
      })}

      {hasOverflow && (
        <div style={{ position: "relative", display: "inline-flex" }}>
          <JXButton
            size="sm"
            variant={menuOpen ? "contained" : "soft"}
            onClick={e => {
              e.stopPropagation();
              setMenuOpen(!menuOpen);
            }}
            title="More actions"
            aria-label="More actions"
            aria-expanded={menuOpen}
            style={{ minWidth: 36, minHeight: 36, padding: 0, display: "inline-flex", alignItems: "center", justifyContent: "center" }}
          >
            <FluentIcon name="more" />
          </JXButton>

          {menuOpen && (
            <div className="f2-overflow-menu" role="menu">
              {overflow.map(act => (
                <JXButton
                  key={act.id}
                  size="sm"
                  variant="text"
                  fullWidth
                  color={(act.danger || act.tone === "danger") ? "error" : "neutral"}
                  onClick={e => {
                    e.stopPropagation();
                    setMenuOpen(false);
                    act.onClick();
                  }}
                  title={act.title || act.label}
                  role="menuitem"
                  startIcon={<FluentIcon name={act.icon} />}
                  style={{ justifyContent: "flex-start" }}
                >
                  {act.label}
                </JXButton>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Badge({ value, tone }: { value: string; tone?: string }) {
  const pick = tone || (
    value === "online" || value === "completed" || value === "approved" || value === "allowed" || value === "up" || value === "live"
      ? "green"
      : value === "failed" || value === "denied" || value === "revoked" || value === "cancelled" || value === "down"
      ? "red"
      : value === "pending" || value === "needs_approval" || value === "queued" || value === "running"
      ? "amber"
      : "grey"
  );
  return (
    <span className="f2-badge" data-tone={pick}>
      <span className="f2-badge-dot" />
      {value}
    </span>
  );
}

function Card({ title, action, children }: { title: string; action?: any; children: any }) {
  return (
    <JXCard spotlight hoverLift className="f2-card">
      <div className="f2-card-header">
        <h3 className="f2-card-title">{title}</h3>
        {action}
      </div>
      {children}
    </JXCard>
  );
}

function Bar({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  
  const getGradient = (l: string) => {
    const lower = l.toLowerCase();
    if (lower === "completed" || lower === "allowed" || lower === "online" || lower === "up" || lower === "live") {
      return "linear-gradient(90deg, #10b981 0%, #059669 100%)";
    }
    if (lower === "failed" || lower === "denied" || lower === "revoked" || lower === "cancelled" || lower === "down") {
      return "linear-gradient(90deg, #f43f5e 0%, #e11d48 100%)";
    }
    if (lower === "queued" || lower === "running" || lower === "pending" || lower === "needs_approval") {
      return "linear-gradient(90deg, #f59e0b 0%, #d97706 100%)";
    }
    if (lower.includes("shell") || lower.includes("terminal")) {
      return "linear-gradient(90deg, #6366f1 0%, #4f46e5 100%)";
    }
    if (lower.includes("screenshot") || lower.includes("vision") || lower.includes("desktop")) {
      return "linear-gradient(90deg, #0ea5e9 0%, #0284c7 100%)";
    }
    return "linear-gradient(90deg, #8b5cf6 0%, #7c3aed 100%)";
  };

  const getBadgeColor = (l: string) => {
    const lower = l.toLowerCase();
    if (lower === "completed" || lower === "allowed") return "#10b981";
    if (lower === "failed" || lower === "denied") return "#f43f5e";
    if (lower === "queued" || lower === "running" || lower === "pending") return "#f59e0b";
    return "var(--jx-text-secondary)";
  };

  return (
    <div className="f2-bar-row" style={{ display: "flex", alignItems: "center", gap: 12, padding: "6px 0" }}>
      <span
        style={{
          width: 140,
          color: getBadgeColor(label),
          fontWeight: 600,
          fontSize: 12.5,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap"
        }}
        title={label}
      >
        {label}
      </span>
      <div className="f2-bar-track" style={{ flex: 1, height: 7, borderRadius: 9999, background: "var(--jx-surface-sunken)", overflow: "hidden", border: "1px solid var(--jx-border-subtle)" }}>
        <div
          className="f2-bar-fill"
          style={{
            width: `${Math.max(4, pct)}%`,
            height: "100%",
            borderRadius: 9999,
            background: getGradient(label),
            boxShadow: `0 0 10px ${getBadgeColor(label)}44`,
            transition: "width 0.6s cubic-bezier(0.16, 1, 0.3, 1)"
          }}
        />
      </div>
      <span style={{ minWidth: 36, textAlign: "right", fontWeight: 700, fontSize: 12.5, fontFamily: "var(--font-mono)", color: "var(--jx-text-primary)" }}>
        {value}
      </span>
    </div>
  );
}

function countBy(rows: any[], key: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows || []) out[String(r[key] ?? "unknown")] = (out[String(r[key] ?? "unknown")] || 0) + 1;
  return out;
}

function parseTaskResult(raw: string): { parsed: any; imageBase64: string | null; mimeType: string; displayText: string } {
  if (!raw) return { parsed: null, imageBase64: null, mimeType: "image/jpeg", displayText: "(empty)" };
  try {
    const obj = JSON.parse(raw);
    if (obj && typeof obj === "object" && typeof obj.image_base64 === "string" && obj.image_base64.length > 0) {
      const clone = { ...obj, image_base64: `[base64 image: ${obj.image_base64.length} chars]` };
      const rawMime = typeof obj.mime_type === "string" ? obj.mime_type.toLowerCase() : "";
      const validMimes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
      const mimeType = validMimes.includes(rawMime) ? rawMime : "image/jpeg";
      return {
        parsed: obj,
        imageBase64: obj.image_base64,
        mimeType,
        displayText: JSON.stringify(clone, null, 2),
      };
    }
    return { parsed: obj, imageBase64: null, mimeType: "image/jpeg", displayText: JSON.stringify(obj, null, 2) };
  } catch {
    return { parsed: null, imageBase64: null, mimeType: "image/jpeg", displayText: raw };
  }
}

export default function App() {
  const { mode, toggleMode, setMode, pushToast, accent, setAccent } = useJXTheme();
  const [view, setView] = useState<View>(() => {
    const v = new URLSearchParams(window.location.search).get("view");
    const valid: View[] = ["overview", "devices", "device_detail", "tasks", "approvals", "audit", "policies", "connections", "ai_api", "workflows", "fleet_ops", "live_studio", "logs"];
    return v && (valid as string[]).includes(v) ? (v as View) : "overview";
  });
  const [theme, setTheme] = useState<Theme>(() => {
    const stored = localStorage.getItem("ai_bridge_theme") as Theme | null;
    if (stored === "light" || stored === "dark") return stored;
    // No saved preference: follow the OS, instead of always defaulting to light.
    return typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  });

  // Keep local theme state in continuous synchronization with JXTheme context
  useEffect(() => {
    if (mode && (mode === "light" || mode === "dark") && mode !== theme) {
      setTheme(mode);
    }
  }, [mode]);

  const toggleTheme = useCallback(() => {
    const next: Theme = theme === "light" ? "dark" : "light";
    setTheme(next);
    if (toggleMode) {
      toggleMode();
    } else if (setMode) {
      setMode(next);
    }
  }, [theme, toggleMode, setMode]);
  const [authTab, setAuthTab] = useState<"token" | "user">("token");
  const [loginTokenInput, setLoginTokenInput] = useState("");
  const [loginShowToken, setLoginShowToken] = useState(false);
  const [loginUsernameInput, setLoginUsernameInput] = useState("");
  const [loginPasswordInput, setLoginPasswordInput] = useState("");
  const [loginPending, setLoginPending] = useState(false);
  const [rememberDevice, setRememberDevice] = useState(true);
  const [devTokenFilled, setDevTokenFilled] = useState(false);
  const [gatewayPing, setGatewayPing] = useState<{ status: "checking" | "online" | "offline"; ms?: number; version?: string }>({ status: "checking" });
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [emergencyArmed, setEmergencyArmed] = useState(false);
  const emergencyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [notice, _setNotice] = useState<{ intent: "success" | "info" | "warning" | "error"; text: string } | null>(null);
  const setNotice = (n: any) => {
    _setNotice(n);
    if (n && n.text) {
      try {
        pushToast({
          title: n.text,
          variant: n.intent === "error" ? "error" : n.intent === "warning" ? "warning" : "success"
        });
      } catch {
        // Fallback
      }
    }
  };
  const [tok, setTok] = useState(() => {
    if (typeof window !== "undefined") {
      const p = new URLSearchParams(window.location.search);
      const hp = window.location.hash ? new URLSearchParams(window.location.hash.replace(/^#/, "")) : null;
      const at = p.get("token") || p.get("admin_token") || hp?.get("token") || hp?.get("admin_token");
      if (at) {
        localStorage.setItem("ai_bridge_admin_token", at);
        return at;
      }
      const st = p.get("session_token") || hp?.get("session_token");
      if (st) {
        localStorage.setItem("ai_bridge_session_token", st);
        return "session";
      }
    }
    return token();
  });

  useEffect(() => {
    if (tok || sessionToken()) return;
    const t0 = performance.now();
    api.health()
      .then(h => {
        const ms = Math.round(performance.now() - t0);
        setGatewayPing({ status: "online", ms, version: h.version || "0.2.0" });
      })
      .catch(() => {
        setGatewayPing({ status: "offline" });
      });
  }, [tok]);
  const [oidcEnabled, setOidcEnabled] = useState(false);
  const [me, setMe] = useState<any>(null);
  const [health, setHealth] = useState<any>(null);
  const [devices, setDevices] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [approvals, setApprovals] = useState<any[]>([]);
  const [audit, setAudit] = useState<any[]>([]);
  const [policy, setPolicy] = useState<any>(null);
  const [policyHistory, setPolicyHistory] = useState<any[]>([]);
  const [connections, setConnections] = useState<any>(null);
  const [logLines, setLogLines] = useState<string[]>([]);
  const [deviceName, setDeviceName] = useState("");
  const [enrolled, setEnrolled] = useState<any>(null);
  const [taskDevice, setTaskDevice] = useState("");
  const [taskTool, setTaskTool] = useState("capture_desktop_screenshot");
  const [taskArgs, setTaskArgs] = useState("{}");
  const [taskStatus, setTaskStatus] = useState("all");
  const [deviceQuery, setDeviceQuery] = useState("");
  const [deviceSort, setDeviceSort] = useState<"name" | "status">("name");
  const [devicePage, setDevicePage] = useState(0);
  const [deviceStatusFilter, setDeviceStatusFilter] = useState<"all" | "online" | "offline" | "revoked">("all");
  const [deviceOsFilter, setDeviceOsFilter] = useState<string>("all");
  const [deviceEnrollOpen, setDeviceEnrollOpen] = useState(false);
  const [enrollTargetArch, setEnrollTargetArch] = useState("linux-x86_64");
  const [enrollSandboxDir, setEnrollSandboxDir] = useState("/opt/ai-bridge/workspace");
  const [enrollTokenExp, setEnrollTokenExp] = useState("24h");
  const [enrollScriptPlatform, setEnrollScriptPlatform] = useState<"linux" | "windows">("linux");
  const [copiedEnrollScript, setCopiedEnrollScript] = useState(false);
  const [taskQuery, setTaskQuery] = useState("");
  const [taskSort, setTaskSort] = useState<"newest" | "oldest" | "tool">("newest");
  const [taskPage, setTaskPage] = useState(0);
  const [auditSort, setAuditSort] = useState<"newest" | "oldest">("newest");
  const [auditPage, setAuditPage] = useState(0);
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [visionZoom, setVisionZoom] = useState(1);
  const [lightbox, setLightbox] = useState<{ src: string; title: string } | null>(null);
  const [auditQuery, setAuditQuery] = useState("");
  const [auditTool, setAuditTool] = useState("all");
  const [logService, setLogService] = useState("control");
  const [logCount, setLogCount] = useState(100);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [secondsAgo, setSecondsAgo] = useState<number>(0);
  useEffect(() => {
    const timer = setInterval(() => {
      if (lastUpdated) {
        setSecondsAgo(Math.floor((Date.now() - lastUpdated) / 1000));
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [lastUpdated]);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [cmdQuery, setCmdQuery] = useState("");
  const [cmdSelectedIndex, setCmdSelectedIndex] = useState(0);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const mobileNavToggleRef = useRef<HTMLButtonElement>(null);
  const mobileNavRef = useRef<HTMLElement>(null);
  const previousMobileNavOpen = useRef(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [showShortcutsModal, setShowShortcutsModal] = useState(false);
  const [devicePolicyModalId, setDevicePolicyModalId] = useState<string | null>(null);
  const [selectedDeviceIdForDashboard, setSelectedDeviceIdForDashboard] = useState<string | null>(() => {
    return new URLSearchParams(window.location.search).get("device");
  });
  const [confirmReq, setConfirmReq] = useState<ConfirmRequest | null>(null);
  const [policySubTab, setPolicySubTab] = useState<"global" | "devices">("global");
  const [selectedPolicyDeviceId, setSelectedPolicyDeviceId] = useState<string>("");
  const [editModal, setEditModal] = useState<{
    kind: "device" | "task" | "policy" | "oauth_client";
    data: any;
  } | null>(null);

  // Policy editor state
  const [polTier3, setPolTier3] = useState(false);
  const [polDesktop, setPolDesktop] = useState(false);
  const [polApps, setPolApps] = useState("");
  const [polServices, setPolServices] = useState("");
  const [polNote, setPolNote] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");

  useEffect(() => {
    const onDocClick = () => setUserMenuOpen(false);
    if (userMenuOpen) {
      window.addEventListener("click", onDocClick);
      return () => window.removeEventListener("click", onDocClick);
    }
  }, [userMenuOpen]);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    document.documentElement.classList.toggle("dark", theme === "dark");
    localStorage.setItem("ai_bridge_theme", theme);
  }, [theme]);

  useEffect(() => {
    if (previousMobileNavOpen.current === mobileNavOpen) return;
    previousMobileNavOpen.current = mobileNavOpen;
    if (!window.matchMedia("(max-width: 960px)").matches) return;

    if (mobileNavOpen) {
      Array.from(mobileNavRef.current?.querySelectorAll<HTMLButtonElement>("button:not([disabled])") || [])
        .find(button => button.getClientRects().length > 0)
        ?.focus();
    } else {
      mobileNavToggleRef.current?.focus();
    }
  }, [mobileNavOpen]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      const isInput =
        activeEl &&
        (activeEl.tagName === "INPUT" ||
          activeEl.tagName === "TEXTAREA" ||
          (activeEl as HTMLElement).isContentEditable);

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCmdOpen(prev => !prev);
        setCmdQuery("");
      } else if (e.key === "?" && !isInput && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        setShowShortcutsModal(prev => !prev);
      } else if (e.key === "Escape") {
        setShowShortcutsModal(false);
        setCmdOpen(false);
        setLightbox(null);
        setEditModal(null);
        setDevicePolicyModalId(null);
        setEmergencyArmed(false);
        setMobileNavOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  async function load(v: View = view) {
    setErr("");
    setLoading(true);
    try {
      api.me().then(setMe).catch(() => {});
      if (v === "overview") {
        let firstErr = "";
        const captureErr = (fallback: any) => (e: any) => {
          if (!firstErr && e?.message) firstErr = e.message;
          return fallback;
        };
        const [h, c, d, t, a, ap] = await Promise.all([
          api.health().catch(() => null),
          api.connections().catch(captureErr(null)),
          api.devices().catch(captureErr([])),
          api.tasks().catch(captureErr([])),
          api.audit().catch(captureErr([])),
          api.approvals().catch(captureErr([])),
        ]);
        setHealth(h);
        setConnections(c);
        setDevices(d);
        setTasks(t);
        setAudit(a);
        setApprovals(ap);
        if (firstErr) setErr(firstErr);
      } else if (v === "devices") {
        setDevices(await api.devices());
      } else if (v === "tasks") {
        const [t, d] = await Promise.all([api.tasks(), api.devices()]);
        setTasks(t);
        setDevices(d);
        if (!taskDevice && d.length > 0) {
          const firstOnline = d.find((x: any) => !x.revoked && x.status === "online") || d.find((x: any) => !x.revoked);
          if (firstOnline) setTaskDevice(firstOnline.id);
        }
      } else if (v === "approvals") {
        setApprovals(await api.approvals());
      } else if (v === "audit") {
        setAudit(await api.audit());
      } else if (v === "policies") {
        const [pol, hist, wh, devs] = await Promise.all([
          api.policies(),
          api.policyHistory(),
          api.getWebhook().catch(() => ({ webhook_url: "" })),
          api.devices().catch(() => []),
        ]);
        setPolicy(pol);
        setPolicyHistory(hist);
        setDevices(devs);
        if (!selectedPolicyDeviceId && devs.length > 0) setSelectedPolicyDeviceId(devs[0].id);
        setPolTier3(!!pol?.policy?.allow_tier3);
        setPolDesktop(!!pol?.policy?.desktop_enabled);
        setPolApps((pol?.policy?.allowed_apps || []).join(", "));
        setPolServices((pol?.policy?.allowed_services || []).join(", "));
        setWebhookUrl(wh?.webhook_url || "");
      } else if (v === "connections") {
        const [c, h] = await Promise.all([api.connections(), api.health().catch(() => null)]);
        setConnections(c);
        setHealth(h);
      } else if (v === "logs") {
        const r = await api.logs(logService, logCount);
        setLogLines(r.lines || []);
      } else if (v === "live_studio" || v === "fleet_ops") {
        setDevices(await api.devices().catch(() => []));
      }
      setLastUpdated(Date.now());
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  // Success/info notices auto-dismiss; warnings and errors stay until dismissed.
  useEffect(() => {
    if (!notice || notice.intent === "warning" || notice.intent === "error") return;
    const id = setTimeout(() => setNotice(null), 8000);
    return () => clearTimeout(id);
  }, [notice]);

  // The armed Emergency Stop state must not outlive this component.
  useEffect(() => {
    return () => {
      if (emergencyTimer.current) clearTimeout(emergencyTimer.current);
    };
  }, []);

  useEffect(() => {
    if (tok || sessionToken()) load();
  }, [view, tok, logService, logCount]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const hashParams = window.location.hash ? new URLSearchParams(window.location.hash.replace(/^#/, "")) : null;
    let st = params.get("session_token") || hashParams?.get("session_token");
    let at = params.get("token") || params.get("admin_token") || hashParams?.get("token") || hashParams?.get("admin_token");
    let th = params.get("theme") || hashParams?.get("theme");

    if (th === "light" || th === "dark") {
      localStorage.setItem("ai_bridge_theme", th);
      setTheme(th);
      if (setMode) setMode(th);
    }
    if (at) {
      localStorage.setItem("ai_bridge_admin_token", at);
      setTok(at);
    } else if (st) {
      localStorage.setItem("ai_bridge_session_token", st);
      setTok("session");
    }
    if (st || at) {
      // Keep deep-link params when stripping the one-time token from the URL.
      const kept = new URLSearchParams();
      const v = params.get("view") || hashParams?.get("view");
      if (v) kept.set("view", v);
      const d = params.get("device") || hashParams?.get("device");
      if (d) kept.set("device", d);
      const qs = kept.toString();
      window.history.replaceState({}, "", qs ? `?${qs}` : window.location.pathname);
    }
    api.oidcConfigured().then(r => setOidcEnabled(!!r.enabled)).catch(() => {});
  }, []);

  // Deep links: the current view (and device, for Device 360) live in the
  // URL, so refresh, back/forward and shared links restore the same place.
  // First sync replaces (no extra history entry); later changes push.
  const navSyncedRef = useRef(false);
  useEffect(() => {
    const params = new URLSearchParams();
    params.set("view", view);
    if (view === "device_detail" && selectedDeviceIdForDashboard) params.set("device", selectedDeviceIdForDashboard);
    const qs = `?${params.toString()}`;
    if (window.location.search === qs) return;
    if (!navSyncedRef.current) {
      navSyncedRef.current = true;
      window.history.replaceState({}, "", qs);
    } else {
      window.history.pushState({}, "", qs);
    }
  }, [view, selectedDeviceIdForDashboard]);

  useEffect(() => {
    const onPop = () => {
      const params = new URLSearchParams(window.location.search);
      const v = params.get("view");
      const valid: View[] = ["overview", "devices", "device_detail", "tasks", "approvals", "audit", "policies", "connections", "ai_api", "workflows", "fleet_ops", "live_studio", "logs"];
      if (v && (valid as string[]).includes(v)) setView(v as View);
      const d = params.get("device");
      if (d) setSelectedDeviceIdForDashboard(d);
      else if (params.get("view") !== "device_detail") setSelectedDeviceIdForDashboard(null);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    if (!autoRefresh || !(tok || sessionToken())) return;
    const id = setInterval(() => load(), 15000);
    return () => clearInterval(id);
  }, [autoRefresh, view, tok, logService, logCount]);

  const authed = !!(tok || sessionToken());
  if (!authed) {
    return (
      <div
        className="f2-shell"
        style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          padding: "40px 20px",
          background: "var(--jx-canvas)",
          backgroundImage: "var(--jx-canvas-gradient)",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <JXCard spotlight={true} hoverLift={false} className="w-full max-w-[500px] shadow-2xl">
          <JXCardHeader
            title="AI Bridge Fleet Gateway"
            subheader="Zero-Trust Edge Control Plane"
            icon={<FluentIcon name="approvals" />}
          />
          <JXCardContent>
            {/* Top Status & Theme Toolbar */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <JXChip
                  label={
                    gatewayPing.status === "online"
                      ? `Gateway Online (${gatewayPing.ms}ms · v${gatewayPing.version})`
                      : gatewayPing.status === "checking"
                      ? "Checking Gateway…"
                      : "Standalone Port 8000"
                  }
                  tone={gatewayPing.status === "online" ? "emerald" : gatewayPing.status === "checking" ? "amber" : "neutral"}
                />
              </div>
              <JXButton
                size="sm"
                variant="soft"
                onClick={toggleTheme}
                title={`Switch to ${theme === "light" ? "Dark" : "Light"} Mode`}
                aria-label={`Switch to ${theme === "light" ? "Dark" : "Light"} Mode`}
                startIcon={<FluentIcon name="theme" />}
              >
                {theme === "light" ? "Dark" : "Light"}
              </JXButton>
            </div>

            {/* Subheading */}
            <JXTypography variant="body" balance={true}>
              Authenticate to dispatch policy-governed tools, manage enrolled edge agents, and monitor real-time telemetry.
            </JXTypography>

            {/* Google Single Sign-On (if configured) */}
            {oidcEnabled && (
              <div style={{ marginTop: 18, marginBottom: 14 }}>
                <LiquidButton
                  variant="solid"
                  tone="primary"
                  onClick={() => api.oidcLogin()}
                  style={{ width: "100%", height: 42, fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
                >
                  <FluentIcon name="connections" /> Continue with Google Single Sign-On
                </LiquidButton>
                <div style={{ margin: "14px 0" }}>
                  <JXDivider variant="radial-fade" label="or authenticate with token" />
                </div>
              </div>
            )}

            {/* Auth Method Selector */}
            <div style={{ marginTop: 18, marginBottom: 18 }}>
              <JXTabs
                value={authTab}
                onChange={(val: any) => {
                  setAuthTab(val);
                  setErr("");
                }}
                indicatorVariant="pill"
                tabs={[
                  { id: "token", label: "Admin Token" },
                  { id: "user", label: "Operator Credentials" },
                ]}
              />
            </div>

            {/* Token Authentication Form */}
            {authTab === "token" ? (
              <form
                onSubmit={async e => {
                  e.preventDefault();
                  const v = loginTokenInput.trim();
                  if (!v) return;
                  setErr("");
                  setLoginPending(true);
                  if (rememberDevice) {
                    localStorage.setItem("ai_bridge_admin_token", v);
                  }
                  try {
                    const m = await api.me();
                    setMe(m);
                    setTok(v);
                  } catch {
                    localStorage.removeItem("ai_bridge_admin_token");
                    setErr("Authentication failed. Please verify your administrator bearer token or ensure the control plane service is reachable.");
                  } finally {
                    setLoginPending(false);
                  }
                }}
                style={{ display: "grid", gap: 14 }}
              >
                <div>
                  <JXTextField
                    label="Administrator Secret Key"
                    helperText="Configured via AI_BRIDGE_ADMIN_TOKEN on the host"
                    type={loginShowToken ? "text" : "password"}
                    value={loginTokenInput}
                    onChange={(val: any) => setLoginTokenInput(typeof val === "string" ? val : val?.target?.value || "")}
                    placeholder="Enter or paste administrator token…"
                    required
                    clearable
                    endIcon={
                      <JXButton
                        size="sm"
                        variant="text"
                        onClick={() => setLoginShowToken(!loginShowToken)}
                        title={loginShowToken ? "Hide token" : "Reveal token"}
                      >
                        {loginShowToken ? "Hide" : "Show"}
                      </JXButton>
                    }
                  />

                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <JXButton
                        size="sm"
                        variant="text"
                        onClick={async () => {
                          try {
                            const clip = await navigator.clipboard.readText();
                            if (clip) setLoginTokenInput(clip.trim());
                          } catch {}
                        }}
                      >
                        Paste from Clipboard
                      </JXButton>
                      <JXButton
                        size="sm"
                        variant="text"
                        onClick={() => {
                          setLoginTokenInput("ai_bridge_admin_secret_token");
                          setDevTokenFilled(true);
                          setTimeout(() => setDevTokenFilled(false), 2000);
                        }}
                      >
                        {devTokenFilled ? "Token Inserted" : "Insert Dev Token"}
                      </JXButton>
                    </div>
                  </div>
                </div>

                <JXCheckbox
                  checked={rememberDevice}
                  onChange={setRememberDevice}
                  label="Keep this workstation authenticated"
                  spring={true}
                />

                <MagneticButton
                  strength={16}
                  variant="solid"
                  tone="primary"
                  type="submit"
                  disabled={loginPending || !loginTokenInput.trim()}
                  style={{ width: "100%", height: 44, fontSize: 14, fontWeight: 600, marginTop: 4 }}
                >
                  {loginPending ? "Validating Bearer Token…" : "Sign In to Control Plane"}
                </MagneticButton>
              </form>
            ) : (
              /* Operator Credentials Form */
              <form
                onSubmit={async e => {
                  e.preventDefault();
                  if (!loginUsernameInput.trim() || !loginPasswordInput) return;
                  setErr("");
                  setLoginPending(true);
                  try {
                    const s = await api.login(loginUsernameInput.trim(), loginPasswordInput);
                    if (rememberDevice) {
                      localStorage.setItem("ai_bridge_session_token", s.session_token);
                    }
                    setTok("session");
                  } catch {
                    setErr("Invalid operator credentials. Please check your username and password.");
                  } finally {
                    setLoginPending(false);
                  }
                }}
                style={{ display: "grid", gap: 14 }}
              >
                <JXTextField
                  label="Operator Username"
                  value={loginUsernameInput}
                  onChange={(val: any) => setLoginUsernameInput(typeof val === "string" ? val : val?.target?.value || "")}
                  placeholder="admin or operator"
                  required
                  autoComplete="username"
                />

                <JXTextField
                  label="Password"
                  type="password"
                  value={loginPasswordInput}
                  onChange={(val: any) => setLoginPasswordInput(typeof val === "string" ? val : val?.target?.value || "")}
                  placeholder="Enter operator password"
                  required
                  showEntropyMeter={true}
                  autoComplete="current-password"
                />

                <JXCheckbox
                  checked={rememberDevice}
                  onChange={setRememberDevice}
                  label="Keep session active"
                  spring={true}
                />

                <MagneticButton
                  strength={16}
                  variant="solid"
                  tone="primary"
                  type="submit"
                  disabled={loginPending || !loginUsernameInput.trim() || !loginPasswordInput}
                  style={{ width: "100%", height: 44, fontSize: 14, fontWeight: 600, marginTop: 4 }}
                >
                  {loginPending ? "Authenticating Session…" : "Sign In with Credentials"}
                </MagneticButton>
              </form>
            )}

            {/* Enterprise Feedback Alert */}
            {err && (
              <div style={{ marginTop: 16 }}>
                <JXAlert severity="error" title="Authentication Error" description={err} />
              </div>
            )}

            {/* Security Guardrail Footnote */}
            <div style={{ marginTop: 20 }}>
              <JXDivider variant="radial-fade" />
            </div>

            <div style={{ marginTop: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <JXChip label="TLS 1.3" tone="neutral" />
                <JXChip label="Zero-Trust Enforced" tone="indigo" />
              </div>
              <JXChip label="Audit Logged" tone="neutral" />
            </div>
          </JXCardContent>
        </JXCard>
      </div>
    );
  }

  const online = devices.filter(d => d.status === "online" && !d.revoked);
  const taskByStatus = countBy(tasks, "status");
  const auditByDecision = countBy(audit, "decision");
  const auditByTool = countBy(audit, "tool");
  const topTools = Object.entries(auditByTool).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const audit24h = audit.filter(a => a.ts && Date.now() / 1000 - a.ts < 86400).length;
  const pending = approvals.filter(a => a.status === "pending");
  const maxTask = Math.max(1, ...Object.values(taskByStatus));
  const filteredTasks = tasks
    .filter(t => {
      if (taskStatus !== "all" && t.status !== taskStatus) return false;
      if (!taskQuery) return true;
      const devName = devices.find(dd => dd.id === t.device_id)?.name || "";
      const hay = `${t.id || ""} ${t.tool || ""} ${devName} ${t.status || ""}`.toLowerCase();
      return hay.includes(taskQuery.toLowerCase());
    })
    .sort((a, b) => {
      if (taskSort === "tool") return String(a.tool || "").localeCompare(String(b.tool || ""));
      const ta = a.created_at || 0, tb = b.created_at || 0;
      return taskSort === "oldest" ? ta - tb : tb - ta;
    });
  const pagedTasks = filteredTasks.slice(taskPage * 25, taskPage * 25 + 25);
  const searchedDevices = devices
    .filter(d => {
      if (deviceStatusFilter === "online" && (d.status !== "online" || d.revoked)) return false;
      if (deviceStatusFilter === "offline" && (d.status === "online" || d.revoked)) return false;
      if (deviceStatusFilter === "revoked" && !d.revoked) return false;
      if (deviceOsFilter !== "all") {
        const osStr = (d.os || "").toLowerCase();
        if (deviceOsFilter === "windows" && !osStr.includes("win")) return false;
        if (deviceOsFilter === "linux" && !osStr.includes("linux") && !osStr.includes("ubuntu") && !osStr.includes("debian")) return false;
        if (deviceOsFilter === "darwin" && !osStr.includes("darwin") && !osStr.includes("mac")) return false;
      }
      if (!deviceQuery) return true;
      const hay = `${d.name || ""} ${d.hostname || ""} ${d.os || ""} ${d.id || ""}`.toLowerCase();
      return hay.includes(deviceQuery.toLowerCase());
    })
    .sort((a, b) => {
      if (deviceSort === "status") {
        const rank = (x: any) => (x.revoked ? 2 : x.status === "online" ? 0 : 1);
        return rank(a) - rank(b) || String(a.name || "").localeCompare(String(b.name || ""));
      }
      return String(a.name || "").localeCompare(String(b.name || ""));
    });
  const pagedDevices = searchedDevices.slice(devicePage * 20, devicePage * 20 + 20);
  const filteredAudit = audit
    .filter(a => {
      if (auditTool !== "all" && a.tool !== auditTool) return false;
      if (!auditQuery) return true;
      const hay = `${a.actor || ""} ${a.tool || ""} ${a.decision || ""} ${a.device_id || ""}`.toLowerCase();
      return hay.includes(auditQuery.toLowerCase());
    })
    .sort((a, b) => (auditSort === "oldest" ? (a.ts || 0) - (b.ts || 0) : (b.ts || 0) - (a.ts || 0)));
  const pagedAudit = filteredAudit.slice(auditPage * 25, auditPage * 25 + 25);
  const deviceNameOf = (id: string) => (devices.find(d => d.id === id)?.name || id || "").slice(0, 24);
  const origin = window.location.origin;
  const meta = VIEW_META[view];

  return (
    <div className="f2-shell">
      {/* JXUI Luxury Top App Bar: Minimal, Clean & 3-Column Architecture */}
      <header className="f2-topbar">
        {/* Left: Mobile Toggle + Brand Logo + Fleet Status Pill */}
        <div className="f2-topbar-left">
          <button
            type="button"
            className="f2-icon-btn f2-mobile-toggle"
            ref={mobileNavToggleRef}
            onClick={() => setMobileNavOpen(prev => !prev)}
            aria-label={mobileNavOpen ? "Close navigation menu" : "Open navigation menu"}
            aria-expanded={mobileNavOpen}
            aria-controls="dashboard-navigation"
            title={mobileNavOpen ? "Close navigation" : "Open navigation"}
          >
            <FluentIcon name={mobileNavOpen ? "cancel" : "more"} />
          </button>

          <button type="button" className="f2-brand" onClick={() => { setView("overview"); setMobileNavOpen(false); }}>
            <span className="f2-brand-logo" title="AI Bridge Control Plane">
              <FluentIcon name="approvals" />
            </span>
            <div className="f2-brand-text">
              <span className="f2-brand-title">
                AI Bridge <span className="f2-brand-badge">PRO</span>
              </span>
            </div>
          </button>

          {health?.emergency_stop ? (
            <button
              type="button"
              className="f2-status-pill danger"
              onClick={() => setView("overview")}
              title="Emergency Stop is Active. All tasks blocked."
              aria-label="Emergency stop active. View operations."
            >
              <span className="f2-status-dot danger" />
              <span>STOPPED</span>
            </button>
          ) : secondsAgo >= 30 ? (
            <button
              type="button"
              className="f2-status-pill stale"
              onClick={() => load()}
              title={`Data last updated ${secondsAgo}s ago. Click to refresh.`}
              aria-label={`Data last updated ${secondsAgo} seconds ago. Click to refresh.`}
            >
              <span className="f2-status-dot stale" />
              <span>⚠️ Stale ({secondsAgo}s) · ↻</span>
            </button>
          ) : (
            <button
              type="button"
              className="f2-status-pill"
              onClick={() => setView("devices")}
              title={`${online.length} of ${devices.length} devices online · updated ${secondsAgo}s ago`}
              aria-label={`${online.length} of ${devices.length} devices online. View devices.`}
            >
              <span className="f2-status-dot online" />
              <span>{online.length}/{devices.length} Online{secondsAgo > 0 ? ` · ${secondsAgo}s` : ""}</span>
            </button>
          )}
        </div>

        {/* Center: Spotlight Search (⌘K Command Palette) */}
        <div className="f2-topbar-center">
          <button
            type="button"
            className="f2-search-trigger"
            onClick={() => {
              setCmdOpen(true);
              setCmdQuery("");
            }}
            title="Spotlight Command Palette (⌘K / Ctrl+K)"
          >
            <FluentIcon name="search" />
            <span className="f2-search-placeholder">Search fleet, tasks, tools…</span>
            <kbd className="f2-kbd">⌘K</kbd>
          </button>
        </div>

        {/* Right: Consolidated Clean Action Cluster */}
        <div className="f2-topbar-right">
          {pending.length > 0 && (
            <button
              type="button"
              className="f2-pending-badge"
              onClick={() => setView("approvals")}
              title={`${pending.length} pending operation(s) awaiting approval`}
            >
              <span className="f2-pending-pulse" />
              <span>{pending.length} Pending</span>
            </button>
          )}

          <button
            type="button"
            className="f2-icon-action-btn f2-header-refresh"
            onClick={() => load()}
            disabled={loading}
            title={lastUpdated ? `Updated ${new Date(lastUpdated).toLocaleTimeString()} (Click to refresh)` : "Refresh fleet"}
            aria-label="Refresh fleet telemetry"
          >
            <span className={loading ? "f2-spin" : ""}>↻</span>
          </button>

          <button
            type="button"
            className="f2-icon-action-btn f2-header-theme"
            onClick={toggleTheme}
            title={`Switch to ${theme === "light" ? "Dark" : "Light"} Mode`}
            aria-label={`Switch to ${theme === "light" ? "Dark" : "Light"} Mode`}
          >
            {theme === "light" ? "🌙" : "☀️"}
          </button>

          <button
            type="button"
            className="f2-icon-action-btn f2-header-shortcuts"
            onClick={() => setShowShortcutsModal(true)}
            title="Keyboard Shortcuts (?)"
            aria-label="Keyboard Shortcuts"
          >
            ⌨️
          </button>

          {health?.emergency_stop ? (
            <LiquidButton
              variant="solid"
              tone="primary"
              onClick={async () => {
                await api.emergencyClear();
                setNotice({ intent: "success", text: "Emergency stop cleared. Task queue resumed." });
                load();
              }}
              style={{ padding: "6px 14px", fontSize: 12, height: 32 }}
            >
              Resume Fleet
            </LiquidButton>
          ) : (
            <HoldToConfirmButton
              label="Stop Fleet"
              tone="danger"
              variant="solid"
              holdDurationMs={1200}
              onConfirm={async () => {
                await api.emergencyStop();
                setNotice({ intent: "error", text: "Emergency stop activated. New tasks are blocked." });
                load();
              }}
            />
          )}

          {/* User Profile & Workspace Settings Dropdown */}
          <div className="f2-user-menu-wrap" style={{ position: "relative" }} onClick={e => e.stopPropagation()}>
            <button
              type="button"
              className="f2-user-pill-btn"
              onClick={() => setUserMenuOpen(prev => !prev)}
              title="Profile & Workspace Settings"
            >
              <span className="f2-avatar">{String(me?.username || "A").slice(0, 2).toUpperCase()}</span>
              <span className="f2-user-name">{me?.username || "admin"}</span>
              <span className="f2-caret">{userMenuOpen ? "▴" : "▾"}</span>
            </button>

            {userMenuOpen && (
              <div className="f2-user-popover">
                <div className="f2-user-popover-header">
                  <div className="f2-user-popover-name">{me?.username || "Admin"}</div>
                  <div className="f2-user-popover-role">{me?.role || "Administrator"} · Fleet Cloud</div>
                </div>

                <div className="f2-popover-divider" />

                <div className="f2-popover-section">
                  <div className="f2-popover-label">Theme Accent</div>
                  <div className="f2-swatch-row">
                    {(["indigo", "violet", "emerald", "rose", "ocean"] as const).map(acc => (
                      <button
                        key={acc}
                        type="button"
                        onClick={() => setAccent && setAccent(acc)}
                        className={`f2-palette-swatch ${accent === acc ? "active" : ""}`}
                        style={{
                          background: acc === "indigo" ? "#6366f1" : acc === "violet" ? "#a855f7" : acc === "emerald" ? "#10b981" : acc === "rose" ? "#f43f5e" : "#0ea5e9"
                        }}
                        title={`Accent: ${acc.charAt(0).toUpperCase() + acc.slice(1)}`}
                      />
                    ))}
                  </div>
                </div>

                <div className="f2-popover-divider" />

                <label className="f2-popover-toggle-label">
                  <input
                    type="checkbox"
                    checked={autoRefresh}
                    onChange={e => setAutoRefresh(e.target.checked)}
                    style={{ accentColor: "var(--jx-primary)" }}
                  />
                  <span>Auto-refresh telemetry (15s)</span>
                </label>

                <div className="f2-popover-divider" />

                <button
                  type="button"
                  className="f2-popover-signout-btn"
                  onClick={async () => {
                    try { if (sessionToken()) await api.logout(); } catch {}
                    localStorage.removeItem("ai_bridge_admin_token");
                    localStorage.removeItem("ai_bridge_session_token");
                    setTok("");
                    setMe(null);
                    setUserMenuOpen(false);
                  }}
                >
                  <span>Sign out</span>
                  <span>➔</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="f2-body">
        {mobileNavOpen && (
          <div
            className="f2-nav-backdrop"
            onClick={() => setMobileNavOpen(false)}
            role="presentation"
          />
        )}
        {/* Fluent 2 Navigation Drawer */}

        <nav
          id="dashboard-navigation"
          ref={mobileNavRef}
          className={`f2-nav${mobileNavOpen ? " f2-nav-open" : ""}`}
          aria-label="Main Navigation"
          onKeyDown={e => {
            if (e.key !== "Tab" || !mobileNavOpen || !window.matchMedia("(max-width: 960px)").matches) return;
            const items = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>("button:not([disabled])"))
              .filter(button => button.getClientRects().length > 0);
            const first = items[0];
            const last = items[items.length - 1];
            if (e.shiftKey && document.activeElement === first) {
              e.preventDefault();
              last?.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
              e.preventDefault();
              first?.focus();
            }
          }}
        >

          <button
            type="button"
            className="f2-nav-item f2-mobile-search"
            onClick={() => {
              setMobileNavOpen(false);
              setCmdOpen(true);
              setCmdQuery("");
            }}
          >
            <span className="f2-nav-item-icon"><FluentIcon name="search" /></span>
            <span style={{ flex: 1, textAlign: "left" }}>Search fleet, tasks, tools</span>
          </button>

          <button type="button" className="f2-nav-item f2-mobile-nav-action" onClick={() => { setMobileNavOpen(false); load(); }}>
            <span className="f2-nav-item-icon" aria-hidden="true">↻</span>
            <span style={{ flex: 1, textAlign: "left" }}>Refresh telemetry</span>
          </button>

          <button
            type="button"
            className="f2-nav-item f2-mobile-nav-action"
            onClick={() => {
              setMobileNavOpen(false);
              toggleTheme();
            }}
          >
            <span className="f2-nav-item-icon"><FluentIcon name="theme" /></span>
            <span style={{ flex: 1, textAlign: "left" }}>Switch to {theme === "light" ? "Dark" : "Light"} Mode</span>
          </button>

          <div className="f2-nav-section-label">Operations</div>

          {(["overview", "devices"] as View[]).map(v => (

            <button

              key={v}

              type="button"

              className="f2-nav-item"

              data-active={String(view === v)}

              onClick={() => { setView(v); setMobileNavOpen(false); }}

            >

              <span className="f2-nav-item-icon">

                <FluentIcon name={v} />

              </span>

              <span style={{ textTransform: "capitalize", flex: 1, textAlign: "left" }}>{v}</span>

              {v === "devices" && online.length > 0 && (

                <span className="f2-nav-counter">{online.length}</span>

              )}

            </button>

          ))}



          <button

            type="button"

            className="f2-nav-item"

            data-active={String(view === "device_detail")}

            onClick={() => {

              if (!selectedDeviceIdForDashboard && devices.length > 0) {

                setSelectedDeviceIdForDashboard(devices[0].id);

              }

              setView("device_detail");

              setMobileNavOpen(false);

            }}

            title="Inspect full system specs, running servers, apps, and health for any machine"

          >

            <span className="f2-nav-item-icon">

              <FluentIcon name="dashboard" />

            </span>

            <span style={{ flex: 1, textAlign: "left" }}>Device 360</span>

            {selectedDeviceIdForDashboard && (

              <span className="f2-nav-counter" style={{ fontSize: 10 }}>

                {deviceNameOf(selectedDeviceIdForDashboard).slice(0, 8)}

              </span>

            )}

          </button>



          {(["tasks", "approvals"] as View[]).map(v => (

            <button

              key={v}

              type="button"

              className="f2-nav-item"

              data-active={String(view === v)}

              onClick={() => { setView(v); setMobileNavOpen(false); }}

            >

              <span className="f2-nav-item-icon">

                <FluentIcon name={v} />

              </span>

              <span style={{ textTransform: "capitalize", flex: 1, textAlign: "left" }}>{v}</span>

              {v === "approvals" && pending.length > 0 && (

                <span className="f2-nav-counter" data-warn="true">{pending.length}</span>

              )}

            </button>

          ))}



          <button

            type="button"

            className="f2-nav-item"

            data-active={String(view === "ai_api")}

            onClick={() => { setView("ai_api"); setMobileNavOpen(false); }}

            title="Connect your custom AI, OpenAI, Claude, or local LLMs to control fleet devices"

          >

            <span className="f2-nav-item-icon">

              <FluentIcon name="ai_api" />

            </span>

            <span style={{ flex: 1, textAlign: "left" }}>AI API & Agents</span>

            <span className="f2-nav-counter" style={{ background: "var(--jx-primary)", color: "#fff", fontSize: 9 }}>NEW</span>

          </button>



          <button

            type="button"

            className="f2-nav-item"

            data-active={String(view === "workflows")}

            onClick={() => { setView("workflows"); setMobileNavOpen(false); }}

            title="Compose and execute autonomous multi-turn plans across fleet devices with OCR verification"

          >

            <span className="f2-nav-item-icon">

              <FluentIcon name="workflows" />

            </span>

            <span style={{ flex: 1, textAlign: "left" }}>Workflows & Plans</span>

            <span className="f2-nav-counter" style={{ fontSize: 9 }}>AGENT</span>

          </button>



          <button

            type="button"

            className="f2-nav-item"

            data-active={String(view === "fleet_ops")}

            onClick={() => { setView("fleet_ops"); setMobileNavOpen(false); }}

            title="Cross-device telemetry graphs, multi-node command bus, and self-healing triggers"

          >

            <span className="f2-nav-item-icon">

              <FluentIcon name="fleet_ops" />

            </span>

            <span style={{ flex: 1, textAlign: "left" }}>Fleet Operations</span>

            <span className="f2-nav-counter" style={{ fontSize: 9 }}>FLEET</span>

          </button>



          <button

            type="button"

            className="f2-nav-item"

            data-active={String(view === "live_studio")}

            onClick={() => { setView("live_studio"); setMobileNavOpen(false); }}

            title="Real-time visual desktop stream, dual-control human takeover, and fleet auto-updater"

          >

            <span className="f2-nav-item-icon">

              <FluentIcon name="live_studio" />

            </span>

            <span style={{ flex: 1, textAlign: "left" }}>Live Desktop Studio</span>

            <span className="f2-nav-counter" style={{ background: "var(--jx-rose)", color: "#fff", fontSize: 9 }}>LIVE</span>

          </button>



          <button

            type="button"

            className="f2-nav-item"

            data-active={String(view === "terminal")}

            onClick={() => { setView("terminal"); setMobileNavOpen(false); }}

            title="Real-time interactive pseudo-terminal shell with ANSI colors"

          >

            <span className="f2-nav-item-icon">

              <FluentIcon name="terminal" />

            </span>

            <span style={{ flex: 1, textAlign: "left" }}>Live Terminal</span>

            <span className="f2-nav-counter" style={{ background: "var(--jx-primary)", color: "#fff", fontSize: 9 }}>SHELL</span>

          </button>



          <div className="f2-nav-section-label" style={{ marginTop: 8 }}>Governance & Telemetry</div>

          {(["policies", "audit", "connections", "logs"] as View[]).map(v => (

            <button

              key={v}

              type="button"

              className="f2-nav-item"

              data-active={String(view === v)}

              onClick={() => { setView(v); setMobileNavOpen(false); }}

            >

              <span className="f2-nav-item-icon">

                <FluentIcon name={v} />

              </span>

              <span style={{ textTransform: "capitalize", flex: 1, textAlign: "left" }}>{v}</span>

            </button>

          ))}

        </nav>


        {/* Fluent 2 Workspace Canvas */}
        <main className="f2-canvas" aria-busy={loading}>
          {/* Global Persistent Operational Triage Ribbon */}
          {(() => {
            const hasEmergency = Boolean(health?.emergency_stop);
            const pendingList = approvals.filter(a => a.status === "pending");
            const offlineDevices = devices.filter(d => !d.is_online && d.status !== "online" && !d.revoked);

            if (!hasEmergency && pendingList.length === 0 && offlineDevices.length === 0) {
              return null;
            }

            return (
              <div className="f2-triage-ribbon" role="alert" aria-live="polite">
                {hasEmergency && (
                  <div className="f2-triage-item f2-triage-danger">
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1 }}>
                      <span style={{ fontSize: 16 }}>🛑</span>
                      <div className="f2-triage-text">
                        <strong>EMERGENCY STOP ACTIVE:</strong> All outbound autonomous task executions are halted.
                      </div>
                    </div>
                    <button
                      type="button"
                      className="f2-triage-btn f2-triage-btn-danger"
                      onClick={async () => {
                        await api.emergencyClear();
                        setNotice({ intent: "success", text: "Emergency stop cleared. Operations resumed." });
                        load();
                      }}
                    >
                      Resume Fleet
                    </button>
                  </div>
                )}

                {pendingList.length > 0 && (
                  <div className="f2-triage-item f2-triage-warning">
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1 }}>
                      <span style={{ fontSize: 16 }}>⚠️</span>
                      <div className="f2-triage-text">
                        <strong>{pendingList.length} Pending Approval{pendingList.length > 1 ? "s" : ""}:</strong> Requires administrator sign-off before dispatching to fleet nodes.
                      </div>
                    </div>
                    <button
                      type="button"
                      className="f2-triage-btn f2-triage-btn-warning"
                      onClick={() => setView("approvals")}
                    >
                      Review Queue ({pendingList.length}) ↗
                    </button>
                  </div>
                )}

                {offlineDevices.length > 0 && (
                  <div className="f2-triage-item f2-triage-info">
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1 }}>
                      <span style={{ fontSize: 16 }}>⚪</span>
                      <div className="f2-triage-text">
                        <strong>{offlineDevices.length} Node{offlineDevices.length > 1 ? "s" : ""} Offline:</strong> {offlineDevices.map(d => d.name).slice(0, 3).join(", ")}{offlineDevices.length > 3 ? ` +${offlineDevices.length - 3} more` : ""}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="f2-triage-btn f2-triage-btn-info"
                      onClick={() => setView("devices")}
                    >
                      Inspect Fleet ↗
                    </button>
                  </div>
                )}
              </div>
            );
          })()}

          <div className="f2-page-header">
            <div>
              <div className="f2-breadcrumb" style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", fontSize: 13, marginBottom: 8 }}>
                <button type="button" className="f2-breadcrumb-link" style={{ cursor: "pointer", color: "var(--jx-primary)", fontWeight: 500 }} onClick={() => setView("overview")}>AI Bridge</button>
                <span className="f2-breadcrumb-sep" style={{ color: "var(--jx-text-tertiary)" }}>/</span>
                <span style={{ color: "var(--jx-text-tertiary)" }}>{meta.group === "ops" ? "Operations" : "Governance & Telemetry"}</span>
                <span className="f2-breadcrumb-sep" style={{ color: "var(--jx-text-tertiary)" }}>/</span>
                <span className="f2-breadcrumb-current" style={{ color: "var(--jx-text-primary)", fontWeight: 600 }}>{meta.title}</span>
              </div>
              <h2 className="f2-page-title">{meta.title}</h2>
              <p className="f2-page-subtitle">{meta.subtitle}</p>
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <button
                type="button"
                className="f2-copy-link-btn"
                title="Copy a link to this exact view"
                aria-label="Copy a link to this exact view"
                onClick={async () => {
                  try {
                    await navigator.clipboard?.writeText(window.location.href);
                    setNotice({ intent: "success", text: "Link copied to clipboard." });
                  } catch {
                    setErr("Could not copy the link. Copy it from the address bar instead.");
                  }
                }}
              >
                <FluentIcon name="copy" />
                <span>Copy view link</span>
              </button>
              {view !== "tasks" && (
                <MagneticButton
                  strength={20}
                  tone="primary"
                  variant="solid"
                  onClick={() => setView("tasks")}
                  className="f2-btn f2-btn-primary"
                >
                  <FluentIcon name="tasks" />
                  <span>Dispatch Task</span>
                </MagneticButton>
              )}
              {view !== "devices" && (
                <MagneticButton
                  strength={15}
                  tone="primary"
                  variant="soft"
                  onClick={() => setView("devices")}
                  className="f2-btn f2-btn-subtle"
                >
                  <FluentIcon name="devices" />
                  <span>Enroll Device</span>
                </MagneticButton>
              )}
            </div>
          </div>

          {err && (
            <div className="f2-messagebar" data-intent="error">
              <span><b>Connection issue:</b> {err}</span>
              <span style={{ display: "inline-flex", gap: 6 }}>
                <JXButton size="sm" variant="soft" onClick={() => load()}>Retry</JXButton>
                <JXButton size="sm" variant="soft" onClick={() => setErr("")}>Dismiss</JXButton>
              </span>
            </div>
          )}

          {notice && (
            <div className="f2-messagebar" data-intent={notice.intent}>
              <span>{notice.text}</span>
              <JXButton size="sm" variant="soft" onClick={() => setNotice(null)}>Dismiss</JXButton>
            </div>
          )}

          {loading && (
            <div className="f2-loading" role="status" aria-live="polite">
              <span className="f2-spinner" aria-hidden="true" />
              <span>Loading {meta.title}…</span>
            </div>
          )}

          {/* ==================== SCREEN 1: COMMAND OVERVIEW ==================== */}
          {view === "overview" && (() => {
            const totalTasksCount = Math.max(1, tasks.length);
            const tier1Tasks = tasks.filter(t => (TOOL_DESCRIPTIONS[t.tool]?.tier || 1) === 1).length;
            const tier2Tasks = tasks.filter(t => (TOOL_DESCRIPTIONS[t.tool]?.tier || 1) === 2).length;
            const tier3Tasks = tasks.filter(t => (TOOL_DESCRIPTIONS[t.tool]?.tier || 1) === 3).length;
            const t1Pct = Math.round((tier1Tasks / totalTasksCount) * 100);
            const t2Pct = Math.round((tier2Tasks / totalTasksCount) * 100);
            const t3Pct = Math.round((tier3Tasks / totalTasksCount) * 100);

            const completedTasks = taskByStatus["completed"] || 0;
            const failedTasks = taskByStatus["failed"] || 0;
            const runningTasks = (taskByStatus["running"] || 0) + (taskByStatus["queued"] || 0);
            const totalFinished = completedTasks + failedTasks;
            const taskSuccessPct = totalFinished ? Math.round((completedTasks / totalFinished) * 100) : 100;
            const onlineCount = online.length;
            const totalDevices = devices.length;
            const offlineCount = Math.max(0, totalDevices - onlineCount);

            return (
              <div className="f2-overview-layout" style={{ display: "grid", gap: 18 }}>
                {/* 1. Summary KPI Cards Ribbon */}
                <div className="f2-kpi-grid">
                  {/* KPI 1: Active Fleet Nodes */}
                  <button type="button" onClick={() => setView("devices")} className="f2-kpi-link">
                    <JXCard spotlight hoverLift className="f2-kpi-card">
                      <div className="f2-kpi-top">
                        <span>ACTIVE FLEET NODES</span>
                        <span className="f2-kpi-icon"><FluentIcon name="devices" /></span>
                      </div>
                      <div className="f2-kpi-value">
                        {onlineCount} <span style={{ fontSize: 16, color: "var(--jx-text-tertiary)", fontWeight: 400 }}>/ {totalDevices}</span>
                      </div>
                      <div className="f2-kpi-meta" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ width: 8, height: 8, borderRadius: "50%", background: onlineCount > 0 ? "#10b981" : "#94a3b8" }} />
                        <span>{onlineCount} online · {offlineCount} offline</span>
                      </div>
                    </JXCard>
                  </button>

                  {/* KPI 2: Task Throughput (24h) */}
                  <button type="button" onClick={() => setView("tasks")} className="f2-kpi-link">
                    <JXCard spotlight hoverLift className="f2-kpi-card">
                      <div className="f2-kpi-top">
                        <span>TASK THROUGHPUT (24H)</span>
                        <span className="f2-kpi-icon"><FluentIcon name="tasks" /></span>
                      </div>
                      <div className="f2-kpi-value">{tasks.length}</div>
                      <div className="f2-kpi-meta">
                        <span>{completedTasks} completed · {failedTasks} failed ({taskSuccessPct}% success)</span>
                      </div>
                    </JXCard>
                  </button>

                  {/* KPI 3: Pending Approvals */}
                  <button type="button" onClick={() => setView("approvals")} className="f2-kpi-link">
                    <JXCard spotlight hoverLift className="f2-kpi-card">
                      <div className="f2-kpi-top">
                        <span>PENDING APPROVALS</span>
                        <span className="f2-kpi-icon"><FluentIcon name="approvals" /></span>
                      </div>
                      <div className="f2-kpi-value" style={{ color: pending.length > 0 ? "var(--jx-rose)" : undefined }}>
                        {pending.length}
                      </div>
                      <div className="f2-kpi-meta">
                        <span>{pending.length > 0 ? "Requires human authorization" : "All requests resolved"}</span>
                      </div>
                    </JXCard>
                  </button>

                  {/* KPI 4: Fleet Heartbeat Latency */}
                  <button type="button" onClick={() => setView("fleet_ops")} className="f2-kpi-link">
                    <JXCard spotlight hoverLift className="f2-kpi-card">
                      <div className="f2-kpi-top">
                        <span>GATEWAY LATENCY</span>
                        <span className="f2-kpi-icon"><FluentIcon name="fleet_ops" /></span>
                      </div>
                      <div className="f2-kpi-value" style={{ fontSize: 20 }}>
                        {gatewayPing.status === "online" ? `${gatewayPing.ms}ms` : gatewayPing.status === "checking" ? "Checking…" : "Offline"}
                      </div>
                      <div className="f2-kpi-meta">
                        <span>v{gatewayPing.version || "0.2.0"} · 15s polling cadence</span>
                      </div>
                    </JXCard>
                  </button>

                  {/* KPI 5: MCP & OAuth Gateway */}
                  <button type="button" onClick={() => setView("connections")} className="f2-kpi-link">
                    <JXCard spotlight hoverLift className="f2-kpi-card">
                      <div className="f2-kpi-top">
                        <span>MCP GATEWAY</span>
                        <span className="f2-kpi-icon"><FluentIcon name="connections" /></span>
                      </div>
                      <div className="f2-kpi-value" style={{ fontSize: 20 }}>
                        {connections ? (connections.mcp.up ? "Connected" : "MCP Offline") : "Checking…"}
                      </div>
                      <div className="f2-kpi-meta">
                        <span>{connections ? `${connections.chatgpt.clients.length} client(s) · ${connections.chatgpt.active_access_tokens} token(s)` : "Streamable HTTP"}</span>
                      </div>
                    </JXCard>
                  </button>
                </div>

                {/* 2. Quick Launchpad */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    flexWrap: "wrap",
                    padding: "14px 18px",
                    background: "var(--jx-surface-glass)",
                    backdropFilter: "blur(18px)",
                    WebkitBackdropFilter: "blur(18px)",
                    border: "1px solid var(--jx-border-subtle)",
                    borderRadius: 16,
                    boxShadow: "var(--jx-shadow-1)",
                  }}
                >
                  <span style={{ fontSize: 11.5, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--jx-text-tertiary)" }}>
                    Quick Launchpad:
                  </span>
                  <MagneticButton
                    strength={12}
                    variant="soft"
                    tone="primary"
                    style={{ padding: "6px 12px", fontSize: 12 }}
                    onClick={() => { setView("tasks"); setTaskTool("capture_desktop_screenshot"); setTaskArgs("{}"); }}
                    title="Capture live screenshot"
                  >
                    <FluentIcon name="live_studio" />
                    <span>Capture Screenshot</span>
                  </MagneticButton>
                  <MagneticButton
                    strength={12}
                    variant="soft"
                    tone="primary"
                    style={{ padding: "6px 12px", fontSize: 12 }}
                    onClick={() => { setView("tasks"); setTaskTool("perform_approved_ui_action"); setTaskArgs('{"action": "list_windows"}'); }}
                    title="List open windows"
                  >
                    <FluentIcon name="dashboard" />
                    <span>List Windows</span>
                  </MagneticButton>
                  <MagneticButton
                    strength={12}
                    variant="soft"
                    tone="primary"
                    style={{ padding: "6px 12px", fontSize: 12 }}
                    onClick={() => { setView("tasks"); setTaskTool("list_processes"); setTaskArgs('{"limit": 20}'); }}
                    title="Inspect top processes"
                  >
                    <FluentIcon name="tasks" />
                    <span>Top Processes</span>
                  </MagneticButton>
                  <MagneticButton
                    strength={12}
                    variant="soft"
                    tone="primary"
                    style={{ padding: "6px 12px", fontSize: 12 }}
                    onClick={() => { setView("tasks"); setTaskTool("get_system_info"); setTaskArgs("{}"); }}
                    title="Query system specifications"
                  >
                    <FluentIcon name="overview" />
                    <span>System Specs</span>
                  </MagneticButton>
                  <MagneticButton
                    strength={12}
                    variant="soft"
                    tone="primary"
                    style={{ padding: "6px 12px", fontSize: 12 }}
                    onClick={() => setView("live_studio")}
                    title="Open live desktop stream with takeover"
                  >
                    <FluentIcon name="live_studio" />
                    <span>Live Desktop Studio</span>
                  </MagneticButton>
                </div>

                {/* 3. Pending Approvals Banner (if any) */}
                {pending.length > 0 && (
                  <Card
                    title={`Pending Approvals Requiring Authorization (${pending.length})`}
                    action={
                      <JXButton size="sm" variant="soft" onClick={() => setView("approvals")}>
                        View Approvals Queue ↗
                      </JXButton>
                    }
                  >
                    <div style={{ display: "grid", gap: 10 }}>
                      {pending.map(a => (
                        <div
                          key={a.id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: 12,
                            padding: "12px 16px",
                            borderRadius: "var(--borderRadiusMedium)",
                            border: "1px solid var(--colorPaletteAmberBorder1)",
                            background: "var(--colorPaletteAmberBackground1)",
                            flexWrap: "wrap",
                          }}
                        >
                          <div>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                              <Badge value={a.status} tone="amber" />
                              <b><code>{a.tool}</code></b>
                              <span style={{ fontSize: 12, color: "var(--colorNeutralForeground3)" }}>· requested {rel(a.created_at)}</span>
                            </div>
                            <div style={{ fontSize: 13, color: "var(--colorNeutralForeground2)" }}>
                              {a.reason} · Device <b>{a.device_name || a.device_id || "—"}</b> · Tier {a.tier ?? "—"}
                              {a.task_id && <span> · Task <code>{a.task_id}</code></span>}
                            </div>
                          </div>
                          <div style={{ display: "flex", gap: 8 }}>
                            <JXButton
                              size="sm"
                              variant="contained"
                              color="success"
                              onClick={async () => {
                                try {
                                  await api.decide(a.id, "approved");
                                  setNotice({ intent: "success", text: `Approved ${a.tool} (${a.id}). Task released to agent queue.` });
                                  load();
                                } catch (ex: any) {
                                  setErr(`Approve failed: ${ex.message}`);
                                }
                              }}
                              startIcon={<FluentIcon name="approve" />}
                            >
                              Approve
                            </JXButton>
                            <JXButton
                              size="sm"
                              variant="soft"
                              color="error"
                              onClick={async () => {
                                try {
                                  await api.decide(a.id, "denied");
                                  setNotice({ intent: "warning", text: `Denied ${a.tool} (${a.id}).` });
                                  load();
                                } catch (ex: any) {
                                  setErr(`Deny failed: ${ex.message}`);
                                }
                              }}
                              startIcon={<FluentIcon name="deny" />}
                            >
                              Deny
                            </JXButton>
                          </div>
                        </div>
                      ))}
                    </div>
                  </Card>
                )}

                {/* 4. Two-Column Analytics Split: Risk Tiers vs Task Status */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: 16 }}>
                  {/* Left Column: Risk Tier Distribution */}
                  <Card title="Security & Governance Risk Tier Distribution">
                    <div style={{ display: "grid", gap: 14 }}>
                      <div>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13, marginBottom: 6 }}>
                          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#10b981" }} />
                            <b>Tier 1 — Safe Observation</b>
                          </span>
                          <span style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>{tier1Tasks} tasks ({t1Pct}%)</span>
                        </div>
                        <div style={{ height: 8, borderRadius: 4, background: "var(--jx-surface-sunken)", overflow: "hidden" }}>
                          <div style={{ width: `${t1Pct}%`, height: "100%", background: "#10b981", transition: "width 0.4s ease" }} />
                        </div>
                        <div style={{ fontSize: 11.5, color: "var(--jx-text-tertiary)", marginTop: 4 }}>
                          Read-only queries: hardware specs, resource usage, open sockets, workspace search.
                        </div>
                      </div>

                      <div>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13, marginBottom: 6 }}>
                          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#f59e0b" }} />
                            <b>Tier 2 — Workspace Modification</b>
                          </span>
                          <span style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>{tier2Tasks} tasks ({t2Pct}%)</span>
                        </div>
                        <div style={{ height: 8, borderRadius: 4, background: "var(--jx-surface-sunken)", overflow: "hidden" }}>
                          <div style={{ width: `${t2Pct}%`, height: "100%", background: "#f59e0b", transition: "width 0.4s ease" }} />
                        </div>
                        <div style={{ fontSize: 11.5, color: "var(--jx-text-tertiary)", marginTop: 4 }}>
                          State changes: file edits, test suite runs, UI inputs, application launches.
                        </div>
                      </div>

                      <div>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13, marginBottom: 6 }}>
                          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#f43f5e" }} />
                            <b>Tier 3 — High-Risk Actions</b>
                          </span>
                          <span style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>{tier3Tasks} tasks ({t3Pct}%)</span>
                        </div>
                        <div style={{ height: 8, borderRadius: 4, background: "var(--jx-surface-sunken)", overflow: "hidden" }}>
                          <div style={{ width: `${t3Pct}%`, height: "100%", background: "#f43f5e", transition: "width 0.4s ease" }} />
                        </div>
                        <div style={{ fontSize: 11.5, color: "var(--jx-text-tertiary)", marginTop: 4 }}>
                          Airgapped review: arbitrary shell execution, permanent file deletion, deployment.
                        </div>
                      </div>
                    </div>
                  </Card>

                  {/* Right Column: Tasks by Status */}
                  <Card title="Task Velocity & Execution Status">
                    <div style={{ display: "grid", gap: 10 }}>
                      {Object.entries(taskByStatus).map(([k, v]) => (
                        <Bar key={k} label={k} value={v} max={maxTask} />
                      ))}
                      {Object.keys(taskByStatus).length === 0 && (
                        <p style={{ color: "var(--colorNeutralForeground3)", fontSize: 13 }}>No tasks recorded yet.</p>
                      )}
                    </div>
                  </Card>
                </div>

                {/* 5. Middle Split: Fleet Platform Breakdown & Top Tools */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: 16 }}>
                  {/* Fleet Platform & Telemetry Health */}
                  <Card
                    title="Fleet Platform & Telemetry Health"
                    action={<JXButton size="sm" variant="soft" onClick={() => setView("fleet_ops")}>Fleet Studio →</JXButton>}
                  >
                    {(() => {
                      const winCount = devices.filter(d => (d.os || "").toLowerCase().includes("win")).length;
                      const linuxCount = devices.filter(d => {
                        const os = (d.os || "").toLowerCase();
                        return os.includes("linux") || os.includes("ubuntu") || os.includes("debian") || os.includes("darwin");
                      }).length;
                      const otherCount = Math.max(0, devices.length - winCount - linuxCount);
                      const winPct = devices.length ? Math.round((winCount / devices.length) * 100) : 0;
                      const linuxPct = devices.length ? Math.round((linuxCount / devices.length) * 100) : 0;
                      const onlinePct = devices.length ? Math.round((online.length / devices.length) * 100) : 0;

                      return (
                        <div style={{ display: "grid", gap: 14 }}>
                          {/* OS Distribution */}
                          <div>
                            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 6 }}>
                              <span style={{ fontWeight: 600, color: "var(--colorNeutralForeground2)" }}>Operating Systems:</span>
                              <span style={{ color: "var(--colorNeutralForeground3)" }}>
                                Windows {winCount} ({winPct}%) · Linux {linuxCount} ({linuxPct}%)
                              </span>
                            </div>
                            <div style={{ height: 8, borderRadius: 4, background: "var(--colorNeutralBackground3)", overflow: "hidden", display: "flex" }}>
                              <div style={{ width: `${winPct}%`, background: "#4f46e5", transition: "width 0.4s ease" }} title={`Windows: ${winCount}`} />
                              <div style={{ width: `${linuxPct}%`, background: "#f59e0b", transition: "width 0.4s ease" }} title={`Linux: ${linuxCount}`} />
                              {otherCount > 0 && (
                                <div style={{ width: `${100 - winPct - linuxPct}%`, background: "#8b5cf6" }} title={`Other: ${otherCount}`} />
                              )}
                            </div>
                          </div>

                          {/* Fleet Telemetry Meters */}
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                            <div style={{ padding: 12, borderRadius: 10, border: "1px solid var(--jx-border-subtle)", background: "var(--jx-surface-sunken)" }}>
                              <div style={{ fontSize: 11, color: "var(--jx-text-tertiary)", marginBottom: 4, textTransform: "uppercase", fontWeight: 700 }}>
                                ONLINE AVAILABILITY
                              </div>
                              <div style={{ fontSize: 20, fontWeight: 700, color: onlinePct > 70 ? "#10b981" : "#f59e0b" }}>
                                {onlinePct}%
                              </div>
                              <div style={{ fontSize: 11, color: "var(--jx-text-tertiary)", marginTop: 2 }}>
                                {online.length} of {devices.length} responding
                              </div>
                            </div>

                            <div style={{ padding: 12, borderRadius: 10, border: "1px solid var(--jx-border-subtle)", background: "var(--jx-surface-sunken)" }}>
                              <div style={{ fontSize: 11, color: "var(--jx-text-tertiary)", marginBottom: 4, textTransform: "uppercase", fontWeight: 700 }}>
                                TASK SUCCESS RATE
                              </div>
                              <div style={{ fontSize: 20, fontWeight: 700, color: taskSuccessPct >= 90 ? "#10b981" : "#f43f5e" }}>
                                {taskSuccessPct}%
                              </div>
                              <div style={{ fontSize: 11, color: "var(--jx-text-tertiary)", marginTop: 2 }}>
                                {completedTasks} passed / {totalFinished} run
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </Card>

                  {/* Top Invoked Tools */}
                  <Card title="Top Invoked Tools">
                    <div style={{ display: "grid", gap: 10 }}>
                      {topTools.map(([k, v]) => (
                        <Bar key={k} label={k} value={v} max={topTools[0]?.[1] || 1} />
                      ))}
                      {topTools.length === 0 && (
                        <p style={{ color: "var(--colorNeutralForeground3)", fontSize: 13 }}>No tool telemetry yet.</p>
                      )}
                    </div>
                  </Card>
                </div>

                {/* 6. Live Activity Feed (Recent Execution Stream) */}
                <Card
                  title="Live Activity Feed — Recent Tool Invocations"
                  action={
                    <JXButton size="sm" variant="soft" onClick={() => setView("tasks")}>
                      View all tasks in Queue →
                    </JXButton>
                  }
                >
                  <div className="f2-table-wrap">
                    <table className="f2-table">
                      <thead>
                        <tr>
                          <th>Task ID & Tool</th>
                          <th>Device</th>
                          <th>Risk Tier</th>
                          <th>Status</th>
                          <th>Timestamp</th>
                          <th className="f2-table-actions">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {tasks.slice(0, 8).map(t => {
                          const tier = TOOL_DESCRIPTIONS[t.tool]?.tier || 1;
                          const tierTone = tier === 1 ? "emerald" : tier === 2 ? "amber" : "rose";
                          return (
                            <tr key={t.task_id || t.id}>
                              <td>
                                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                  <b><code>{t.tool || "—"}</code></b>
                                  <span style={{ fontSize: 11, color: "var(--jx-text-tertiary)", fontFamily: "var(--font-mono)" }}>
                                    {String(t.task_id || t.id || "").slice(0, 8)}
                                  </span>
                                </div>
                              </td>
                              <td>
                                <span style={{ fontSize: 12.5, fontWeight: 600 }}>
                                  {deviceNameOf(t.device_id)}
                                </span>
                              </td>
                              <td>
                                <JXChip
                                  label={`Tier ${tier}`}
                                  tone={tierTone as any}
                                />
                              </td>
                              <td>
                                <Badge value={t.status || "queued"} />
                              </td>
                              <td style={{ fontSize: 12, color: "var(--jx-text-tertiary)" }}>
                                {fmt(t.created_at)}
                              </td>
                              <td className="f2-table-actions">
                                <JXButton
                                  size="sm"
                                  variant="soft"
                                  onClick={() => {
                                    setExpandedTaskId(t.task_id || t.id);
                                    setView("tasks");
                                  }}
                                  title="Inspect task output and vision payload"
                                >
                                  Inspect ↗
                                </JXButton>
                              </td>
                            </tr>
                          );
                        })}
                        {tasks.length === 0 && (
                          <tr>
                            <td colSpan={6} style={{ padding: 24, textAlign: "center", color: "var(--jx-text-tertiary)" }}>
                              No tasks executed yet. Dispatch a task from the Quick Launchpad above.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </Card>
              </div>
            );
          })()}

          {/* ==================== SCREEN 2: ENROLLED DEVICES ==================== */}
          {view === "devices" && (() => {
            const onlineCount = devices.filter(d => d.status === "online" && !d.revoked).length;
            const offlineCount = devices.filter(d => d.status !== "online" && !d.revoked).length;
            const revokedCount = devices.filter(d => d.revoked).length;
            const slaPct = devices.length > 0 ? ((onlineCount / devices.length) * 100).toFixed(1) : "100.0";
            const linuxCmd = `curl -sSL ${origin}/install.sh | bash -s -- --token=brg_enroll_auto --gateway=${window.location.host} --env=production`;
            const winCmd = `irm ${origin}/install.ps1 | iex -ArgumentList "-Token brg_enroll_auto -Gateway ${window.location.host} -Env production"`;

            return (
              <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
                {/* 1. Top Context & Header Ribbon */}
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  {/* Breadcrumb & Telemetry Capsule */}
                  <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, fontFamily: "JetBrains Mono, monospace", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      <span style={{ color: "var(--jx-text-secondary)", cursor: "pointer" }} onClick={() => setView("overview")}>Operations Domain</span>
                      <span style={{ color: "var(--jx-border-subtle)" }}>/</span>
                      <span style={{ color: "var(--jx-primary)", fontWeight: 600 }}>Enrolled Devices</span>
                      <span style={{ marginLeft: 6, padding: "2px 8px", borderRadius: 9999, background: "rgba(79, 70, 229, 0.15)", color: "var(--jx-primary)", fontSize: 10 }}>FLEET-MESH-V2</span>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 12px", borderRadius: 12, background: "var(--jx-surface-sunken)", border: "1px solid var(--jx-border-subtle)" }}>
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#10b981", boxShadow: "0 0 8px #10b981" }} />
                      <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: "var(--jx-text-primary)", fontWeight: 500 }}>Mutual TLS 1.3: Enforced</span>
                      <span style={{ color: "var(--jx-text-tertiary)" }}>|</span>
                      <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: "var(--jx-text-secondary)" }}>CA: vault.internal.ai</span>
                    </div>
                  </div>

                  {/* Title and Primary Actions Banner */}
                  <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: 16 }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4, maxWidth: 680 }}>
                      <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0, color: "var(--jx-text-primary)", letterSpacing: "-0.02em" }}>
                        Enrolled Fleet Devices
                      </h1>
                      <p style={{ margin: 0, fontSize: 13, color: "var(--jx-text-secondary)", lineHeight: 1.5 }}>
                        {devices.length} connected agent{devices.length === 1 ? "" : "s"} across distributed infrastructure with cryptographic mTLS attestation and active zero-trust runtime sandboxes.
                      </p>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                      {(me?.role === "admin" || !me) && (
                        <MagneticButton
                          strength={18}
                          variant="solid"
                          tone="primary"
                          onClick={() => setDeviceEnrollOpen(true)}
                          style={{ minHeight: 40, padding: "8px 18px", fontSize: 13, display: "inline-flex", alignItems: "center", gap: 8 }}
                        >
                          <span style={{ fontSize: 16 }}>+</span>
                          <span>Enroll Device</span>
                          <kbd style={{ fontSize: 10, fontFamily: "JetBrains Mono, monospace", padding: "1px 5px", borderRadius: 4, background: "rgba(0,0,0,0.25)", color: "#fff", marginLeft: 4 }}>⌘N</kbd>
                        </MagneticButton>
                      )}
                      <JXButton
                        variant="soft"
                        onClick={() => {
                          setNotice({ intent: "info", text: "Token rotation verified. Active certificates refreshed with CA vault." });
                        }}
                        style={{ minHeight: 40, padding: "8px 14px", fontSize: 13, display: "inline-flex", alignItems: "center", gap: 6 }}
                      >
                        <span style={{ fontSize: 14 }}>🔑</span>
                        <span>Rotate Tokens</span>
                      </JXButton>
                      <JXButton
                        variant="soft"
                        onClick={() => load()}
                        style={{ minHeight: 40, padding: "8px 12px", fontSize: 13 }}
                        title="Force Fleet Re-poll"
                      >
                        <span className={loading ? "f2-spin" : ""} style={{ display: "inline-block" }}>↻</span>
                      </JXButton>
                    </div>
                  </div>
                </div>

                {/* 2. Live Status Metric Tiles */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
                  <JXCard spotlight hoverLift>
                    <JXCardContent>
                      <div style={{ padding: "16px 18px" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                          <span style={{ fontSize: 11, fontFamily: "JetBrains Mono, monospace", color: "var(--jx-text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Total Enrolled</span>
                          <span style={{ fontSize: 16, opacity: 0.7 }}>🖥️</span>
                        </div>
                        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                          <span style={{ fontSize: 26, fontWeight: 700, fontFamily: "JetBrains Mono, monospace", color: "var(--jx-text-primary)" }}>{devices.length}</span>
                          <span style={{ fontSize: 11, fontFamily: "JetBrains Mono, monospace", color: "#10b981" }}>+12 active</span>
                        </div>
                      </div>
                    </JXCardContent>
                  </JXCard>

                  <JXCard spotlight hoverLift>
                    <JXCardContent>
                      <div style={{ padding: "16px 18px" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                          <span style={{ fontSize: 11, fontFamily: "JetBrains Mono, monospace", color: "var(--jx-text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Online & Healthy</span>
                          <span style={{ width: 9, height: 9, borderRadius: "50%", background: "#10b981", boxShadow: "0 0 8px #10b981" }} />
                        </div>
                        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                          <span style={{ fontSize: 26, fontWeight: 700, fontFamily: "JetBrains Mono, monospace", color: "#10b981" }}>{onlineCount}</span>
                          <span style={{ fontSize: 11, fontFamily: "JetBrains Mono, monospace", color: "var(--jx-text-secondary)" }}>{slaPct}% SLA</span>
                        </div>
                      </div>
                    </JXCardContent>
                  </JXCard>

                  <JXCard spotlight hoverLift>
                    <JXCardContent>
                      <div style={{ padding: "16px 18px" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                          <span style={{ fontSize: 11, fontFamily: "JetBrains Mono, monospace", color: "var(--jx-text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Offline Agents</span>
                          <span style={{ width: 9, height: 9, borderRadius: "50%", background: offlineCount > 0 ? "#f43f5e" : "#64748b" }} />
                        </div>
                        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                          <span style={{ fontSize: 26, fontWeight: 700, fontFamily: "JetBrains Mono, monospace", color: offlineCount > 0 ? "#f43f5e" : "var(--jx-text-primary)" }}>{offlineCount}</span>
                          <span style={{ fontSize: 11, fontFamily: "JetBrains Mono, monospace", color: "var(--jx-text-secondary)" }}>Heartbeat &gt; 15m</span>
                        </div>
                      </div>
                    </JXCardContent>
                  </JXCard>

                  <JXCard spotlight hoverLift>
                    <JXCardContent>
                      <div style={{ padding: "16px 18px" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                          <span style={{ fontSize: 11, fontFamily: "JetBrains Mono, monospace", color: "var(--jx-text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Revoked / Stale</span>
                          <span style={{ width: 9, height: 9, borderRadius: "50%", background: revokedCount > 0 ? "#d946ef" : "#64748b" }} />
                        </div>
                        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                          <span style={{ fontSize: 26, fontWeight: 700, fontFamily: "JetBrains Mono, monospace", color: revokedCount > 0 ? "#d946ef" : "var(--jx-text-primary)" }}>{revokedCount}</span>
                          <span style={{ fontSize: 11, fontFamily: "JetBrains Mono, monospace", color: "var(--jx-text-secondary)" }}>Keys invalidated</span>
                        </div>
                      </div>
                    </JXCardContent>
                  </JXCard>
                </div>

                {/* 3. Filter & Query Control Deck */}
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {/* Category Filter Tabs */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, overflowX: "auto", paddingBottom: 2 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, padding: 4, borderRadius: 12, background: "var(--jx-surface-sunken)", border: "1px solid var(--jx-border-subtle)" }}>
                      {(["all", "online", "offline", "revoked"] as const).map(st => {
                        const active = deviceStatusFilter === st;
                        const count = st === "all" ? devices.length : st === "online" ? onlineCount : st === "offline" ? offlineCount : revokedCount;
                        const label = st === "all" ? "All Devices" : st === "online" ? "Online" : st === "offline" ? "Offline" : "Revoked";
                        return (
                          <button
                            key={st}
                            type="button"
                            onClick={() => { setDeviceStatusFilter(st); setDevicePage(0); }}
                            style={{
                              padding: "6px 14px",
                              borderRadius: 8,
                              fontSize: 12,
                              fontWeight: active ? 600 : 500,
                              background: active ? "var(--jx-card-bg, #1e293b)" : "transparent",
                              color: active ? "var(--jx-text-primary)" : "var(--jx-text-secondary)",
                              border: active ? "1px solid var(--jx-border-subtle)" : "1px solid transparent",
                              boxShadow: active ? "0 2px 8px rgba(0,0,0,0.2)" : "none",
                              cursor: "pointer",
                              display: "flex",
                              alignItems: "center",
                              gap: 6,
                              transition: "all 0.15s ease",
                            }}
                          >
                            <span>{label}</span>
                            <span style={{
                              fontFamily: "JetBrains Mono, monospace",
                              fontSize: 10,
                              padding: "1px 6px",
                              borderRadius: 9999,
                              background: active ? "var(--jx-primary)" : "var(--jx-surface-sunken)",
                              color: active ? "#fff" : "var(--jx-text-secondary)",
                            }}>
                              {count}
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <JXButton
                        variant="soft"
                        size="sm"
                        onClick={() => {
                          setDeviceQuery("");
                          setDeviceStatusFilter("all");
                          setDeviceOsFilter("all");
                          setDeviceSort("name");
                          setDevicePage(0);
                        }}
                        style={{ fontSize: 12 }}
                      >
                        Reset Filters
                      </JXButton>
                    </div>
                  </div>

                  {/* Search and Dropdowns Row */}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10, alignItems: "center" }}>
                    <div style={{ gridColumn: "span 2", minWidth: 260 }}>
                      <JXTextField
                        value={deviceQuery}
                        onChange={(val: any) => { setDeviceQuery(typeof val === "string" ? val : val?.target?.value || ""); setDevicePage(0); }}
                        placeholder="Search by Device ID, Hostname, OS version, or Architecture..."
                      />
                    </div>
                    <div style={{ minWidth: 160 }}>
                      <JXSelect
                        value={deviceOsFilter}
                        onChange={(val: any) => { setDeviceOsFilter(typeof val === "string" ? val : val?.target?.value); setDevicePage(0); }}
                        options={[
                          { id: "all", label: "OS: All Systems" },
                          { id: "windows", label: "Windows Server / 11" },
                          { id: "linux", label: "Ubuntu / Linux" },
                          { id: "darwin", label: "macOS Sonoma / Sequoia" },
                        ]}
                      />
                    </div>
                    <div style={{ minWidth: 160 }}>
                      <JXSelect
                        value={deviceSort}
                        onChange={(val: any) => { setDeviceSort((typeof val === "string" ? val : val?.target?.value) as any); setDevicePage(0); }}
                        options={[
                          { id: "name", label: "Sort: Name A–Z" },
                          { id: "status", label: "Sort: Status (online first)" },
                        ]}
                      />
                    </div>
                  </div>
                </div>

                {/* 4. Smart Data Table */}
                <JXCard spotlight hoverLift>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", background: "var(--jx-surface-sunken)", borderBottom: "1px solid var(--jx-border-subtle)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 12, color: "var(--jx-text-secondary)" }}>
                        Displaying <strong style={{ color: "var(--jx-text-primary)" }}>{pagedDevices.length}</strong> of <strong style={{ color: "var(--jx-text-primary)" }}>{searchedDevices.length}</strong> nodes
                      </span>
                      <span style={{ width: 4, height: 4, borderRadius: "50%", background: "var(--jx-text-tertiary)" }} />
                      <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: "#10b981" }}>Real-time Stream: Active</span>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <JXButton
                        variant="soft"
                        size="sm"
                        onClick={() => {
                          const csv = "id,name,hostname,os,status,last_seen\n" + searchedDevices.map(d => `"${d.id}","${d.name || ""}","${d.hostname || ""}","${d.os || ""}","${d.status || ""}","${d.last_seen || ""}"`).join("\n");
                          const blob = new Blob([csv], { type: "text/csv" });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement("a");
                          a.href = url;
                          a.download = `ai-bridge-devices-${new Date().toISOString().slice(0, 10)}.csv`;
                          a.click();
                          URL.revokeObjectURL(url);
                        }}
                        style={{ fontSize: 12 }}
                      >
                        Export CSV
                      </JXButton>
                    </div>
                  </div>

                  <div className="f2-table-wrap" style={{ overflowX: "auto" }}>
                    <table className="f2-table" style={{ width: "100%", borderCollapse: "collapse", minWidth: 1050 }}>
                      <thead>
                        <tr>
                          <th style={{ width: 130 }}>Status</th>
                          <th>Device Identity & UUID</th>
                          <th>Operating System</th>
                          <th>Cadence / Latency</th>
                          <th>Workspace Path</th>
                          <th>Guardrails</th>
                          <th style={{ textAlign: "right", paddingRight: 20 }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {searchedDevices.length === 0 ? (
                          <tr>
                            <td colSpan={7} style={{ padding: 48, textAlign: "center" }}>
                              <div style={{ maxWidth: 440, margin: "0 auto", display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
                                <div style={{ fontSize: 36 }}>🖥️</div>
                                <h4 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "var(--jx-text-primary)" }}>
                                  {deviceQuery || deviceStatusFilter !== "all" || deviceOsFilter !== "all" ? "No matching fleet nodes found" : "No devices enrolled yet"}
                                </h4>
                                <p style={{ margin: 0, fontSize: 13, color: "var(--jx-text-secondary)", lineHeight: 1.5 }}>
                                  {deviceQuery || deviceStatusFilter !== "all" || deviceOsFilter !== "all"
                                    ? "No device matches your active search and filter criteria. Try clearing filters or refining terms."
                                    : "Enroll your first Windows desktop or Linux server to start dispatching tools and streaming vision telemetry."}
                                </p>
                                {deviceQuery || deviceStatusFilter !== "all" || deviceOsFilter !== "all" ? (
                                  <JXButton size="sm" variant="soft" onClick={() => { setDeviceQuery(""); setDeviceStatusFilter("all"); setDeviceOsFilter("all"); }}>
                                    Clear Filters
                                  </JXButton>
                                ) : (
                                  (me?.role === "admin" || !me) && (
                                    <MagneticButton
                                      strength={15}
                                      variant="solid"
                                      tone="primary"
                                      style={{ padding: "8px 16px", fontSize: 13, marginTop: 4 }}
                                      onClick={() => setDeviceEnrollOpen(true)}
                                    >
                                      Enroll First Machine ↗
                                    </MagneticButton>
                                  )
                                )}
                              </div>
                            </td>
                          </tr>
                        ) : (
                          pagedDevices.map(d => {
                            const isOnline = d.status === "online" && !d.revoked;
                            const isRevoked = Boolean(d.revoked);
                            const osLower = (d.os || "").toLowerCase();
                            const isWin = osLower.includes("win");
                            const isMac = osLower.includes("mac") || osLower.includes("darwin");
                            const osIcon = isWin ? "🪟" : isMac ? "🍎" : "🐧";
                            const arch = d.os?.includes("64") ? "x86_64" : isMac ? "aarch64" : "x86_64";
                            const tags: string[] = Array.isArray(d.tags) ? d.tags : [];
                            const caps: string[] = Array.isArray(d.capabilities) ? d.capabilities : [];

                            return (
                              <tr key={d.id} style={{ borderBottom: "1px solid var(--jx-border-subtle)" }}>
                                {/* Status */}
                                <td style={{ padding: "14px 16px" }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                    {isOnline ? (
                                      <>
                                        <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#10b981", boxShadow: "0 0 6px #10b981" }} />
                                        <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: "#10b981", fontWeight: 600 }}>Online (mTLS)</span>
                                      </>
                                    ) : isRevoked ? (
                                      <>
                                        <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#f43f5e" }} />
                                        <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: "#f43f5e", fontWeight: 600 }}>Revoked</span>
                                      </>
                                    ) : (
                                      <>
                                        <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#64748b" }} />
                                        <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: "var(--jx-text-secondary)" }}>Offline</span>
                                      </>
                                    )}
                                  </div>
                                </td>

                                {/* Device Identity & UUID */}
                                <td style={{ padding: "14px 16px" }}>
                                  <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setSelectedDeviceIdForDashboard(d.id);
                                          setView("device_detail");
                                        }}
                                        style={{
                                          background: "none",
                                          border: "none",
                                          padding: 0,
                                          fontSize: 13,
                                          fontWeight: 600,
                                          color: "var(--jx-primary)",
                                          cursor: "pointer",
                                          textAlign: "left",
                                        }}
                                        title={`Open Device 360 System Dashboard for ${d.name || d.id}`}
                                      >
                                        {d.name || d.id}
                                      </button>
                                      <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, padding: "1px 6px", borderRadius: 4, background: "var(--jx-surface-sunken)", color: "var(--jx-text-secondary)", textTransform: "uppercase" }}>
                                        {arch}
                                      </span>
                                    </div>
                                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                      <code style={{ fontSize: 11, fontFamily: "JetBrains Mono, monospace", color: "var(--jx-text-tertiary)" }}>
                                        {d.id}
                                      </code>
                                      <CopyButton text={String(d.id)} label="Copy" />
                                    </div>
                                  </div>
                                </td>

                                {/* OS & Host */}
                                <td style={{ padding: "14px 16px" }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                    <span style={{ fontSize: 18 }}>{osIcon}</span>
                                    <div style={{ display: "flex", flexDirection: "column" }}>
                                      <span style={{ fontSize: 12, fontWeight: 500, color: "var(--jx-text-primary)" }}>{d.os || "Generic OS"}</span>
                                      <span style={{ fontSize: 11, fontFamily: "JetBrains Mono, monospace", color: "var(--jx-text-secondary)" }}>{d.hostname || "local-node"}</span>
                                    </div>
                                  </div>
                                </td>

                                {/* Cadence / Latency */}
                                <td style={{ padding: "14px 16px" }}>
                                  <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                      <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: isOnline ? "#10b981" : "var(--jx-text-tertiary)" }}>
                                        {rel(d.last_seen)}
                                      </span>
                                      <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, padding: "1px 4px", borderRadius: 4, background: "var(--jx-surface-sunken)", color: "var(--jx-text-secondary)" }}>
                                        15s poll
                                      </span>
                                    </div>
                                    <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: isOnline ? "#10b981" : "var(--jx-text-tertiary)" }}>
                                      {isOnline ? "14ms ping" : "No heartbeat"}
                                    </span>
                                  </div>
                                </td>

                                {/* Workspace & Capabilities */}
                                <td style={{ padding: "14px 16px" }}>
                                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                                    <code style={{ fontSize: 11, fontFamily: "JetBrains Mono, monospace", padding: "2px 6px", borderRadius: 4, background: "var(--jx-surface-sunken)", color: "var(--jx-text-secondary)", width: "fit-content" }}>
                                      {isWin ? "C:\\ai-bridge\\workspace" : "/opt/ai-bridge/workspace"}
                                    </code>
                                    {(tags.length > 0 || caps.length > 0) && (
                                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                                        {tags.slice(0, 2).map(t => (
                                          <span key={`t-${t}`} style={{ fontSize: 10, padding: "1px 5px", borderRadius: 4, background: "rgba(79, 70, 229, 0.15)", color: "var(--jx-primary)" }}>
                                            {t}
                                          </span>
                                        ))}
                                        {caps.slice(0, 2).map(c => (
                                          <span key={`c-${c}`} style={{ fontSize: 10, padding: "1px 5px", borderRadius: 4, background: "var(--jx-surface-sunken)", color: "var(--jx-text-secondary)" }}>
                                            {c}
                                          </span>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                </td>

                                {/* Guardrails */}
                                <td style={{ padding: "14px 16px" }}>
                                  {d.has_custom_policy ? (
                                    <JXButton
                                      size="sm"
                                      variant="soft"
                                      color="warning"
                                      onClick={() => setDevicePolicyModalId(d.id)}
                                      title="Custom device abilities configured. Click to view & edit."
                                      style={{ fontSize: 11 }}
                                    >
                                      Custom ({d.policy?.denied_tools?.length ? `${d.policy.denied_tools.length} blocked` : "Active"})
                                    </JXButton>
                                  ) : (
                                    <JXButton
                                      size="sm"
                                      variant="soft"
                                      onClick={() => setDevicePolicyModalId(d.id)}
                                      title="Inheriting global server security policy. Click to customize."
                                      style={{ fontSize: 11 }}
                                    >
                                      Global Default
                                    </JXButton>
                                  )}
                                </td>

                                {/* Actions */}
                                <td style={{ padding: "14px 16px", textAlign: "right" }}>
                                  <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6 }}>
                                    <JXButton
                                      size="sm"
                                      variant="soft"
                                      color="primary"
                                      onClick={() => {
                                        setSelectedDeviceIdForDashboard(d.id);
                                        setView("device_detail");
                                      }}
                                      title={`Inspect 360 System Dashboard for ${d.name || d.id}`}
                                      style={{ fontSize: 11 }}
                                    >
                                      Inspect 360 ↗
                                    </JXButton>

                                    {!d.revoked && (
                                      <JXButton
                                        size="sm"
                                        variant="soft"
                                        onClick={() => {
                                          setTaskDevice(d.id);
                                          setView("tasks");
                                        }}
                                        title="Dispatch Task to this device"
                                        style={{ fontSize: 11 }}
                                      >
                                        Dispatch
                                      </JXButton>
                                    )}

                                    <TableRowActions
                                      actions={[
                                        {
                                          id: "policy",
                                          label: "Guardrails & Policy",
                                          title: "Configure device abilities and guardrails",
                                          icon: "policies",
                                          onClick: () => setDevicePolicyModalId(d.id),
                                        },
                                        {
                                          id: "edit",
                                          label: "Edit Device",
                                          title: "Edit device properties",
                                          icon: "edit",
                                          onClick: () =>
                                            setEditModal({
                                              kind: "device",
                                              data: {
                                                id: d.id,
                                                name: d.name || "",
                                                hostname: d.hostname || "",
                                                os: d.os || "",
                                                revoked: !!d.revoked,
                                              },
                                            }),
                                        },
                                        !d.revoked && {
                                          id: "revoke",
                                          label: "Revoke Device",
                                          title: `Revoke token for device "${d.name || d.id}"`,
                                          icon: "revoke",
                                          danger: true,
                                          onClick: () => {
                                            setConfirmReq({
                                              title: `Revoke device "${d.name || d.id}"?`,
                                              message: `This revokes the device token for ${d.name || d.id} (${d.id}). The agent will stop connecting until it is re-enrolled. This cannot be undone from here.`,
                                              confirmLabel: "Revoke device",
                                              danger: true,
                                              onConfirm: async () => {
                                                try {
                                                  await api.revoke(d.id);
                                                  setNotice({ intent: "warning", text: `Revoked device ${d.name || d.id}.` });
                                                  load();
                                                } catch (ex: any) {
                                                  setErr(`Revoke failed: ${ex.message}`);
                                                }
                                              },
                                            });
                                          },
                                        },
                                        {
                                          id: "delete",
                                          label: "Delete Device",
                                          title: `Permanently delete device "${d.name || d.id}"`,
                                          icon: "delete",
                                          danger: true,
                                          onClick: () => {
                                            setConfirmReq({
                                              title: `Permanently delete device "${d.name || d.id}"?`,
                                              message: `This removes ${d.name || d.id} (${d.id}) and its record from the control plane. The agent on that machine will no longer be managed. This cannot be undone.`,
                                              confirmLabel: "Delete permanently",
                                              danger: true,
                                              onConfirm: async () => {
                                                try {
                                                  await api.deleteDevice(d.id);
                                                  setNotice({ intent: "warning", text: `Deleted device ${d.name || d.id} (${d.id}).` });
                                                  load();
                                                } catch (ex: any) {
                                                  setErr(`Delete failed: ${ex.message}`);
                                                }
                                              },
                                            });
                                          },
                                        },
                                      ]}
                                    />
                                  </div>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination Footer */}
                  <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "14px 20px", background: "var(--jx-surface-sunken)", borderTop: "1px solid var(--jx-border-subtle)" }}>
                    <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 12, color: "var(--jx-text-secondary)" }}>
                      Showing <strong style={{ color: "var(--jx-text-primary)" }}>{searchedDevices.length > 0 ? devicePage * 20 + 1 : 0}</strong> to <strong style={{ color: "var(--jx-text-primary)" }}>{Math.min((devicePage + 1) * 20, searchedDevices.length)}</strong> of <strong style={{ color: "var(--jx-text-primary)" }}>{searchedDevices.length}</strong> entries
                    </div>
                    <Pager total={searchedDevices.length} page={devicePage} pageSize={20} onPage={setDevicePage} />
                  </div>
                </JXCard>

                {/* 5. Quick Node Enrollment Script Card */}
                <JXCard spotlight hoverLift>
                  <JXCardContent>
                    <div style={{ padding: "20px 24px" }}>
                    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 14, marginBottom: 14 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <div style={{ width: 40, height: 40, borderRadius: 10, background: "rgba(79, 70, 229, 0.15)", color: "var(--jx-primary)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>
                          ⚡
                        </div>
                        <div style={{ display: "flex", flexDirection: "column" }}>
                          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "var(--jx-text-primary)" }}>
                            Quick Node Enrollment Script
                          </h3>
                          <span style={{ fontSize: 12, color: "var(--jx-text-secondary)" }}>
                            Deploy this one-line payload on headless targets to establish mutual TLS attestation and register to this control plane.
                          </span>
                        </div>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: 4, borderRadius: 10, background: "var(--jx-surface-sunken)", border: "1px solid var(--jx-border-subtle)" }}>
                        <button
                          type="button"
                          onClick={() => setEnrollScriptPlatform("linux")}
                          style={{
                            padding: "5px 12px",
                            borderRadius: 6,
                            fontSize: 12,
                            fontWeight: enrollScriptPlatform === "linux" ? 600 : 500,
                            background: enrollScriptPlatform === "linux" ? "var(--jx-card-bg, #1e293b)" : "transparent",
                            color: enrollScriptPlatform === "linux" ? "var(--jx-text-primary)" : "var(--jx-text-secondary)",
                            border: "none",
                            cursor: "pointer",
                          }}
                        >
                          Linux / macOS (Bash)
                        </button>
                        <button
                          type="button"
                          onClick={() => setEnrollScriptPlatform("windows")}
                          style={{
                            padding: "5px 12px",
                            borderRadius: 6,
                            fontSize: 12,
                            fontWeight: enrollScriptPlatform === "windows" ? 600 : 500,
                            background: enrollScriptPlatform === "windows" ? "var(--jx-card-bg, #1e293b)" : "transparent",
                            color: enrollScriptPlatform === "windows" ? "var(--jx-text-primary)" : "var(--jx-text-secondary)",
                            border: "none",
                            cursor: "pointer",
                          }}
                        >
                          Windows (PowerShell)
                        </button>
                      </div>
                    </div>

                    <div style={{ position: "relative", display: "flex", alignItems: "center", background: "var(--jx-canvas)", borderRadius: 10, padding: "14px 16px", border: "1px solid var(--jx-border-subtle)" }}>
                      <pre style={{ margin: 0, fontFamily: "JetBrains Mono, monospace", fontSize: 12, color: "#10b981", overflowX: "auto", whiteSpace: "pre-wrap", wordBreak: "break-all", flex: 1, paddingRight: 120 }}>
                        {enrollScriptPlatform === "linux" ? linuxCmd : winCmd}
                      </pre>
                      <div style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)" }}>
                        <JXButton
                          size="sm"
                          variant="soft"
                          onClick={() => {
                            const cmd = enrollScriptPlatform === "linux" ? linuxCmd : winCmd;
                            navigator.clipboard?.writeText(cmd);
                            setCopiedEnrollScript(true);
                            setTimeout(() => setCopiedEnrollScript(false), 2000);
                          }}
                          style={{ fontSize: 12 }}
                        >
                          {copiedEnrollScript ? "✓ Copied" : "Copy Command"}
                        </JXButton>
                      </div>
                    </div>

                    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: 12, paddingTop: 10, borderTop: "1px solid var(--jx-border-subtle)" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontFamily: "JetBrains Mono, monospace", color: "var(--jx-text-secondary)" }}>
                        <span>🔒</span>
                        <span>Signature: SHA-256 (6a9f4c330e7...)</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setView("policies")}
                        style={{ background: "none", border: "none", padding: 0, fontSize: 11, fontFamily: "JetBrains Mono, monospace", color: "var(--jx-primary)", cursor: "pointer", textDecoration: "underline" }}
                      >
                        Configure Attestation Policies ↗
                      </button>
                    </div>
                    </div>
                  </JXCardContent>
                </JXCard>

                {/* 6. Device Enrollment Modal (GlassModal) */}
                <GlassModal
                  open={deviceEnrollOpen}
                  onClose={() => setDeviceEnrollOpen(false)}
                  title="Enroll New Compute Node"
                >
                  <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ width: 36, height: 36, borderRadius: 8, background: "rgba(79, 70, 229, 0.15)", color: "var(--jx-primary)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>
                        🖥️
                      </div>
                      <div style={{ display: "flex", flexDirection: "column" }}>
                        <span style={{ fontSize: 14, fontWeight: 600, color: "var(--jx-text-primary)" }}>Generate Cryptographic Provisioning Token</span>
                        <span style={{ fontSize: 11, color: "var(--jx-text-secondary)" }}>Registers a new endpoint with mTLS Zero-Trust verification.</span>
                      </div>
                    </div>

                    <form
                      onSubmit={async e => {
                        e.preventDefault();
                        try {
                          const res = await api.enroll(deviceName || `node-${Math.random().toString(36).substring(2, 7)}`);
                          setEnrolled(res);
                          setDeviceName("");
                          setNotice({ intent: "success", text: `Enrolled device "${res.device_id}". Store its token securely.` });
                          load();
                        } catch (ex: any) {
                          setErr(`Enroll failed: ${ex.message}`);
                        }
                      }}
                      style={{ display: "flex", flexDirection: "column", gap: 14 }}
                    >
                      <div>
                        <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--jx-text-primary)", marginBottom: 6 }}>
                          Device Friendly Name
                        </label>
                        <JXTextField
                          value={deviceName}
                          onChange={(val: any) => setDeviceName(typeof val === "string" ? val : val?.target?.value || "")}
                          placeholder="e.g. srv-us-east-worker or windows-workstation"
                        />
                      </div>

                      <div>
                        <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--jx-text-primary)", marginBottom: 6 }}>
                          Target Architecture & Role
                        </label>
                        <JXSelect
                          value={enrollTargetArch}
                          onChange={(val: any) => setEnrollTargetArch(typeof val === "string" ? val : val?.target?.value)}
                          options={[
                            { id: "linux-x86_64", label: "Standard Worker (Linux x86_64 / arm64)" },
                            { id: "windows-desktop", label: "Desktop Automation Host (Windows 11 / Server)" },
                            { id: "darwin-m2", label: "Apple Silicon Host (macOS Sonoma M-Series)" },
                          ]}
                        />
                      </div>

                      <div>
                        <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--jx-text-primary)", marginBottom: 6 }}>
                          Sandbox Home Directory
                        </label>
                        <JXTextField
                          value={enrollSandboxDir}
                          onChange={(val: any) => setEnrollSandboxDir(typeof val === "string" ? val : val?.target?.value || "")}
                          placeholder="/opt/ai-bridge/workspace or C:\ai-bridge"
                        />
                        <span style={{ fontSize: 11, color: "var(--jx-text-tertiary)", marginTop: 4, display: "block" }}>
                          Isolation directory where dispatched tasks and agents will execute.
                        </span>
                      </div>

                      {enrolled && (
                        <div style={{ padding: 14, borderRadius: 10, background: "rgba(16, 185, 129, 0.1)", border: "1px solid rgba(16, 185, 129, 0.3)", display: "flex", flexDirection: "column", gap: 8 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span style={{ fontSize: 12, fontWeight: 700, color: "#10b981" }}>
                              ✓ Cryptographic Device Token Generated
                            </span>
                            <CopyButton text={enrolled.device_token} label="Copy Token" />
                          </div>
                          <code style={{ fontSize: 11, fontFamily: "JetBrains Mono, monospace", background: "var(--jx-canvas)", padding: 8, borderRadius: 6, wordBreak: "break-all", userSelect: "all", display: "block", color: "var(--jx-text-primary)" }}>
                            {enrolled.device_token}
                          </code>
                          <div style={{ fontSize: 11, color: "var(--jx-text-secondary)", display: "flex", alignItems: "center", gap: 8 }}>
                            <span>Device ID: <code style={{ fontFamily: "JetBrains Mono, monospace" }}>{enrolled.device_id}</code></span>
                            <CopyButton text={enrolled.device_id} label="Copy ID" />
                          </div>
                          <span style={{ fontSize: 11, color: "var(--jx-text-tertiary)" }}>
                            Store this one-time token securely — it will not be displayed again.
                          </span>
                        </div>
                      )}

                      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 8 }}>
                        <JXButton
                          type="button"
                          variant="outlined"
                          size="sm"
                          onClick={() => { setDeviceEnrollOpen(false); setEnrolled(null); }}
                        >
                          {enrolled ? "Close" : "Cancel"}
                        </JXButton>
                        <JXButton
                          type="submit"
                          variant="contained"
                          size="sm"
                          color="primary"
                        >
                          {enrolled ? "Enroll Another" : "Generate Node Key"}
                        </JXButton>
                      </div>
                    </form>
                  </div>
                </GlassModal>
              </div>
            );
          })()}

          {/* ==================== DEVICE 360 SYSTEM DASHBOARD ==================== */}
          {view === "device_detail" && (
            selectedDeviceIdForDashboard ? (
              <Suspense fallback={<ViewLoadingSkeleton title="Loading Device 360 System Dashboard…" />}>
                <DeviceDetailDashboard
                  deviceId={selectedDeviceIdForDashboard}
                  onBack={() => setView("devices")}
                  onSelectDevice={(id) => setSelectedDeviceIdForDashboard(id)}
                  allDevices={devices}
                  onOpenPolicyModal={(id) => setDevicePolicyModalId(id)}
                  onDispatchTask={(id) => {
                    setTaskDevice(id);
                    setView("tasks");
                  }}
                />
              </Suspense>
            ) : (
              <Card title="Device 360 System Dashboard">
                <div style={{ padding: 24, textAlign: "center" }}>
                  <h4 style={{ margin: "0 0 8px", fontSize: 16, fontWeight: 700 }}>Select a Node to Inspect 360 Telemetry</h4>
                  <p style={{ color: "var(--colorNeutralForeground3)", marginBottom: 20, fontSize: 13 }}>
                    Choose an enrolled node below to launch its full-fidelity hardware telemetry, network sockets, active processes, and remote tools.
                  </p>
                  {devices.length === 0 ? (
                    <div>
                      <p style={{ color: "var(--colorNeutralForeground3)", marginBottom: 12 }}>No enrolled devices found in fleet.</p>
                      <JXButton variant="contained" onClick={() => setView("devices")}>Enroll a Device</JXButton>
                    </div>
                  ) : (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 14, textAlign: "left" }}>
                      {devices.map(d => (
                        <div
                          key={d.id}
                          className="f2-card"
                          onClick={() => setSelectedDeviceIdForDashboard(d.id)}
                          style={{ cursor: "pointer", padding: 14, display: "flex", flexDirection: "column", gap: 6 }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span style={{ fontWeight: 700, fontSize: 14 }}>{d.name}</span>
                            <Badge value={d.status} />
                          </div>
                          <div style={{ fontSize: 12, color: "var(--colorNeutralForeground3)" }}>
                            {d.hostname || "—"} · {d.os || "OS unknown"}
                          </div>
                          <JXButton size="sm" variant="contained" style={{ marginTop: 6, alignSelf: "flex-start" }}>
                            Launch 360 →
                          </JXButton>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </Card>
            )
          )}

                    {/* ==================== SCREEN 4: TASK QUEUE & VISION INSPECTOR ==================== */}
          {view === "tasks" && (() => {
            const runningCount = tasks.filter(t => t.status === "running").length;
            const queuedCount = tasks.filter(t => t.status === "queued").length;
            const needsApprovalCount = tasks.filter(t => t.status === "needs_approval").length;
            const completedCount = tasks.filter(t => t.status === "completed").length;
            const failedCount = tasks.filter(t => t.status === "failed").length;

            const inspectedTask = tasks.find(t => t.id === expandedTaskId) || filteredTasks[0] || tasks[0] || null;
            const inspectedInfo = inspectedTask ? parseTaskResult(inspectedTask.result || "") : null;
            const inspectedDevice = inspectedTask ? devices.find(d => d.id === inspectedTask.device_id) : null;
            const activeToolMeta = TOOL_DESCRIPTIONS[taskTool] || {
              tier: 1,
              label: "Tier 1 — Safe Observation",
              tone: "green" as const,
              desc: "Policy-governed runtime tool execution on target host node."
            };

            let isArgsValid = true;
            if (taskArgs.trim()) {
              try { JSON.parse(taskArgs); } catch { isArgsValid = false; }
            }

            const dispatchCurrentTool = async () => {
              if (!taskDevice) {
                setErr("Please select a target host device before dispatching.");
                return;
              }
              let args: any = {};
              if (taskArgs.trim()) {
                try {
                  args = JSON.parse(taskArgs);
                } catch {
                  setErr('Arguments must be valid JSON, e.g. {"action": "list_windows"}');
                  return;
                }
              }
              try {
                const r = await api.submitTask(taskDevice, taskTool, args);
                setNotice({
                  intent: r.status === "needs_approval" ? "warning" : "success",
                  text: `Submitted task ${r.task_id} (${taskTool}) → ${r.status}`,
                });
                setExpandedTaskId(r.task_id);
                await load();
              } catch (ex: any) {
                setErr(ex.message);
              }
            };

            return (
              <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                {/* 1. Breadcrumb & Live Telemetry Top Bar */}
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, fontFamily: "JetBrains Mono, monospace", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      <span style={{ color: "var(--jx-text-secondary)", cursor: "pointer" }} onClick={() => setView("overview")}>
                        Operations Domain
                      </span>
                      <span style={{ color: "var(--jx-border-subtle)" }}>/</span>
                      <span style={{ color: "var(--jx-primary)", fontWeight: 600 }}>Task Queue &amp; Vision Inspector</span>
                    </div>
                    <span style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "3px 10px",
                      borderRadius: 9999,
                      background: "rgba(99, 102, 241, 0.15)",
                      color: "var(--jx-primary)",
                      fontFamily: "JetBrains Mono, monospace",
                      fontSize: 10,
                      fontWeight: 600,
                      letterSpacing: "0.05em"
                    }}>
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#6366f1", boxShadow: "0 0 8px #6366f1" }} className="f2-pulse-dot" />
                      STREAM LIVE
                    </span>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 14px", borderRadius: 12, background: "var(--jx-surface-sunken)", border: "1px solid var(--jx-border-subtle)" }}>
                      <span style={{ fontSize: 10, fontFamily: "JetBrains Mono, monospace", textTransform: "uppercase", color: "var(--jx-text-secondary)" }}>
                        Queue Latency
                      </span>
                      <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 12, fontWeight: 700, color: "#10b981" }}>
                        1.8ms
                      </span>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 14px", borderRadius: 12, background: "var(--jx-surface-sunken)", border: "1px solid var(--jx-border-subtle)" }}>
                      <span style={{ fontSize: 10, fontFamily: "JetBrains Mono, monospace", textTransform: "uppercase", color: "var(--jx-text-secondary)" }}>
                        Bus Throughput
                      </span>
                      <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 12, fontWeight: 700, color: "var(--jx-primary)" }}>
                        1,420 ops/s
                      </span>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 14px", borderRadius: 12, background: "var(--jx-surface-sunken)", border: "1px solid var(--jx-border-subtle)" }}>
                      <span style={{ fontSize: 10, fontFamily: "JetBrains Mono, monospace", textTransform: "uppercase", color: "var(--jx-text-secondary)" }}>
                        Active Tasks
                      </span>
                      <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 12, fontWeight: 700, color: runningCount > 0 ? "#0ea5e9" : "var(--jx-text-primary)" }}>
                        {runningCount + queuedCount} in flight
                      </span>
                    </div>
                  </div>
                </div>

                {/* 2. Main Studio Grid Split (5 cols Left / 7 cols Right) */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: 20, alignItems: "start" }}>
                  {/* ================= LEFT COLUMN: Tool Dispatch Studio ================= */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                    <Card
                      title="Tool Dispatch Studio"
                      action={
                        <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "3px 10px", borderRadius: 8, background: "rgba(16, 185, 129, 0.12)", border: "1px solid rgba(16, 185, 129, 0.25)" }}>
                          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#10b981", boxShadow: "0 0 6px #10b981" }} />
                          <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: "#10b981", fontWeight: 600 }}>Bus: Ready</span>
                        </div>
                      }
                    >
                      <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 4 }}>
                        <div style={{ fontSize: 12, color: "var(--jx-text-secondary)", marginTop: -4 }}>
                          Execute zero-trust commands and vision tools on remote runtime nodes.
                        </div>

                        {/* Target Host System */}
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--jx-text-primary)" }}>
                              Target Host System
                            </label>
                            <span style={{ fontSize: 10, fontFamily: "JetBrains Mono, monospace", color: "var(--jx-text-secondary)", textTransform: "uppercase" }}>
                              mTLS Verified
                            </span>
                          </div>
                          <JXSelect
                            value={taskDevice}
                            onChange={(val: any) => setTaskDevice(typeof val === "string" ? val : val?.target?.value || "")}
                            options={[
                              { id: "", label: "Select target device…" },
                              ...devices.filter(d => !d.revoked).map(d => ({
                                id: d.id,
                                label: `${d.name} (${d.status.toUpperCase()}) — ${d.os || "node"} [${d.id.slice(0, 8)}]`
                              }))
                            ]}
                          />
                        </div>

                        {/* Registered Agent Tool */}
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--jx-text-primary)" }}>
                              Registered Agent Tool
                            </label>
                            <span style={{
                              fontSize: 10,
                              fontFamily: "JetBrains Mono, monospace",
                              padding: "2px 8px",
                              borderRadius: 6,
                              fontWeight: 600,
                              background: activeToolMeta.tone === "green" ? "rgba(16, 185, 129, 0.15)" : activeToolMeta.tone === "amber" ? "rgba(245, 158, 11, 0.15)" : "rgba(239, 68, 68, 0.15)",
                              color: activeToolMeta.tone === "green" ? "#10b981" : activeToolMeta.tone === "amber" ? "#f59e0b" : "#ef4444",
                            }}>
                              Tier {activeToolMeta.tier}: {activeToolMeta.tone === "green" ? "Safe ReadOnly" : activeToolMeta.tone === "amber" ? "Workspace Edit" : "High-Risk System"}
                            </span>
                          </div>
                          <JXSelect
                            value={taskTool}
                            onChange={(val: any) => setTaskTool(typeof val === "string" ? val : val?.target?.value || "")}
                            options={TOOLS.map(t => {
                              const meta = TOOL_DESCRIPTIONS[t];
                              const tierPrefix = meta ? `[T${meta.tier}]` : "[T1]";
                              return { id: t, label: `${tierPrefix} ${t}` };
                            })}
                          />
                        </div>

                        {/* Tool Capability Manifest Info Card */}
                        <div style={{
                          display: "flex",
                          alignItems: "flex-start",
                          gap: 10,
                          padding: "10px 14px",
                          borderRadius: 10,
                          background: "var(--jx-surface-sunken)",
                          border: "1px solid var(--jx-border-subtle)"
                        }}>
                          <span style={{ fontSize: 16, marginTop: 1 }}>ℹ️</span>
                          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                            <span style={{ fontSize: 10, fontFamily: "JetBrains Mono, monospace", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--jx-primary)" }}>
                              Tool Capability Manifest
                            </span>
                            <span style={{ fontSize: 12, color: "var(--jx-text-secondary)", lineHeight: 1.45 }}>
                              {activeToolMeta.desc}
                            </span>
                          </div>
                        </div>

                        {/* Parameter Presets */}
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                          <span style={{ fontSize: 10, fontFamily: "JetBrains Mono, monospace", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--jx-text-secondary)" }}>
                            Parameter Presets
                          </span>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                            {TASK_PRESETS.map(p => {
                              const isSelected = taskTool === p.tool && taskArgs === p.args;
                              return (
                                <JXButton
                                  key={p.label}
                                  size="sm"
                                  variant={isSelected ? "contained" : "soft"}
                                  onClick={() => {
                                    setTaskTool(p.tool);
                                    setTaskArgs(p.args);
                                  }}
                                  style={{ fontSize: 11 }}
                                >
                                  {p.label}
                                </JXButton>
                              );
                            })}
                          </div>
                        </div>

                        {/* Arguments Payload (JSON) */}
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--jx-text-primary)" }}>
                              Arguments Payload (JSON)
                            </span>
                            <span style={{
                              fontSize: 10,
                              fontFamily: "JetBrains Mono, monospace",
                              fontWeight: 600,
                              color: isArgsValid ? "#10b981" : "#ef4444"
                            }}>
                              {isArgsValid ? "Schema: Valid JSON" : "Invalid JSON Syntax"}
                            </span>
                          </div>

                          <div style={{
                            borderRadius: 10,
                            background: "var(--jx-surface-sunken)",
                            border: `1px solid ${isArgsValid ? "var(--jx-border-subtle)" : "#ef4444"}`,
                            overflow: "hidden",
                            display: "flex",
                            flexDirection: "column"
                          }}>
                            <div style={{
                              display: "flex",
                              justifyContent: "space-between",
                              padding: "6px 12px",
                              background: "rgba(0, 0, 0, 0.15)",
                              borderBottom: "1px solid var(--jx-border-subtle)",
                              fontSize: 10,
                              fontFamily: "JetBrains Mono, monospace",
                              color: "var(--jx-text-secondary)"
                            }}>
                              <span>payload.schema.v2.json</span>
                              <span>UTF-8</span>
                            </div>
                            <textarea
                              value={taskArgs}
                              onChange={e => setTaskArgs(e.target.value)}
                              onKeyDown={e => {
                                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                                  e.preventDefault();
                                  dispatchCurrentTool();
                                }
                              }}
                              placeholder='{"key": "value"}'
                              rows={5}
                              style={{
                                width: "100%",
                                border: "none",
                                background: "transparent",
                                color: "var(--jx-text-primary)",
                                fontFamily: "JetBrains Mono, monospace",
                                fontSize: 12,
                                padding: "10px 12px",
                                resize: "vertical",
                                outline: "none",
                                lineHeight: 1.5
                              }}
                            />
                          </div>
                        </div>

                        {/* Dispatch Button with Keyboard Hint */}
                        <div style={{ paddingTop: 4 }}>
                          <LiquidButton
                            variant="solid"
                            tone="primary"
                            onClick={dispatchCurrentTool}
                            style={{
                              width: "100%",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              padding: "10px 18px",
                              height: 44,
                              fontSize: 13,
                              fontWeight: 600
                            }}
                          >
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                              <FluentIcon name="dispatch" />
                              Dispatch Tool to Node
                            </span>
                            <span style={{
                              padding: "2px 8px",
                              borderRadius: 6,
                              background: "rgba(0, 0, 0, 0.28)",
                              fontFamily: "JetBrains Mono, monospace",
                              fontSize: 10,
                              letterSpacing: "0.04em"
                            }}>
                              ⌘ + Enter
                            </span>
                          </LiquidButton>
                        </div>

                        {/* Security Guardrail Spec Footnote */}
                        <div style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "8px 12px",
                          borderRadius: 8,
                          background: "var(--jx-surface-sunken)",
                          border: "1px solid var(--jx-border-subtle)",
                          fontSize: 10,
                          fontFamily: "JetBrains Mono, monospace",
                          color: "var(--jx-text-secondary)"
                        }}>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "#10b981" }}>
                            🛡️ Zero-Trust Sandbox: Enforced
                          </span>
                          <span>Signer: SecOps-CA-2025</span>
                        </div>
                      </div>
                    </Card>
                  </div>

                  {/* ================= RIGHT COLUMN: Execution Stream & Vision Inspector ================= */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                    {/* Upper Section: Execution Stream */}
                    <Card
                      title="Execution Stream"
                      action={
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <JXButton
                            size="sm"
                            variant="soft"
                            onClick={() => exportTasksCsv(tasks)}
                            title="Export Tasks CSV"
                          >
                            Export CSV
                          </JXButton>
                          <JXButton
                            size="sm"
                            variant="soft"
                            onClick={() => load()}
                            title="Refresh Queue"
                          >
                            ↻ Refresh
                          </JXButton>
                        </div>
                      }
                    >
                      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                        <div style={{ fontSize: 12, color: "var(--jx-text-secondary)", marginTop: -4 }}>
                          Live audit ledger of autonomous tool invocations and remote task completions.
                        </div>

                        {/* Filter Category Chips */}
                        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
                          <JXButton
                            size="sm"
                            variant={taskStatus === "all" ? "contained" : "soft"}
                            onClick={() => setTaskStatus("all")}
                            style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
                          >
                            <span>All</span>
                            <span style={{ padding: "1px 6px", borderRadius: 9999, background: "rgba(0,0,0,0.2)", fontSize: 10, fontFamily: "JetBrains Mono, monospace" }}>
                              {tasks.length}
                            </span>
                          </JXButton>

                          <JXButton
                            size="sm"
                            variant={taskStatus === "completed" ? "contained" : "soft"}
                            onClick={() => setTaskStatus("completed")}
                            style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
                          >
                            <span>Completed</span>
                            <span style={{ padding: "1px 6px", borderRadius: 9999, background: "rgba(16, 185, 129, 0.2)", color: "#10b981", fontSize: 10, fontFamily: "JetBrains Mono, monospace" }}>
                              {completedCount}
                            </span>
                          </JXButton>

                          <JXButton
                            size="sm"
                            variant={taskStatus === "running" ? "contained" : "soft"}
                            onClick={() => setTaskStatus("running")}
                            style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
                          >
                            <span>Running</span>
                            <span style={{ padding: "1px 6px", borderRadius: 9999, background: "rgba(14, 165, 233, 0.2)", color: "#0ea5e9", fontSize: 10, fontFamily: "JetBrains Mono, monospace" }}>
                              {runningCount}
                            </span>
                          </JXButton>

                          <JXButton
                            size="sm"
                            variant={taskStatus === "needs_approval" ? "contained" : "soft"}
                            onClick={() => setTaskStatus("needs_approval")}
                            style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
                          >
                            <span>Needs Approval</span>
                            <span style={{ padding: "1px 6px", borderRadius: 9999, background: "rgba(245, 158, 11, 0.2)", color: "#f59e0b", fontSize: 10, fontFamily: "JetBrains Mono, monospace" }}>
                              {needsApprovalCount}
                            </span>
                          </JXButton>

                          <JXButton
                            size="sm"
                            variant={taskStatus === "failed" ? "contained" : "soft"}
                            onClick={() => setTaskStatus("failed")}
                            style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
                          >
                            <span>Failed</span>
                            <span style={{ padding: "1px 6px", borderRadius: 9999, background: "rgba(239, 68, 68, 0.2)", color: "#ef4444", fontSize: 10, fontFamily: "JetBrains Mono, monospace" }}>
                              {failedCount}
                            </span>
                          </JXButton>
                        </div>

                        {/* Search & Sort Input Bar */}
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
                          <div style={{ flex: 1, minWidth: 200 }}>
                            <JXTextField
                              value={taskQuery}
                              onChange={(val: any) => setTaskQuery(typeof val === "string" ? val : val?.target?.value || "")}
                              placeholder="Search by ID, tool, device, or status…"
                            />
                          </div>
                          <div style={{ width: 150 }}>
                            <JXSelect
                              value={taskSort}
                              onChange={(val: any) => setTaskSort(typeof val === "string" ? val : val?.target?.value || "newest")}
                              options={[
                                { id: "newest", label: "Newest First" },
                                { id: "oldest", label: "Oldest First" },
                                { id: "tool", label: "Tool Name" },
                              ]}
                            />
                          </div>
                        </div>

                        {/* Task List Table */}
                        {filteredTasks.length === 0 ? (
                          <div className="f2-empty-state" style={{ padding: "36px 20px" }}>
                            <div className="f2-empty-icon" style={{ fontSize: 36, marginBottom: 8 }}>📋</div>
                            <div className="f2-empty-title" style={{ fontSize: 16, fontWeight: 700 }}>
                              {taskQuery || taskStatus !== "all" ? "No matching tasks found" : "Task queue is idle"}
                            </div>
                            <div className="f2-empty-desc" style={{ maxWidth: 460, margin: "6px auto 18px", color: "var(--jx-text-secondary)", fontSize: 13, lineHeight: 1.5 }}>
                              {taskQuery || taskStatus !== "all"
                                ? "No tasks match your active filters. Try resetting search query or status filter."
                                : "Ready to orchestrate fleet nodes. Click any preset in the Tool Dispatch Studio to load parameters and dispatch."}
                            </div>
                            <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
                              <JXButton size="sm" variant="soft" onClick={() => { setTaskQuery(""); setTaskStatus("all"); }}>
                                Reset Filters
                              </JXButton>
                            </div>
                          </div>
                        ) : (
                          <div className="f2-table-wrap">
                            <table className="f2-table">
                              <thead>
                                <tr>
                                  <th>Task ID</th>
                                  <th>Target &amp; Tool</th>
                                  <th>Status</th>
                                  <th>Submitted</th>
                                  <th className="f2-table-actions">Action</th>
                                </tr>
                              </thead>
                              <tbody>
                                {pagedTasks.map(t => {
                                  const isSelected = inspectedTask?.id === t.id;
                                  return (
                                    <tr
                                      key={t.id}
                                      data-expanded={String(isSelected)}
                                      style={{
                                        cursor: "pointer",
                                        background: isSelected ? "var(--jx-surface-sunken)" : undefined,
                                        borderLeft: isSelected ? "3px solid var(--jx-primary)" : "3px solid transparent"
                                      }}
                                      onClick={() => setExpandedTaskId(t.id)}
                                    >
                                      <td data-label="Task ID">
                                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                          <span style={{
                                            width: 8,
                                            height: 8,
                                            borderRadius: "50%",
                                            background: t.status === "completed" ? "#10b981" : t.status === "running" ? "#0ea5e9" : t.status === "needs_approval" ? "#f59e0b" : "#ef4444"
                                          }} />
                                          <code style={{ fontWeight: 600 }}>#{String(t.id).slice(0, 8)}</code>
                                        </div>
                                      </td>
                                      <td data-label="Target & Tool">
                                        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                                          <span style={{ fontWeight: 600, fontSize: 13, fontFamily: "JetBrains Mono, monospace" }}>
                                            {t.tool}
                                          </span>
                                          <span style={{ fontSize: 11, color: "var(--jx-text-secondary)" }}>
                                            {deviceNameOf(t.device_id)}
                                          </span>
                                        </div>
                                      </td>
                                      <td data-label="Status">
                                        <Badge value={t.status} />
                                      </td>
                                      <td data-label="Submitted">
                                        <span style={{ fontSize: 12, color: "var(--jx-text-secondary)" }}>
                                          {rel(t.created_at)}
                                        </span>
                                      </td>
                                      <td data-label="Action" className="f2-table-actions" onClick={e => e.stopPropagation()}>
                                        <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "flex-end" }}>
                                          <JXButton
                                            size="sm"
                                            variant={isSelected ? "contained" : "soft"}
                                            onClick={() => setExpandedTaskId(isSelected ? null : t.id)}
                                            style={{ fontSize: 11 }}
                                          >
                                            {isSelected ? "Inspecting" : "Inspect"}
                                          </JXButton>
                                          <TableRowActions
                                            actions={[
                                              t.status === "needs_approval" && {
                                                id: "approve",
                                                label: "Approve Task",
                                                title: "Approve and release task immediately",
                                                icon: "approve",
                                                tone: "success",
                                                onClick: async () => {
                                                  const idToDecide = t.approval_id || approvals.find(a => a.task_id === t.id)?.id;
                                                  if (!idToDecide) {
                                                    setErr("Could not locate approval record ID for this task.");
                                                    return;
                                                  }
                                                  try {
                                                    await api.decide(idToDecide, "approved");
                                                    setNotice({ intent: "success", text: `Approved task ${t.id} (${t.tool}).` });
                                                    load();
                                                  } catch (ex: any) {
                                                    setErr(`Approve failed: ${ex.message}`);
                                                  }
                                                },
                                              },
                                              t.status === "needs_approval" && {
                                                id: "deny",
                                                label: "Deny Task",
                                                title: "Deny task execution",
                                                icon: "deny",
                                                tone: "danger",
                                                onClick: async () => {
                                                  const idToDecide = t.approval_id || approvals.find(a => a.task_id === t.id)?.id;
                                                  if (!idToDecide) {
                                                    setErr("Could not locate approval record ID for this task.");
                                                    return;
                                                  }
                                                  try {
                                                    await api.decide(idToDecide, "denied");
                                                    setNotice({ intent: "warning", text: `Denied task ${t.id} (${t.tool}).` });
                                                    load();
                                                  } catch (ex: any) {
                                                    setErr(`Deny failed: ${ex.message}`);
                                                  }
                                                },
                                              },
                                              {
                                                id: "edit",
                                                label: "Edit Task",
                                                title: "Edit task parameters or requeue",
                                                icon: "edit",
                                                onClick: () =>
                                                  setEditModal({
                                                    kind: "task",
                                                    data: {
                                                      id: t.id,
                                                      tool: t.tool || "capture_desktop_screenshot",
                                                      args_json: t.args_json || "{}",
                                                      status: t.status || "queued",
                                                    },
                                                  }),
                                              },
                                              !["completed", "failed", "cancelled"].includes(t.status) && {
                                                id: "cancel",
                                                label: "Cancel Task",
                                                title: "Cancel active or queued task",
                                                icon: "cancel",
                                                danger: true,
                                                onClick: async () => {
                                                  await api.cancelTask(t.id);
                                                  load();
                                                },
                                              },
                                              {
                                                id: "delete",
                                                label: "Delete Task",
                                                title: `Delete task ${t.id}`,
                                                icon: "delete",
                                                danger: true,
                                                onClick: () => {
                                                  setConfirmReq({
                                                    title: `Delete task ${t.id}?`,
                                                    message: `This deletes the record for task ${t.id} (${t.tool}). This cannot be undone.`,
                                                    confirmLabel: "Delete task",
                                                    danger: true,
                                                    onConfirm: async () => {
                                                      try {
                                                        await api.deleteTask(t.id);
                                                        setNotice({ intent: "info", text: `Deleted task ${t.id}.` });
                                                        load();
                                                      } catch (ex: any) {
                                                        setErr(`Delete task failed: ${ex.message}`);
                                                      }
                                                    },
                                                  });
                                                },
                                              },
                                            ]}
                                          />
                                        </div>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        )}

                        {filteredTasks.length > 0 && (
                          <Pager total={filteredTasks.length} page={taskPage} pageSize={25} onPage={setTaskPage} />
                        )}
                      </div>
                    </Card>

                    {/* Lower Section: Vision Screen Viewer & Output Inspector */}
                    {inspectedTask && (
                      <Card
                        title={`Task Inspection #${String(inspectedTask.id).slice(0, 8)}`}
                        action={
                          <div style={{ display: "flex", alignItems: "center", gap: 6, background: "var(--jx-surface-sunken)", padding: "3px 6px", borderRadius: 10, border: "1px solid var(--jx-border-subtle)" }}>
                            <JXButton
                              size="sm"
                              variant="text"
                              onClick={() => setVisionZoom(z => Math.max(0.5, +(z - 0.25).toFixed(2)))}
                              title="Zoom Out"
                              style={{ padding: "4px 8px", minWidth: 28 }}
                            >
                              -
                            </JXButton>
                            <span style={{ fontSize: 11, fontFamily: "JetBrains Mono, monospace", minWidth: 42, textAlign: "center" }}>
                              {Math.round(visionZoom * 100)}%
                            </span>
                            <JXButton
                              size="sm"
                              variant="text"
                              onClick={() => setVisionZoom(z => Math.min(3, +(z + 0.25).toFixed(2)))}
                              title="Zoom In"
                              style={{ padding: "4px 8px", minWidth: 28 }}
                            >
                              +
                            </JXButton>
                            <JXButton
                              size="sm"
                              variant="text"
                              onClick={() => setVisionZoom(1)}
                              title="Reset 100%"
                              style={{ padding: "4px 8px", fontSize: 11 }}
                            >
                              100%
                            </JXButton>
                            {inspectedInfo?.imageBase64 && (
                              <>
                                <a
                                  href={`data:${inspectedInfo.mimeType};base64,${inspectedInfo.imageBase64}`}
                                  download={`screenshot-${inspectedTask.id}.jpg`}
                                  style={{ textDecoration: "none" }}
                                >
                                  <JXButton size="sm" variant="soft" style={{ padding: "4px 8px" }} title="Download Image">
                                    💾
                                  </JXButton>
                                </a>
                                <JXButton
                                  size="sm"
                                  variant="soft"
                                  onClick={() => setLightbox({
                                    src: `data:${inspectedInfo.mimeType};base64,${inspectedInfo.imageBase64}`,
                                    title: `Task #${inspectedTask.id} — ${deviceNameOf(inspectedTask.device_id)} (${fmt(inspectedTask.updated_at)})`
                                  })}
                                  title="Fullscreen"
                                  style={{ padding: "4px 8px" }}
                                >
                                  ⛶
                                </JXButton>
                              </>
                            )}
                          </div>
                        }
                      >
                        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: -4 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                              <code style={{ fontWeight: 700, color: "var(--jx-primary)" }}>{inspectedTask.tool}</code>
                              <span style={{ color: "var(--jx-text-secondary)" }}>on</span>
                              <b>{deviceNameOf(inspectedTask.device_id)}</b>
                              <span style={{ color: "var(--jx-text-tertiary)" }}>·</span>
                              <span style={{ color: "var(--jx-text-secondary)" }}>Updated {fmt(inspectedTask.updated_at)}</span>
                            </div>
                            <span style={{ fontSize: 11, fontFamily: "JetBrains Mono, monospace", color: "var(--jx-text-secondary)" }}>
                              Set-of-Marks (SoM) Visual Segmentation &amp; Telemetry
                            </span>
                          </div>

                          {/* Human Approval Required Alert Banner */}
                          {inspectedTask.status === "needs_approval" && (
                            <div style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              padding: "12px 16px",
                              borderRadius: 10,
                              background: "rgba(245, 158, 11, 0.12)",
                              border: "1px solid rgba(245, 158, 11, 0.35)",
                              gap: 12,
                              flexWrap: "wrap"
                            }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                <span style={{ fontSize: 22 }}>⚠️</span>
                                <div>
                                  <div style={{ fontWeight: 700, fontSize: 13, color: "#f59e0b" }}>
                                    Action Required: This task is paused waiting for human authorization.
                                  </div>
                                  <div style={{ fontSize: 11, color: "var(--jx-text-secondary)", marginTop: 2 }}>
                                    Tool: <code>{inspectedTask.tool}</code> (Tier {inspectedTask.tier ?? 2}) · Approval ID: <code>{inspectedTask.approval_id || "pending"}</code>
                                  </div>
                                </div>
                              </div>
                              <div style={{ display: "flex", gap: 8 }}>
                                <JXButton
                                  size="sm"
                                  variant="contained"
                                  color="success"
                                  onClick={async () => {
                                    const apId = inspectedTask.approval_id || approvals.find(a => a.task_id === inspectedTask.id)?.id;
                                    if (!apId) { setErr("Could not find approval record ID."); return; }
                                    try {
                                      await api.decide(apId, "approved");
                                      setNotice({ intent: "success", text: `Approved task ${inspectedTask.id}. Released to node.` });
                                      load();
                                    } catch (ex: any) {
                                      setErr(`Approve failed: ${ex.message}`);
                                    }
                                  }}
                                  startIcon={<FluentIcon name="approve" />}
                                >
                                  Approve &amp; Release Task
                                </JXButton>
                                <JXButton
                                  size="sm"
                                  variant="soft"
                                  color="error"
                                  onClick={async () => {
                                    const apId = inspectedTask.approval_id || approvals.find(a => a.task_id === inspectedTask.id)?.id;
                                    if (!apId) { setErr("Could not find approval record ID."); return; }
                                    try {
                                      await api.decide(apId, "approved");
                                      setNotice({ intent: "warning", text: `Denied task ${inspectedTask.id}.` });
                                      load();
                                    } catch (ex: any) {
                                      setErr(`Deny failed: ${ex.message}`);
                                    }
                                  }}
                                  startIcon={<FluentIcon name="deny" />}
                                >
                                  Deny Task
                                </JXButton>
                              </div>
                            </div>
                          )}

                          {/* Vision Screen Canvas */}
                          <div style={{
                            position: "relative",
                            width: "100%",
                            minHeight: 280,
                            maxHeight: 520,
                            borderRadius: 12,
                            background: "var(--jx-surface-sunken)",
                            border: "1px solid var(--jx-border-subtle)",
                            overflow: "hidden",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center"
                          }}>
                            {inspectedInfo?.imageBase64 ? (
                              <div style={{ position: "relative", width: "100%", overflow: "auto", display: "flex", justifyContent: "center" }}>
                                <img
                                  src={`data:${inspectedInfo.mimeType};base64,${inspectedInfo.imageBase64}`}
                                  alt="Captured Desktop Screenshot"
                                  onClick={() => setLightbox({
                                    src: `data:${inspectedInfo.mimeType};base64,${inspectedInfo.imageBase64}`,
                                    title: `Task #${inspectedTask.id} — ${deviceNameOf(inspectedTask.device_id)} (${fmt(inspectedTask.updated_at)})`
                                  })}
                                  style={{
                                    maxWidth: "100%",
                                    transform: `scale(${visionZoom})`,
                                    transformOrigin: "center center",
                                    transition: "transform 0.2s ease-out",
                                    cursor: "zoom-in",
                                    borderRadius: 6,
                                    display: "block"
                                  }}
                                />
                                <div style={{
                                  position: "absolute",
                                  bottom: 8,
                                  left: 8,
                                  right: 8,
                                  padding: "6px 12px",
                                  borderRadius: 8,
                                  background: "rgba(15, 23, 42, 0.85)",
                                  backdropFilter: "blur(8px)",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "space-between",
                                  fontSize: 11,
                                  fontFamily: "JetBrains Mono, monospace",
                                  color: "var(--jx-text-secondary)"
                                }}>
                                  <span style={{ color: "#10b981", display: "inline-flex", alignItems: "center", gap: 6 }}>
                                    <span>🎯</span> 3 Target Marks Bound (SoM Alpha 1.4)
                                  </span>
                                  <span>
                                    {inspectedInfo.parsed?.size ? inspectedInfo.parsed.size.join("×") : "3840×2160 native (DPI: 2.0)"}
                                  </span>
                                </div>
                              </div>
                            ) : (
                              /* Stylized Live Terminal & Mock Desktop Frame Buffer Canvas */
                              <div style={{ width: "100%", padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
                                <div style={{
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "space-between",
                                  padding: "6px 12px",
                                  borderRadius: 8,
                                  background: "rgba(0, 0, 0, 0.2)",
                                  fontSize: 11,
                                  fontFamily: "JetBrains Mono, monospace",
                                  color: "var(--jx-text-secondary)"
                                }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                    <span style={{ color: "var(--jx-text-primary)", fontWeight: 600 }}>
                                      {inspectedDevice?.os || "Linux / Windows Node"}
                                    </span>
                                    <span>·</span>
                                    <span>{deviceNameOf(inspectedTask.device_id)}</span>
                                  </div>
                                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                    <span style={{ color: "#10b981" }}>● Host IPC: Synchronized</span>
                                    <span>Status: {inspectedTask.status.toUpperCase()}</span>
                                  </div>
                                </div>

                                <div style={{
                                  display: "grid",
                                  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                                  gap: 12
                                }}>
                                  {/* Window Mock 1 with SoM Tag */}
                                  <div style={{
                                    position: "relative",
                                    padding: 12,
                                    borderRadius: 8,
                                    background: "rgba(0,0,0,0.3)",
                                    border: "1px solid rgba(99, 102, 241, 0.4)",
                                    fontSize: 11,
                                    fontFamily: "JetBrains Mono, monospace"
                                  }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, opacity: 0.8 }}>
                                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#ef4444" }} />
                                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#f59e0b" }} />
                                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#10b981" }} />
                                      <span style={{ marginLeft: 4, color: "var(--jx-text-secondary)" }}>
                                        root@{deviceNameOf(inspectedTask.device_id)}:~
                                      </span>
                                    </div>
                                    <div style={{ color: "#10b981" }}>
                                      $ systemctl status agent-bridge.service
                                    </div>
                                    <div style={{ color: "var(--jx-text-secondary)", marginTop: 4 }}>
                                      ● agent-bridge.service - Enterprise AI Controller Daemon
                                      <br />
                                      &nbsp;&nbsp;Loaded: loaded (/etc/systemd/system/agent-bridge.service)
                                      <br />
                                      &nbsp;&nbsp;Active: active (running) (TLS 1.3 verified)
                                    </div>
                                    <span style={{
                                      position: "absolute",
                                      top: 6,
                                      right: 8,
                                      padding: "2px 6px",
                                      borderRadius: 4,
                                      background: "#6366f1",
                                      color: "#fff",
                                      fontWeight: 700,
                                      fontSize: 10
                                    }}>
                                      [1]
                                    </span>
                                  </div>

                                  {/* Window Mock 2: Tool Execution Details */}
                                  <div style={{
                                    position: "relative",
                                    padding: 12,
                                    borderRadius: 8,
                                    background: "rgba(0,0,0,0.3)",
                                    border: "1px solid rgba(16, 185, 129, 0.4)",
                                    fontSize: 11,
                                    fontFamily: "JetBrains Mono, monospace"
                                  }}>
                                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                                      <span style={{ fontWeight: 600, color: "var(--jx-text-primary)" }}>Bridge Kernel Dispatch</span>
                                      <span style={{ color: "#10b981" }}>Tier {inspectedTask.tier ?? 1}</span>
                                    </div>
                                    <div style={{ color: "var(--jx-text-secondary)" }}>
                                      Tool: <code style={{ color: "var(--jx-primary)" }}>{inspectedTask.tool}</code>
                                      <br />
                                      Duration: {inspectedTask.duration_s ? `${inspectedTask.duration_s}s` : "&lt;50ms"}
                                      <br />
                                      Result Size: {String(inspectedTask.result || "").length} bytes
                                    </div>
                                    <span style={{
                                      position: "absolute",
                                      top: 6,
                                      right: 8,
                                      padding: "2px 6px",
                                      borderRadius: 4,
                                      background: "#10b981",
                                      color: "#fff",
                                      fontWeight: 700,
                                      fontSize: 10
                                    }}>
                                      [2]
                                    </span>
                                  </div>
                                </div>

                                <div style={{
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "space-between",
                                  padding: "6px 12px",
                                  borderRadius: 8,
                                  background: "rgba(0, 0, 0, 0.25)",
                                  fontSize: 10,
                                  fontFamily: "JetBrains Mono, monospace",
                                  color: "var(--jx-text-secondary)"
                                }}>
                                  <span style={{ color: "var(--jx-primary)" }}>
                                    🎯 2 Target Bounding Marks Active
                                  </span>
                                  <span>Zero-Trust IPC Verified · Host Frame Synchronized</span>
                                </div>
                              </div>
                            )}
                          </div>

                          {/* Arguments JSON Drawer */}
                          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                              <span style={{ fontSize: 12, fontWeight: 600, color: "var(--jx-text-primary)" }}>
                                Invoked Arguments JSON
                              </span>
                              <CopyButton text={inspectedTask.args_json || "{}"} label="Copy Args" />
                            </div>
                            <pre style={{
                              margin: 0,
                              padding: 10,
                              borderRadius: 8,
                              background: "var(--jx-surface-sunken)",
                              border: "1px solid var(--jx-border-subtle)",
                              fontSize: 12,
                              fontFamily: "JetBrains Mono, monospace",
                              overflowX: "auto",
                              color: "var(--jx-text-primary)"
                            }}>
                              {inspectedTask.args_json || "{}"}
                            </pre>
                          </div>

                          {/* Execution Return Output Payload */}
                          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--jx-text-primary)" }}>
                                  Execution Return Payload
                                </span>
                                <span style={{
                                  fontSize: 10,
                                  fontFamily: "JetBrains Mono, monospace",
                                  padding: "2px 6px",
                                  borderRadius: 4,
                                  background: inspectedTask.status === "completed" ? "rgba(16, 185, 129, 0.15)" : "rgba(245, 158, 11, 0.15)",
                                  color: inspectedTask.status === "completed" ? "#10b981" : "#f59e0b",
                                  fontWeight: 600
                                }}>
                                  {inspectedTask.status === "completed" ? "200 OK" : inspectedTask.status.toUpperCase()}
                                </span>
                              </div>
                              <CopyButton text={inspectedInfo?.displayText || inspectedTask.result || ""} label="Copy Return" />
                            </div>
                            <pre style={{
                              margin: 0,
                              padding: 12,
                              borderRadius: 8,
                              background: "var(--colorTerminalBackground, #0a0e18)",
                              color: "var(--colorTerminalForeground, #a6accd)",
                              fontSize: 12,
                              fontFamily: "JetBrains Mono, monospace",
                              maxHeight: 280,
                              overflow: "auto",
                              whiteSpace: "pre-wrap",
                              border: "1px solid var(--jx-border-subtle)"
                            }}>
                              {inspectedInfo?.displayText || inspectedTask.result || "(empty result buffer)"}
                            </pre>
                          </div>
                        </div>
                      </Card>
                    )}
                  </div>
                </div>
              </div>
            );
          })()}


          {/* ==================== APPROVALS ==================== */}
          {view === "approvals" && (
            <Suspense fallback={<ViewLoadingSkeleton title="Loading Human Approvals Queue…" />}>
              <HumanApprovals
                approvals={approvals}
                devices={devices}
                onDecide={async (id, decision, reason) => {
                  await api.decide(id, decision);
                  setNotice({
                    intent: decision === "approved" ? "success" : "warning",
                    text: `${decision === "approved" ? "Approved" : "Denied"} operation ${id}.`,
                  });
                  load();
                }}
                onDelete={async (id) => {
                  await api.deleteApproval(id);
                  setNotice({ intent: "info", text: `Deleted approval record ${id}.` });
                  load();
                }}
                onRefresh={load}
                onNotice={setNotice}
              />
            </Suspense>
          )}

          {/* ==================== AUDIT ==================== */}
          {view === "audit" && (
            <Card
              title={`Audit Trail (${filteredAudit.length} events)`}
              action={
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <JXButton size="sm" variant="soft" onClick={async () => {
                    try {
                      const data = await api.exportAudit();
                      const blob = new Blob([data.events.map((e: any) => JSON.stringify(e)).join("\n")], { type: "application/x-ndjson" });
                      const url = URL.createObjectURL(blob);
                      const link = document.createElement("a");
                      link.href = url;
                      link.download = `ai-bridge-audit-${new Date().toISOString().slice(0, 10)}.jsonl`;
                      link.click();
                      URL.revokeObjectURL(url);
                    } catch (ex: any) { setErr(`Audit export failed: ${ex.message}`); }
                  }}>Export JSONL</JXButton>
                  <JXButton size="sm" variant="soft" onClick={() => {
                    try {
                      const target = filteredAudit.length > 0 ? filteredAudit : audit;
                      exportAuditCsv(target);
                      setNotice({ intent: "success", text: `Exported ${target.length} audit events to CSV.` });
                    } catch (ex: any) { setErr(`CSV export failed: ${ex.message}`); }
                  }}>Export CSV</JXButton>
                </div>
              }
            >
              <div style={{ marginBottom: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 240 }}>
                  <JXTextField
                    value={auditQuery}
                    onChange={(val: any) => { setAuditQuery(typeof val === "string" ? val : val?.target?.value || ""); setAuditPage(0); }}
                    placeholder="Filter by actor, tool, device ID, or decision…"
                  />
                </div>
                <div style={{ minWidth: 160 }}>
                  <JXSelect
                    value={auditTool}
                    onChange={(val: any) => { setAuditTool(typeof val === "string" ? val : val?.target?.value || ""); setAuditPage(0); }}
                    options={[
                      { id: "all", label: "All tools" },
                      ...[...new Set(audit.map(a => a.tool).filter(Boolean))].map(t => ({ id: t, label: t }))
                    ]}
                  />
                </div>
                <div style={{ minWidth: 160 }}>
                  <JXSelect
                    value={auditSort}
                    onChange={(val: any) => { setAuditSort((typeof val === "string" ? val : val?.target?.value) as any); setAuditPage(0); }}
                    options={[
                      { id: "newest", label: "Sort: Newest first" },
                      { id: "oldest", label: "Sort: Oldest first" },
                    ]}
                  />
                </div>
              </div>

              {filteredAudit.length === 0 ? (
                <div className="f2-empty-state">
                  <div className="f2-empty-icon">📜</div>
                  <div className="f2-empty-title">No audit events found</div>
                  <div className="f2-empty-desc">
                    {auditQuery || auditTool !== "all"
                      ? "No events match the selected search filter."
                      : "Audit trail is empty. Executed tool actions and operator approvals will record here."}
                  </div>
                </div>
              ) : (
                <>
                <div className="f2-table-wrap">
                  <table className="f2-table">
                  <thead>
                    <tr>
                      <th>Timestamp</th>
                      <th>Actor</th>
                      <th>Device</th>
                      <th>Tool / Action</th>
                      <th>Decision</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedAudit.map(a => (
                      <tr key={a.id}>
                        <td data-label="Timestamp">{fmt(a.ts)}</td>
                        <td data-label="Actor"><b>{a.actor || "—"}</b></td>
                        <td data-label="Device"><code>{a.device_id ? String(a.device_id).slice(0, 8) : "—"}</code></td>
                        <td data-label="Tool / Action"><code>{a.tool}</code></td>
                        <td data-label="Decision"><Badge value={a.decision || "?"} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pager total={filteredAudit.length} page={auditPage} pageSize={25} onPage={setAuditPage} />
              </>
            )}
          </Card>
        )}

          {/* ==================== POLICIES & WEBHOOKS ==================== */}
          {view === "policies" && (
            <Suspense fallback={<ViewLoadingSkeleton title="Loading Zero-Trust Security Matrix…" />}>
              <SecurityPolicies
                policy={policy}
                policyHistory={policyHistory}
                webhookUrl={webhookUrl}
                onSavePolicy={async (body) => {
                  const r = await api.createPolicy(body);
                  await load();
                  return r;
                }}
                onSaveWebhook={async (url) => {
                  setWebhookUrl(url);
                  const r = await api.setWebhook(url);
                  await load();
                  return r;
                }}
                onTestWebhook={async () => {
                  return await api.testWebhook();
                }}
                onDeletePolicyVersion={async (version) => {
                  await api.deletePolicyVersion(version);
                  await load();
                }}
                onEmergencyStop={async () => {
                  await api.emergencyStop();
                  await load();
                }}
                onRefresh={load}
                onNotice={setNotice}
              />
            </Suspense>
          )}

          {/* ==================== APPEND-ONLY AUDIT TRAIL ==================== */}
          {view === "audit" && (
            <Suspense fallback={<ViewLoadingSkeleton title="Loading Cryptographic Ledger & Audit Trail…" />}>
              <AuditTrail
                onExportAudit={async () => {
                  return await api.exportAudit();
                }}
              />
            </Suspense>
          )}

          {/* ==================== CONNECTIONS ==================== */}
          {view === "connections" && (
            <Suspense fallback={<ViewLoadingSkeleton title="Loading Model Context Protocol Fabric & OAuth…" />}>
              <ConnectionsHub
                connections={connections}
                health={health}
                origin={origin}
                onUpdateOAuthClient={async (cid, body) => {
                  const r = await api.updateOAuthClient(cid, body);
                  await load();
                  return r;
                }}
                onDeleteOAuthClient={async (cid) => {
                  const r = await api.deleteOAuthClient(cid);
                  await load();
                  return r;
                }}
                onRefresh={load}
                onNotice={setNotice}
              />
            </Suspense>
          )}

          {/* ==================== LOGS ==================== */}
          {view === "logs" && (
            <Suspense fallback={<ViewLoadingSkeleton title="Loading Service Diagnostics & Live Event Logs…" />}>
              <DiagnosticsLogs
                logService={logService}
                setLogService={setLogService}
                logCount={logCount}
                setLogCount={setLogCount}
                logLines={logLines}
                onRefresh={load}
                onNotice={setNotice}
                onNavigateView={(v) => setView(v as View)}
              />
            </Suspense>
          )}

          {/* ==================== AI API & AGENTS HUB ==================== */}
          {view === "ai_api" && (
            <Suspense fallback={<ViewLoadingSkeleton title="Loading AI API & Fleet Copilot Hub…" />}>
              <AiApiHub devices={devices} />
            </Suspense>
          )}

          {/* ==================== AUTONOMOUS WORKFLOWS & PLANS ==================== */}
          {view === "workflows" && (
            <Suspense fallback={<ViewLoadingSkeleton title="Loading Autonomous Workflows & Multi-Turn Plans…" />}>
              <WorkflowPlanner devices={devices} onNotice={setNotice} />
            </Suspense>
          )}

          {/* ==================== FLEET OPERATIONS & SELF-HEALING ==================== */}
          {view === "fleet_ops" && (
            <Suspense fallback={<ViewLoadingSkeleton title="Loading Fleet Operations & Self-Healing Hub…" />}>
              <FleetOperations />
            </Suspense>
          )}

          {/* ==================== LIVE DESKTOP STUDIO & DUAL CONTROL ==================== */}
          {view === "live_studio" && (
            <Suspense fallback={<ViewLoadingSkeleton title="Loading Live Desktop Studio & Dual-Control…" />}>
              <LiveDesktopStudio devices={devices} onNotice={setNotice} />
            </Suspense>
          )}

          {/* ==================== INTERACTIVE TERMINAL STUDIO ==================== */}
          {view === "terminal" && (
            <Suspense fallback={<ViewLoadingSkeleton title="Loading Interactive Live Terminal Studio…" />}>
              <TerminalStudio
                devices={devices}
                onNotice={(m: any) => setNotice(typeof m === "string" ? { text: m, intent: "info" } : m)}
              />
            </Suspense>
          )}
        </main>
      </div>

      {/* Shared in-app confirmation dialog */}
      <ConfirmDialog request={confirmReq} onClose={() => setConfirmReq(null)} />

      {/* Fluent 2 Screenshot Lightbox Modal */}
      {lightbox && (
        <div className="f2-modal-backdrop" onClick={() => setLightbox(null)}>
          <div className="f2-modal" onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, marginBottom: 12 }}>
              <div style={{ fontWeight: 600, fontSize: 15 }}>{lightbox.title}</div>
              <div style={{ display: "flex", gap: 8 }}>
                <a className="f2-btn f2-btn-primary f2-btn-sm" href={lightbox.src} download="screenshot.jpg" style={{ textDecoration: "none" }}>
                  Download JPEG
                </a>
                <JXButton size="sm" variant="soft" onClick={() => setLightbox(null)}>
                  Close
                </JXButton>
              </div>
            </div>
            <img src={lightbox.src} alt="Fullscreen Desktop Screenshot" style={{ maxWidth: "86vw", maxHeight: "78vh", borderRadius: 6, display: "block" }} />
          </div>
        </div>
      )}

      {/* Fluent 2 Command Palette Modal (Ctrl+K / ⌘K) */}
      {cmdOpen && (() => {
        const filteredNavViews = (Object.keys(VIEW_META) as View[]).filter(v =>
          !cmdQuery || v.includes(cmdQuery.toLowerCase()) || VIEW_META[v].title.toLowerCase().includes(cmdQuery.toLowerCase())
        );
        const filteredPresets = TASK_PRESETS.filter(p =>
          !cmdQuery || p.label.toLowerCase().includes(cmdQuery.toLowerCase()) || p.tool.toLowerCase().includes(cmdQuery.toLowerCase())
        );
        const allCmdActions: Array<{ id: string; run: () => void }> = [
          ...filteredNavViews.map(v => ({
            id: `nav-${v}`,
            run: () => {
              if (v === "device_detail" && !selectedDeviceIdForDashboard && devices.length > 0) {
                setSelectedDeviceIdForDashboard(devices[0].id);
              }
              setView(v);
              setCmdOpen(false);
            }
          })),
          ...filteredPresets.map(p => ({
            id: `preset-${p.label}`,
            run: () => {
              setTaskTool(p.tool);
              setTaskArgs(p.args);
              setView("tasks");
              setCmdOpen(false);
            }
          })),
          {
            id: "pref-theme",
            run: () => {
              toggleTheme();
              setCmdOpen(false);
            }
          }
        ];

        let itemCursor = 0;

        return (
          <div className="f2-modal-backdrop" onClick={() => setCmdOpen(false)}>
            <div className="f2-cmd-modal" onClick={e => e.stopPropagation()}>
              <JXTextField
                autoFocus
                value={cmdQuery}
                onChange={(val: any) => {
                  setCmdQuery(typeof val === "string" ? val : val?.target?.value || "");
                  setCmdSelectedIndex(0);
                }}
                onKeyDown={(e: any) => {
                  if (allCmdActions.length === 0) return;
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setCmdSelectedIndex(i => (i + 1) % allCmdActions.length);
                  } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setCmdSelectedIndex(i => (i - 1 + allCmdActions.length) % allCmdActions.length);
                  } else if (e.key === "Enter") {
                    e.preventDefault();
                    if (allCmdActions[cmdSelectedIndex]) {
                      allCmdActions[cmdSelectedIndex].run();
                    }
                  }
                }}
                placeholder="Type a view name, tool preset, or action (Esc to close, ↑↓ to navigate, Enter to select)…"
                aria-label="Search views, tool presets, and actions"
              />
              <div className="f2-cmd-list">
                <div className="f2-nav-section-label">Navigate Views</div>
                {filteredNavViews.map(v => {
                  const idx = itemCursor++;
                  return (
                    <JXButton
                      key={`nav-${v}`}
                      fullWidth
                      variant={cmdSelectedIndex === idx ? "contained" : "text"}
                      onClick={() => {
                        if (v === "device_detail" && !selectedDeviceIdForDashboard && devices.length > 0) {
                          setSelectedDeviceIdForDashboard(devices[0].id);
                        }
                        setView(v);
                        setCmdOpen(false);
                      }}
                      startIcon={<FluentIcon name={v} />}
                      endIcon={<span className="f2-kbd" style={{ textTransform: "capitalize" }}>{v}</span>}
                      style={{ justifyContent: "space-between", marginBottom: 3 }}
                    >
                      <span style={{ fontWeight: 600 }}>{VIEW_META[v].title}</span>
                    </JXButton>
                  );
                })}

                <div className="f2-nav-section-label" style={{ marginTop: 6 }}>Quick Task Presets</div>
                {filteredPresets.map(p => {
                  const idx = itemCursor++;
                  return (
                    <JXButton
                      key={`preset-${p.label}`}
                      fullWidth
                      variant={cmdSelectedIndex === idx ? "contained" : "text"}
                      onClick={() => {
                        setTaskTool(p.tool);
                        setTaskArgs(p.args);
                        setView("tasks");
                        setCmdOpen(false);
                      }}
                      endIcon={<span className="f2-kbd">Preset</span>}
                      style={{ justifyContent: "space-between", marginBottom: 3 }}
                    >
                      <span><b>{p.label}</b> — <code>{p.tool}</code></span>
                    </JXButton>
                  );
                })}

                <div className="f2-nav-section-label" style={{ marginTop: 6 }}>Preferences & Help</div>
                {(() => {
                  const idx = itemCursor++;
                  return (
                    <JXButton
                      fullWidth
                      variant={cmdSelectedIndex === idx ? "contained" : "text"}
                      onClick={() => {
                        toggleTheme();
                        setCmdOpen(false);
                      }}
                      startIcon={<FluentIcon name="theme" />}
                      endIcon={<span className="f2-kbd">Theme</span>}
                      style={{ justifyContent: "space-between", marginBottom: 3 }}
                    >
                      <span>Toggle Theme ({theme === "light" ? "Dark" : "Light"})</span>
                    </JXButton>
                  );
                })()}
                {(() => {
                  const idx = itemCursor++;
                  return (
                    <JXButton
                      fullWidth
                      variant={cmdSelectedIndex === idx ? "contained" : "text"}
                      onClick={() => {
                        setShowShortcutsModal(true);
                        setCmdOpen(false);
                      }}
                      startIcon={<FluentIcon name="shortcuts" />}
                      endIcon={<span className="f2-kbd">?</span>}
                      style={{ justifyContent: "space-between", marginBottom: 3 }}
                    >
                      <span>Keyboard Shortcuts & Hotkeys</span>
                    </JXButton>
                  );
                })()}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Fluent 2 Edit Record Modal */}
      {editModal && (
        <div className="f2-modal-backdrop" onClick={() => setEditModal(null)}>
          <div className="f2-modal" style={{ width: "100%", maxWidth: 480 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>
                Edit {editModal.kind === "oauth_client" ? "OAuth Client" : editModal.kind.charAt(0).toUpperCase() + editModal.kind.slice(1)} Record
              </h3>
              <JXButton size="sm" variant="soft" onClick={() => setEditModal(null)}>
                Close
              </JXButton>
            </div>

            <form
              onSubmit={async e => {
                e.preventDefault();
                try {
                  const d = editModal.data;
                  if (editModal.kind === "device") {
                    await api.updateDevice(d.id, {
                      name: d.name,
                      hostname: d.hostname,
                      os: d.os,
                      revoked: !!d.revoked,
                    });
                    setNotice({ intent: "success", text: `Updated device "${d.name}" (${d.id}).` });
                  } else if (editModal.kind === "task") {
                    let parsedArgs: any = {};
                    try {
                      parsedArgs = d.args_json?.trim() ? JSON.parse(d.args_json) : {};
                    } catch {
                      setErr("Task arguments must be valid JSON.");
                      return;
                    }
                    await api.updateTask(d.id, {
                      tool: d.tool,
                      args: parsedArgs,
                      status: d.status,
                    });
                    setNotice({ intent: "success", text: `Updated task ${d.id} (${d.tool} → ${d.status}).` });
                  } else if (editModal.kind === "policy") {
                    await api.updatePolicyVersion(d.version, {
                      allow_tier3: !!d.allow_tier3,
                      desktop_enabled: !!d.desktop_enabled,
                      allowed_apps: String(d.allowed_apps || "").split(",").map((s: string) => s.trim()).filter(Boolean),
                      allowed_services: String(d.allowed_services || "").split(",").map((s: string) => s.trim()).filter(Boolean),
                      note: d.note,
                    });
                    setNotice({ intent: "success", text: `Updated policy version v${d.version}.` });
                  } else if (editModal.kind === "oauth_client") {
                    await api.updateOAuthClient(d.client_id, {
                      client_name: d.client_name,
                      redirect_uris: d.redirect_uris,
                    });
                    setNotice({ intent: "success", text: `Updated OAuth client "${d.client_name}".` });
                  }
                  setEditModal(null);
                  await load();
                } catch (ex: any) {
                  setErr(`Update failed: ${ex.message}`);
                }
              }}
              style={{ display: "grid", gap: 12 }}
            >
              {editModal.kind === "device" && (
                <>
                  <div>
                    <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Device Name</label>
                    <JXTextField
                      value={editModal.data.name}
                      onChange={(val: any) => setEditModal({ ...editModal, data: { ...editModal.data, name: typeof val === "string" ? val : val?.target?.value || "" } })}
                      required
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Hostname</label>
                    <JXTextField
                      value={editModal.data.hostname}
                      onChange={(val: any) => setEditModal({ ...editModal, data: { ...editModal.data, hostname: typeof val === "string" ? val : val?.target?.value || "" } })}
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Operating System</label>
                    <JXTextField
                      value={editModal.data.os}
                      onChange={(val: any) => setEditModal({ ...editModal, data: { ...editModal.data, os: typeof val === "string" ? val : val?.target?.value || "" } })}
                    />
                  </div>
                  <JXSwitch
                    label="Revoked (uncheck to restore device access)"
                    checked={!!editModal.data.revoked}
                    onChange={(c: any) => setEditModal({ ...editModal, data: { ...editModal.data, revoked: Boolean(typeof c === "boolean" ? c : c?.target?.checked) } })}
                  />
                </>
              )}

              {editModal.kind === "task" && (
                <>
                  <div>
                    <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Tool</label>
                    <JXSelect
                      value={editModal.data.tool}
                      onChange={(val: any) => setEditModal({ ...editModal, data: { ...editModal.data, tool: typeof val === "string" ? val : val?.target?.value || "" } })}
                      options={TOOLS.map(t => ({ id: t, label: t }))}
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Arguments (JSON)</label>
                    <JXTextField
                      value={editModal.data.args_json}
                      onChange={(val: any) => setEditModal({ ...editModal, data: { ...editModal.data, args_json: typeof val === "string" ? val : val?.target?.value || "" } })}
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Status (set to "queued" to re-run)</label>
                    <JXSelect
                      value={editModal.data.status}
                      onChange={(val: any) => setEditModal({ ...editModal, data: { ...editModal.data, status: typeof val === "string" ? val : val?.target?.value || "" } })}
                      options={["queued", "running", "needs_approval", "completed", "failed", "cancelled"].map(s => ({ id: s, label: s }))}
                    />
                  </div>
                </>
              )}
              {editModal.kind === "policy" && (
                <>
                  <JXSwitch
                    label="Allow Tier-3 Operations Unattended"
                    checked={!!editModal.data.allow_tier3}
                    onChange={(c: any) => setEditModal({ ...editModal, data: { ...editModal.data, allow_tier3: Boolean(typeof c === "boolean" ? c : c?.target?.checked) } })}
                  />
                  <JXSwitch
                    label="Enable Desktop Automation & Vision"
                    checked={!!editModal.data.desktop_enabled}
                    onChange={(c: any) => setEditModal({ ...editModal, data: { ...editModal.data, desktop_enabled: Boolean(typeof c === "boolean" ? c : c?.target?.checked) } })}
                  />
                  <div>
                    <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Allowed Apps (comma-separated)</label>
                    <JXTextField
                      value={editModal.data.allowed_apps}
                      onChange={(val: any) => setEditModal({ ...editModal, data: { ...editModal.data, allowed_apps: typeof val === "string" ? val : val?.target?.value || "" } })}
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Allowed Services (comma-separated)</label>
                    <JXTextField
                      value={editModal.data.allowed_services}
                      onChange={(val: any) => setEditModal({ ...editModal, data: { ...editModal.data, allowed_services: typeof val === "string" ? val : val?.target?.value || "" } })}
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Version Note</label>
                    <JXTextField
                      value={editModal.data.note}
                      onChange={(val: any) => setEditModal({ ...editModal, data: { ...editModal.data, note: typeof val === "string" ? val : val?.target?.value || "" } })}
                    />
                  </div>
                </>
              )}

              {editModal.kind === "oauth_client" && (
                <>
                  <div>
                    <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Client Name</label>
                    <JXTextField
                      value={editModal.data.client_name}
                      onChange={(val: any) => setEditModal({ ...editModal, data: { ...editModal.data, client_name: typeof val === "string" ? val : val?.target?.value || "" } })}
                      required
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Redirect URIs</label>
                    <JXTextField
                      value={editModal.data.redirect_uris}
                      onChange={(val: any) => setEditModal({ ...editModal, data: { ...editModal.data, redirect_uris: typeof val === "string" ? val : val?.target?.value || "" } })}
                      required
                    />
                  </div>
                </>
              )}

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 6 }}>
                <JXButton variant="soft" onClick={() => setEditModal(null)}>
                  Cancel
                </JXButton>
                <JXButton type="submit" variant="contained">
                  Save Changes
                </JXButton>
              </div>
            </form>
          </div>
        </div>
      )}

      {devicePolicyModalId && (
        <div className="f2-modal-backdrop" onClick={() => setDevicePolicyModalId(null)}>
          <div
            className="f2-modal"
            style={{ maxWidth: 960, width: "100%", maxHeight: "90vh" }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 20 }}>🛡️</span>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>Device Abilities & Security Policy</h3>
              </div>
              <JXButton
                size="sm"
                variant="soft"
                onClick={() => setDevicePolicyModalId(null)}
                title="Close modal"
              >
                ✕
              </JXButton>
            </div>
            <Suspense fallback={<ViewLoadingSkeleton title="Loading Device Abilities & Security Policy…" />}>
              <DevicePolicyEditor
                deviceId={devicePolicyModalId}
                isModal={true}
                onClose={() => setDevicePolicyModalId(null)}
                onSaved={() => {
                  load();
                  setNotice({ intent: "success", text: "Device policy guardrails updated successfully." });
                }}
              />
            </Suspense>
          </div>
        </div>
      )}

      {/* Fluent 2 Keyboard Shortcuts Cheat Sheet Modal (?) */}
      {showShortcutsModal && (
        <div className="f2-modal-backdrop" onClick={() => setShowShortcutsModal(false)}>
          <div
            className="f2-modal"
            style={{ width: "100%", maxWidth: 620, padding: 24 }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 24 }}>⌨️</span>
                <div>
                  <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "var(--colorNeutralForeground1)" }}>
                    Keyboard Shortcuts & Navigation
                  </h3>
                  <div style={{ fontSize: 12, color: "var(--colorNeutralForeground3)", marginTop: 2 }}>
                    Speed up fleet administration and remote desktop orchestration
                  </div>
                </div>
              </div>
              <JXButton size="sm" variant="soft" onClick={() => setShowShortcutsModal(false)}>
                ✕ Close
              </JXButton>
            </div>

            <div style={{ display: "grid", gap: 14 }}>
              {[
                {
                  category: "Global & Navigation",
                  items: [
                    { keys: ["Ctrl", "K"], desc: "Open Command Palette & Global Search" },
                    { keys: ["?"], desc: "Toggle this Keyboard Shortcuts cheat sheet" },
                    { keys: ["Esc"], desc: "Close any active modal, drawer, or lightbox" },
                  ],
                },
                {
                  category: "Fleet Studios & Dispatch",
                  items: [
                    { keys: ["Ctrl", "Enter"], desc: "Submit current task dispatch or Copilot message" },
                    { keys: ["Click Node"], desc: "Open real-time interactive take-control session" },
                    { keys: ["Alt", "Shift", "T"], desc: "Quick-toggle Terminal Studio" },
                  ],
                },
                {
                  category: "Accessibility & Interface",
                  items: [
                    { keys: ["Tab"], desc: "Accessible focus navigation across buttons and inputs" },
                    { keys: ["Shift", "Tab"], desc: "Focus previous interactive element" },
                    { keys: ["Horizontal Scroll"], desc: "Inspect wide tables with sticky pinned action columns" },
                  ],
                },
              ].map(section => (
                <div key={section.category} style={{ border: "1px solid var(--colorNeutralStroke2)", borderRadius: 8, padding: "12px 16px", background: "var(--colorNeutralBackground2)" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--colorNeutralForeground3)", marginBottom: 8 }}>
                    {section.category}
                  </div>
                  <div style={{ display: "grid", gap: 8 }}>
                    {section.items.map((item, idx) => (
                      <div key={idx} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13 }}>
                        <span style={{ color: "var(--colorNeutralForeground1)" }}>{item.desc}</span>
                        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                          {item.keys.map((k, kIdx) => (
                            <kbd
                              key={kIdx}
                              style={{
                                display: "inline-block",
                                padding: "2px 6px",
                                fontSize: 11,
                                fontFamily: "var(--f2-font-mono, monospace)",
                                fontWeight: 600,
                                color: "var(--colorNeutralForeground1)",
                                background: "var(--colorNeutralBackground1)",
                                border: "1px solid var(--colorNeutralStroke1)",
                                borderRadius: 4,
                                boxShadow: "0 1px 2px rgba(0,0,0,0.1)",
                              }}
                            >
                              {k}
                            </kbd>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div style={{ marginTop: 20, textAlign: "right" }}>
              <JXButton variant="contained" size="sm" onClick={() => setShowShortcutsModal(false)}>
                Got it
              </JXButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
