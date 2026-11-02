import { Fragment, useEffect, useState, useRef, type MouseEvent as ReactMouseEvent } from "react";
import {
  JXCard,
  JXButton,
  JXSwitch,
  JXChip,
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
} from "@jacxishippingorg/jx-ui-react";
import { api, token, sessionToken } from "./api";
import { DevicePolicyEditor } from "./DevicePolicyEditor";
import { DeviceDetailDashboard } from "./DeviceDetailDashboard";
import { AiApiHub } from "./AiApiHub";
import { WorkflowPlanner } from "./WorkflowPlanner";
import { FleetOperations } from "./FleetOperations";
import { LiveDesktopStudio } from "./LiveDesktopStudio";
import { TerminalStudio } from "./TerminalStudio";
import { ConfirmDialog, type ConfirmRequest } from "./ConfirmDialog";
import { Pager } from "./Pager";

type View = "overview" | "devices" | "device_detail" | "tasks" | "approvals" | "audit" | "policies" | "connections" | "ai_api" | "workflows" | "fleet_ops" | "live_studio" | "terminal" | "logs";
type Theme = "light" | "dark";

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
    default:
      return null;
  }
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
  return (
    <div className="f2-bar-row">
      <span style={{ width: 140, color: "var(--colorNeutralForeground2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={label}>
        {label}
      </span>
      <div className="f2-bar-track">
        <div className="f2-bar-fill" style={{ width: `${pct}%` }} />
      </div>
      <span style={{ width: 42, textAlign: "right", fontWeight: 600 }}>{value}</span>
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
  const { pushToast, accent, setAccent, toggleMode } = useJXTheme();
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
  const [authTab, setAuthTab] = useState<"token" | "user">("token");
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
  const [taskQuery, setTaskQuery] = useState("");
  const [taskSort, setTaskSort] = useState<"newest" | "oldest" | "tool">("newest");
  const [taskPage, setTaskPage] = useState(0);
  const [auditSort, setAuditSort] = useState<"newest" | "oldest">("newest");
  const [auditPage, setAuditPage] = useState(0);
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<{ src: string; title: string } | null>(null);
  const [auditQuery, setAuditQuery] = useState("");
  const [auditTool, setAuditTool] = useState("all");
  const [logService, setLogService] = useState("control");
  const [logCount, setLogCount] = useState(100);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [cmdQuery, setCmdQuery] = useState("");
  const [cmdSelectedIndex, setCmdSelectedIndex] = useState(0);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
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
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCmdOpen(prev => !prev);
        setCmdQuery("");
      } else if (e.key === "Escape") {
        setCmdOpen(false);
        setLightbox(null);
        setEditModal(null);
        setDevicePolicyModalId(null);
        setEmergencyArmed(false);
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
      <div className="f2-shell" style={{ justifyContent: "center", alignItems: "center", padding: 24 }}>
        <div className="f2-card" style={{ width: "100%", maxWidth: 440, padding: 28, boxShadow: "var(--shadow16)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div className="f2-brand">
              <span className="f2-brand-logo">
                <FluentIcon name="approvals" />
              </span>
              <span>AI Bridge Control Plane</span>
            </div>
            <JXButton
              size="sm"
              variant="soft"
              onClick={() => setTheme(theme === "light" ? "dark" : "light")}
              title="Toggle Light / Dark theme"
              startIcon={<FluentIcon name="theme" />}
            >
              {theme === "light" ? "Dark" : "Light"}
            </JXButton>
          </div>

          <h1 style={{ margin: "0 0 6px", fontSize: 22, fontWeight: 600 }}>Sign in to your fleet</h1>
          <p style={{ margin: "0 0 20px", fontSize: 13, color: "var(--colorNeutralForeground3)" }}>
            Policy-governed MCP gateway & remote device orchestration.
          </p>

          {oidcEnabled && (
            <div style={{ marginBottom: 18 }}>
              <JXButton
                fullWidth
                variant="contained"
                onClick={() => api.oidcLogin()}
                startIcon={<FluentIcon name="connections" />}
              >
                Continue with Google Single Sign-On
              </JXButton>
              <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "16px 0 0", color: "var(--colorNeutralForeground3)", fontSize: 12 }}>
                <div style={{ flex: 1, height: 1, background: "var(--colorNeutralStroke2)" }} />
                <span>or use direct credentials</span>
                <div style={{ flex: 1, height: 1, background: "var(--colorNeutralStroke2)" }} />
              </div>
            </div>
          )}

          <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
            <JXButton
              size="sm"
              variant={authTab === "token" ? "contained" : "soft"}
              onClick={() => setAuthTab("token")}
            >
              Admin Token
            </JXButton>
            <JXButton
              size="sm"
              variant={authTab === "user" ? "contained" : "soft"}
              onClick={() => setAuthTab("user")}
            >
              Username & Password
            </JXButton>
          </div>

          {authTab === "token" ? (
            <form
              onSubmit={async e => {
                e.preventDefault();
                const v = (e.target as any).t.value.trim();
                if (!v) return;
                setErr("");
                localStorage.setItem("ai_bridge_admin_token", v);
                try {
                  const m = await api.me();
                  setMe(m);
                  setTok(v);
                } catch {
                  localStorage.removeItem("ai_bridge_admin_token");
                  setErr("Invalid administrator token.");
                }
              }}
              style={{ display: "grid", gap: 12 }}
            >
              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4, color: "var(--colorNeutralForeground2)" }}>
                  Administrator Token (<code>AI_BRIDGE_ADMIN_TOKEN</code>)
                </label>
                <JXTextField name="t" type="password" placeholder="Paste your admin token…" required aria-label="Administrator token" autoComplete="current-password" />
              </div>
              <JXButton type="submit" fullWidth variant="contained">
                Sign in with Admin Token
              </JXButton>
            </form>
          ) : (
            <form
              onSubmit={async e => {
                e.preventDefault();
                const f = e.target as any;
                try {
                  const s = await api.login(f.u.value, f.p.value);
                  localStorage.setItem("ai_bridge_session_token", s.session_token);
                  setTok("session");
                } catch {
                  setErr("Invalid username or password.");
                }
              }}
              style={{ display: "grid", gap: 10 }}
            >
              <JXTextField name="u" placeholder="Username" required aria-label="Username" autoComplete="username" />
              <JXTextField name="p" type="password" placeholder="Password" required aria-label="Password" autoComplete="current-password" />
              <JXButton type="submit" fullWidth variant="contained">
                Sign in as User
              </JXButton>
            </form>
          )}

          {err && (
            <div className="f2-messagebar" data-intent="error" style={{ marginTop: 14, marginBottom: 0 }}>
              <span>{err}</span>
            </div>
          )}

          <p style={{ margin: "18px 0 0", fontSize: 12, color: "var(--colorNeutralForeground3)", lineHeight: 1.5 }}>
            Credentials are stored locally in your browser session. Never share device tokens in untrusted chats.
          </p>
        </div>
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
            onClick={() => setMobileNavOpen(prev => !prev)}
            aria-label="Toggle navigation menu"
            title="Toggle navigation"
          >
            <FluentIcon name={mobileNavOpen ? "cancel" : "more"} />
          </button>

          <div className="f2-brand" onClick={() => { setView("overview"); setMobileNavOpen(false); }}>
            <span className="f2-brand-logo" title="AI Bridge Control Plane">
              <FluentIcon name="approvals" />
            </span>
            <div className="f2-brand-text">
              <span className="f2-brand-title">
                AI Bridge <span className="f2-brand-badge">PRO</span>
              </span>
            </div>
          </div>

          <div
            className="f2-status-pill"
            onClick={() => setView("devices")}
            title={health?.emergency_stop ? "Emergency Stop is Active" : `${online.length} of ${devices.length} devices online (click to view)`}
            style={{ cursor: "pointer" }}
          >
            <span className={`f2-status-dot ${health?.emergency_stop ? "danger" : "online"}`} />
            <span>{health?.emergency_stop ? "STOPPED" : `${online.length}/${devices.length} Online`}</span>
          </div>
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
            className="f2-icon-action-btn"
            onClick={() => load()}
            disabled={loading}
            title={lastUpdated ? `Updated ${new Date(lastUpdated).toLocaleTimeString()} (Click to refresh)` : "Refresh fleet"}
          >
            <span className={loading ? "f2-spin" : ""}>↻</span>
          </button>

          <button
            type="button"
            className="f2-icon-action-btn"
            onClick={() => {
              const next = theme === "light" ? "dark" : "light";
              setTheme(next);
              if (toggleMode) toggleMode();
            }}
            title={`Switch to ${theme === "light" ? "Dark" : "Light"} Mode`}
          >
            {theme === "light" ? "🌙" : "☀️"}
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

        <nav className={`f2-nav${mobileNavOpen ? " f2-nav-open" : ""}`} aria-label="Main Navigation">

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
          <div className="f2-page-header">
            <div>
              <div className="f2-breadcrumb" style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", fontSize: 13, marginBottom: 8 }}>
                <span className="f2-breadcrumb-link" style={{ cursor: "pointer", color: "var(--jx-primary)", fontWeight: 500 }} onClick={() => setView("overview")}>AI Bridge</span>
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
                className="f2-btn f2-btn-subtle"
                title="Copy a link to this exact view"
                onClick={async () => {
                  try {
                    await navigator.clipboard?.writeText(window.location.href);
                    setNotice({ intent: "success", text: "Link copied to clipboard." });
                  } catch {
                    setErr("Could not copy the link. Copy it from the address bar instead.");
                  }
                }}
              >
                🔗 Copy link
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

          {/* ==================== OVERVIEW ==================== */}
          {view === "overview" && (
            <div style={{ display: "grid", gap: 16 }}>
              <div className="f2-kpi-grid">
                <div onClick={() => setView("devices")} className="cursor-pointer" style={{ outline: "none" }}>
                  <JXCard spotlight hoverLift className="f2-kpi-card">
                    <div className="f2-kpi-top">
                      <span>ONLINE DEVICES</span>
                      <span className="f2-kpi-icon"><FluentIcon name="devices" /></span>
                    </div>
                    <div className="f2-kpi-value">{online.length} <span style={{ fontSize: 16, color: "var(--jx-text-tertiary)", fontWeight: 400 }}>/ {devices.length}</span></div>
                    <div className="f2-kpi-meta" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#10b981", boxShadow: "0 0 8px #10b981" }} />
                      <span>Active outbound-polling agents</span>
                    </div>
                  </JXCard>
                </div>

                <div onClick={() => setView("tasks")} className="cursor-pointer" style={{ outline: "none" }}>
                  <JXCard spotlight hoverLift className="f2-kpi-card">
                    <div className="f2-kpi-top">
                      <span>TOTAL TASKS</span>
                      <span className="f2-kpi-icon"><FluentIcon name="tasks" /></span>
                    </div>
                    <div className="f2-kpi-value">{tasks.length}</div>
                    <div className="f2-kpi-meta">
                      {taskByStatus["completed"] || 0} completed · {taskByStatus["queued"] || 0} queued · {taskByStatus["failed"] || 0} failed
                    </div>
                  </JXCard>
                </div>

                <div onClick={() => setView("approvals")} className="cursor-pointer" style={{ outline: "none" }}>
                  <JXCard spotlight hoverLift className="f2-kpi-card">
                    <div className="f2-kpi-top">
                      <span>PENDING APPROVALS</span>
                      <span className="f2-kpi-icon"><FluentIcon name="approvals" /></span>
                    </div>
                    <div className="f2-kpi-value" style={{ color: pending.length > 0 ? "var(--jx-rose)" : undefined }}>
                      {pending.length}
                    </div>
                    <div className="f2-kpi-meta">Awaiting administrator decision</div>
                  </JXCard>
                </div>

                <div onClick={() => setView("audit")} className="cursor-pointer" style={{ outline: "none" }}>
                  <JXCard spotlight hoverLift className="f2-kpi-card">
                    <div className="f2-kpi-top">
                      <span>AUDIT EVENTS (24H)</span>
                      <span className="f2-kpi-icon"><FluentIcon name="audit" /></span>
                    </div>
                    <div className="f2-kpi-value">{audit24h}</div>
                    <div className="f2-kpi-meta">Recorded security & tool actions</div>
                  </JXCard>
                </div>

                <div onClick={() => setView("connections")} className="cursor-pointer" style={{ outline: "none" }}>
                  <JXCard spotlight hoverLift className="f2-kpi-card">
                    <div className="f2-kpi-top">
                      <span>MCP & OAUTH GATEWAY</span>
                      <span className="f2-kpi-icon"><FluentIcon name="connections" /></span>
                    </div>
                    <div className="f2-kpi-value" style={{ fontSize: 20 }}>
                      {connections ? (connections.mcp.up ? "Connected" : "MCP Offline") : "Loading…"}
                    </div>
                    <div className="f2-kpi-meta">
                      {connections ? `${connections.chatgpt.clients.length} OAuth client(s) · ${connections.chatgpt.active_access_tokens} active token(s)` : "Checking ports…"}
                    </div>
                  </JXCard>
                </div>
              </div>

              {/* JXUI Tactile Command Strip */}
              <div className="f2-command-strip" style={{
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
                marginBottom: 24,
              }}>
                <span style={{ fontSize: 11.5, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--jx-text-tertiary)" }}>
                  ⚡ Quick Dispatch:
                </span>
                <MagneticButton strength={12} variant="soft" tone="primary" style={{ padding: "6px 12px", fontSize: 12 }} onClick={() => { setView("tasks"); setTaskTool("run_shell"); setTaskArgs('{"command": "uptime && free -h"}'); }} title="Dispatch shell diagnostics task"><FluentIcon name="terminal" /><span>Fleet Uptime & RAM</span></MagneticButton>
                <MagneticButton strength={12} variant="soft" tone="primary" style={{ padding: "6px 12px", fontSize: 12 }} onClick={() => { setView("tasks"); setTaskTool("capture_desktop_screenshot"); setTaskArgs("{}"); }} title="Capture live screenshot"><FluentIcon name="live_studio" /><span>Desktop Vision Inspector</span></MagneticButton>
                <MagneticButton strength={12} variant="soft" tone="primary" style={{ padding: "6px 12px", fontSize: 12 }} onClick={() => setView("ai_api")} title="Jump to AI API hub"><FluentIcon name="ai_api" /><span>AI Copilot & Hub</span></MagneticButton>
                <MagneticButton strength={12} variant="soft" tone="primary" style={{ padding: "6px 12px", fontSize: 12 }} onClick={() => setView("fleet_ops")} title="Jump to Fleet Operations"><FluentIcon name="fleet_ops" /><span>Self-Healing Triggers</span></MagneticButton>
                <MagneticButton strength={12} variant="soft" tone="primary" style={{ padding: "6px 12px", fontSize: 12 }} onClick={() => setView("live_studio")} title="Jump to Live Desktop Studio"><FluentIcon name="live_studio" /><span>Live Studio Stream</span></MagneticButton>
              </div>

              {pending.length > 0 && (
                <Card
                  title={`⚠️ Pending Approvals Requiring Action (${pending.length})`}
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

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16 }}>
                <Card title="Tasks by Status">
                  {Object.entries(taskByStatus).map(([k, v]) => <Bar key={k} label={k} value={v} max={maxTask} />)}
                  {Object.keys(taskByStatus).length === 0 && <p style={{ color: "var(--colorNeutralForeground3)", fontSize: 13 }}>No tasks recorded yet.</p>}
                </Card>

                <Card title="Audit Decisions">
                  {Object.entries(auditByDecision).map(([k, v]) => (
                    <Bar key={k} label={k} value={v} max={Math.max(1, ...Object.values(auditByDecision))} />
                  ))}
                  {Object.keys(auditByDecision).length === 0 && <p style={{ color: "var(--colorNeutralForeground3)", fontSize: 13 }}>No audit decisions yet.</p>}
                </Card>

                <Card title="Top Invoked Tools">
                  {topTools.map(([k, v]) => <Bar key={k} label={k} value={v} max={topTools[0]?.[1] || 1} />)}
                  {topTools.length === 0 && <p style={{ color: "var(--colorNeutralForeground3)", fontSize: 13 }}>No tool telemetry yet.</p>}
                </Card>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(400px, 1fr))", gap: 16 }}>
                <Card
                  title="Enrolled Fleet Status"
                  action={<JXButton size="sm" variant="soft" onClick={() => setView("devices")}>Manage devices →</JXButton>}
                >
                  {devices.filter(d => !d.revoked).map(d => (
                    <div key={d.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--colorNeutralStroke3)", fontSize: 13 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <Badge value={d.status} />
                        <div>
                          <b>{d.name}</b> <code style={{ fontSize: 11, color: "var(--colorNeutralForeground3)" }}>{String(d.id).slice(0, 8)}</code>
                          <div style={{ fontSize: 12, color: "var(--colorNeutralForeground3)" }}>{d.hostname || "—"} · {d.os || "OS unknown"}</div>
                        </div>
                      </div>
                      <span style={{ fontSize: 12, color: "var(--colorNeutralForeground3)" }}>seen {rel(d.last_seen)}</span>
                    </div>
                  ))}
                  {devices.length === 0 && <p style={{ color: "var(--colorNeutralForeground3)", fontSize: 13 }}>No devices enrolled yet.</p>}
                </Card>

                <Card
                  title="Recent Audit Stream"
                  action={<JXButton size="sm" variant="soft" onClick={() => setView("audit")}>Full audit log →</JXButton>}
                >
                  {audit.slice(0, 8).map(a => (
                    <div key={a.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px solid var(--colorNeutralStroke3)", fontSize: 13 }}>
                      <div>
                        <b>{a.tool}</b> <span style={{ color: "var(--colorNeutralForeground3)" }}>by {a.actor || "system"}</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <Badge value={a.decision || "?"} />
                        <span style={{ fontSize: 12, color: "var(--colorNeutralForeground3)", minWidth: 58, textAlign: "right" }}>{rel(a.ts)}</span>
                      </div>
                    </div>
                  ))}
                  {audit.length === 0 && <p style={{ color: "var(--colorNeutralForeground3)", fontSize: 13 }}>No audit events yet.</p>}
                </Card>
              </div>
            </div>
          )}

          {/* ==================== DEVICES ==================== */}
          {view === "devices" && (
            <div style={{ display: "grid", gap: 16 }}>
              {(me?.role === "admin" || !me) ? (
                <Card title="Enroll a New Device">
                  <form
                    onSubmit={async e => {
                      e.preventDefault();
                      try {
                        const res = await api.enroll(deviceName);
                        setEnrolled(res);
                        setDeviceName("");
                        setNotice({ intent: "success", text: `Enrolled device "${res.device_id}". Copy its one-time token below.` });
                        load();
                      } catch (ex: any) {
                        setErr(`Enroll failed: ${ex.message}`);
                      }
                    }}
                    style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}
                  >
                    <div style={{ flex: 1, minWidth: 280 }}>
                      <JXTextField
                        value={deviceName}
                        onChange={(val: any) => setDeviceName(typeof val === "string" ? val : val?.target?.value || "")}
                        placeholder="Device friendly name (e.g. windows-workstation)"
                        required
                      />
                    </div>
                    <JXButton type="submit" variant="contained">
                      Enroll Device
                    </JXButton>
                  </form>

                  {enrolled && (
                    <div className="f2-messagebar" data-intent="info" style={{ marginTop: 14, marginBottom: 0, display: "block" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                        <span style={{ fontWeight: 600 }}>One-Time Device Token (copy and store securely — never shown again):</span>
                        <CopyButton text={enrolled.device_token} label="Copy Token" />
                      </div>
                      <code style={{ display: "block", padding: 8, background: "var(--colorNeutralBackground1)", borderRadius: 4, userSelect: "all", wordBreak: "break-all" }}>
                        {enrolled.device_token}
                      </code>
                      <div style={{ marginTop: 6, fontSize: 12, display: "flex", alignItems: "center", gap: 8 }}>
                        <span>Device ID: <code>{enrolled.device_id}</code></span>
                        <CopyButton text={enrolled.device_id} label="Copy ID" />
                        <span>· Use this token in your agent config and when authorizing MCP OAuth clients.</span>
                      </div>
                    </div>
                  )}
                </Card>
              ) : (
                <Card title="Device Enrollment (Admin Only)">
                  <div className="f2-messagebar" data-intent="info" style={{ marginBottom: 0 }}>
                    <span>
                      Enrolling new fleet machines is restricted to administrators. Your current session role is <b>{me.role}</b>.
                      To enroll a machine, request an administrator to issue a device token.
                    </span>
                  </div>
                </Card>
              )}

              <Card title={`Fleet Inventory (${searchedDevices.length} of ${devices.length})`}>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
                  <div style={{ flex: 1, minWidth: 240 }}>
                    <JXTextField
                      value={deviceQuery}
                      onChange={(val: any) => { setDeviceQuery(typeof val === "string" ? val : val?.target?.value || ""); setDevicePage(0); }}
                      placeholder="Search by name, hostname, OS, or ID…"
                    />
                  </div>
                  <div style={{ minWidth: 180 }}>
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
                <div className="f2-table-wrap">
                  <table className="f2-table">
                    <thead>
                      <tr>
                        <th>Device Name & ID</th>
                        <th>Host, OS & Capabilities</th>
                        <th>Status</th>
                        <th>Guardrails & Abilities</th>
                        <th>Last Heartbeat</th>
                        <th>Token Expiry</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pagedDevices.map(d => {
                        const expSoon = d.token_expires_at && Date.now() / 1000 > d.token_expires_at - 86400;
                        const tags: string[] = Array.isArray(d.tags) ? d.tags : [];
                        const caps: string[] = Array.isArray(d.capabilities) ? d.capabilities : [];
                        return (
                          <tr key={d.id}>
                            <td>
                              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <JXButton
                                  size="sm"
                                  variant="text"
                                  onClick={() => {
                                    setSelectedDeviceIdForDashboard(d.id);
                                    setView("device_detail");
                                  }}
                                  title={`Open full system dashboard for ${d.name}`}
                                  startIcon={<span>🖥️</span>}
                                >
                                  {d.name}
                                </JXButton>
                              </div>
                              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
                                <code style={{ fontSize: 11, color: "var(--colorNeutralForeground3)" }}>{d.id}</code>
                                <CopyButton text={String(d.id)} label="Copy" />
                              </div>
                            </td>
                            <td>
                              {d.hostname || "—"}
                              <div style={{ fontSize: 12, color: "var(--colorNeutralForeground3)" }}>{d.os || ""}</div>
                              {(tags.length > 0 || caps.length > 0) && (
                                <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 4 }}>
                                  {tags.map(t => (
                                    <span key={`t-${t}`} className="f2-badge" data-tone="blue" style={{ fontSize: 11, padding: "1px 6px" }}>
                                      tag:{t}
                                    </span>
                                  ))}
                                  {caps.slice(0, 4).map(c => (
                                    <span key={`c-${c}`} className="f2-badge" data-tone="grey" style={{ fontSize: 11, padding: "1px 6px" }}>
                                      {c}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </td>
                            <td><Badge value={d.revoked ? "revoked" : d.status} /></td>
                            <td>
                              {d.has_custom_policy ? (
                                <JXButton
                                  size="sm"
                                  variant="soft"
                                  color="warning"
                                  onClick={() => setDevicePolicyModalId(d.id)}
                                  title="Custom device abilities configured. Click to view & edit."
                                >
                                  🛡️ Custom ({d.policy?.denied_tools?.length ? `${d.policy.denied_tools.length} blocked` : "Active"})
                                </JXButton>
                              ) : (
                                <JXButton
                                  size="sm"
                                  variant="soft"
                                  onClick={() => setDevicePolicyModalId(d.id)}
                                  title="Inheriting global server security policy. Click to customize."
                                >
                                  🌐 Global Default
                                </JXButton>
                              )}
                            </td>
                            <td>
                              {rel(d.last_seen)}
                              <div style={{ fontSize: 11, color: "var(--colorNeutralForeground3)" }}>{fmt(d.last_seen)}</div>
                            </td>
                            <td style={{ color: expSoon ? "var(--colorStatusDangerForeground1)" : undefined }}>
                              {d.token_expires_at ? rel(d.token_expires_at) : "—"}
                            </td>
                            <td>
                              <TableRowActions
                                actions={[
                                  {
                                    id: "dashboard",
                                    label: "Device Dashboard",
                                    title: `Open full system dashboard for "${d.name}"`,
                                    icon: "dashboard",
                                    tone: "primary",
                                    onClick: () => {
                                      setSelectedDeviceIdForDashboard(d.id);
                                      setView("device_detail");
                                    },
                                  },
                                  !d.revoked && {
                                    id: "dispatch",
                                    label: "Dispatch Task",
                                    title: "Dispatch task to this device",
                                    icon: "dispatch",
                                    tone: "primary",
                                    onClick: () => {
                                      setTaskDevice(d.id);
                                      setView("tasks");
                                    },
                                  },
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
                                    title: `Revoke token for device "${d.name}"`,
                                    icon: "revoke",
                                    danger: true,
                                    onClick: () => {
                                      setConfirmReq({
                                        title: `Revoke device "${d.name}"?`,
                                        message: `This revokes the device token for ${d.name} (${d.id}). The agent will stop connecting until it is re-enrolled. This cannot be undone from here.`,
                                        confirmLabel: "Revoke device",
                                        danger: true,
                                        onConfirm: async () => {
                                          try {
                                            await api.revoke(d.id);
                                            setNotice({ intent: "warning", text: `Revoked device ${d.name}.` });
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
                                    title: `Permanently delete device "${d.name}"`,
                                    icon: "delete",
                                    danger: true,
                                    onClick: () => {
                                      setConfirmReq({
                                        title: `Permanently delete device "${d.name}"?`,
                                        message: `This removes ${d.name} (${d.id}) and its record from the control plane. The agent on that machine will no longer be managed. This cannot be undone.`,
                                        confirmLabel: "Delete permanently",
                                        danger: true,
                                        onConfirm: async () => {
                                          try {
                                            await api.deleteDevice(d.id);
                                            setNotice({ intent: "warning", text: `Deleted device ${d.name} (${d.id}).` });
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
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              <Pager total={searchedDevices.length} page={devicePage} pageSize={20} onPage={setDevicePage} />
              </Card>
            </div>
          )}

          {/* ==================== DEVICE 360 SYSTEM DASHBOARD ==================== */}
          {view === "device_detail" && (
            selectedDeviceIdForDashboard ? (
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

          {/* ==================== TASKS ==================== */}
          {view === "tasks" && (
            <div style={{ display: "grid", gap: 16 }}>
              <Card title="Dispatch Tool Task">
                <div style={{ marginBottom: 12, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "var(--colorNeutralForeground3)", marginRight: 4 }}>Quick Presets:</span>
                  {TASK_PRESETS.map(p => (
                    <JXButton
                      key={p.label}
                      size="sm"
                      variant={taskTool === p.tool && taskArgs === p.args ? "contained" : "soft"}
                      onClick={() => {
                        setTaskTool(p.tool);
                        setTaskArgs(p.args);
                      }}
                    >
                      {p.label}
                    </JXButton>
                  ))}
                </div>

                <form
                  onSubmit={async e => {
                    e.preventDefault();
                    try {
                      let args: any = {};
                      if (taskArgs.trim()) {
                        try {
                          args = JSON.parse(taskArgs);
                        } catch {
                          setErr('Arguments must be valid JSON, e.g. {"action": "list_windows"}');
                          return;
                        }
                      }
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
                  }}
                  style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}
                >
                  <div style={{ minWidth: 200 }}>
                    <JXSelect
                      value={taskDevice}
                      onChange={(val: any) => setTaskDevice(typeof val === "string" ? val : val?.target?.value || "")}
                      options={[
                        { id: "", label: "Select target device…" },
                        ...devices.filter(d => !d.revoked).map(d => ({ id: d.id, label: `${d.name} (${d.status})` }))
                      ]}
                    />
                  </div>

                  <div style={{ minWidth: 160 }}>
                    <JXSelect
                      value={taskTool}
                      onChange={(val: any) => setTaskTool(typeof val === "string" ? val : val?.target?.value || "")}
                      options={TOOLS.map(t => ({ id: t, label: t }))}
                    />
                  </div>

                  <div style={{ flex: 1, minWidth: 260 }}>
                    <JXTextField
                      value={taskArgs}
                      onChange={(val: any) => setTaskArgs(typeof val === "string" ? val : val?.target?.value || "")}
                      placeholder='JSON arguments, e.g. {"action": "list_windows"}'
                    />
                  </div>

                  <JXButton type="submit" variant="contained">
                    Run Task
                  </JXButton>
                </form>
              </Card>

              <Card
                title={`Task Queue (${filteredTasks.length})`}
                action={
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                    {["all", "queued", "running", "needs_approval", "completed", "failed", "cancelled"].map(s => (
                      <JXButton
                        key={s}
                        size="sm"
                        variant={taskStatus === s ? "contained" : "soft"}
                        onClick={() => { setTaskStatus(s); setTaskPage(0); }}
                      >
                        {s}
                      </JXButton>
                    ))}
                    <JXButton
                      size="sm"
                      variant="soft"
                      color="error"
                      onClick={() => {
                        setConfirmReq({
                          title: `Clear ${taskStatus === "all" ? "finished" : taskStatus} tasks?`,
                          message: taskStatus === "all"
                            ? "This deletes all finished task records (completed, failed and cancelled). Running and queued tasks are kept. This cannot be undone."
                            : `This deletes all ${taskStatus} task records. This cannot be undone.`,
                          confirmLabel: "Clear tasks",
                          danger: true,
                          onConfirm: async () => {
                            try {
                              const r = await api.clearTasks(taskStatus);
                              setNotice({ intent: "info", text: `Deleted ${r.deleted_count} task record(s).` });
                              load();
                            } catch (ex: any) {
                              setErr(`Clear tasks failed: ${ex.message}`);
                            }
                          },
                        });
                      }}
                    >
                      Clear {taskStatus === "all" ? "Finished" : taskStatus}
                    </JXButton>
                  </div>
                }
              >
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
                  <div style={{ flex: 1, minWidth: 240 }}>
                    <JXTextField
                      value={taskQuery}
                      onChange={(val: any) => { setTaskQuery(typeof val === "string" ? val : val?.target?.value || ""); setTaskPage(0); }}
                      placeholder="Search by task ID, tool, device, or status…"
                    />
                  </div>
                  <div style={{ minWidth: 180 }}>
                    <JXSelect
                      value={taskSort}
                      onChange={(val: any) => { setTaskSort((typeof val === "string" ? val : val?.target?.value) as any); setTaskPage(0); }}
                      options={[
                        { id: "newest", label: "Sort: Newest first" },
                        { id: "oldest", label: "Sort: Oldest first" },
                        { id: "tool", label: "Sort: Tool A–Z" },
                      ]}
                    />
                  </div>
                </div>
                <div className="f2-table-wrap">
                  <table className="f2-table">
                    <thead>
                      <tr>
                        <th>Task ID</th>
                        <th>Device</th>
                        <th>Tool</th>
                        <th>Risk Tier</th>
                        <th>Status</th>
                        <th>Submitted</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pagedTasks.map(t => {
                        const isOpen = expandedTaskId === t.id;
                        const info = isOpen ? parseTaskResult(t.result || "") : null;
                        return (
                          <Fragment key={t.id}>
                            <tr data-expanded={String(isOpen)}>
                              <td><code>{String(t.id).slice(0, 8)}</code></td>
                              <td><b>{deviceNameOf(t.device_id)}</b></td>
                              <td><code>{t.tool}</code></td>
                              <td><Badge value={`Tier ${t.tier ?? "?"}`} tone={t.tier >= 4 ? "red" : t.tier === 3 ? "amber" : "blue"} /></td>
                              <td><Badge value={t.status} /></td>
                              <td>{rel(t.created_at)}</td>
                              <td>
                                <TableRowActions
                                  actions={[
                                    t.status === "needs_approval" && {
                                      id: "approve",
                                      label: "Approve Task",
                                      title: "Approve execution and release task immediately",
                                      icon: "approve",
                                      tone: "success",
                                      onClick: async () => {
                                        const idToDecide = t.approval_id || approvals.find(a => a.task_id === t.id)?.id;
                                        if (!idToDecide) {
                                          setErr("Could not locate approval record ID for this task. Refresh the task list and try again.");
                                          return;
                                        }
                                        try {
                                          await api.decide(idToDecide, "approved");
                                          setNotice({ intent: "success", text: `Approved task ${t.id} (${t.tool}). Released to agent.` });
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
                                          setErr("Could not locate approval record ID for this task. Refresh the task list and try again.");
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
                                      id: "inspect",
                                      label: isOpen ? "Hide Details" : "Inspect Task",
                                      title: isOpen ? "Hide task details and vision" : "Inspect task output and vision telemetry",
                                      icon: "inspect",
                                      tone: isOpen ? "primary" : "subtle",
                                      onClick: () => setExpandedTaskId(isOpen ? null : t.id),
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
                                      title: "Cancel this active or queued task",
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
                                          message: `This deletes the record for task ${t.id} (${t.tool}). It does not stop a task that is already running on a device. This cannot be undone.`,
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
                              </td>
                            </tr>
                            {isOpen && info && (
                              <tr>
                                <td colSpan={7} style={{ background: "var(--colorNeutralBackground2)", padding: 16 }}>
                                  {t.status === "needs_approval" && (
                                    <div
                                      style={{
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "space-between",
                                        padding: "12px 16px",
                                        borderRadius: "var(--borderRadiusMedium)",
                                        border: "1px solid var(--colorPaletteAmberBorder1)",
                                        background: "var(--colorPaletteAmberBackground1)",
                                        marginBottom: 12,
                                        gap: 12,
                                        flexWrap: "wrap",
                                      }}
                                    >
                                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                        <span style={{ fontSize: 20 }}>⚠️</span>
                                        <div>
                                          <div style={{ fontWeight: 700, fontSize: 13, color: "var(--colorPaletteAmberForeground1)" }}>
                                            Action Required: This task is paused waiting for human approval.
                                          </div>
                                          <div style={{ fontSize: 12, color: "var(--colorNeutralForeground2)" }}>
                                            Tool: <code>{t.tool}</code> (Tier {t.tier}) · Approval ID: <code>{t.approval_id || "pending"}</code>
                                          </div>
                                        </div>
                                      </div>
                                      <div style={{ display: "flex", gap: 8 }}>
                                        <JXButton
                                          size="sm"
                                          variant="contained"
                                          color="success"
                                          onClick={async () => {
                                            const apId = t.approval_id || approvals.find(a => a.task_id === t.id)?.id;
                                            if (!apId) { setErr("Could not find approval record ID for this task. Refresh the task list and try again."); return; }
                                            try {
                                              await api.decide(apId, "approved");
                                              setNotice({ intent: "success", text: `Approved task ${t.id} (${t.tool}). Released to agent.` });
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
                                            const apId = t.approval_id || approvals.find(a => a.task_id === t.id)?.id;
                                            if (!apId) { setErr("Could not find approval record ID for this task. Refresh the task list and try again."); return; }
                                            try {
                                              await api.decide(apId, "denied");
                                              setNotice({ intent: "warning", text: `Denied task ${t.id} (${t.tool}).` });
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

                                  <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 10, fontSize: 12, color: "var(--colorNeutralForeground3)" }}>
                                    <span><b>Full Task ID:</b> <code>{t.id}</code></span>
                                    <span><b>Updated:</b> {fmt(t.updated_at)}</span>
                                    {t.approval_id && <span><b>Approval ID:</b> <code>{t.approval_id}</code></span>}
                                  </div>

                                  <div style={{ display: "grid", gap: 12 }}>
                                    <div>
                                      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4, color: "var(--colorNeutralForeground2)" }}>Arguments JSON</div>
                                      <pre style={{ margin: 0, padding: 10, borderRadius: 6, background: "var(--colorNeutralBackground1)", border: "1px solid var(--colorNeutralStroke2)", fontSize: 12, overflowX: "auto" }}>
                                        {t.args_json || "{}"}
                                      </pre>
                                    </div>

                                    {info.imageBase64 && (
                                      <div>
                                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                                          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--colorNeutralForeground2)" }}>
                                            Captured Desktop Screenshot {info.parsed?.size ? `(${info.parsed.size.join("×")})` : ""}
                                          </span>
                                          <div style={{ display: "flex", gap: 8 }}>
                                            <JXButton
                                              size="sm"
                                              variant="soft"
                                              onClick={() => setLightbox({
                                                src: `data:${info.mimeType};base64,${info.imageBase64}`,
                                                title: `Task ${t.id} — ${deviceNameOf(t.device_id)} (${fmt(t.updated_at)})`,
                                              })}
                                            >
                                              Expand Fullscreen
                                            </JXButton>
                                            <a
                                              className="f2-btn f2-btn-sm"
                                              href={`data:${info.mimeType};base64,${info.imageBase64}`}
                                              download={`screenshot-${t.id}.jpg`}
                                              style={{ textDecoration: "none" }}
                                            >
                                              Download JPEG
                                            </a>
                                          </div>
                                        </div>
                                        <img
                                          src={`data:${info.mimeType};base64,${info.imageBase64}`}
                                          alt="Captured Desktop Screenshot"
                                          onClick={() => setLightbox({
                                            src: `data:${info.mimeType};base64,${info.imageBase64}`,
                                            title: `Task ${t.id} — ${deviceNameOf(t.device_id)} (${fmt(t.updated_at)})`,
                                          })}
                                          style={{
                                            maxWidth: "100%",
                                            maxHeight: 520,
                                            borderRadius: 8,
                                            border: "1px solid var(--colorNeutralStroke1)",
                                            boxShadow: "var(--shadow8)",
                                            cursor: "zoom-in",
                                            display: "block",
                                          }}
                                        />
                                      </div>
                                    )}

                                    <div>
                                      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4, color: "var(--colorNeutralForeground2)" }}>Execution Output</div>
                                      <pre style={{ margin: 0, padding: 12, borderRadius: 6, background: "var(--colorTerminalBackground)", color: "var(--colorTerminalForeground)", fontSize: 12, maxHeight: 340, overflow: "auto", whiteSpace: "pre-wrap" }}>
                                        {info.displayText}
                                      </pre>
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <Pager total={filteredTasks.length} page={taskPage} pageSize={25} onPage={setTaskPage} />
              </Card>
            </div>
          )}

          {/* ==================== APPROVALS ==================== */}
          {view === "approvals" && (
            <Card title={`Approval Queue (${approvals.length})`}>
              <div style={{ display: "grid", gap: 10 }}>
                {approvals.map(a => (
                  <div
                    key={a.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 12,
                      padding: "12px 16px",
                      borderRadius: "var(--borderRadiusMedium)",
                      border: "1px solid var(--colorNeutralStroke2)",
                      background: a.status === "pending" ? "var(--colorStatusWarningBackground1)" : "var(--colorNeutralBackground2)",
                    }}
                  >
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                        <Badge value={a.status} />
                        <b><code>{a.tool}</code></b>
                        <span style={{ fontSize: 12, color: "var(--colorNeutralForeground3)" }}>· requested {rel(a.created_at)}</span>
                      </div>
                      <div style={{ fontSize: 13, color: "var(--colorNeutralForeground2)" }}>
                        {a.reason} · Device <b>{a.device_name || a.device_id || "—"}</b> · Tier {a.tier ?? "—"} · Policy v{a.policy_version ?? 0}
                        {a.expires_at && <span> · expires {rel(a.expires_at)}</span>}
                        {a.task_id && <span style={{ color: "var(--colorNeutralForeground3)" }}> · Task <code>{a.task_id}</code></span>}
                        {a.args && <pre style={{ margin: "6px 0 0", whiteSpace: "pre-wrap", fontSize: 12 }}>{JSON.stringify(a.args, null, 2)}</pre>}
                      </div>
                    </div>

                    <TableRowActions
                      actions={[
                        a.status === "pending" && {
                          id: "approve",
                          label: "Approve Task",
                          title: "Approve execution and queue task immediately",
                          icon: "approve",
                          tone: "success",
                          onClick: async () => {
                            try {
                              await api.decide(a.id, "approved");
                              setNotice({ intent: "success", text: `Approved ${a.tool} (${a.id}). Task released to agent queue.` });
                              load();
                            } catch (ex: any) {
                              setErr(`Approve failed: ${ex.message}`);
                            }
                          },
                        },
                        a.status === "pending" && {
                          id: "deny",
                          label: "Deny Task",
                          title: "Deny task execution",
                          icon: "deny",
                          tone: "danger",
                          onClick: async () => {
                            try {
                              await api.decide(a.id, "denied");
                              setNotice({ intent: "warning", text: `Denied ${a.tool} (${a.id}).` });
                              load();
                            } catch (ex: any) {
                              setErr(`Deny failed: ${ex.message}`);
                            }
                          },
                        },
                        {
                          id: "delete",
                          label: "Delete Record",
                          title: `Delete approval record ${a.id}`,
                          icon: "delete",
                          danger: true,
                          onClick: () => {
                            setConfirmReq({
                              title: `Delete approval record ${a.id}?`,
                              message: `This deletes the approval record for ${a.id} (${a.tool}). A pending task linked to it will no longer be approvable from this record. This cannot be undone.`,
                              confirmLabel: "Delete record",
                              danger: true,
                              onConfirm: async () => {
                                try {
                                  await api.deleteApproval(a.id);
                                  setNotice({ intent: "info", text: `Deleted approval ${a.id}.` });
                                  load();
                                } catch (ex: any) {
                                  setErr(`Delete approval failed: ${ex.message}`);
                                }
                              },
                            });
                          },
                        },
                      ]}
                    />
                  </div>
                ))}
                {approvals.length === 0 && <p style={{ color: "var(--colorNeutralForeground3)", fontSize: 13 }}>No approval requests yet.</p>}
              </div>
            </Card>
          )}

          {/* ==================== AUDIT ==================== */}
          {view === "audit" && (
            <Card
              title={`Audit Trail (${filteredAudit.length} events)`}
              action={<JXButton size="sm" variant="soft" onClick={async () => {
                try { const data = await api.exportAudit(); const blob = new Blob([data.events.map((e: any) => JSON.stringify(e)).join("\n")], { type: "application/x-ndjson" });
                  const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = "ai-bridge-audit.jsonl"; link.click(); URL.revokeObjectURL(url);
                } catch (ex: any) { setErr(`Audit export failed: ${ex.message}`); }
              }}>Export JSONL</JXButton>}
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
                        <td>{fmt(a.ts)}</td>
                        <td><b>{a.actor || "—"}</b></td>
                        <td><code>{a.device_id ? String(a.device_id).slice(0, 8) : "—"}</code></td>
                        <td><code>{a.tool}</code></td>
                        <td><Badge value={a.decision || "?"} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pager total={filteredAudit.length} page={auditPage} pageSize={25} onPage={setAuditPage} />
            </Card>
          )}

          {/* ==================== POLICIES & WEBHOOKS ==================== */}
          {view === "policies" && (
            <div style={{ display: "grid", gap: 16 }}>
              {/* Policy Scope Tabs: Global vs Per-Device */}
              <div style={{ display: "flex", gap: 8, borderBottom: "1px solid var(--colorNeutralStroke2)", paddingBottom: 10, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
                <div style={{ display: "flex", gap: 8 }}>
                  <JXButton
                    size="sm"
                    variant={policySubTab === "global" ? "contained" : "soft"}
                    onClick={() => setPolicySubTab("global")}
                  >
                    🌐 Global Fleet Policy Baseline
                  </JXButton>
                  <JXButton
                    size="sm"
                    variant={policySubTab === "devices" ? "contained" : "soft"}
                    onClick={() => {
                      setPolicySubTab("devices");
                      if (!selectedPolicyDeviceId && devices.length > 0) {
                        setSelectedPolicyDeviceId(devices[0].id);
                      }
                    }}
                  >
                    🛡️ Per-Device & Server Guardrails ({devices.length})
                  </JXButton>
                </div>
              </div>

              {policySubTab === "devices" ? (
                <Card title="Target Device & Server Policy Manager">
                  {devices.length === 0 ? (
                    <p style={{ color: "var(--colorNeutralForeground3)", fontSize: 13 }}>No enrolled devices found.</p>
                  ) : (
                    <div style={{ display: "grid", gap: 16 }}>
                      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", padding: 10, borderRadius: 6, background: "var(--colorNeutralBackground2)", border: "1px solid var(--colorNeutralStroke2)" }}>
                        <label style={{ fontSize: 13, fontWeight: 600 }}>Select Target Device / Server:</label>
                        <div style={{ flex: 1, minWidth: 260 }}>
                          <JXSelect
                            value={selectedPolicyDeviceId || devices[0]?.id || ""}
                            onChange={(val: any) => setSelectedPolicyDeviceId(typeof val === "string" ? val : val?.target?.value || "")}
                            options={devices.map(d => ({
                              id: d.id,
                              label: `${d.name} (${d.os || "linux"} - ${d.hostname || d.id}) ${d.has_custom_policy ? "[Custom Guardrails Active]" : "[Global Baseline]"}`
                            }))}
                          />
                        </div>
                      </div>

                      <DevicePolicyEditor
                        deviceId={selectedPolicyDeviceId || devices[0]?.id}
                        onSaved={() => load()}
                      />
                    </div>
                  )}
                </Card>
              ) : (
                <>
              <Card title={`Security Policy Editor (Active Version: v${policy?.version ?? "?"})`}>
                {policy ? (
                  <form
                    onSubmit={async e => {
                      e.preventDefault();
                      try {
                        const allowed_apps = polApps.split(",").map(s => s.trim()).filter(Boolean);
                        const allowed_services = polServices.split(",").map(s => s.trim()).filter(Boolean);
                        const r = await api.createPolicy({
                          allow_tier3: polTier3,
                          desktop_enabled: polDesktop,
                          allowed_apps,
                          allowed_services,
                          note: polNote || "Updated via Fluent 2 policy editor",
                        });
                        setPolNote("");
                        setNotice({ intent: "success", text: `Saved policy v${r.version}. Propagates automatically to agents on next poll.` });
                        await load();
                      } catch (ex: any) {
                        setErr(`Failed to save policy: ${ex.message}`);
                      }
                    }}
                    style={{ display: "grid", gap: 16 }}
                  >
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12 }}>
                      <div style={{ padding: 12, borderRadius: 6, border: "1px solid var(--colorNeutralStroke2)", background: "var(--colorNeutralBackground2)" }}>
                        <JXSwitch
                          label="Allow Tier-3 Operations Unattended"
                          helperText="Execute Tier-3 tools without queuing for manual approval"
                          checked={polTier3}
                          onChange={(c: any) => setPolTier3(Boolean(typeof c === "boolean" ? c : c?.target?.checked))}
                        />
                      </div>

                      <div style={{ padding: 12, borderRadius: 6, border: "1px solid var(--colorNeutralStroke2)", background: "var(--colorNeutralBackground2)" }}>
                        <JXSwitch
                          label="Enable Desktop Automation & Vision"
                          helperText="Permit screenshots, approved app launches, and UI actions"
                          checked={polDesktop}
                          onChange={(c: any) => setPolDesktop(Boolean(typeof c === "boolean" ? c : c?.target?.checked))}
                        />
                      </div>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12 }}>
                      <div>
                        <JXTextField
                          label="Allowed Desktop Applications (comma-separated)"
                          value={polApps}
                          onChange={(val: any) => setPolApps(typeof val === "string" ? val : val?.target?.value || "")}
                          placeholder="chrome, code, notepad, msedge, firefox, terminal"
                        />
                      </div>

                      <div>
                        <JXTextField
                          label="Allowed System Services (comma-separated)"
                          value={polServices}
                          onChange={(val: any) => setPolServices(typeof val === "string" ? val : val?.target?.value || "")}
                          placeholder="nginx, docker, ssh, postgresql, redis"
                        />
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                      <div style={{ flex: 1, minWidth: 240 }}>
                        <JXTextField
                          value={polNote}
                          onChange={(val: any) => setPolNote(typeof val === "string" ? val : val?.target?.value || "")}
                          placeholder="Change note for audit history (optional)"
                        />
                      </div>
                      <JXButton type="submit" variant="contained">
                        Save New Policy Version
                      </JXButton>
                    </div>
                  </form>
                ) : (
                  <p style={{ color: "var(--colorNeutralForeground3)", fontSize: 13 }}>Loading policy…</p>
                )}
              </Card>

              <Card title="Multi-Channel Approval Alerts & 1-Click Mobile Approvals (Telegram / Discord / Slack)">
                <p style={{ margin: "0 0 10px", fontSize: 13, color: "var(--colorNeutralForeground2)" }}>
                  Receive real-time push alerts whenever a task enters <code>needs_approval</code>. Supports <b>Telegram Bots</b> (with native inline action buttons), <b>Discord</b> (rich embeds), <b>Slack</b> (interactive block kit), or any generic webhook.
                </p>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
                  <JXButton
                    size="sm"
                    variant="soft"
                    onClick={() => setWebhookUrl("https://api.telegram.org/bot<BOT_TOKEN>/sendMessage?chat_id=<CHAT_ID>")}
                  >
                    📱 Telegram Template
                  </JXButton>
                  <JXButton
                    size="sm"
                    variant="soft"
                    onClick={() => setWebhookUrl("https://discord.com/api/webhooks/<WEBHOOK_ID>/<WEBHOOK_TOKEN>")}
                  >
                    💬 Discord Template
                  </JXButton>
                  <JXButton
                    size="sm"
                    variant="soft"
                    onClick={() => setWebhookUrl("https://hooks.slack.com/services/<T>/<B>/<X>")}
                  >
                    💼 Slack Template
                  </JXButton>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <div style={{ flex: 1, minWidth: 280 }}>
                    <JXTextField
                      value={webhookUrl}
                      onChange={(val: any) => setWebhookUrl(typeof val === "string" ? val : val?.target?.value || "")}
                      placeholder="https://api.telegram.org/... or https://discord.com/api/webhooks/... or https://hooks.slack.com/..."
                    />
                  </div>
                  <JXButton
                    variant="contained"
                    onClick={async () => {
                      try {
                        const r = await api.setWebhook(webhookUrl);
                        setNotice({ intent: "success", text: r.configured ? "Webhook URL saved." : "Webhook URL cleared." });
                      } catch (ex: any) {
                        setErr(`Save webhook failed: ${ex.message}`);
                      }
                    }}
                  >
                    Save Webhook
                  </JXButton>
                  <JXButton
                    variant="soft"
                    disabled={!webhookUrl.trim()}
                    onClick={async () => {
                      try {
                        const r = await api.testWebhook();
                        setNotice({
                          intent: r.ok ? "success" : "error",
                          text: r.ok ? `Webhook test succeeded (HTTP ${r.status}).` : `Webhook test failed: ${r.error || "unknown error"}`,
                        });
                      } catch (ex: any) {
                        setErr(`Webhook test failed: ${ex.message}`);
                      }
                    }}
                  >
                    Send Test Alert
                  </JXButton>
                </div>
                <div style={{ marginTop: 12, padding: "8px 12px", background: "rgba(0, 120, 212, 0.08)", border: "1px solid rgba(0, 120, 212, 0.2)", borderRadius: 6, fontSize: 12, color: "var(--colorNeutralForeground2)", display: "flex", alignItems: "center", gap: 8 }}>
                  <span>🛡️</span>
                  <span><b>1-Click Mobile Authorization:</b> Outgoing alerts include HMAC-SHA256 signed buttons allowing you to securely approve or deny tasks directly from your phone in one click.</span>
                </div>
              </Card>

              <Card title="Versioned Policy History">
                <div className="f2-table-wrap">
                  <table className="f2-table">
                    <thead>
                      <tr>
                        <th>Version</th>
                        <th>Created</th>
                        <th>Author</th>
                        <th>Note</th>
                        <th>Configuration Summary</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {policyHistory.map(p => {
                        let pol: any = {};
                        try {
                          pol = JSON.parse(p.policy_json);
                        } catch {
                          /* ignore */
                        }
                        return (
                          <tr key={p.version}>
                            <td><Badge value={`v${p.version}`} tone="blue" /></td>
                            <td>{fmt(p.created_at)}</td>
                            <td><b>{p.created_by || "—"}</b></td>
                            <td>{p.note || "—"}</td>
                            <td>
                              <code>tier3={String(pol.allow_tier3)} desktop={String(pol.desktop_enabled)} apps=[{(pol.allowed_apps || []).join(", ")}]</code>
                            </td>
                            <td>
                              <TableRowActions
                                actions={[
                                  {
                                    id: "edit",
                                    label: "Edit Policy Version",
                                    title: `Edit policy version v${p.version}`,
                                    icon: "edit",
                                    onClick: () =>
                                      setEditModal({
                                        kind: "policy",
                                        data: {
                                          version: p.version,
                                          allow_tier3: !!pol.allow_tier3,
                                          desktop_enabled: !!pol.desktop_enabled,
                                          allowed_apps: (pol.allowed_apps || []).join(", "),
                                          allowed_services: (pol.allowed_services || []).join(", "),
                                          note: p.note || "",
                                        },
                                      }),
                                  },
                                  {
                                    id: "delete",
                                    label: "Delete Policy Version",
                                    title: `Delete policy version v${p.version}`,
                                    icon: "delete",
                                    danger: true,
                                    onClick: () => {
                                      setConfirmReq({
                                        title: `Delete policy version v${p.version}?`,
                                        message: "This deletes that saved policy version from history. The currently active policy is not changed. This cannot be undone.",
                                        confirmLabel: "Delete version",
                                        danger: true,
                                        onConfirm: async () => {
                                          try {
                                            await api.deletePolicyVersion(p.version);
                                            setNotice({ intent: "info", text: `Deleted policy version v${p.version}.` });
                                            load();
                                          } catch (ex: any) {
                                            setErr(`Delete policy failed: ${ex.message}`);
                                          }
                                        },
                                      });
                                    },
                                  },
                                ]}
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>
                </>
              )}
            </div>
          )}

          {/* ==================== CONNECTIONS ==================== */}
          {view === "connections" && (
            <div style={{ display: "grid", gap: 16 }}>
              <div className="f2-kpi-grid">
                <Card title="Control Plane API" action={<CopyButton text={`${origin}/api`} label="Copy URL" />}>
                  <Badge value={health ? (health.emergency_stop ? "emergency stop" : "online") : "unknown"} />
                  <p style={{ fontSize: 13, margin: "8px 0 4px" }}>Version <b>{health?.version || "?"}</b></p>
                  <code style={{ fontSize: 12, color: "var(--colorNeutralForeground3)", wordBreak: "break-all" }}>{origin}/api</code>
                </Card>

                <Card title="MCP Streamable HTTP" action={<CopyButton text={`${origin}/mcp`} label="Copy URL" />}>
                  <Badge value={connections ? (connections.mcp.up ? "online" : "down") : "unknown"} />
                  <p style={{ fontSize: 13, margin: "8px 0 4px" }}>Loopback <code>:{connections?.mcp.port || 8001}</code></p>
                  <code style={{ fontSize: 12, color: "var(--colorNeutralForeground3)", wordBreak: "break-all" }}>{origin}/mcp</code>
                </Card>

                <Card title="OAuth 2.0 Gateway" action={<CopyButton text={`${origin}/oauth/authorize`} label="Copy Auth URL" />}>
                  <Badge value={connections ? (connections.oauth_gateway.up ? "online" : "down") : "unknown"} />
                  <p style={{ fontSize: 13, margin: "8px 0 4px" }}>Loopback <code>:{connections?.oauth_gateway.port || 8002}</code> · Admin Token Auth</p>
                  <span style={{ fontSize: 12, color: "var(--colorNeutralForeground3)" }}>Fleet-wide MCP access with Admin Token only</span>
                </Card>
              </div>

              <Card title="MCP Client Setup & Fleet-Wide AI Connection Workflow">
                <div className="f2-stepper">
                  <div className="f2-step-box">
                    <span className="f2-step-num">STEP 01 · ADD MCP SERVER</span>
                    <b>Connect Claude / Cursor / ChatGPT</b>
                    <span style={{ fontSize: 12, color: "var(--colorNeutralForeground3)" }}>
                      Point your MCP client to <code>{origin}/mcp</code>. It automatically discovers OAuth 2.1 or accepts Bearer auth.
                    </span>
                  </div>
                  <div className="f2-step-box">
                    <span className="f2-step-num">STEP 02 · AUTHENTICATE</span>
                    <b>Enter Admin Token Only</b>
                    <span style={{ fontSize: 12, color: "var(--colorNeutralForeground3)" }}>
                      Provide your <code>AI_BRIDGE_ADMIN_TOKEN</code>. No device tokens required to connect.
                    </span>
                  </div>
                  <div className="f2-step-box">
                    <span className="f2-step-num">STEP 03 · FLEET CONTROL</span>
                    <b>Access All Enrolled Devices</b>
                    <span style={{ fontSize: 12, color: "var(--colorNeutralForeground3)" }}>
                      The AI agent can list all devices (<code>list_devices()</code>), switch targets (<code>select_device()</code>), or pass <code>device="..."</code> to any tool.
                    </span>
                  </div>
                </div>
              </Card>

              <Card title="Registered OAuth Clients (ChatGPT / Claude / Codex)">
                {connections ? (
                  <>
                    <p style={{ fontSize: 13, marginTop: 0, color: "var(--colorNeutralForeground2)" }}>
                      Registered clients: <b>{connections.chatgpt.clients.length}</b> · Active access tokens: <b>{connections.chatgpt.active_access_tokens}</b> · Active refresh tokens: <b>{connections.chatgpt.active_refresh_tokens}</b> · Last activity: <b>{rel(connections.chatgpt.last_token_at)}</b>
                    </p>
                    <div className="f2-table-wrap">
                      <table className="f2-table">
                        <thead>
                          <tr>
                            <th>Client Name</th>
                            <th>Client ID Prefix</th>
                            <th>Redirect URIs</th>
                            <th>Registered</th>
                            <th>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {connections.chatgpt.clients.map((c: any, i: number) => {
                            const cid = c.client_id || c.client_id_prefix;
                            return (
                              <tr key={i}>
                                <td><b>{c.client_name || "MCP Client"}</b></td>
                                <td><code>{c.client_id_prefix}…</code></td>
                                <td style={{ wordBreak: "break-all", fontSize: 12 }}>{c.redirect_uris}</td>
                                <td>{fmt(c.created_at)}</td>
                                <td>
                                  <TableRowActions
                                    actions={[
                                      {
                                        id: "edit",
                                        label: "Edit Client",
                                        title: `Edit OAuth client "${c.client_name || cid}"`,
                                        icon: "edit",
                                        onClick: () =>
                                          setEditModal({
                                            kind: "oauth_client",
                                            data: {
                                              client_id: cid,
                                              client_name: c.client_name || "",
                                              redirect_uris: c.redirect_uris || "",
                                            },
                                          }),
                                      },
                                      {
                                        id: "delete",
                                        label: "Delete Client",
                                        title: `Delete OAuth client "${c.client_name || cid}" and revoke tokens`,
                                        icon: "delete",
                                        danger: true,
                                        onClick: () => {
                                          setConfirmReq({
                                            title: `Delete OAuth client "${c.client_name || cid}"?`,
                                            message: "This deletes the client and revokes its tokens. Any integration using it will stop working until it is recreated. This cannot be undone.",
                                            confirmLabel: "Delete client",
                                            danger: true,
                                            onConfirm: async () => {
                                              try {
                                                await api.deleteOAuthClient(cid);
                                                setNotice({ intent: "warning", text: `Deleted OAuth client ${c.client_name || cid}.` });
                                                load();
                                              } catch (ex: any) {
                                                setErr(`Delete OAuth client failed: ${ex.message}`);
                                              }
                                            },
                                          });
                                        },
                                      },
                                    ]}
                                  />
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </>
                ) : (
                  <p style={{ color: "var(--colorNeutralForeground3)", fontSize: 13 }}>Loading connections…</p>
                )}
              </Card>
            </div>
          )}

          {/* ==================== LOGS ==================== */}
          {view === "logs" && (
            <Card title="Systemd & Proxy Telemetry">
              <div style={{ marginBottom: 12, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <div style={{ minWidth: 240 }}>
                  <JXSelect
                    value={logService}
                    onChange={(val: any) => setLogService(typeof val === "string" ? val : val?.target?.value || "")}
                    options={[
                      { id: "control", label: "Control Plane (ai-bridge-control)" },
                      { id: "mcp", label: "MCP Server (ai-bridge-mcp)" },
                      { id: "oauth", label: "OAuth Gateway (ai-bridge-oauth)" },
                      { id: "nginx", label: "Nginx Reverse Proxy (/mcp & /api)" },
                    ]}
                  />
                </div>

                <div style={{ minWidth: 140 }}>
                  <JXSelect
                    value={String(logCount)}
                    onChange={(val: any) => setLogCount(Number(typeof val === "string" ? val : val?.target?.value) || 50)}
                    options={[
                      { id: "50", label: "50 lines" },
                      { id: "100", label: "100 lines" },
                      { id: "200", label: "200 lines" },
                    ]}
                  />
                </div>

                <JXButton variant="soft" onClick={() => load()}>
                  Refresh Logs
                </JXButton>
              </div>

              <pre style={{
                margin: 0,
                padding: 16,
                borderRadius: 8,
                background: "var(--colorTerminalBackground)",
                color: "var(--colorTerminalForeground)",
                fontSize: 12,
                lineHeight: 1.55,
                maxHeight: 620,
                overflow: "auto",
                whiteSpace: "pre-wrap",
              }}>
                {logLines.join("\n") || "No log lines returned."}
              </pre>
            </Card>
          )}

          {/* ==================== AI API & AGENTS HUB ==================== */}
          {view === "ai_api" && (
            <AiApiHub devices={devices} />
          )}

          {/* ==================== AUTONOMOUS WORKFLOWS & PLANS ==================== */}
          {view === "workflows" && (
            <WorkflowPlanner devices={devices} onNotice={setNotice} />
          )}

          {/* ==================== FLEET OPERATIONS & SELF-HEALING ==================== */}
          {view === "fleet_ops" && (
            <FleetOperations />
          )}

          {/* ==================== LIVE DESKTOP STUDIO & DUAL CONTROL ==================== */}
          {view === "live_studio" && (
            <LiveDesktopStudio devices={devices} onNotice={setNotice} />
          )}

          {/* ==================== INTERACTIVE TERMINAL STUDIO ==================== */}
          {view === "terminal" && (
            <TerminalStudio
              devices={devices}
              onNotice={(m: any) => setNotice(typeof m === "string" ? { text: m, intent: "info" } : m)}
            />
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
              setTheme(theme === "light" ? "dark" : "light");
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

                <div className="f2-nav-section-label" style={{ marginTop: 6 }}>Preferences</div>
                {(() => {
                  const idx = itemCursor++;
                  return (
                    <JXButton
                      fullWidth
                      variant={cmdSelectedIndex === idx ? "contained" : "text"}
                      onClick={() => {
                        setTheme(theme === "light" ? "dark" : "light");
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
            <DevicePolicyEditor
              deviceId={devicePolicyModalId}
              isModal={true}
              onClose={() => setDevicePolicyModalId(null)}
              onSaved={() => {
                load();
                setNotice({ intent: "success", text: "Device policy guardrails updated successfully." });
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
