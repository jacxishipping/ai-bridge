import { Fragment, useEffect, useState, useRef } from "react";
import { api, token, sessionToken } from "./api";
import { DevicePolicyEditor } from "./DevicePolicyEditor";
import { DeviceDetailDashboard } from "./DeviceDetailDashboard";

type View = "overview" | "devices" | "device_detail" | "tasks" | "approvals" | "audit" | "policies" | "connections" | "logs";
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
    <button
      type="button"
      className="f2-copy-pill"
      onClick={e => {
        e.stopPropagation();
        navigator.clipboard?.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      }}
      title="Copy to clipboard"
    >
      {copied ? "✓ Copied" : label}
    </button>
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
          <button
            key={act.id}
            type="button"
            className={cls}
            onClick={e => {
              e.stopPropagation();
              act.onClick();
            }}
            title={act.title || act.label}
            aria-label={act.title || act.label}
          >
            <FluentIcon name={act.icon} />
          </button>
        );
      })}

      {hasOverflow && (
        <div style={{ position: "relative", display: "inline-flex" }}>
          <button
            type="button"
            className={`f2-icon-btn ${menuOpen ? "f2-icon-btn-primary" : ""}`}
            onClick={e => {
              e.stopPropagation();
              setMenuOpen(!menuOpen);
            }}
            title="More actions"
            aria-label="More actions"
            aria-expanded={menuOpen}
          >
            <FluentIcon name="more" />
          </button>

          {menuOpen && (
            <div className="f2-overflow-menu" role="menu">
              {overflow.map(act => (
                <button
                  key={act.id}
                  type="button"
                  className="f2-overflow-item"
                  data-danger={String(!!act.danger || act.tone === "danger")}
                  onClick={e => {
                    e.stopPropagation();
                    setMenuOpen(false);
                    act.onClick();
                  }}
                  title={act.title || act.label}
                  role="menuitem"
                >
                  <FluentIcon name={act.icon} />
                  <span>{act.label}</span>
                </button>
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
    <section className="f2-card">
      <div className="f2-card-header">
        <h3 className="f2-card-title">{title}</h3>
        {action}
      </div>
      {children}
    </section>
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
  const [view, setView] = useState<View>("overview");
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem("ai_bridge_theme") as Theme) || "light");
  const [authTab, setAuthTab] = useState<"token" | "user">("token");
  const [err, setErr] = useState("");
  const [notice, setNotice] = useState<{ intent: "success" | "info" | "warning" | "error"; text: string } | null>(null);
  const [tok, setTok] = useState(token());
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
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<{ src: string; title: string } | null>(null);
  const [auditQuery, setAuditQuery] = useState("");
  const [auditTool, setAuditTool] = useState("all");
  const [logService, setLogService] = useState("control");
  const [logCount, setLogCount] = useState(100);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [cmdQuery, setCmdQuery] = useState("");
  const [devicePolicyModalId, setDevicePolicyModalId] = useState<string | null>(null);
  const [selectedDeviceIdForDashboard, setSelectedDeviceIdForDashboard] = useState<string | null>(null);
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
    document.documentElement.setAttribute("data-theme", theme);
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
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  async function load(v: View = view) {
    setErr("");
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
      }
    } catch (e: any) {
      setErr(e.message);
    }
  }

  useEffect(() => {
    if (tok || sessionToken()) load();
  }, [view, tok, logService, logCount]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    let st = params.get("session_token");
    if (!st && window.location.hash) {
      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      st = hashParams.get("session_token");
    }
    if (st) {
      localStorage.setItem("ai_bridge_session_token", st);
      setTok("session");
      window.history.replaceState({}, "", window.location.pathname);
    }
    api.oidcConfigured().then(r => setOidcEnabled(!!r.enabled)).catch(() => {});
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
            <button
              type="button"
              className="f2-btn f2-btn-subtle f2-btn-sm"
              onClick={() => setTheme(theme === "light" ? "dark" : "light")}
              title="Toggle Light / Dark theme"
            >
              <FluentIcon name="theme" /> {theme === "light" ? "Dark" : "Light"}
            </button>
          </div>

          <h1 style={{ margin: "0 0 6px", fontSize: 22, fontWeight: 600 }}>Sign in to your fleet</h1>
          <p style={{ margin: "0 0 20px", fontSize: 13, color: "var(--colorNeutralForeground3)" }}>
            Policy-governed MCP gateway & remote device orchestration.
          </p>

          {oidcEnabled && (
            <div style={{ marginBottom: 18 }}>
              <button
                type="button"
                className="f2-btn f2-btn-primary"
                style={{ width: "100%", height: 38 }}
                onClick={() => api.oidcLogin()}
              >
                <FluentIcon name="connections" /> Continue with Google Single Sign-On
              </button>
              <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "16px 0 0", color: "var(--colorNeutralForeground3)", fontSize: 12 }}>
                <div style={{ flex: 1, height: 1, background: "var(--colorNeutralStroke2)" }} />
                <span>or use direct credentials</span>
                <div style={{ flex: 1, height: 1, background: "var(--colorNeutralStroke2)" }} />
              </div>
            </div>
          )}

          <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
            <button
              type="button"
              className="f2-chip"
              data-active={String(authTab === "token")}
              onClick={() => setAuthTab("token")}
            >
              Admin Token
            </button>
            <button
              type="button"
              className="f2-chip"
              data-active={String(authTab === "user")}
              onClick={() => setAuthTab("user")}
            >
              Username & Password
            </button>
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
                <input name="t" type="password" className="f2-input" placeholder="Paste your admin token…" style={{ width: "100%" }} required />
              </div>
              <button type="submit" className="f2-btn f2-btn-primary" style={{ height: 36 }}>
                Sign in with Admin Token
              </button>
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
              <input name="u" className="f2-input" placeholder="Username" style={{ width: "100%" }} required />
              <input name="p" type="password" className="f2-input" placeholder="Password" style={{ width: "100%" }} required />
              <button type="submit" className="f2-btn f2-btn-primary" style={{ height: 36 }}>
                Sign in as User
              </button>
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
  const filteredTasks = taskStatus === "all" ? tasks : tasks.filter(t => t.status === taskStatus);
  const filteredAudit = audit
    .filter(a => {
      if (auditTool !== "all" && a.tool !== auditTool) return false;
      if (!auditQuery) return true;
      const hay = `${a.actor || ""} ${a.tool || ""} ${a.decision || ""} ${a.device_id || ""}`.toLowerCase();
      return hay.includes(auditQuery.toLowerCase());
    })
    .slice(0, 100);
  const deviceNameOf = (id: string) => (devices.find(d => d.id === id)?.name || id || "").slice(0, 24);
  const origin = window.location.origin;
  const meta = VIEW_META[view];

  return (
    <div className="f2-shell">
      {/* Fluent 2 Acrylic Top App Bar */}
      <header className="f2-topbar">
        <div className="f2-brand">
          <span className="f2-brand-logo">
            <FluentIcon name="approvals" />
          </span>
          <span>AI Bridge</span>
          {health && (
            <Badge
              value={health.emergency_stop ? "EMERGENCY STOP" : "System Online"}
              tone={health.emergency_stop ? "red" : "green"}
            />
          )}
        </div>

        <div className="f2-topbar-actions">
          <button
            type="button"
            className="f2-search-trigger"
            onClick={() => {
              setCmdOpen(true);
              setCmdQuery("");
            }}
            title="Open Command Palette (Ctrl+K)"
          >
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <FluentIcon name="search" />
              <span>Search views &amp; tools…</span>
            </span>
            <span className="f2-kbd">Ctrl K</span>
          </button>

          <label className="f2-switch-label" title="Poll control plane every 15 seconds">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={e => setAutoRefresh(e.target.checked)}
              style={{ display: "none" }}
            />
            <span className="f2-switch" data-checked={String(autoRefresh)} />
            <span>Auto-refresh</span>
          </label>

          <button type="button" className="f2-btn f2-btn-sm" onClick={() => load()}>
            Refresh
          </button>

          <button
            type="button"
            className="f2-btn f2-btn-sm"
            onClick={() => setTheme(theme === "light" ? "dark" : "light")}
            title="Switch between Fluent 2 Light and Dark themes"
          >
            <FluentIcon name="theme" /> {theme === "light" ? "Dark" : "Light"}
          </button>

          {health?.emergency_stop ? (
            <button
              type="button"
              className="f2-btn f2-btn-primary f2-btn-sm"
              onClick={async () => {
                await api.emergencyClear();
                setNotice({ intent: "success", text: "Emergency stop cleared. Task queue resumed." });
                load();
              }}
            >
              Resume Queue
            </button>
          ) : (
            <button
              type="button"
              className="f2-btn f2-btn-danger f2-btn-sm"
              onClick={async () => {
                await api.emergencyStop();
                setNotice({ intent: "warning", text: "Emergency stop activated. New tasks are blocked." });
                load();
              }}
            >
              Emergency Stop
            </button>
          )}

          {me && (
            <span className="f2-persona" title={`Signed in as ${me.username} (${me.role})`}>
              <span className="f2-avatar">{String(me.username || "A").slice(0, 2)}</span>
              <span>
                <b>{me.username}</b> <span style={{ color: "var(--colorNeutralForeground3)" }}>· {me.role}</span>
              </span>
            </span>
          )}

          <button
            type="button"
            className="f2-btn f2-btn-subtle f2-btn-sm"
            onClick={async () => {
              try { if (sessionToken()) await api.logout(); } catch { /* local sign-out still clears an unavailable session */ }
              localStorage.removeItem("ai_bridge_admin_token");
              localStorage.removeItem("ai_bridge_session_token");
              setTok("");
              setMe(null);
            }}
          >
            Sign out
          </button>
        </div>
      </header>

      <div className="f2-body">
        {/* Fluent 2 Navigation Drawer */}
        <nav className="f2-nav" aria-label="Main Navigation">
          <div className="f2-nav-section-label">Operations</div>
          {(["overview", "devices"] as View[]).map(v => (
            <button
              key={v}
              type="button"
              className="f2-nav-item"
              data-active={String(view === v)}
              onClick={() => setView(v)}
            >
              <span className="f2-nav-item-icon">
                <FluentIcon name={v} />
              </span>
              <span style={{ textTransform: "capitalize" }}>{v}</span>
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
            }}
            title="Inspect full system specs, running servers, apps, and health for any machine"
          >
            <span className="f2-nav-item-icon">
              <FluentIcon name="dashboard" />
            </span>
            <span>Device 360</span>
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
              onClick={() => setView(v)}
            >
              <span className="f2-nav-item-icon">
                <FluentIcon name={v} />
              </span>
              <span style={{ textTransform: "capitalize" }}>{v}</span>
              {v === "approvals" && pending.length > 0 && (
                <span className="f2-nav-counter" data-warn="true">{pending.length}</span>
              )}
            </button>
          ))}

          <div className="f2-nav-section-label" style={{ marginTop: 8 }}>Governance & Telemetry</div>
          {(["policies", "audit", "connections", "logs"] as View[]).map(v => (
            <button
              key={v}
              type="button"
              className="f2-nav-item"
              data-active={String(view === v)}
              onClick={() => setView(v)}
            >
              <span className="f2-nav-item-icon">
                <FluentIcon name={v} />
              </span>
              <span style={{ textTransform: "capitalize" }}>{v}</span>
            </button>
          ))}
        </nav>

        {/* Fluent 2 Workspace Canvas */}
        <main className="f2-canvas">
          <div className="f2-page-header">
            <div>
              <div className="f2-breadcrumb">
                <span>AI Bridge</span>
                <span className="f2-breadcrumb-sep">/</span>
                <span>{meta.group === "ops" ? "Operations" : "Governance & Telemetry"}</span>
                <span className="f2-breadcrumb-sep">/</span>
                <span className="f2-breadcrumb-current">{meta.title}</span>
              </div>
              <h2 className="f2-page-title">{meta.title}</h2>
              <p className="f2-page-subtitle">{meta.subtitle}</p>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {view !== "tasks" && (
                <button
                  type="button"
                  className="f2-btn f2-btn-primary f2-btn-sm"
                  onClick={() => setView("tasks")}
                >
                  <FluentIcon name="tasks" /> Dispatch Task
                </button>
              )}
              {view !== "devices" && (
                <button
                  type="button"
                  className="f2-btn f2-btn-sm"
                  onClick={() => setView("devices")}
                >
                  <FluentIcon name="devices" /> Enroll Device
                </button>
              )}
            </div>
          </div>

          {err && (
            <div className="f2-messagebar" data-intent="error">
              <span><b>Connection issue:</b> {err}</span>
              <button type="button" className="f2-btn f2-btn-sm" onClick={() => setErr("")}>Dismiss</button>
            </div>
          )}

          {notice && (
            <div className="f2-messagebar" data-intent={notice.intent}>
              <span>{notice.text}</span>
              <button type="button" className="f2-btn f2-btn-sm" onClick={() => setNotice(null)}>Dismiss</button>
            </div>
          )}

          {/* ==================== OVERVIEW ==================== */}
          {view === "overview" && (
            <div style={{ display: "grid", gap: 16 }}>
              <div className="f2-kpi-grid">
                <div className="f2-kpi-card" onClick={() => setView("devices")}>
                  <div className="f2-kpi-top">
                    <span>ONLINE DEVICES</span>
                    <span className="f2-kpi-icon"><FluentIcon name="devices" /></span>
                  </div>
                  <div className="f2-kpi-value">{online.length} <span style={{ fontSize: 16, color: "var(--colorNeutralForeground3)", fontWeight: 400 }}>/ {devices.length}</span></div>
                  <div className="f2-kpi-meta">Active outbound-polling agents</div>
                </div>

                <div className="f2-kpi-card" onClick={() => setView("tasks")}>
                  <div className="f2-kpi-top">
                    <span>TOTAL TASKS</span>
                    <span className="f2-kpi-icon"><FluentIcon name="tasks" /></span>
                  </div>
                  <div className="f2-kpi-value">{tasks.length}</div>
                  <div className="f2-kpi-meta">
                    {taskByStatus["completed"] || 0} completed · {taskByStatus["queued"] || 0} queued · {taskByStatus["failed"] || 0} failed
                  </div>
                </div>

                <div className="f2-kpi-card" onClick={() => setView("approvals")}>
                  <div className="f2-kpi-top">
                    <span>PENDING APPROVALS</span>
                    <span className="f2-kpi-icon"><FluentIcon name="approvals" /></span>
                  </div>
                  <div className="f2-kpi-value" style={{ color: pending.length > 0 ? "var(--colorStatusWarningForeground1)" : undefined }}>
                    {pending.length}
                  </div>
                  <div className="f2-kpi-meta">Awaiting administrator decision</div>
                </div>

                <div className="f2-kpi-card" onClick={() => setView("audit")}>
                  <div className="f2-kpi-top">
                    <span>AUDIT EVENTS (24H)</span>
                    <span className="f2-kpi-icon"><FluentIcon name="audit" /></span>
                  </div>
                  <div className="f2-kpi-value">{audit24h}</div>
                  <div className="f2-kpi-meta">Recorded security & tool actions</div>
                </div>

                <div className="f2-kpi-card" onClick={() => setView("connections")}>
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
                </div>
              </div>

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
                  action={<button type="button" className="f2-btn f2-btn-subtle f2-btn-sm" onClick={() => setView("devices")}>Manage devices →</button>}
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
                  action={<button type="button" className="f2-btn f2-btn-subtle f2-btn-sm" onClick={() => setView("audit")}>Full audit log →</button>}
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
              <Card title="Enroll a New Device">
                {me?.role === "viewer" && (
                  <div className="f2-messagebar" data-intent="warning">
                    <span>Enrolling a device requires administrator privileges. Your current session role is <b>viewer</b>.</span>
                  </div>
                )}
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
                  <input
                    className="f2-input"
                    value={deviceName}
                    onChange={e => setDeviceName(e.target.value)}
                    placeholder="Device friendly name (e.g. windows-workstation)"
                    style={{ minWidth: 280, flex: 1 }}
                    required
                  />
                  <button type="submit" className="f2-btn f2-btn-primary">
                    Enroll Device
                  </button>
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

              <Card title={`Fleet Inventory (${devices.length})`}>
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
                      {devices.map(d => {
                        const expSoon = d.token_expires_at && Date.now() / 1000 > d.token_expires_at - 86400;
                        const tags: string[] = Array.isArray(d.tags) ? d.tags : [];
                        const caps: string[] = Array.isArray(d.capabilities) ? d.capabilities : [];
                        return (
                          <tr key={d.id}>
                            <td>
                              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedDeviceIdForDashboard(d.id);
                                    setView("device_detail");
                                  }}
                                  title={`Open full system dashboard for ${d.name}`}
                                  style={{
                                    background: "none",
                                    border: "none",
                                    padding: 0,
                                    font: "inherit",
                                    fontWeight: 700,
                                    color: "var(--colorBrandForeground1)",
                                    cursor: "pointer",
                                    textAlign: "left",
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: 6,
                                  }}
                                >
                                  <span>🖥️</span>
                                  <span style={{ textDecoration: "underline" }}>{d.name}</span>
                                </button>
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
                                <button
                                  type="button"
                                  className="f2-preset-pill"
                                  onClick={() => setDevicePolicyModalId(d.id)}
                                  title="Custom device abilities configured. Click to view & edit."
                                  style={{ border: "1px solid var(--colorStatusWarningStroke1)", background: "var(--colorStatusWarningBackground1)", color: "var(--colorStatusWarningForeground1)" }}
                                >
                                  🛡️ Custom ({d.policy?.denied_tools?.length ? `${d.policy.denied_tools.length} blocked` : "Active"})
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  className="f2-preset-pill"
                                  onClick={() => setDevicePolicyModalId(d.id)}
                                  title="Inheriting global server security policy. Click to customize."
                                  style={{ border: "1px solid var(--colorNeutralStroke2)", background: "transparent" }}
                                >
                                  🌐 Global Default
                                </button>
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
                                    onClick: async () => {
                                      if (confirm(`Revoke device "${d.name}" (${d.id})?`)) {
                                        try {
                                          await api.revoke(d.id);
                                          setNotice({ intent: "warning", text: `Revoked device ${d.name}.` });
                                          load();
                                        } catch (ex: any) {
                                          setErr(`Revoke failed: ${ex.message}`);
                                        }
                                      }
                                    },
                                  },
                                  {
                                    id: "delete",
                                    label: "Delete Device",
                                    title: `Permanently delete device "${d.name}"`,
                                    icon: "delete",
                                    danger: true,
                                    onClick: async () => {
                                      if (confirm(`Permanently delete device "${d.name}" (${d.id})?`)) {
                                        try {
                                          await api.deleteDevice(d.id);
                                          setNotice({ intent: "warning", text: `Deleted device ${d.name} (${d.id}).` });
                                          load();
                                        } catch (ex: any) {
                                          setErr(`Delete failed: ${ex.message}`);
                                        }
                                      }
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
                <div style={{ padding: 32, textAlign: "center" }}>
                  <p style={{ color: "var(--colorNeutralForeground3)", marginBottom: 16 }}>
                    No device selected to inspect. Choose a machine from the Fleet Inventory.
                  </p>
                  <button type="button" className="f2-btn f2-btn-primary" onClick={() => setView("devices")}>
                    Go to Fleet Inventory
                  </button>
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
                    <button
                      key={p.label}
                      type="button"
                      className="f2-chip"
                      data-active={String(taskTool === p.tool && taskArgs === p.args)}
                      onClick={() => {
                        setTaskTool(p.tool);
                        setTaskArgs(p.args);
                      }}
                    >
                      {p.label}
                    </button>
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
                  <select className="f2-select" value={taskDevice} onChange={e => setTaskDevice(e.target.value)} required>
                    <option value="">Select target device…</option>
                    {devices.filter(d => !d.revoked).map(d => (
                      <option key={d.id} value={d.id}>{d.name} ({d.status})</option>
                    ))}
                  </select>

                  <select className="f2-select" value={taskTool} onChange={e => setTaskTool(e.target.value)}>
                    {TOOLS.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>

                  <input
                    className="f2-input"
                    value={taskArgs}
                    onChange={e => setTaskArgs(e.target.value)}
                    placeholder='JSON arguments, e.g. {"action": "list_windows"}'
                    style={{ flex: 1, minWidth: 260, fontFamily: "var(--fontFamilyMonospace)", fontSize: 13 }}
                  />

                  <button type="submit" className="f2-btn f2-btn-primary">
                    Run Task
                  </button>
                </form>
              </Card>

              <Card
                title={`Task Queue (${filteredTasks.length})`}
                action={
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                    {["all", "queued", "running", "needs_approval", "completed", "failed", "cancelled"].map(s => (
                      <button
                        key={s}
                        type="button"
                        className="f2-chip"
                        data-active={String(taskStatus === s)}
                        onClick={() => setTaskStatus(s)}
                      >
                        {s}
                      </button>
                    ))}
                    <button
                      type="button"
                      className="f2-btn f2-btn-danger f2-btn-sm"
                      onClick={async () => {
                        if (confirm(`Clear ${taskStatus === "all" ? "all finished (completed/failed/cancelled)" : taskStatus} tasks?`)) {
                          try {
                            const r = await api.clearTasks(taskStatus);
                            setNotice({ intent: "info", text: `Deleted ${r.deleted_count} task record(s).` });
                            load();
                          } catch (ex: any) {
                            setErr(`Clear tasks failed: ${ex.message}`);
                          }
                        }
                      }}
                    >
                      Clear {taskStatus === "all" ? "Finished" : taskStatus}
                    </button>
                  </div>
                }
              >
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
                      {filteredTasks.slice(0, 100).map(t => {
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
                                      onClick: async () => {
                                        if (confirm(`Delete task ${t.id} (${t.tool})?`)) {
                                          try {
                                            await api.deleteTask(t.id);
                                            setNotice({ intent: "info", text: `Deleted task ${t.id}.` });
                                            load();
                                          } catch (ex: any) {
                                            setErr(`Delete task failed: ${ex.message}`);
                                          }
                                        }
                                      },
                                    },
                                  ]}
                                />
                              </td>
                            </tr>
                            {isOpen && info && (
                              <tr>
                                <td colSpan={7} style={{ background: "var(--colorNeutralBackground2)", padding: 16 }}>
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
                                            <button
                                              type="button"
                                              className="f2-btn f2-btn-sm"
                                              onClick={() => setLightbox({
                                                src: `data:${info.mimeType};base64,${info.imageBase64}`,
                                                title: `Task ${t.id} — ${deviceNameOf(t.device_id)} (${fmt(t.updated_at)})`,
                                              })}
                                            >
                                              Expand Fullscreen
                                            </button>
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
                          onClick: async () => {
                            if (confirm(`Delete approval record ${a.id} (${a.tool})?`)) {
                              try {
                                await api.deleteApproval(a.id);
                                setNotice({ intent: "info", text: `Deleted approval ${a.id}.` });
                                load();
                              } catch (ex: any) {
                                setErr(`Delete approval failed: ${ex.message}`);
                              }
                            }
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
              title={`Audit Trail (${filteredAudit.length} events shown)`}
              action={<button type="button" className="f2-btn f2-btn-sm" onClick={async () => {
                try { const data = await api.exportAudit(); const blob = new Blob([data.events.map((e: any) => JSON.stringify(e)).join("\n")], { type: "application/x-ndjson" });
                  const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = "ai-bridge-audit.jsonl"; link.click(); URL.revokeObjectURL(url);
                } catch (ex: any) { setErr(`Audit export failed: ${ex.message}`); }
              }}>Export JSONL</button>}
            >
              <div style={{ marginBottom: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
                <input
                  className="f2-input"
                  value={auditQuery}
                  onChange={e => setAuditQuery(e.target.value)}
                  placeholder="Filter by actor, tool, device ID, or decision…"
                  style={{ flex: 1, minWidth: 240 }}
                />
                <select className="f2-select" value={auditTool} onChange={e => setAuditTool(e.target.value)}>
                  <option value="all">All tools</option>
                  {[...new Set(audit.map(a => a.tool).filter(Boolean))].map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
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
                    {filteredAudit.map(a => (
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
            </Card>
          )}

          {/* ==================== POLICIES & WEBHOOKS ==================== */}
          {view === "policies" && (
            <div style={{ display: "grid", gap: 16 }}>
              {/* Policy Scope Tabs: Global vs Per-Device */}
              <div style={{ display: "flex", gap: 8, borderBottom: "1px solid var(--colorNeutralStroke2)", paddingBottom: 10, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    type="button"
                    className="f2-chip"
                    data-active={String(policySubTab === "global")}
                    onClick={() => setPolicySubTab("global")}
                    style={{ fontSize: 13, padding: "6px 14px" }}
                  >
                    🌐 Global Fleet Policy Baseline
                  </button>
                  <button
                    type="button"
                    className="f2-chip"
                    data-active={String(policySubTab === "devices")}
                    onClick={() => {
                      setPolicySubTab("devices");
                      if (!selectedPolicyDeviceId && devices.length > 0) {
                        setSelectedPolicyDeviceId(devices[0].id);
                      }
                    }}
                    style={{ fontSize: 13, padding: "6px 14px" }}
                  >
                    🛡️ Per-Device & Server Guardrails ({devices.length})
                  </button>
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
                        <select
                          className="f2-select"
                          value={selectedPolicyDeviceId || devices[0]?.id}
                          onChange={e => setSelectedPolicyDeviceId(e.target.value)}
                          style={{ minWidth: 260, flex: 1 }}
                        >
                          {devices.map(d => (
                            <option key={d.id} value={d.id}>
                              {d.name} ({d.os || "linux"} - {d.hostname || d.id}) {d.has_custom_policy ? "[Custom Guardrails Active]" : "[Global Baseline]"}
                            </option>
                          ))}
                        </select>
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
                        <label className="f2-switch-label">
                          <input type="checkbox" checked={polTier3} onChange={e => setPolTier3(e.target.checked)} style={{ display: "none" }} />
                          <span className="f2-switch" data-checked={String(polTier3)} />
                          <div>
                            <div style={{ fontWeight: 600 }}>Allow Tier-3 Operations Unattended</div>
                            <div style={{ fontSize: 12, color: "var(--colorNeutralForeground3)" }}>
                              Execute Tier-3 tools without queuing for manual approval
                            </div>
                          </div>
                        </label>
                      </div>

                      <div style={{ padding: 12, borderRadius: 6, border: "1px solid var(--colorNeutralStroke2)", background: "var(--colorNeutralBackground2)" }}>
                        <label className="f2-switch-label">
                          <input type="checkbox" checked={polDesktop} onChange={e => setPolDesktop(e.target.checked)} style={{ display: "none" }} />
                          <span className="f2-switch" data-checked={String(polDesktop)} />
                          <div>
                            <div style={{ fontWeight: 600 }}>Enable Desktop Automation & Vision</div>
                            <div style={{ fontSize: 12, color: "var(--colorNeutralForeground3)" }}>
                              Permit screenshots, approved app launches, and UI actions
                            </div>
                          </div>
                        </label>
                      </div>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12 }}>
                      <div>
                        <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4, color: "var(--colorNeutralForeground2)" }}>
                          Allowed Desktop Applications (comma-separated)
                        </label>
                        <input
                          className="f2-input"
                          value={polApps}
                          onChange={e => setPolApps(e.target.value)}
                          placeholder="chrome, code, notepad, msedge, firefox, terminal"
                          style={{ width: "100%" }}
                        />
                      </div>

                      <div>
                        <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4, color: "var(--colorNeutralForeground2)" }}>
                          Allowed System Services (comma-separated)
                        </label>
                        <input
                          className="f2-input"
                          value={polServices}
                          onChange={e => setPolServices(e.target.value)}
                          placeholder="nginx, docker, ssh, postgresql, redis"
                          style={{ width: "100%" }}
                        />
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                      <input
                        className="f2-input"
                        value={polNote}
                        onChange={e => setPolNote(e.target.value)}
                        placeholder="Change note for audit history (optional)"
                        style={{ flex: 1, minWidth: 240 }}
                      />
                      <button type="submit" className="f2-btn f2-btn-primary">
                        Save New Policy Version
                      </button>
                    </div>
                  </form>
                ) : (
                  <p style={{ color: "var(--colorNeutralForeground3)", fontSize: 13 }}>Loading policy…</p>
                )}
              </Card>

              <Card title="Approval Webhook Notifications (Slack / Discord / Telegram / Custom)">
                <p style={{ margin: "0 0 10px", fontSize: 13, color: "var(--colorNeutralForeground2)" }}>
                  Receive an instant HTTP POST notification whenever a task enters <code>needs_approval</code>. Supports Slack, Discord, Telegram Bot URLs (<code>https://api.telegram.org/botTOKEN/sendMessage?chat_id=ID</code>), or any JSON endpoint.
                </p>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <input
                    className="f2-input"
                    value={webhookUrl}
                    onChange={e => setWebhookUrl(e.target.value)}
                    placeholder="https://hooks.slack.com/services/... or https://discord.com/api/webhooks/..."
                    style={{ flex: 1, minWidth: 280 }}
                  />
                  <button
                    type="button"
                    className="f2-btn f2-btn-primary"
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
                  </button>
                  <button
                    type="button"
                    className="f2-btn"
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
                  </button>
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
                                    onClick: async () => {
                                      if (confirm(`Delete policy version v${p.version}?`)) {
                                        try {
                                          await api.deletePolicyVersion(p.version);
                                          setNotice({ intent: "info", text: `Deleted policy version v${p.version}.` });
                                          load();
                                        } catch (ex: any) {
                                          setErr(`Delete policy failed: ${ex.message}`);
                                        }
                                      }
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
                  <p style={{ fontSize: 13, margin: "8px 0 4px" }}>Loopback <code>:{connections?.oauth_gateway.port || 8002}</code> · Device Token Required</p>
                  <span style={{ fontSize: 12, color: "var(--colorNeutralForeground3)" }}>Binds MCP bearer tokens to enrolled devices</span>
                </Card>
              </div>

              <Card title="MCP Client Setup & Required Device Binding Workflow">
                <div className="f2-stepper">
                  <div className="f2-step-box">
                    <span className="f2-step-num">STEP 01 · ENROLL DEVICE</span>
                    <b>Issue Device Token</b>
                    <span style={{ fontSize: 12, color: "var(--colorNeutralForeground3)" }}>
                      Go to <b>Devices → Enroll Device</b> to generate a one-time token for your Windows or Linux agent.
                    </span>
                  </div>
                  <div className="f2-step-box">
                    <span className="f2-step-num">STEP 02 · ADD MCP SERVER</span>
                    <b>Connect Claude / ChatGPT</b>
                    <span style={{ fontSize: 12, color: "var(--colorNeutralForeground3)" }}>
                      Point your MCP client to <code>{origin}/mcp</code>. It will automatically discover OAuth 2.1 + PKCE metadata.
                    </span>
                  </div>
                  <div className="f2-step-box">
                    <span className="f2-step-num">STEP 03 · AUTHORIZE &amp; BIND</span>
                    <b>Enter Admin + Device Token</b>
                    <span style={{ fontSize: 12, color: "var(--colorNeutralForeground3)" }}>
                      On the Fluent 2 consent screen, provide both tokens so every MCP tool call is routed to your device.
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
                                        onClick: async () => {
                                          if (confirm(`Delete OAuth client "${c.client_name || cid}" and revoke its tokens?`)) {
                                            try {
                                              await api.deleteOAuthClient(cid);
                                              setNotice({ intent: "warning", text: `Deleted OAuth client ${c.client_name || cid}.` });
                                              load();
                                            } catch (ex: any) {
                                              setErr(`Delete OAuth client failed: ${ex.message}`);
                                            }
                                          }
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
                <select className="f2-select" value={logService} onChange={e => setLogService(e.target.value)}>
                  <option value="control">Control Plane (ai-bridge-control)</option>
                  <option value="mcp">MCP Server (ai-bridge-mcp)</option>
                  <option value="oauth">OAuth Gateway (ai-bridge-oauth)</option>
                  <option value="nginx">Nginx Reverse Proxy (/mcp & /api)</option>
                </select>

                <select className="f2-select" value={logCount} onChange={e => setLogCount(Number(e.target.value))}>
                  <option value={50}>50 lines</option>
                  <option value={100}>100 lines</option>
                  <option value={200}>200 lines</option>
                </select>

                <button type="button" className="f2-btn" onClick={() => load()}>
                  Refresh Logs
                </button>
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
        </main>
      </div>

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
                <button type="button" className="f2-btn f2-btn-sm" onClick={() => setLightbox(null)}>
                  Close
                </button>
              </div>
            </div>
            <img src={lightbox.src} alt="Fullscreen Desktop Screenshot" style={{ maxWidth: "86vw", maxHeight: "78vh", borderRadius: 6, display: "block" }} />
          </div>
        </div>
      )}

      {/* Fluent 2 Command Palette Modal (Ctrl+K) */}
      {cmdOpen && (
        <div className="f2-modal-backdrop" onClick={() => setCmdOpen(false)}>
          <div className="f2-cmd-modal" onClick={e => e.stopPropagation()}>
            <input
              autoFocus
              className="f2-cmd-input"
              value={cmdQuery}
              onChange={e => setCmdQuery(e.target.value)}
              placeholder="Type a view name, tool preset, or action (Esc to close)…"
            />
            <div className="f2-cmd-list">
              <div className="f2-nav-section-label">Navigate Views</div>
              {(Object.keys(VIEW_META) as View[])
                .filter(v => !cmdQuery || v.includes(cmdQuery.toLowerCase()) || VIEW_META[v].title.toLowerCase().includes(cmdQuery.toLowerCase()))
                .map(v => (
                  <button
                    key={`nav-${v}`}
                    type="button"
                    className="f2-cmd-item"
                    onClick={() => {
                      if (v === "device_detail" && !selectedDeviceIdForDashboard && devices.length > 0) {
                        setSelectedDeviceIdForDashboard(devices[0].id);
                      }
                      setView(v);
                      setCmdOpen(false);
                    }}
                  >
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
                      <FluentIcon name={v} />
                      <span><b>{VIEW_META[v].title}</b></span>
                    </span>
                    <span className="f2-kbd" style={{ textTransform: "capitalize" }}>{v}</span>
                  </button>
                ))}

              <div className="f2-nav-section-label" style={{ marginTop: 6 }}>Quick Task Presets</div>
              {TASK_PRESETS
                .filter(p => !cmdQuery || p.label.toLowerCase().includes(cmdQuery.toLowerCase()) || p.tool.toLowerCase().includes(cmdQuery.toLowerCase()))
                .map(p => (
                  <button
                    key={`preset-${p.label}`}
                    type="button"
                    className="f2-cmd-item"
                    onClick={() => {
                      setTaskTool(p.tool);
                      setTaskArgs(p.args);
                      setView("tasks");
                      setCmdOpen(false);
                    }}
                  >
                    <span><b>{p.label}</b> — <code>{p.tool}</code></span>
                    <span className="f2-kbd">Preset</span>
                  </button>
                ))}

              <div className="f2-nav-section-label" style={{ marginTop: 6 }}>Preferences</div>
              <button
                type="button"
                className="f2-cmd-item"
                onClick={() => {
                  setTheme(theme === "light" ? "dark" : "light");
                  setCmdOpen(false);
                }}
              >
                <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
                  <FluentIcon name="theme" />
                  <span>Toggle Fluent 2 {theme === "light" ? "Dark" : "Light"} Theme</span>
                </span>
                <span className="f2-kbd">Theme</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Fluent 2 Edit Record Modal */}
      {editModal && (
        <div className="f2-modal-backdrop" onClick={() => setEditModal(null)}>
          <div className="f2-modal" style={{ width: "100%", maxWidth: 480 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>
                Edit {editModal.kind === "oauth_client" ? "OAuth Client" : editModal.kind.charAt(0).toUpperCase() + editModal.kind.slice(1)} Record
              </h3>
              <button type="button" className="f2-btn f2-btn-sm" onClick={() => setEditModal(null)}>
                Close
              </button>
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
                    <input
                      className="f2-input"
                      style={{ width: "100%" }}
                      value={editModal.data.name}
                      onChange={e => setEditModal({ ...editModal, data: { ...editModal.data, name: e.target.value } })}
                      required
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Hostname</label>
                    <input
                      className="f2-input"
                      style={{ width: "100%" }}
                      value={editModal.data.hostname}
                      onChange={e => setEditModal({ ...editModal, data: { ...editModal.data, hostname: e.target.value } })}
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Operating System</label>
                    <input
                      className="f2-input"
                      style={{ width: "100%" }}
                      value={editModal.data.os}
                      onChange={e => setEditModal({ ...editModal, data: { ...editModal.data, os: e.target.value } })}
                    />
                  </div>
                  <label className="f2-switch-label" style={{ marginTop: 4 }}>
                    <input
                      type="checkbox"
                      checked={!!editModal.data.revoked}
                      onChange={e => setEditModal({ ...editModal, data: { ...editModal.data, revoked: e.target.checked } })}
                      style={{ display: "none" }}
                    />
                    <span className="f2-switch" data-checked={String(!!editModal.data.revoked)} />
                    <span>Revoked (uncheck to restore device access)</span>
                  </label>
                </>
              )}

              {editModal.kind === "task" && (
                <>
                  <div>
                    <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Tool</label>
                    <select
                      className="f2-select"
                      style={{ width: "100%" }}
                      value={editModal.data.tool}
                      onChange={e => setEditModal({ ...editModal, data: { ...editModal.data, tool: e.target.value } })}
                    >
                      {TOOLS.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Arguments (JSON)</label>
                    <input
                      className="f2-input"
                      style={{ width: "100%", fontFamily: "var(--fontFamilyMonospace)" }}
                      value={editModal.data.args_json}
                      onChange={e => setEditModal({ ...editModal, data: { ...editModal.data, args_json: e.target.value } })}
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Status (set to "queued" to re-run)</label>
                    <select
                      className="f2-select"
                      style={{ width: "100%" }}
                      value={editModal.data.status}
                      onChange={e => setEditModal({ ...editModal, data: { ...editModal.data, status: e.target.value } })}
                    >
                      {["queued", "running", "needs_approval", "completed", "failed", "cancelled"].map(s => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                </>
              )}
              {editModal.kind === "policy" && (
                <>
                  <label className="f2-switch-label">
                    <input
                      type="checkbox"
                      checked={!!editModal.data.allow_tier3}
                      onChange={e => setEditModal({ ...editModal, data: { ...editModal.data, allow_tier3: e.target.checked } })}
                      style={{ display: "none" }}
                    />
                    <span className="f2-switch" data-checked={String(!!editModal.data.allow_tier3)} />
                    <span>Allow Tier-3 Operations Unattended</span>
                  </label>
                  <label className="f2-switch-label">
                    <input
                      type="checkbox"
                      checked={!!editModal.data.desktop_enabled}
                      onChange={e => setEditModal({ ...editModal, data: { ...editModal.data, desktop_enabled: e.target.checked } })}
                      style={{ display: "none" }}
                    />
                    <span className="f2-switch" data-checked={String(!!editModal.data.desktop_enabled)} />
                    <span>Enable Desktop Automation &amp; Vision</span>
                  </label>
                  <div>
                    <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Allowed Apps (comma-separated)</label>
                    <input
                      className="f2-input"
                      style={{ width: "100%" }}
                      value={editModal.data.allowed_apps}
                      onChange={e => setEditModal({ ...editModal, data: { ...editModal.data, allowed_apps: e.target.value } })}
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Allowed Services (comma-separated)</label>
                    <input
                      className="f2-input"
                      style={{ width: "100%" }}
                      value={editModal.data.allowed_services}
                      onChange={e => setEditModal({ ...editModal, data: { ...editModal.data, allowed_services: e.target.value } })}
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Version Note</label>
                    <input
                      className="f2-input"
                      style={{ width: "100%" }}
                      value={editModal.data.note}
                      onChange={e => setEditModal({ ...editModal, data: { ...editModal.data, note: e.target.value } })}
                    />
                  </div>
                </>
              )}

              {editModal.kind === "oauth_client" && (
                <>
                  <div>
                    <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Client Name</label>
                    <input
                      className="f2-input"
                      style={{ width: "100%" }}
                      value={editModal.data.client_name}
                      onChange={e => setEditModal({ ...editModal, data: { ...editModal.data, client_name: e.target.value } })}
                      required
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Redirect URIs</label>
                    <input
                      className="f2-input"
                      style={{ width: "100%", fontFamily: "var(--fontFamilyMonospace)" }}
                      value={editModal.data.redirect_uris}
                      onChange={e => setEditModal({ ...editModal, data: { ...editModal.data, redirect_uris: e.target.value } })}
                      required
                    />
                  </div>
                </>
              )}

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 6 }}>
                <button type="button" className="f2-btn" onClick={() => setEditModal(null)}>
                  Cancel
                </button>
                <button type="submit" className="f2-btn f2-btn-primary">
                  Save Changes
                </button>
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
              <button
                type="button"
                className="f2-btn f2-btn-subtle f2-btn-sm"
                onClick={() => setDevicePolicyModalId(null)}
                title="Close modal"
              >
                ✕
              </button>
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
