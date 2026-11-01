import React, { useState, useEffect } from "react";
import { ConfirmDialog, type ConfirmRequest } from "./ConfirmDialog";
import { api } from "./api";
import {
  JXButton,
  JXSwitch,
  JXSelect,
  JXTextField,
  JXChip,
} from "@jacxishippingorg/jx-ui-react";

export interface ToolMetadata {
  name: string;
  category: "diagnostics" | "workspace" | "dev" | "execution" | "desktop" | "governance";
  label: string;
  description: string;
  tier: number; // 1: Read-only, 2: Low-risk, 3: Sensitive, 4: High-risk
}

export const FLEET_TOOLS: ToolMetadata[] = [
  // Fleet Diagnostics & Health
  { name: "get_system_info", category: "diagnostics", label: "System Information", description: "Query CPU, architecture, kernel, hostname, and OS details", tier: 1 },
  { name: "get_resource_usage", category: "diagnostics", label: "CPU & Memory Utilization", description: "Real-time CPU and RAM percentage load telemetry", tier: 1 },
  { name: "get_network_info", category: "diagnostics", label: "Network & Listening Ports", description: "Query network adapters, IPv4/IPv6 addresses, and listening sockets", tier: 1 },
  { name: "get_disk_usage", category: "diagnostics", label: "Disk Storage Usage", description: "Storage partition capacities, used/free disk space", tier: 1 },
  { name: "get_memory_usage", category: "diagnostics", label: "Memory & Swap Stats", description: "Detailed RAM breakdown, buffers, cache, and swap memory", tier: 1 },
  { name: "list_processes", category: "diagnostics", label: "Process Tree & Top Consumers", description: "Inspect active OS processes, PIDs, and memory usage", tier: 1 },
  { name: "get_service_status", category: "diagnostics", label: "Service Health Status", description: "Check status of systemd units or Windows Services", tier: 1 },
  { name: "get_recent_logs", category: "diagnostics", label: "Recent System Logs", description: "Inspect read-only journalctl or Windows Event logs", tier: 1 },
  { name: "list_docker_containers", category: "diagnostics", label: "Docker Containers", description: "Inspect running Docker containers, status, and ports", tier: 1 },
  { name: "get_device_status", category: "diagnostics", label: "Device Heartbeat Status", description: "Heartbeat, network latency, and connectivity state", tier: 1 },

  // Workspace & Code Editing
  { name: "list_workspace", category: "workspace", label: "List Workspace Files", description: "Directory trees, file names, and directory structures", tier: 1 },
  { name: "read_workspace_file", category: "workspace", label: "Read Workspace File", description: "Read contents of files within approved project paths", tier: 1 },
  { name: "search_workspace", category: "workspace", label: "Search Workspace (Grep)", description: "Fast full-text regex code and configuration grep", tier: 1 },
  { name: "create_workspace_file", category: "workspace", label: "Create Workspace File", description: "Create new source or configuration files in workspace", tier: 2 },
  { name: "edit_workspace_file", category: "workspace", label: "Edit Workspace File", description: "Apply targeted replacements to existing workspace files", tier: 3 },
  { name: "move_workspace_file", category: "workspace", label: "Move / Rename File", description: "Relocate or rename workspace files and directories", tier: 3 },
  { name: "delete_workspace_file", category: "workspace", label: "Delete Workspace File", description: "Permanently delete files from the workspace directory", tier: 4 },

  // Dev, Git & Testing
  { name: "git_status", category: "dev", label: "Git Branch & Status", description: "Inspect current git branch, staged and unstaged files", tier: 1 },
  { name: "git_diff", category: "dev", label: "Git Diff Inspection", description: "Inspect line-by-line diffs of pending codebase changes", tier: 1 },
  { name: "run_project_tests", category: "dev", label: "Run Test Suites", description: "Execute pytest, npm test, or go test suites in workspace", tier: 2 },
  { name: "run_linter", category: "dev", label: "Run Code Linter", description: "Run static code analysis, flake8, or eslint checks", tier: 2 },

  // Execution & Packages
  { name: "run_shell", category: "execution", label: "Terminal Shell Execution", description: "Execute commands in PowerShell or bash shell sessions", tier: 3 },
  { name: "install_package", category: "execution", label: "Package Installation", description: "Install system packages via apt-get, winget, or npm", tier: 3 },
  { name: "create_backup", category: "execution", label: "Create Backup Snapshot", description: "Generate point-in-time workspace snapshot archive", tier: 3 },
  { name: "deploy_application", category: "execution", label: "Deploy Application", description: "Trigger application build, reload, or deploy scripts", tier: 3 },

  // Desktop Automation & UI (Full Mouse & Keyboard)
  { name: "get_desktop_status", category: "desktop", label: "Desktop Environment Status", description: "Query active displays, resolution, and window state", tier: 1 },
  { name: "capture_desktop_screenshot", category: "desktop", label: "Capture Screen Vision", description: "Capture high-resolution screenshots of the desktop", tier: 3 },
  { name: "take_screenshot", category: "desktop", label: "Take Screenshot", description: "Quick screenshot capture with dimensions and active window metadata", tier: 3 },
  { name: "mouse_click", category: "desktop", label: "Mouse Click", description: "Click mouse at (x, y) with left, right, or middle button; single/double click", tier: 3 },
  { name: "mouse_move", category: "desktop", label: "Mouse Move", description: "Move mouse cursor to (x, y) coordinates", tier: 3 },
  { name: "mouse_scroll", category: "desktop", label: "Mouse Scroll", description: "Scroll mouse wheel up or down at cursor position", tier: 3 },
  { name: "mouse_drag", category: "desktop", label: "Mouse Drag", description: "Click and drag mouse from start coordinates to end coordinates", tier: 3 },
  { name: "keyboard_type", category: "desktop", label: "Keyboard Type Text", description: "Type unicode text into focused window using native Win32 SendInput", tier: 3 },
  { name: "keyboard_press", category: "desktop", label: "Keyboard Key / Hotkey", description: "Press key or combo (e.g. enter, tab, ctrl+c, alt+tab, win)", tier: 3 },
  { name: "list_desktop_windows", category: "desktop", label: "List Desktop Windows", description: "List all visible top-level windows and their bounds", tier: 1 },
  { name: "focus_window", category: "desktop", label: "Focus Window", description: "Bring window matching title to foreground and restore if minimized", tier: 3 },
  { name: "get_screen_size", category: "desktop", label: "Get Screen Resolution", description: "Query primary desktop resolution and viewport size", tier: 1 },
  { name: "launch_approved_application", category: "desktop", label: "Launch Approved App", description: "Launch allowlisted GUI application from policy allowlist", tier: 3 },
  { name: "perform_approved_ui_action", category: "desktop", label: "Perform UI Actions", description: "Simulate click, keystrokes, or window focus actions", tier: 3 },
];

export const DESKTOP_TOOL_NAMES = [
  "capture_desktop_screenshot", "take_screenshot", "launch_approved_application",
  "perform_approved_ui_action", "mouse_click", "mouse_move", "mouse_scroll",
  "mouse_drag", "keyboard_type", "keyboard_press", "list_desktop_windows",
  "focus_window", "get_screen_size"
];

export const CATEGORY_LABELS: Record<string, { label: string; icon: string }> = {
  all: { label: "All Abilities", icon: "⚡" },
  diagnostics: { label: "Diagnostics & Health", icon: "📊" },
  workspace: { label: "Workspace & Files", icon: "📁" },
  dev: { label: "Dev & Testing", icon: "🧪" },
  execution: { label: "Terminal & Packages", icon: "💻" },
  desktop: { label: "Desktop Vision & UI", icon: "🖥️" },
};

function TierBadge({ tier }: { tier: number }) {
  if (tier === 1) return <span className="f2-badge" data-tone="grey" style={{ fontSize: 11, padding: "1px 6px" }}>Tier 1 Read-Only</span>;
  if (tier === 2) return <span className="f2-badge" data-tone="blue" style={{ fontSize: 11, padding: "1px 6px" }}>Tier 2 Low-Risk</span>;
  if (tier === 3) return <span className="f2-badge" data-tone="amber" style={{ fontSize: 11, padding: "1px 6px" }}>Tier 3 Sensitive</span>;
  return <span className="f2-badge" data-tone="red" style={{ fontSize: 11, padding: "1px 6px" }}>Tier 4 High-Risk</span>;
}

interface DevicePolicyEditorProps {
  deviceId: string;
  onClose?: () => void;
  onSaved?: (res: any) => void;
  isModal?: boolean;
}

export function DevicePolicyEditor({ deviceId, onClose, onSaved, isModal = false }: DevicePolicyEditorProps) {
  const [loading, setLoading] = useState(true);
  const [deviceData, setDeviceData] = useState<any>(null);
  const [err, setErr] = useState("");
  const [notice, setNotice] = useState("");
  const [confirmReq, setConfirmReq] = useState<ConfirmRequest | null>(null);

  // Guardrail form states
  const [inheritGlobal, setInheritGlobal] = useState(true);
  const [unrestricted, setUnrestricted] = useState(false);
  const [allowWrites, setAllowWrites] = useState(true);
  const [allowTier3, setAllowTier3] = useState(false);
  const [desktopEnabled, setDesktopEnabled] = useState(false);
  const [allowShell, setAllowShell] = useState(true);
  const [allowPackageInstall, setAllowPackageInstall] = useState(true);
  const [allowFileDeletion, setAllowFileDeletion] = useState(false);
  const [maxTierUnattended, setMaxTierUnattended] = useState<number>(2);
  const [allowedApps, setAllowedApps] = useState("");
  const [allowedServices, setAllowedServices] = useState("");
  const [deniedTools, setDeniedTools] = useState<Set<string>>(new Set());
  const [note, setNote] = useState("");

  // Filter and search
  const [filterText, setFilterText] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);

  async function fetchPolicy() {
    setLoading(true);
    setErr("");
    try {
      const data = await api.devicePolicy(deviceId);
      setDeviceData(data);
      const custom = data.custom_policy || {};
      const hasCustom = !!data.has_custom_policy;
      setInheritGlobal(!hasCustom || custom.inherit_global !== false);

      const eff = data.effective_policy || {};
      const isUnrestricted = !!eff.unrestricted || (data.os && data.os.toLowerCase().includes("linux") && !eff.restricted);
      setUnrestricted(isUnrestricted);
      setAllowWrites(eff.allow_writes !== false);
      setAllowTier3(!!eff.allow_tier3);
      setDesktopEnabled(!!eff.desktop_enabled);
      setAllowShell(!eff.denied_tools?.includes("run_shell"));
      setAllowPackageInstall(!eff.denied_tools?.includes("install_package"));
      setAllowFileDeletion(!eff.denied_tools?.includes("delete_workspace_file"));
      setMaxTierUnattended(eff.max_tier_unattended ?? 2);
      setAllowedApps((eff.allowed_apps || []).join(", "));
      setAllowedServices((eff.allowed_services || []).join(", "));
      setDeniedTools(new Set(eff.denied_tools || []));
      setNote(custom.note || "");
    } catch (e: any) {
      setErr(`Failed to load device policy: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (deviceId) fetchPolicy();
  }, [deviceId]);

  // Ability toggle helper
  function toggleAbility(toolName: string, allow: boolean) {
    setInheritGlobal(false);
    setDeniedTools(prev => {
      const next = new Set(prev);
      if (allow) {
        next.delete(toolName);
      } else {
        next.add(toolName);
      }
      return next;
    });

    // Keep high level switches in sync
    if (toolName === "run_shell") setAllowShell(allow);
    if (toolName === "install_package") setAllowPackageInstall(allow);
    if (toolName === "delete_workspace_file") setAllowFileDeletion(allow);
    if (["capture_desktop_screenshot", "launch_approved_application", "perform_approved_ui_action"].includes(toolName)) {
      if (!allow) {
        // If all desktop tools are blocked, can turn off desktop switch
      }
    }
  }

  // Bulk category toggling
  function setCategoryAbilities(category: string, allow: boolean) {
    setInheritGlobal(false);
    const targetTools = category === "all"
      ? FLEET_TOOLS
      : FLEET_TOOLS.filter(t => t.category === category);

    setDeniedTools(prev => {
      const next = new Set(prev);
      for (const t of targetTools) {
        if (allow) next.delete(t.name);
        else next.add(t.name);
      }
      return next;
    });

    if (category === "execution" || category === "all") {
      setAllowShell(allow);
      setAllowPackageInstall(allow);
    }
    if (category === "workspace" || category === "all") {
      if (!allow) setAllowWrites(false);
      setAllowFileDeletion(allow);
    }
    if (category === "desktop" || category === "all") {
      setDesktopEnabled(allow);
    }
    if (category === "all" && allow) {
      setAllowWrites(true);
      setAllowTier3(true);
      setDesktopEnabled(true);
      setAllowShell(true);
      setAllowPackageInstall(true);
      setAllowFileDeletion(true);
      setMaxTierUnattended(4);
    } else if (category === "all" && !allow) {
      setAllowWrites(false);
      setAllowTier3(false);
      setDesktopEnabled(false);
      setAllowShell(false);
      setAllowPackageInstall(false);
      setAllowFileDeletion(false);
      setMaxTierUnattended(1);
    }
  }

  // Preset role applicators
  function applyPreset(preset: "linux_server" | "strict_prod" | "dev_agent" | "workstation" | "unattended" | "lockdown") {
    setInheritGlobal(false);
    if (preset === "linux_server") {
      // Linux Server (Unrestricted / No Policy Restrictions): Full autonomy for DevOps, maintenance, deployments
      setUnrestricted(true);
      setAllowWrites(true);
      setAllowTier3(true);
      setDesktopEnabled(true);
      setAllowShell(true);
      setAllowPackageInstall(true);
      setAllowFileDeletion(true);
      setMaxTierUnattended(4);
      setDeniedTools(new Set());
      setAllowedApps("*");
      setAllowedServices("*");
      setNote("Applied Linux Server (Unrestricted / No Policy Restrictions) preset");
    } else if (preset === "strict_prod") {
      setUnrestricted(false);
      // Production Server Strict: Diagnostics only, write blocked, shell blocked, package blocked, deletion blocked
      setAllowWrites(false);
      setAllowTier3(false);
      setDesktopEnabled(false);
      setAllowShell(false);
      setAllowPackageInstall(false);
      setAllowFileDeletion(false);
      setMaxTierUnattended(1);
      const denied = new Set([
        "run_shell", "install_package", "delete_workspace_file",
        "create_workspace_file", "edit_workspace_file", "move_workspace_file",
        "deploy_application", "create_backup",
        "capture_desktop_screenshot", "launch_approved_application", "perform_approved_ui_action"
      ]);
      setDeniedTools(denied);
      setNote("Applied Production Server (Strict Guardrails) preset");
    } else if (preset === "dev_agent") {
      // Dev & Build Agent: File edits, linters, tests, package install; No shell or deletion without approval
      setAllowWrites(true);
      setAllowTier3(true);
      setDesktopEnabled(false);
      setAllowShell(true);
      setAllowPackageInstall(true);
      setAllowFileDeletion(false);
      setMaxTierUnattended(3);
      const denied = new Set([
        "delete_workspace_file",
        "capture_desktop_screenshot", "launch_approved_application", "perform_approved_ui_action"
      ]);
      setDeniedTools(denied);
      setNote("Applied Dev & Build Agent preset");
    } else if (preset === "workstation") {
      // Interactive Workstation: Full desktop vision & UI, writes allowed, shell allowed, safe packages
      setAllowWrites(true);
      setAllowTier3(true);
      setDesktopEnabled(true);
      setAllowShell(true);
      setAllowPackageInstall(true);
      setAllowFileDeletion(false);
      setMaxTierUnattended(3);
      setDeniedTools(new Set(["delete_workspace_file"]));
      setNote("Applied Interactive Workstation preset");
    } else if (preset === "unattended") {
      // Full Unattended: High trust, tier 3 & 4 unattended, all tools allowed without approval
      setAllowWrites(true);
      setAllowTier3(true);
      setDesktopEnabled(true);
      setAllowShell(true);
      setAllowPackageInstall(true);
      setAllowFileDeletion(true);
      setMaxTierUnattended(4);
      setDeniedTools(new Set());
      setNote("Applied Full Unattended High-Trust preset (No approvals required)");
    } else if (preset === "lockdown") {
      // Total Lockdown: Read-only diagnostics ONLY
      setAllowWrites(false);
      setAllowTier3(false);
      setDesktopEnabled(false);
      setAllowShell(false);
      setAllowPackageInstall(false);
      setAllowFileDeletion(false);
      setMaxTierUnattended(1);
      const nonRead = FLEET_TOOLS.filter(t => t.tier > 1).map(t => t.name);
      setDeniedTools(new Set(nonRead));
      setNote("Applied Total Lockdown preset");
    }
  }

  async function handleSave() {
    setSaving(true);
    setErr("");
    setNotice("");
    try {
      const apps = allowedApps.split(",").map(s => s.trim()).filter(Boolean);
      const services = allowedServices.split(",").map(s => s.trim()).filter(Boolean);

      // Build denied list including switch states
      const activeDenied = new Set(deniedTools);
      if (!allowShell) activeDenied.add("run_shell");
      else activeDenied.delete("run_shell");

      if (!allowPackageInstall) activeDenied.add("install_package");
      else activeDenied.delete("install_package");

      if (!allowFileDeletion) activeDenied.add("delete_workspace_file");
      else activeDenied.delete("delete_workspace_file");

      if (!allowWrites) {
        ["create_workspace_file", "edit_workspace_file", "move_workspace_file", "delete_workspace_file"].forEach(t => activeDenied.add(t));
      }

      if (!desktopEnabled) {
        DESKTOP_TOOL_NAMES.forEach(t => activeDenied.add(t));
      }

      const payload = {
        inherit_global: inheritGlobal,
        unrestricted: unrestricted,
        restricted: !unrestricted,
        allow_writes: allowWrites,
        allow_tier3: allowTier3,
        desktop_enabled: desktopEnabled,
        allow_shell: allowShell,
        allow_package_install: allowPackageInstall,
        allow_file_deletion: allowFileDeletion,
        max_tier_unattended: maxTierUnattended,
        allowed_apps: apps,
        allowed_services: services,
        denied_tools: Array.from(activeDenied),
        allowed_tools: null,
        note: note || "Configured via Device Policy UI",
      };

      const res = await api.setDevicePolicy(deviceId, payload);
      setNotice(`Saved policy guardrails for "${res.device_name}". Propagates to agent on next task poll.`);
      await fetchPolicy();
      if (onSaved) onSaved(res);
    } catch (e: any) {
      setErr(`Save failed: ${e.message}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleReset() {
    setConfirmReq({
      title: `Reset policy for "${deviceData?.device_name || deviceId}"?`,
      message: "The device's custom guardrails will be removed and it will inherit the global server policy. Its current custom settings will be lost.",
      confirmLabel: "Reset to global policy",
      danger: true,
      onConfirm: async () => {
        setResetting(true);
        setErr("");
        setNotice("");
        try {
          await api.resetDevicePolicy(deviceId);
          setNotice(`Device policy reset to inherit global fleet guardrails.`);
          await fetchPolicy();
          if (onSaved) onSaved({ reset: true });
        } catch (e: any) {
          setErr(`Reset failed: ${e.message}`);
        } finally {
          setResetting(false);
        }
      },
    });
  }

  // Filter tools
  const filteredTools = FLEET_TOOLS.filter(tool => {
    if (activeCategory !== "all" && tool.category !== activeCategory) return false;
    if (filterText.trim()) {
      const q = filterText.toLowerCase();
      return tool.name.toLowerCase().includes(q) ||
        tool.label.toLowerCase().includes(q) ||
        tool.description.toLowerCase().includes(q);
    }
    return true;
  });

  const deniedCount = FLEET_TOOLS.filter(t => deniedTools.has(t.name)).length;
  const allowedCount = FLEET_TOOLS.length - deniedCount;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <ConfirmDialog request={confirmReq} onClose={() => setConfirmReq(null)} />
      {/* Device Info & Scope Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap", padding: "14px 16px", borderRadius: 8, background: "var(--colorNeutralBackground2)", border: "1px solid var(--colorNeutralStroke2)" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 20 }}>🛡️</span>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>
              Device Execution Policy & Abilities
            </h3>
            {deviceData?.has_custom_policy ? (
              <span className="f2-badge" data-tone="amber">🛡️ Custom Guardrails Active</span>
            ) : (
              <span className="f2-badge" data-tone="grey">🌐 Inheriting Global Policy</span>
            )}
          </div>
          <div style={{ fontSize: 13, color: "var(--colorNeutralForeground2)", display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <span>Target: <b>{deviceData?.device_name || deviceId}</b></span>
            <span>·</span>
            <span>Host: <code>{deviceData?.hostname || "localhost"}</code></span>
            <span>·</span>
            <span>OS: <code>{deviceData?.os || "linux"}</code></span>
            <span>·</span>
            <span>ID: <code style={{ fontSize: 11 }}>{deviceId}</code></span>
          </div>
        </div>

        {/* Global vs Custom Toggle */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, background: "var(--colorNeutralBackground1)", padding: "4px 8px", borderRadius: 6, border: "1px solid var(--colorNeutralStroke1)" }}>
          <span style={{ fontSize: 12, fontWeight: 600 }}>Policy Scope:</span>
          <JXButton
            variant={inheritGlobal ? "contained" : "soft"}
            size="sm"
            onClick={() => setInheritGlobal(true)}
          >
            🌐 Inherit Global
          </JXButton>
          <JXButton
            variant={!inheritGlobal ? "contained" : "soft"}
            size="sm"
            onClick={() => setInheritGlobal(false)}
          >
            🛡️ Custom Device Guardrails
          </JXButton>
        </div>
      </div>

      {inheritGlobal && (
        <div className="f2-messagebar" data-intent="info" style={{ margin: 0 }}>
          <span>
            <b>Global Policy Mode:</b> This device currently uses the global server security baseline.
            Any customizations below will convert this device to an independent guardrail profile when saved.
          </span>
        </div>
      )}

      {notice && (
        <div className="f2-messagebar" data-intent="success" style={{ margin: 0 }}>
          <span>{notice}</span>
        </div>
      )}

      {err && (
        <div className="f2-messagebar" data-intent="error" style={{ margin: 0 }}>
          <span>{err}</span>
        </div>
      )}

      {/* Role Quick Presets Bar */}
      <div style={{ padding: "12px 14px", borderRadius: 8, border: "1px solid var(--colorNeutralStroke2)", background: "var(--colorNeutralBackground1)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, flexWrap: "wrap", gap: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--colorNeutralForeground1)", display: "flex", alignItems: "center", gap: 6 }}>
            <span>⚡ Quick Role Presets:</span>
            <span style={{ fontSize: 12, fontWeight: 400, color: "var(--colorNeutralForeground3)" }}>(Click to instantly configure safe role abilities)</span>
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <JXButton
              variant="soft"
              size="sm"
              onClick={() => applyPreset("linux_server")}
              title="Linux Server Mode: No execution policy applied."
            >
              🐧 Linux Server (No Policy)
            </JXButton>
            <JXButton
              variant="soft"
              size="sm"
              onClick={() => applyPreset("strict_prod")}
              title="Read-only diagnostics only."
            >
              🛡️ Production Server (Strict)
            </JXButton>
            <JXButton
              variant="soft"
              size="sm"
              onClick={() => applyPreset("dev_agent")}
              title="Allows code editing, project tests, linters, package installs."
            >
              🛠️ Dev & Build Agent
            </JXButton>
            <JXButton
              variant="soft"
              size="sm"
              onClick={() => applyPreset("workstation")}
              title="Permits full desktop control."
            >
              🖥️ Windows Workstation
            </JXButton>
            <JXButton
              variant="soft"
              size="sm"
              onClick={() => applyPreset("unattended")}
              title="High-trust autonomous execution."
            >
              ⚡ Full Unattended
            </JXButton>
            <JXButton
              variant="soft"
              size="sm"
              onClick={() => applyPreset("lockdown")}
              title="Deny all execution."
            >
              🔒 Total Lockdown
            </JXButton>
          </div>
        </div>
      </div>

      {unrestricted && (
        <div style={{ padding: "10px 14px", borderRadius: 8, background: "rgba(14, 112, 14, 0.08)", border: "1px solid rgba(14, 112, 14, 0.3)", display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 22 }}>⚡</span>
          <div>
            <div style={{ fontWeight: 700, color: "#0e700e", fontSize: 13 }}>UNRESTRICTED SERVER MODE ACTIVE</div>
            <div style={{ fontSize: 12, color: "var(--colorNeutralForeground2)" }}>
              No execution policy or human approval guardrails are applied to this machine. All server tools (shell commands, package installs, file modifications, service controls, deployments) execute immediately and autonomously.
            </div>
          </div>
        </div>
      )}

      {/* High-Level Guardrail Switches */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 10 }}>
        {/* Workspace writes */}
        <div style={{ padding: "12px 14px", borderRadius: 8, border: "1px solid var(--colorNeutralStroke2)", background: "var(--colorNeutralBackground2)" }}>
          <JXSwitch
            checked={allowWrites}
            onChange={(val: any) => {
              setInheritGlobal(false);
              setAllowWrites(val);
            }}
            label="Workspace File Edits"
            helperText="Allow creating, editing, and moving workspace files"
          />
        </div>

        {/* Tier-3 Unattended */}
        <div style={{ padding: "12px 14px", borderRadius: 8, border: "1px solid var(--colorNeutralStroke2)", background: "var(--colorNeutralBackground2)" }}>
          <JXSwitch
            checked={allowTier3}
            onChange={(val: any) => {
              setInheritGlobal(false);
              setAllowTier3(val);
            }}
            label="Allow Tier-3 Unattended"
            helperText="Execute Tier-3 tools without human approval"
          />
        </div>

        {/* Desktop Automation */}
        <div style={{ padding: "12px 14px", borderRadius: 8, border: "1px solid var(--colorNeutralStroke2)", background: "var(--colorNeutralBackground2)" }}>
          <JXSwitch
            checked={desktopEnabled}
            onChange={(val: any) => {
              setInheritGlobal(false);
              setDesktopEnabled(val);
              if (!val) {
                setDeniedTools(prev => {
                  const n = new Set(prev);
                  DESKTOP_TOOL_NAMES.forEach(t => n.add(t));
                  return n;
                });
              } else {
                setDeniedTools(prev => {
                  const n = new Set(prev);
                  DESKTOP_TOOL_NAMES.forEach(t => n.delete(t));
                  return n;
                });
              }
            }}
            label="Desktop Vision & UI Automation"
            helperText="Screenshots, window controls, and app launch"
          />
        </div>

        {/* Shell Execution */}
        <div style={{ padding: "12px 14px", borderRadius: 8, border: "1px solid var(--colorNeutralStroke2)", background: "var(--colorNeutralBackground2)" }}>
          <JXSwitch
            checked={allowShell}
            onChange={(val: any) => {
              setInheritGlobal(false);
              setAllowShell(val);
              toggleAbility("run_shell", val);
            }}
            label="Terminal Shell Execution"
            helperText="Allow arbitrary shell execution (run_shell)"
          />
        </div>

        {/* Package Installation */}
        <div style={{ padding: "12px 14px", borderRadius: 8, border: "1px solid var(--colorNeutralStroke2)", background: "var(--colorNeutralBackground2)" }}>
          <JXSwitch
            checked={allowPackageInstall}
            onChange={(val: any) => {
              setInheritGlobal(false);
              setAllowPackageInstall(val);
              toggleAbility("install_package", val);
            }}
            label="Package Installation"
            helperText="Allow installing packages via apt, winget, npm"
          />
        </div>

        {/* File Deletion Safeguard */}
        <div style={{ padding: "12px 14px", borderRadius: 8, border: "1px solid var(--colorNeutralStroke2)", background: "var(--colorNeutralBackground2)" }}>
          <JXSwitch
            checked={allowFileDeletion}
            onChange={(val: any) => {
              setInheritGlobal(false);
              setAllowFileDeletion(val);
              toggleAbility("delete_workspace_file", val);
            }}
            label="File Deletion Safeguard"
            helperText="Permit permanent file deletions (delete_workspace_file)"
          />
        </div>
      </div>

      {/* Autonomous Unattended Level & Approvals Guardrail */}
      <div style={{ padding: 14, borderRadius: 8, border: "1px solid var(--colorNeutralStroke2)", background: "var(--colorNeutralBackground2)", display: "grid", gap: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 13, color: "var(--colorNeutralForeground1)" }}>
              Autonomous Unattended Level (Max Risk Tier Executed without Human Approval)
            </div>
            <div style={{ fontSize: 12, color: "var(--colorNeutralForeground3)" }}>
              Tools above this tier are paused in the Approval Queue and require administrator confirmation before executing.
            </div>
          </div>
          <div style={{ minWidth: 280 }}>
            <JXSelect
              options={[
                { id: "1", label: "Tier 1: Read-Only Only (Tier 2–4 require approval)" },
                { id: "2", label: "Tier 2: Safe Workspace & Tests (Tier 3–4 require approval)" },
                { id: "3", label: "Tier 3: Sensitive Tools Unattended (Tier 4 requires approval)" },
                { id: "4", label: "Tier 4: 🚀 Full Unrestricted Access (No tools require approval)" },
              ]}
              value={String(maxTierUnattended)}
              onChange={(val: any) => {
                setInheritGlobal(false);
                const v = Number(val);
                setMaxTierUnattended(v);
                if (v >= 3) setAllowTier3(true);
                if (v >= 4) setAllowFileDeletion(true);
              }}
            />
          </div>
        </div>
        {maxTierUnattended >= 4 ? (
          <div className="f2-messagebar" data-intent="success" style={{ margin: 0, padding: "8px 12px", fontSize: 12 }}>
            <span><b>✓ Full Autonomous Mode Active:</b> All approved tools execute immediately without human approval on this machine.</span>
          </div>
        ) : (
          <div className="f2-messagebar" data-intent="info" style={{ margin: 0, padding: "8px 12px", fontSize: 12 }}>
            <span>ℹ️ Any operations classified above <b>Tier {maxTierUnattended}</b> will enter <code>needs_approval</code> status and require administrator confirmation.</span>
          </div>
        )}
      </div>

      {/* Granular Abilities Matrix */}
      <div style={{ border: "1px solid var(--colorNeutralStroke1)", borderRadius: 8, padding: 14, background: "var(--colorNeutralBackground1)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 10 }}>
          <div>
            <h4 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>
              Granular Abilities & Tool Matrix ({FLEET_TOOLS.length} Total)
            </h4>
            <div style={{ fontSize: 12, color: "var(--colorNeutralForeground3)" }}>
              Allowed: <b style={{ color: "var(--colorStatusSuccessForeground1)" }}>{allowedCount}</b> · Blocked: <b style={{ color: deniedCount > 0 ? "var(--colorStatusDangerForeground1)" : "inherit" }}>{deniedCount}</b>
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            {/* Category Bulk Actions */}
            <JXButton
              variant="outlined"
              size="sm"
              onClick={() => setCategoryAbilities(activeCategory, true)}
              title="Allow all abilities in this category"
            >
              ✓ Allow All in {activeCategory === "all" ? "Fleet" : CATEGORY_LABELS[activeCategory]?.label}
            </JXButton>
            <JXButton
              variant="soft"
              color="error"
              size="sm"
              onClick={() => setCategoryAbilities(activeCategory, false)}
              title="Disallow all abilities in this category"
            >
              ✕ Block All in {activeCategory === "all" ? "Fleet" : CATEGORY_LABELS[activeCategory]?.label}
            </JXButton>
          </div>
        </div>

        {/* Search & Category Filter Tabs */}
        <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {Object.entries(CATEGORY_LABELS).map(([catKey, catInfo]) => {
              const count = catKey === "all"
                ? FLEET_TOOLS.length
                : FLEET_TOOLS.filter(t => t.category === catKey).length;
              return (
                <JXButton
                  key={catKey}
                  variant={activeCategory === catKey ? "contained" : "soft"}
                  size="sm"
                  onClick={() => setActiveCategory(catKey)}
                >
                  {catInfo.icon} {catInfo.label} ({count})
                </JXButton>
              );
            })}
          </div>

          <div style={{ width: 220 }}>
            <JXTextField
              value={filterText}
              onChange={(val: any) => setFilterText(val)}
              placeholder="Search abilities or tools..."
            />
          </div>
        </div>

        {/* Ability Cards Grid */}
        <div className="f2-ability-grid">
          {filteredTools.map(tool => {
            const isDenied = deniedTools.has(tool.name);
            const isAllowed = !isDenied;

            return (
              <div
                key={tool.name}
                className="f2-ability-card"
                data-allowed={String(isAllowed)}
              >
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 6, marginBottom: 4 }}>
                    <span style={{ fontWeight: 600, fontSize: 13, color: "var(--colorNeutralForeground1)" }}>
                      {tool.label}
                    </span>
                    <TierBadge tier={tool.tier} />
                  </div>
                  <div style={{ fontSize: 11, color: "var(--colorNeutralForeground3)", marginBottom: 6 }}>
                    {tool.description}
                  </div>
                  <code style={{ fontSize: 11, color: "var(--colorNeutralForeground2)", background: "var(--colorNeutralBackground1)", padding: "1px 5px", borderRadius: 3 }}>
                    {tool.name}
                  </code>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4, paddingTop: 6, borderTop: "1px solid var(--colorNeutralStroke2)" }}>
                  <span style={{ fontSize: 12 }}>
                    {isAllowed ? (
                      <span className="f2-badge" data-tone="green" style={{ fontSize: 11, padding: "1px 6px" }}>
                        ✓ Allowed
                      </span>
                    ) : (
                      <span className="f2-badge" data-tone="red" style={{ fontSize: 11, padding: "1px 6px" }}>
                        ✕ Blocked
                      </span>
                    )}
                  </span>

                  <JXSwitch
                    checked={isAllowed}
                    onChange={(val: any) => toggleAbility(tool.name, val)}
                    size="sm"
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Allowed Apps & Services Allowlist */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12 }}>
        <div>
          <JXTextField
            label="Allowed GUI Applications (comma-separated executables)"
            value={allowedApps}
            onChange={(val: any) => {
              setInheritGlobal(false);
              setAllowedApps(val);
            }}
            placeholder="chrome, code, notepad, msedge, terminal"
          />
        </div>

        <div>
          <JXTextField
            label="Allowed System Services (comma-separated unit names)"
            value={allowedServices}
            onChange={(val: any) => {
              setInheritGlobal(false);
              setAllowedServices(val);
            }}
            placeholder="nginx, docker, postgresql, ssh"
          />
        </div>
      </div>

      {/* Rationale & Actions */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", paddingTop: 10, borderTop: "1px solid var(--colorNeutralStroke2)" }}>
        <div style={{ flex: 1, minWidth: 260 }}>
          <JXTextField
            value={note}
            onChange={(val: any) => setNote(val)}
            placeholder="Audit rationale for this policy modification (optional)"
          />
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {deviceData?.has_custom_policy && (
            <JXButton
              variant="soft"
              color="error"
              size="md"
              disabled={resetting || saving}
              onClick={handleReset}
              title="Remove device overrides and inherit the global server policy"
            >
              {resetting ? "Resetting…" : "Reset to Global"}
            </JXButton>
          )}

          {isModal && onClose && (
            <JXButton variant="outlined" size="md" onClick={onClose} disabled={saving}>
              Close
            </JXButton>
          )}

          <JXButton
            variant="contained"
            color="primary"
            size="md"
            loading={saving}
            onClick={handleSave}
          >
            Save Device Policy
          </JXButton>
        </div>
      </div>
    </div>
  );
}

