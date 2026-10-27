import React, { useState, useEffect, useCallback } from "react";
import { api } from "./api";

interface DeviceDetailDashboardProps {
  deviceId: string;
  onBack: () => void;
  onSelectDevice: (deviceId: string) => void;
  allDevices: Array<{ id: string; name: string; hostname?: string; os?: string; status: string; revoked?: boolean; has_custom_policy?: boolean }>;
  onOpenPolicyModal?: (deviceId: string) => void;
  onDispatchTask?: (deviceId: string, tool?: string, args?: any) => void;
}

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

function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || isNaN(bytes)) return "—";
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function DeviceDetailDashboard({
  deviceId,
  onBack,
  onSelectDevice,
  allDevices,
  onOpenPolicyModal,
  onDispatchTask,
}: DeviceDetailDashboardProps) {
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [overview, setOverview] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<"specs" | "servers" | "apps" | "vision" | "history">("specs");

  // Filters
  const [procSearch, setProcSearch] = useState<string>("");
  const [appSearch, setAppSearch] = useState<string>("");
  const [selectedTaskJson, setSelectedTaskJson] = useState<any | null>(null);

  // Modals
  const [showInstallModal, setShowInstallModal] = useState<boolean>(false);
  const [installPackageId, setInstallPackageId] = useState<string>("");
  const [installVersion, setInstallVersion] = useState<string>("");
  const [installing, setInstalling] = useState<boolean>(false);

  const [launchAppModal, setLaunchAppModal] = useState<string | null>(null);
  const [launchUrl, setLaunchUrl] = useState<string>("");
  const [launching, setLaunching] = useState<boolean>(false);

  const loadData = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      const data = await api.deviceOverview(deviceId);
      setOverview(data);
    } catch (err: any) {
      setError(`Failed to load device overview: ${err.message}`);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [deviceId]);

  useEffect(() => {
    loadData();
    // Auto refresh every 15s while viewing this dashboard
    const interval = setInterval(() => {
      loadData(true);
    }, 15000);
    return () => clearInterval(interval);
  }, [loadData]);

  const handleTriggerTelemetry = async (tools?: string[]) => {
    try {
      setRefreshing(true);
      await api.refreshDeviceTelemetry(deviceId, tools);
      // Wait slightly for agent poll and refresh overview
      setTimeout(() => {
        loadData(true);
      }, 2500);
    } catch (err: any) {
      alert(`Diagnostic trigger failed: ${err.message}`);
      setRefreshing(false);
    }
  };

  const handleLaunchApp = async () => {
    if (!launchAppModal) return;
    try {
      setLaunching(true);
      const args: any = { app_name: launchAppModal };
      if (launchUrl.trim()) args.url = launchUrl.trim();
      await api.submitTask(deviceId, "launch_approved_application", args);
      alert(`Launch task queued for ${launchAppModal}.`);
      setLaunchAppModal(null);
      setLaunchUrl("");
      setTimeout(() => loadData(true), 2000);
    } catch (err: any) {
      alert(`Launch error: ${err.message}`);
    } finally {
      setLaunching(false);
    }
  };

  const handleInstallPackage = async () => {
    if (!installPackageId.trim()) return;
    try {
      setInstalling(true);
      const args: any = { package_id: installPackageId.trim() };
      if (installVersion.trim()) args.version = installVersion.trim();
      await api.submitTask(deviceId, "install_package", args);
      alert(`Package installation task submitted for ${installPackageId}. If approval is required, check Approvals tab.`);
      setShowInstallModal(false);
      setInstallPackageId("");
      setInstallVersion("");
      setTimeout(() => loadData(true), 2500);
    } catch (err: any) {
      alert(`Install task error: ${err.message}`);
    } finally {
      setInstalling(false);
    }
  };

  if (loading && !overview) {
    return (
      <div style={{ padding: 32, textAlign: "center" }}>
        <div style={{ fontSize: 24, marginBottom: 12 }}>⚡</div>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>Connecting to Device Telemetry Stream...</div>
        <div style={{ fontSize: 13, color: "var(--colorNeutralForeground3)" }}>Device ID: {deviceId}</div>
      </div>
    );
  }

  const dev = overview?.device || {};
  const health = overview?.health || {};
  const sys = overview?.system_info || {};
  const res = overview?.resource_usage || {};
  const processes = overview?.processes || [];
  const docker = overview?.docker || { available: false, containers: [] };
  const apps = overview?.apps || { allowed_apps: [], installed_packages: [], allowed_services: [], service_statuses: {} };
  const desktop = overview?.desktop || {};
  const recentTasks = overview?.recent_tasks || [];

  const isOnline = health.is_online;
  const isRevoked = !!dev.revoked;

  // CPU Tone
  const cpuVal = typeof res.cpu_percent === "number" ? res.cpu_percent : null;
  const cpuTone = cpuVal === null ? "neutral" : cpuVal > 85 ? "danger" : cpuVal > 65 ? "warning" : "success";

  // RAM Tone
  const memVal = typeof res.memory_percent === "number" ? res.memory_percent : null;
  const memTone = memVal === null ? "neutral" : memVal > 85 ? "danger" : memVal > 70 ? "warning" : "brand";

  // Disk Tone
  let diskUsedPercent: number | null = null;
  if (res.disk_total_bytes && res.disk_used_bytes) {
    diskUsedPercent = Math.round((res.disk_used_bytes / res.disk_total_bytes) * 100);
  } else if (res.disk_total_bytes && res.disk_free_bytes) {
    diskUsedPercent = Math.round(((res.disk_total_bytes - res.disk_free_bytes) / res.disk_total_bytes) * 100);
  }
  const diskTone = diskUsedPercent === null ? "neutral" : diskUsedPercent > 90 ? "danger" : diskUsedPercent > 75 ? "warning" : "brand";

  // Filtered processes
  const filteredProcesses = (processes as any[]).filter(p => {
    if (!procSearch.trim()) return true;
    const q = procSearch.toLowerCase();
    return (p.name && String(p.name).toLowerCase().includes(q)) || (p.pid && String(p.pid).includes(q));
  });

  // Filtered allowed apps
  const filteredAllowedApps = (apps.allowed_apps as string[]).filter(a => {
    if (!appSearch.trim()) return true;
    return a.toLowerCase().includes(appSearch.toLowerCase());
  });

  return (
    <div style={{ display: "grid", gap: 20 }}>
      {/* Top Header Card */}
      <div className="f2-card" style={{ padding: "18px 20px" }}>
        {/* Navigation Breadcrumb & Switcher */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button
              type="button"
              className="f2-btn"
              onClick={onBack}
              title="Return to fleet device inventory"
              style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 12px" }}
            >
              <span>←</span>
              <span>Fleet Inventory</span>
            </button>
            <span style={{ color: "var(--colorNeutralStroke1)" }}>/</span>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 18, fontWeight: 700, color: "var(--colorNeutralForeground1)" }}>
                {dev.name || "Device"}
              </span>
              <code style={{ fontSize: 12, padding: "2px 6px", background: "var(--colorNeutralBackground3)", borderRadius: 4 }}>
                {dev.id}
              </code>
            </div>
          </div>

          {/* Device Switcher Dropdown */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 12, color: "var(--colorNeutralForeground3)", fontWeight: 500 }}>Switch Device:</span>
            <select
              className="f2-input"
              value={deviceId}
              onChange={e => onSelectDevice(e.target.value)}
              style={{ minWidth: 200, padding: "4px 10px", fontSize: 13 }}
            >
              {allDevices.map(d => (
                <option key={d.id} value={d.id}>
                  {d.status === "online" ? "🟢" : d.revoked ? "🔴" : "⚪"} {d.name} ({d.hostname || d.id})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Presence & Meta Subbar */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16, borderTop: "1px solid var(--colorNeutralStroke2)", paddingTop: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
            {/* Status Indicator */}
            {isRevoked ? (
              <span className="f2-badge" data-tone="red" style={{ padding: "4px 10px", display: "inline-flex", alignItems: "center", gap: 6 }}>
                ✕ Revoked Device
              </span>
            ) : isOnline ? (
              <span className="f2-badge" data-tone="green" style={{ padding: "4px 10px", display: "inline-flex", alignItems: "center", gap: 6 }}>
                <span className="f2-pulse-dot" />
                ONLINE (Live Stream)
              </span>
            ) : (
              <span className="f2-badge" data-tone="grey" style={{ padding: "4px 10px", display: "inline-flex", alignItems: "center", gap: 6 }}>
                ○ OFFLINE (Awaiting Poll)
              </span>
            )}

            <div style={{ fontSize: 13, color: "var(--colorNeutralForeground2)" }}>
              <span>Host: <b>{dev.hostname || sys.machine || "—"}</b></span>
              <span style={{ margin: "0 8px", color: "var(--colorNeutralStroke1)" }}>•</span>
              <span>OS: <b>{sys.system ? `${sys.system} ${sys.release}` : (dev.os || "—")}</b></span>
              <span style={{ margin: "0 8px", color: "var(--colorNeutralStroke1)" }}>•</span>
              <span>Heartbeat: <b>{rel(health.last_seen_ts)}</b></span>
            </div>

            {dev.has_custom_policy ? (
              <span className="f2-badge" data-tone="amber" title="Custom device guardrails active">
                🛡️ Custom Abilities
              </span>
            ) : (
              <span className="f2-badge" data-tone="blue" title="Inheriting global default policy">
                🌐 Global Policy
              </span>
            )}
          </div>

          {/* Action Buttons Bar */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              className="f2-btn"
              onClick={() => handleTriggerTelemetry()}
              disabled={refreshing}
              title="Queue get_system_info and get_resource_usage tasks"
              style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
            >
              <span>{refreshing ? "⏳" : "⚡"}</span>
              <span>{refreshing ? "Refreshing..." : "Refresh Telemetry"}</span>
            </button>

            {onOpenPolicyModal && (
              <button
                type="button"
                className="f2-btn"
                onClick={() => onOpenPolicyModal(deviceId)}
                title="Configure allowed tools, apps, and guardrails for this device"
                style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
              >
                <span>🛡️</span>
                <span>Edit Abilities</span>
              </button>
            )}

            {onDispatchTask && !isRevoked && (
              <button
                type="button"
                className="f2-btn f2-btn-primary"
                onClick={() => onDispatchTask(deviceId)}
                title="Open task composer to run any tool on this device"
                style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
              >
                <span>🚀</span>
                <span>Dispatch Task</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div className="f2-messagebar" data-intent="error">
          <span>{error}</span>
        </div>
      )}

      {/* Row 1: 4 System Health KPI Gauges */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14 }}>
        {/* CPU Utilization Gauge */}
        <div className="f2-card" style={{ padding: "16px 18px", position: "relative" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--colorNeutralForeground2)" }}>CPU LOAD</span>
            <span className="f2-badge" data-tone={cpuTone === "danger" ? "red" : cpuTone === "warning" ? "amber" : "blue"}>
              {cpuVal !== null ? `${cpuVal}%` : "No data"}
            </span>
          </div>
          <div style={{ fontSize: 28, fontWeight: 700, color: "var(--colorNeutralForeground1)", marginBottom: 8 }}>
            {cpuVal !== null ? `${cpuVal}%` : "—"}
          </div>
          {/* Progress Bar */}
          <div className="f2-bar-track" style={{ height: 8, marginBottom: 8 }}>
            <div
              className="f2-bar-fill"
              style={{
                width: `${Math.min(100, Math.max(0, cpuVal || 0))}%`,
                background:
                  cpuTone === "danger"
                    ? "var(--colorStatusDangerForeground1)"
                    : cpuTone === "warning"
                    ? "var(--colorStatusWarningForeground1)"
                    : "var(--colorBrandBackground)",
              }}
            />
          </div>
          <div style={{ fontSize: 11, color: "var(--colorNeutralForeground3)", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>
            {sys.processor || (sys.machine ? `Architecture: ${sys.machine}` : "Processor metrics")}
          </div>
        </div>

        {/* RAM Memory Gauge */}
        <div className="f2-card" style={{ padding: "16px 18px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--colorNeutralForeground2)" }}>RAM USAGE</span>
            <span className="f2-badge" data-tone={memTone === "danger" ? "red" : memTone === "warning" ? "amber" : "blue"}>
              {memVal !== null ? `${memVal}%` : "No data"}
            </span>
          </div>
          <div style={{ fontSize: 24, fontWeight: 700, color: "var(--colorNeutralForeground1)", marginBottom: 8 }}>
            {res.memory_total_bytes
              ? `${formatBytes(res.memory_total_bytes - (res.memory_available_bytes || 0))} / ${formatBytes(res.memory_total_bytes)}`
              : (memVal !== null ? `${memVal}%` : "—")}
          </div>
          <div className="f2-bar-track" style={{ height: 8, marginBottom: 8 }}>
            <div
              className="f2-bar-fill"
              style={{
                width: `${Math.min(100, Math.max(0, memVal || 0))}%`,
                background:
                  memTone === "danger"
                    ? "var(--colorStatusDangerForeground1)"
                    : memTone === "warning"
                    ? "var(--colorStatusWarningForeground1)"
                    : "linear-gradient(90deg, #0078d4 0%, #2886de 100%)",
              }}
            />
          </div>
          <div style={{ fontSize: 11, color: "var(--colorNeutralForeground3)" }}>
            {res.memory_available_bytes ? `${formatBytes(res.memory_available_bytes)} free available` : "System memory"}
          </div>
        </div>

        {/* Disk Storage Gauge */}
        <div className="f2-card" style={{ padding: "16px 18px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--colorNeutralForeground2)" }}>STORAGE DISK</span>
            <span className="f2-badge" data-tone={diskTone === "danger" ? "red" : diskTone === "warning" ? "amber" : "blue"}>
              {diskUsedPercent !== null ? `${diskUsedPercent}% used` : "No data"}
            </span>
          </div>
          <div style={{ fontSize: 24, fontWeight: 700, color: "var(--colorNeutralForeground1)", marginBottom: 8 }}>
            {res.disk_total_bytes
              ? `${formatBytes(res.disk_total_bytes - (res.disk_free_bytes || 0))} / ${formatBytes(res.disk_total_bytes)}`
              : "—"}
          </div>
          <div className="f2-bar-track" style={{ height: 8, marginBottom: 8 }}>
            <div
              className="f2-bar-fill"
              style={{
                width: `${Math.min(100, Math.max(0, diskUsedPercent || 0))}%`,
                background:
                  diskTone === "danger"
                    ? "var(--colorStatusDangerForeground1)"
                    : diskTone === "warning"
                    ? "var(--colorStatusWarningForeground1)"
                    : "linear-gradient(90deg, #107c41 0%, #27ac60 100%)",
              }}
            />
          </div>
          <div style={{ fontSize: 11, color: "var(--colorNeutralForeground3)" }}>
            {res.disk_free_bytes ? `${formatBytes(res.disk_free_bytes)} free partition space` : "Root filesystem storage"}
          </div>
        </div>

        {/* Execution Guardrails Posture */}
        <div className="f2-card" style={{ padding: "16px 18px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--colorNeutralForeground2)" }}>GUARDRAILS & POSTURE</span>
            <span className="f2-badge" data-tone={dev.effective_policy?.allow_tier3 ? "amber" : "green"}>
              {dev.effective_policy?.allow_tier3 ? "Tier-3 Opt-in" : "Strict Guarded"}
            </span>
          </div>
          <div style={{ display: "grid", gap: 4, marginTop: 4 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
              <span style={{ color: "var(--colorNeutralForeground3)" }}>Desktop Automation:</span>
              <b>{dev.effective_policy?.desktop_enabled ? "Enabled" : "Disabled"}</b>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
              <span style={{ color: "var(--colorNeutralForeground3)" }}>Unattended Ceiling:</span>
              <b>Tier {dev.effective_policy?.max_tier_unattended || 2}</b>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
              <span style={{ color: "var(--colorNeutralForeground3)" }}>Allowed Apps:</span>
              <b>{apps.allowed_apps?.length || 0} apps</b>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
              <span style={{ color: "var(--colorNeutralForeground3)" }}>Monitored Services:</span>
              <b>{apps.allowed_services?.length || 0} services</b>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs Navigation Header */}
      <div style={{ display: "flex", borderBottom: "1px solid var(--colorNeutralStroke2)", gap: 4, flexWrap: "wrap" }}>
        {[
          { id: "specs", label: "💻 System Full Info", count: null },
          { id: "servers", label: "⚙️ Running Servers & Services", count: docker?.containers?.length || processes?.length || null },
          { id: "apps", label: "📦 Installed Apps & Packages", count: (apps.allowed_apps?.length || 0) + (apps.installed_packages?.length || 0) },
          { id: "vision", label: "👁️ Vision & Desktop", count: desktop.screenshot ? "Ready" : null },
          { id: "history", label: "📜 Task Execution History", count: recentTasks.length },
        ].map(tab => (
          <button
            key={tab.id}
            type="button"
            className="f2-tab"
            data-active={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            style={{
              padding: "10px 16px",
              border: "none",
              borderBottom: activeTab === tab.id ? "3px solid var(--colorBrandBackground)" : "3px solid transparent",
              background: "transparent",
              fontWeight: activeTab === tab.id ? 600 : 500,
              color: activeTab === tab.id ? "var(--colorBrandForeground1)" : "var(--colorNeutralForeground2)",
              cursor: "pointer",
              fontSize: 14,
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <span>{tab.label}</span>
            {tab.count !== null && (
              <span className="f2-badge" data-tone={activeTab === tab.id ? "blue" : "grey"} style={{ fontSize: 11, padding: "1px 6px" }}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* TAB CONTENT */}

      {/* 1. SYSTEM FULL INFO */}
      {activeTab === "specs" && (
        <div style={{ display: "grid", gap: 16 }}>
          <div className="f2-card" style={{ padding: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>System Specifications & Hardware Architecture</h3>
                <div style={{ fontSize: 12, color: "var(--colorNeutralForeground3)", marginTop: 2 }}>
                  Comprehensive hardware node and operating system details reported by the host agent.
                </div>
              </div>
              <button
                type="button"
                className="f2-btn"
                onClick={() => handleTriggerTelemetry(["get_system_info"])}
                disabled={refreshing}
                title="Dispatch get_system_info diagnostic task to refresh hardware specs"
              >
                ⚡ Probe System Info
              </button>
            </div>

            <div className="f2-table-wrap">
              <table className="f2-table">
                <tbody>
                  <tr>
                    <td style={{ width: "25%", fontWeight: 600, color: "var(--colorNeutralForeground3)" }}>Hostname</td>
                    <td><b>{dev.hostname || sys.machine || "—"}</b></td>
                    <td style={{ width: "25%", fontWeight: 600, color: "var(--colorNeutralForeground3)" }}>Device ID & Tenant</td>
                    <td><code>{dev.id}</code> (Tenant: {dev.tenant || "default"})</td>
                  </tr>
                  <tr>
                    <td style={{ fontWeight: 600, color: "var(--colorNeutralForeground3)" }}>Operating System</td>
                    <td>{sys.system ? `${sys.system} ${sys.release}` : (dev.os || "—")}</td>
                    <td style={{ fontWeight: 600, color: "var(--colorNeutralForeground3)" }}>Kernel / OS Version</td>
                    <td>{sys.version || "—"}</td>
                  </tr>
                  <tr>
                    <td style={{ fontWeight: 600, color: "var(--colorNeutralForeground3)" }}>CPU Architecture</td>
                    <td><span className="f2-badge" data-tone="blue">{sys.machine || "x86_64"}</span></td>
                    <td style={{ fontWeight: 600, color: "var(--colorNeutralForeground3)" }}>Processor Model</td>
                    <td>{sys.processor || "—"}</td>
                  </tr>
                  <tr>
                    <td style={{ fontWeight: 600, color: "var(--colorNeutralForeground3)" }}>Python Runtime</td>
                    <td><code>Python {sys.python || "—"}</code></td>
                    <td style={{ fontWeight: 600, color: "var(--colorNeutralForeground3)" }}>Heartbeat Status</td>
                    <td>
                      {isOnline ? "🟢 Live Active" : "⚪ Offline"} ({rel(health.last_seen_ts)})
                    </td>
                  </tr>
                  <tr>
                    <td style={{ fontWeight: 600, color: "var(--colorNeutralForeground3)" }}>Token Issued</td>
                    <td>{fmt(dev.token_issued_at || dev.created_at)}</td>
                    <td style={{ fontWeight: 600, color: "var(--colorNeutralForeground3)" }}>Token Expiration</td>
                    <td>{fmt(dev.token_expires_at)} ({rel(dev.token_expires_at)})</td>
                  </tr>
                  <tr>
                    <td style={{ fontWeight: 600, color: "var(--colorNeutralForeground3)" }}>Diagnostics Last Polled</td>
                    <td>{fmt(sys.updated_at || res.updated_at)} ({rel(sys.updated_at || res.updated_at)})</td>
                    <td style={{ fontWeight: 600, color: "var(--colorNeutralForeground3)" }}>Security Profile</td>
                    <td>{dev.has_custom_policy ? "Custom Device Policy" : "Inherited Global Policy"}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 2. RUNNING SERVERS & SERVICES */}
      {activeTab === "servers" && (
        <div style={{ display: "grid", gap: 20 }}>
          {/* Docker Containers Section */}
          <div className="f2-card" style={{ padding: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
                  <span>🐳 Docker Containers</span>
                  {docker.available && (
                    <span className="f2-badge" data-tone="green">Docker Engine Active</span>
                  )}
                </h3>
                <div style={{ fontSize: 12, color: "var(--colorNeutralForeground3)", marginTop: 2 }}>
                  Active containerized servers and reverse proxies running on this host.
                </div>
              </div>
              <button
                type="button"
                className="f2-btn"
                onClick={() => handleTriggerTelemetry(["list_docker_containers"])}
                disabled={refreshing}
                title="Scan Docker containers"
              >
                Scan Docker
              </button>
            </div>

            {!docker.available ? (
              <div className="f2-messagebar" data-intent="info">
                <span>{docker.note || "Docker is not detected on this machine or the Docker daemon is inactive."}</span>
              </div>
            ) : !docker.containers || docker.containers.length === 0 ? (
              <div style={{ padding: 24, textAlign: "center", color: "var(--colorNeutralForeground3)" }}>
                No active Docker containers running.
              </div>
            ) : (
              <div className="f2-table-wrap">
                <table className="f2-table">
                  <thead>
                    <tr>
                      <th>Container ID</th>
                      <th>Name</th>
                      <th>Image</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {docker.containers.map((c: any) => (
                      <tr key={c.id}>
                        <td><code>{c.id}</code></td>
                        <td><b>{c.name}</b></td>
                        <td><span className="f2-badge" data-tone="blue">{c.image}</span></td>
                        <td><span className="f2-badge" data-tone="green">{c.status}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Monitored Daemons & Services */}
          <div className="f2-card" style={{ padding: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>⚙️ System Services & Daemons</h3>
                <div style={{ fontSize: 12, color: "var(--colorNeutralForeground3)", marginTop: 2 }}>
                  Systemd service units or Windows Services allowlisted for monitoring.
                </div>
              </div>
            </div>

            {(!apps.allowed_services || apps.allowed_services.length === 0) ? (
              <div style={{ padding: 20, textAlign: "center", color: "var(--colorNeutralForeground3)", fontSize: 13 }}>
                No monitored services configured in policy. You can add services (e.g. <code>nginx</code>, <code>ai-bridge-control</code>, <code>sshd</code>, <code>docker</code>) in the Abilities & Guardrails settings.
              </div>
            ) : (
              <div className="f2-table-wrap">
                <table className="f2-table">
                  <thead>
                    <tr>
                      <th>Service Name</th>
                      <th>Probe Status</th>
                      <th>Last Polled Output</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {apps.allowed_services.map((svc: string) => {
                      const st = apps.service_statuses?.[svc];
                      return (
                        <tr key={svc}>
                          <td><b>{svc}</b></td>
                          <td>
                            {st ? (
                              <span className="f2-badge" data-tone={st.output?.includes("active") || st.output?.includes("RUNNING") ? "green" : "grey"}>
                                {st.output?.includes("active") ? "Active (Running)" : st.output?.includes("RUNNING") ? "Running" : "Inactive"}
                              </span>
                            ) : (
                              <span className="f2-badge" data-tone="grey">Not Probed</span>
                            )}
                          </td>
                          <td style={{ fontSize: 12, fontFamily: "monospace", maxWidth: 360, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {st ? st.output : "—"}
                          </td>
                          <td>
                            <button
                              type="button"
                              className="f2-btn"
                              style={{ padding: "3px 8px", fontSize: 12 }}
                              onClick={async () => {
                                try {
                                  await api.submitTask(deviceId, "get_service_status", { service: svc });
                                  alert(`Probing status of service "${svc}".`);
                                  setTimeout(() => loadData(true), 2000);
                                } catch (e: any) {
                                  alert(e.message);
                                }
                              }}
                            >
                              Check Status
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Top Running Processes */}
          <div className="f2-card" style={{ padding: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>📊 Top Active Running Processes</h3>
                <div style={{ fontSize: 12, color: "var(--colorNeutralForeground3)", marginTop: 2 }}>
                  Live process tree sorted by CPU and memory consumption.
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <input
                  className="f2-input"
                  placeholder="Filter processes by name or PID..."
                  value={procSearch}
                  onChange={e => setProcSearch(e.target.value)}
                  style={{ width: 220, padding: "5px 10px", fontSize: 13 }}
                />
                <button
                  type="button"
                  className="f2-btn"
                  onClick={() => handleTriggerTelemetry(["list_processes"])}
                  disabled={refreshing}
                  title="Scan top active processes on this device"
                >
                  Scan Processes
                </button>
              </div>
            </div>

            {processes.length === 0 ? (
              <div style={{ padding: 24, textAlign: "center", color: "var(--colorNeutralForeground3)" }}>
                No process list reported yet. Click "Scan Processes" to poll the active process table.
              </div>
            ) : (
              <div className="f2-table-wrap">
                <table className="f2-table">
                  <thead>
                    <tr>
                      <th style={{ width: 90 }}>PID</th>
                      <th>Process Name</th>
                      <th style={{ width: 140 }}>CPU %</th>
                      <th style={{ width: 140 }}>Memory %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredProcesses.map((p: any, idx: number) => (
                      <tr key={`${p.pid}-${idx}`}>
                        <td><code>{p.pid}</code></td>
                        <td><b>{p.name}</b></td>
                        <td>
                          <span className="f2-badge" data-tone={p.cpu_percent > 50 ? "red" : p.cpu_percent > 20 ? "amber" : "blue"}>
                            {p.cpu_percent !== null && p.cpu_percent !== undefined ? `${p.cpu_percent}%` : "—"}
                          </span>
                        </td>
                        <td>
                          <span className="f2-badge" data-tone={p.memory_percent > 30 ? "amber" : "grey"}>
                            {p.memory_percent !== null && p.memory_percent !== undefined ? `${p.memory_percent}%` : "—"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 3. INSTALLED APPS & PACKAGES */}
      {activeTab === "apps" && (
        <div style={{ display: "grid", gap: 20 }}>
          {/* Allowlisted Desktop Applications */}
          <div className="f2-card" style={{ padding: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>🖥️ Allowlisted Desktop & GUI Applications</h3>
                <div style={{ fontSize: 12, color: "var(--colorNeutralForeground3)", marginTop: 2 }}>
                  Applications authorized by device policy for automated or interactive launch.
                </div>
              </div>
              <input
                className="f2-input"
                placeholder="Search allowlisted apps..."
                value={appSearch}
                onChange={e => setAppSearch(e.target.value)}
                style={{ width: 220, padding: "5px 10px", fontSize: 13 }}
              />
            </div>

            {filteredAllowedApps.length === 0 ? (
              <div style={{ padding: 24, textAlign: "center", color: "var(--colorNeutralForeground3)" }}>
                No allowlisted applications match your search.
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", gap: 12 }}>
                {filteredAllowedApps.map(app => (
                  <div
                    key={app}
                    style={{
                      border: "1px solid var(--colorNeutralStroke2)",
                      borderRadius: "var(--borderRadiusMedium)",
                      padding: "14px 16px",
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "space-between",
                      gap: 12,
                      background: "var(--colorNeutralBackground1)",
                    }}
                  >
                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <b style={{ fontSize: 15, textTransform: "capitalize" }}>{app}</b>
                        <span className="f2-badge" data-tone="green" style={{ fontSize: 11 }}>Approved</span>
                      </div>
                      <div style={{ fontSize: 12, color: "var(--colorNeutralForeground3)", marginTop: 4 }}>
                        Executable identifier: <code>{app}</code>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="f2-btn"
                      onClick={() => setLaunchAppModal(app)}
                      style={{ width: "100%", justifyContent: "center", fontSize: 12 }}
                    >
                      🚀 Launch App
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Installed Software Packages */}
          <div className="f2-card" style={{ padding: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>📦 System Packages Installed</h3>
                <div style={{ fontSize: 12, color: "var(--colorNeutralForeground3)", marginTop: 2 }}>
                  Packages deployed onto this host via <code>winget</code> or Linux package managers (<code>apt-get</code>, <code>dnf</code>).
                </div>
              </div>
              <button
                type="button"
                className="f2-btn f2-btn-primary"
                onClick={() => setShowInstallModal(true)}
              >
                + Install Package
              </button>
            </div>

            {(!apps.installed_packages || apps.installed_packages.length === 0) ? (
              <div style={{ padding: 24, textAlign: "center", color: "var(--colorNeutralForeground3)" }}>
                No packages recorded as installed via tasks yet. Click "+ Install Package" to deploy a package to this host.
              </div>
            ) : (
              <div className="f2-table-wrap">
                <table className="f2-table">
                  <thead>
                    <tr>
                      <th>Package ID</th>
                      <th>Version</th>
                      <th>Manager</th>
                      <th>Installed At</th>
                    </tr>
                  </thead>
                  <tbody>
                    {apps.installed_packages.map((pkg: any, idx: number) => (
                      <tr key={`${pkg.package_id}-${idx}`}>
                        <td><b>{pkg.package_id}</b></td>
                        <td><code>{pkg.version || "latest"}</code></td>
                        <td><span className="f2-badge" data-tone="blue">{pkg.manager}</span></td>
                        <td>{fmt(pkg.updated_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 4. VISION & DESKTOP */}
      {activeTab === "vision" && (
        <div style={{ display: "grid", gap: 16 }}>
          <div className="f2-card" style={{ padding: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>📸 Desktop Screen Vision Inspector</h3>
                <div style={{ fontSize: 12, color: "var(--colorNeutralForeground3)", marginTop: 2 }}>
                  Real-time visual capture of the desktop display for multimodal AI inspection.
                </div>
              </div>
              <button
                type="button"
                className="f2-btn f2-btn-primary"
                onClick={() => handleTriggerTelemetry(["capture_desktop_screenshot"])}
                disabled={refreshing}
                title="Capture desktop screenshot"
              >
                📸 Capture Screenshot
              </button>
            </div>

            {desktop.screenshot?.image_base64 ? (
              <div style={{ textAlign: "center" }}>
                <img
                  src={`data:${desktop.screenshot.mime_type || "image/png"};base64,${desktop.screenshot.image_base64}`}
                  alt="Desktop Screenshot"
                  style={{
                    maxWidth: "100%",
                    maxHeight: "650px",
                    borderRadius: "var(--borderRadiusMedium)",
                    border: "1px solid var(--colorNeutralStroke1)",
                    boxShadow: "var(--shadow16)",
                  }}
                />
                <div style={{ marginTop: 8, fontSize: 12, color: "var(--colorNeutralForeground3)" }}>
                  Captured: {fmt(desktop.screenshot_updated_at)} ({rel(desktop.screenshot_updated_at)})
                  {desktop.screenshot.size && ` • Resolution: ${Array.isArray(desktop.screenshot.size) ? desktop.screenshot.size.join("x") : desktop.screenshot.size}`}
                </div>
              </div>
            ) : (
              <div style={{ padding: 36, textAlign: "center", color: "var(--colorNeutralForeground3)" }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>🖥️</div>
                <div style={{ fontWeight: 600 }}>No screenshot captured yet</div>
                <div style={{ fontSize: 13, marginTop: 4, marginBottom: 16 }}>
                  Click "Capture Screenshot" above to take a live high-resolution snapshot of this machine's desktop.
                </div>
              </div>
            )}
          </div>

          {/* Open Desktop Windows List */}
          <div className="f2-card" style={{ padding: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>🪟 Active Desktop Windows</h3>
                <div style={{ fontSize: 12, color: "var(--colorNeutralForeground3)", marginTop: 2 }}>
                  Open application windows currently visible on the host desktop.
                </div>
              </div>
              <button
                type="button"
                className="f2-btn"
                onClick={async () => {
                  try {
                    await api.submitTask(deviceId, "perform_approved_ui_action", { action: "list_windows" });
                    alert("List windows task queued.");
                    setTimeout(() => loadData(true), 2500);
                  } catch (e: any) {
                    alert(e.message);
                  }
                }}
              >
                Scan Windows
              </button>
            </div>

            {!desktop.windows || desktop.windows.length === 0 ? (
              <div style={{ padding: 20, textAlign: "center", color: "var(--colorNeutralForeground3)" }}>
                No active windows scanned yet. Click "Scan Windows" to query open desktop windows.
              </div>
            ) : (
              <div className="f2-table-wrap">
                <table className="f2-table">
                  <thead>
                    <tr>
                      <th style={{ width: 120 }}>HWND</th>
                      <th>Window Title</th>
                    </tr>
                  </thead>
                  <tbody>
                    {desktop.windows.map((win: any, idx: number) => (
                      <tr key={`${win.hwnd}-${idx}`}>
                        <td><code>{win.hwnd}</code></td>
                        <td><b>{win.title}</b></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 5. TASK EXECUTION STREAM & HISTORY */}
      {activeTab === "history" && (
        <div className="f2-card" style={{ padding: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>📜 Device Task Execution Stream</h3>
              <div style={{ fontSize: 12, color: "var(--colorNeutralForeground3)", marginTop: 2 }}>
                Audit history of all diagnostic probes and commands dispatched to this specific device.
              </div>
            </div>
            <button
              type="button"
              className="f2-btn"
              onClick={() => loadData(true)}
              disabled={refreshing}
            >
              ↻ Refresh
            </button>
          </div>

          {recentTasks.length === 0 ? (
            <div style={{ padding: 32, textAlign: "center", color: "var(--colorNeutralForeground3)" }}>
              No tasks executed on this device yet.
            </div>
          ) : (
            <div className="f2-table-wrap">
              <table className="f2-table">
                <thead>
                  <tr>
                    <th>Task ID</th>
                    <th>Tool</th>
                    <th>Tier</th>
                    <th>Status</th>
                    <th>Executed At</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {recentTasks.map((t: any) => (
                    <tr key={t.id}>
                      <td><code>{t.id}</code></td>
                      <td><b>{t.tool}</b></td>
                      <td>
                        <span className="f2-badge" data-tone={t.tier === 1 ? "blue" : t.tier === 2 ? "grey" : t.tier === 3 ? "amber" : "red"}>
                          Tier {t.tier}
                        </span>
                      </td>
                      <td>
                        <span
                          className="f2-badge"
                          data-tone={
                            t.status === "completed"
                              ? "green"
                              : t.status === "running"
                              ? "blue"
                              : t.status === "needs_approval"
                              ? "amber"
                              : "red"
                          }
                        >
                          {t.status}
                        </span>
                      </td>
                      <td>
                        {fmt(t.created_at)}
                        <div style={{ fontSize: 11, color: "var(--colorNeutralForeground3)" }}>{rel(t.created_at)}</div>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="f2-btn"
                          style={{ padding: "3px 8px", fontSize: 12 }}
                          onClick={() => setSelectedTaskJson(t)}
                        >
                          Inspect JSON
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* MODAL: Launch Application */}
      {launchAppModal && (
        <div className="f2-dialog-overlay" onClick={() => setLaunchAppModal(null)}>
          <div className="f2-dialog" onClick={e => e.stopPropagation()} style={{ maxWidth: 460 }}>
            <h3 style={{ margin: "0 0 12px 0", fontSize: 17 }}>Launch Application: {launchAppModal}</h3>
            <p style={{ fontSize: 13, color: "var(--colorNeutralForeground2)", marginBottom: 16 }}>
              Dispatch a policy-governed task to launch <code>{launchAppModal}</code> on device <b>{dev.name}</b>.
            </p>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
                Optional Target URL or File Path:
              </label>
              <input
                className="f2-input"
                placeholder="e.g. https://google.com (optional)"
                value={launchUrl}
                onChange={e => setLaunchUrl(e.target.value)}
                style={{ width: "100%" }}
              />
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button type="button" className="f2-btn" onClick={() => setLaunchAppModal(null)} disabled={launching}>
                Cancel
              </button>
              <button type="button" className="f2-btn f2-btn-primary" onClick={handleLaunchApp} disabled={launching}>
                {launching ? "Dispatching..." : "Launch Application"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Install Package */}
      {showInstallModal && (
        <div className="f2-dialog-overlay" onClick={() => setShowInstallModal(false)}>
          <div className="f2-dialog" onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>
            <h3 style={{ margin: "0 0 12px 0", fontSize: 17 }}>Deploy / Install Package</h3>
            <p style={{ fontSize: 13, color: "var(--colorNeutralForeground2)", marginBottom: 16 }}>
              Install a package onto <b>{dev.name}</b> via package manager (winget on Windows, apt-get on Ubuntu/Debian).
            </p>
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
                Package Identifier:
              </label>
              <input
                className="f2-input"
                placeholder="e.g. Git.Git or htop or curl"
                value={installPackageId}
                onChange={e => setInstallPackageId(e.target.value)}
                style={{ width: "100%" }}
                required
              />
              <div style={{ fontSize: 11, color: "var(--colorNeutralForeground3)", marginTop: 4 }}>
                Windows winget format: <code>Publisher.App</code> (e.g. <code>Mozilla.Firefox</code>). Linux format: <code>package_name</code>.
              </div>
            </div>
            <div style={{ marginBottom: 18 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
                Version (Optional):
              </label>
              <input
                className="f2-input"
                placeholder="e.g. 2.44.0 (leave blank for latest)"
                value={installVersion}
                onChange={e => setInstallVersion(e.target.value)}
                style={{ width: "100%" }}
              />
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button type="button" className="f2-btn" onClick={() => setShowInstallModal(false)} disabled={installing}>
                Cancel
              </button>
              <button type="button" className="f2-btn f2-btn-primary" onClick={handleInstallPackage} disabled={installing || !installPackageId.trim()}>
                {installing ? "Submitting..." : "Submit Install Task"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Inspect Task JSON */}
      {selectedTaskJson && (
        <div className="f2-dialog-overlay" onClick={() => setSelectedTaskJson(null)}>
          <div className="f2-dialog" onClick={e => e.stopPropagation()} style={{ maxWidth: 680, maxHeight: "80vh", display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <h3 style={{ margin: 0, fontSize: 17 }}>Task Inspector: {selectedTaskJson.tool} ({selectedTaskJson.id})</h3>
              <button type="button" className="f2-btn" style={{ padding: "2px 8px" }} onClick={() => setSelectedTaskJson(null)}>✕</button>
            </div>
            <div style={{ overflowY: "auto", flex: 1, padding: 4 }}>
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--colorNeutralForeground3)", marginBottom: 4 }}>Arguments:</div>
                <pre style={{ background: "var(--colorNeutralBackground3)", padding: 10, borderRadius: 4, fontSize: 12, overflowX: "auto" }}>
                  {JSON.stringify(selectedTaskJson.args, null, 2)}
                </pre>
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--colorNeutralForeground3)", marginBottom: 4 }}>Result Payload:</div>
                <pre style={{ background: "var(--colorNeutralBackground3)", padding: 10, borderRadius: 4, fontSize: 12, overflowX: "auto", whiteSpace: "pre-wrap" }}>
                  {selectedTaskJson.result || "(empty result)"}
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
