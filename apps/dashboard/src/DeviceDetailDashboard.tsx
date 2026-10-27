import React, { useState, useEffect, useCallback, useRef } from "react";
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

const KNOWN_PORTS: Record<number, string> = {
  22: "SSH (Secure Shell)",
  53: "DNS Resolver",
  80: "HTTP (Web Server)",
  443: "HTTPS (Web Server)",
  3000: "Node.js / React / Grafana",
  3306: "MySQL Database",
  5000: "Flask / API Service",
  5173: "Vite Dev Server",
  5432: "PostgreSQL Database",
  6379: "Redis In-Memory Cache",
  8000: "AI Bridge Control Plane",
  8080: "HTTP Alternate / Proxy",
  9090: "Prometheus Metrics",
  27017: "MongoDB",
};

/* Fluent 2 SVG Mini Sparkline */
function Sparkline({
  data,
  color = "#0078d4",
  height = 34,
  width = 160,
}: {
  data: number[];
  color?: string;
  height?: number;
  width?: number;
}) {
  if (!data || data.length < 2) return null;
  const maxVal = Math.max(100, ...data);
  const minVal = 0;
  const range = maxVal - minVal || 1;
  const step = width / (data.length - 1);
  const points = data.map((val, idx) => {
    const x = idx * step;
    const y = height - ((val - minVal) / range) * (height - 6) - 3;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const d = `M ${points.join(" L ")}`;
  const fillD = `${d} L ${width},${height} L 0,${height} Z`;
  const gradId = `spark-grad-${Math.abs(color.split("").reduce((a, b) => ((a << 5) - a + b.charCodeAt(0)) | 0, 0))}`;
  const lastX = (data.length - 1) * step;
  const lastY = height - ((data[data.length - 1] - minVal) / range) * (height - 6) - 3;

  return (
    <svg width={width} height={height} style={{ overflow: "visible", display: "block" }}>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.32" />
          <stop offset="100%" stopColor={color} stopOpacity="0.0" />
        </linearGradient>
      </defs>
      <path d={fillD} fill={`url(#${gradId})`} />
      <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lastX} cy={lastY} r="3" fill={color} />
    </svg>
  );
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
  const [activeTab, setActiveTab] = useState<"specs" | "network" | "servers" | "terminal" | "apps" | "vision" | "history">("specs");

  // Local simulated history if only 1 data point returned
  const [cpuHistory, setCpuHistory] = useState<number[]>([12, 16, 14, 22, 19]);
  const [memHistory, setMemHistory] = useState<number[]>([38, 40, 39, 41, 42]);

  // Terminal state
  const [terminalInput, setTerminalInput] = useState<string>("");
  const [terminalRunning, setTerminalRunning] = useState<boolean>(false);
  const [terminalHistory, setTerminalHistory] = useState<Array<{ cmd: string; taskId: string; status: string; output: string; ts: number }>>([
    { cmd: "uptime", taskId: "init", status: "completed", output: "up 14 days, 3 users, load average: 0.18, 0.22, 0.19", ts: Date.now() / 1000 - 60 },
  ]);

  // Process manager state
  const [procSearch, setProcSearch] = useState<string>("");
  const [procFilter, setProcFilter] = useState<"all" | "high_cpu" | "high_mem" | "servers">("all");
  const [procSort, setProcSort] = useState<"cpu" | "mem" | "name" | "pid">("cpu");

  // Network filter
  const [portSearch, setPortSearch] = useState<string>("");

  // Modals & inspectors
  const [selectedTaskJson, setSelectedTaskJson] = useState<any | null>(null);
  const [showFullDiagModal, setShowFullDiagModal] = useState<boolean>(false);
  const [diagProgress, setDiagProgress] = useState<number>(0);
  const [showExportModal, setShowExportModal] = useState<boolean>(false);
  const [exportFormat, setExportFormat] = useState<"markdown" | "json">("markdown");

  // Vision screen hover & action simulation
  const [mouseCoord, setMouseCoord] = useState<{ x: number; y: number } | null>(null);
  const [uiActionModal, setUiActionModal] = useState<{ x: number; y: number; action: string; text?: string } | null>(null);
  const [autoCaptureVision, setAutoCaptureVision] = useState<boolean>(false);
  const [fullscreenScreenshot, setFullscreenScreenshot] = useState<boolean>(false);

  // App launch & Package install modals
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

      // Populate sparkline histories
      if (data.resource_history && data.resource_history.length > 1) {
        setCpuHistory(data.resource_history.map((h: any) => h.cpu_percent ?? 0));
        setMemHistory(data.resource_history.map((h: any) => h.memory_percent ?? 0));
      } else if (typeof data.resource_usage?.cpu_percent === "number") {
        setCpuHistory(prev => [...prev.slice(-14), data.resource_usage.cpu_percent]);
        if (typeof data.resource_usage?.memory_percent === "number") {
          setMemHistory(prev => [...prev.slice(-14), data.resource_usage.memory_percent]);
        }
      }
    } catch (err: any) {
      setError(`Failed to load device overview: ${err.message}`);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [deviceId]);

  useEffect(() => {
    loadData();
    const interval = setInterval(() => {
      loadData(true);
    }, 15000);
    return () => clearInterval(interval);
  }, [loadData]);

  // Auto-capture vision mode timer
  useEffect(() => {
    if (!autoCaptureVision) return;
    const visionTimer = setInterval(async () => {
      try {
        await api.submitTask(deviceId, "capture_desktop_screenshot", {});
        setTimeout(() => loadData(true), 2500);
      } catch {
        // quiet fallback
      }
    }, 10000);
    return () => clearInterval(visionTimer);
  }, [autoCaptureVision, deviceId, loadData]);

  const handleTriggerTelemetry = async (tools?: string[]) => {
    try {
      setRefreshing(true);
      await api.refreshDeviceTelemetry(deviceId, tools);
      setTimeout(() => {
        loadData(true);
      }, 2500);
    } catch (err: any) {
      alert(`Diagnostic trigger failed: ${err.message}`);
      setRefreshing(false);
    }
  };

  const handleRunFullDiagnostics = async () => {
    setShowFullDiagModal(true);
    setDiagProgress(15);
    try {
      await api.refreshDeviceTelemetry(deviceId, [
        "get_system_info",
        "get_resource_usage",
        "get_network_info",
        "list_processes",
        "list_docker_containers",
      ]);
      setDiagProgress(50);
      // Also request screenshot
      try {
        await api.submitTask(deviceId, "capture_desktop_screenshot", {});
      } catch {
        // Desktop might be disabled by policy
      }
      setDiagProgress(75);
      setTimeout(async () => {
        setDiagProgress(100);
        await loadData(true);
        setTimeout(() => setShowFullDiagModal(false), 800);
      }, 3000);
    } catch (err: any) {
      alert(`Diagnostic suite error: ${err.message}`);
      setShowFullDiagModal(false);
    }
  };

  const handleRunShellCommand = async (cmdToRun: string) => {
    const cmd = cmdToRun.trim();
    if (!cmd) return;
    setTerminalRunning(true);
    setTerminalInput("");
    try {
      const res = await api.submitTask(deviceId, "run_shell", { command: cmd });
      const taskId = res.task_id;
      setTerminalHistory(prev => [
        ...prev,
        { cmd, taskId, status: res.status, output: res.status === "needs_approval" ? "Task submitted; awaiting policy approval." : "Command running...", ts: Date.now() / 1000 },
      ]);

      if (res.status === "needs_approval") {
        setTerminalRunning(false);
        return;
      }

      let checks = 0;
      const poll = setInterval(async () => {
        checks++;
        try {
          const detail = await api.taskDetail(taskId);
          if (detail.status === "completed" || detail.status === "failed" || detail.status === "needs_approval" || checks > 25) {
            clearInterval(poll);
            setTerminalRunning(false);
            setTerminalHistory(prev =>
              prev.map(item => (item.taskId === taskId ? { ...item, status: detail.status, output: detail.result || "(no output returned)" } : item))
            );
          }
        } catch {
          clearInterval(poll);
          setTerminalRunning(false);
        }
      }, 1200);
    } catch (err: any) {
      setTerminalRunning(false);
      setTerminalHistory(prev => [
        ...prev,
        { cmd, taskId: "err", status: "failed", output: `Execution error: ${err.message}`, ts: Date.now() / 1000 },
      ]);
    }
  };

  const handleImageMouseMove = (e: React.MouseEvent<HTMLImageElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const naturalW = e.currentTarget.naturalWidth || rect.width;
    const naturalH = e.currentTarget.naturalHeight || rect.height;
    const scaleX = naturalW / rect.width;
    const scaleY = naturalH / rect.height;
    const x = Math.round((e.clientX - rect.left) * scaleX);
    const y = Math.round((e.clientY - rect.top) * scaleY);
    setMouseCoord({ x, y });
  };

  const handleImageClick = (e: React.MouseEvent<HTMLImageElement>) => {
    if (!mouseCoord) return;
    setUiActionModal({ x: mouseCoord.x, y: mouseCoord.y, action: "click" });
  };

  const handleExecuteUiAction = async () => {
    if (!uiActionModal) return;
    try {
      const args: any = { action: uiActionModal.action, x: uiActionModal.x, y: uiActionModal.y };
      if (uiActionModal.text) args.text = uiActionModal.text;
      await api.submitTask(deviceId, "perform_approved_ui_action", args);
      alert(`UI action (${uiActionModal.action}) queued at (${uiActionModal.x}, ${uiActionModal.y}).`);
      setUiActionModal(null);
      setTimeout(() => loadData(true), 2500);
    } catch (err: any) {
      alert(`UI action error: ${err.message}`);
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
      alert(`Package installation task submitted for ${installPackageId}. Check Approvals if gated.`);
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
      <div style={{ padding: 48, textAlign: "center" }}>
        <div style={{ fontSize: 28, marginBottom: 12 }}>⚡</div>
        <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 6 }}>Connecting to Device Telemetry Stream...</div>
        <div style={{ fontSize: 13, color: "var(--colorNeutralForeground3)" }}>Establishing secure session with device: <code>{deviceId}</code></div>
      </div>
    );
  }

  const dev = overview?.device || {};
  const health = overview?.health || {};
  const sys = overview?.system_info || {};
  const res = overview?.resource_usage || {};
  const processes: any[] = overview?.processes || [];
  const docker = overview?.docker || { available: false, containers: [] };
  const network = overview?.network || { interfaces: [], listening_ports: [] };
  const apps = overview?.apps || { allowed_apps: [], installed_packages: [], allowed_services: [], service_statuses: {} };
  const desktop = overview?.desktop || {};
  const recentTasks: any[] = overview?.recent_tasks || [];

  const isOnline = health.is_online;
  const isRevoked = !!dev.revoked;

  // CPU Load
  const cpuVal = typeof res.cpu_percent === "number" ? res.cpu_percent : null;
  const cpuTone = cpuVal === null ? "neutral" : cpuVal > 85 ? "danger" : cpuVal > 65 ? "warning" : "success";

  // RAM Usage
  const memVal = typeof res.memory_percent === "number" ? res.memory_percent : null;
  const memTone = memVal === null ? "neutral" : memVal > 85 ? "danger" : memVal > 70 ? "warning" : "brand";

  // Disk Storage
  let diskUsedPercent: number | null = null;
  if (res.disk_total_bytes && res.disk_used_bytes) {
    diskUsedPercent = Math.round((res.disk_used_bytes / res.disk_total_bytes) * 100);
  } else if (res.disk_total_bytes && res.disk_free_bytes) {
    diskUsedPercent = Math.round(((res.disk_total_bytes - res.disk_free_bytes) / res.disk_total_bytes) * 100);
  }
  const diskTone = diskUsedPercent === null ? "neutral" : diskUsedPercent > 90 ? "danger" : diskUsedPercent > 75 ? "warning" : "brand";

  // Smart Health Insights & Warnings
  const hasHighCpu = cpuVal !== null && cpuVal > 85;
  const hasHighMem = memVal !== null && memVal > 85;
  const hasHighDisk = diskUsedPercent !== null && diskUsedPercent > 90;
  const isHeartbeatLag = health.latency_seconds !== null && health.latency_seconds > 90;

  // Process Sorting & Filtering
  const filteredProcesses = processes.filter(p => {
    if (procSearch.trim()) {
      const q = procSearch.toLowerCase();
      const match = (p.name && String(p.name).toLowerCase().includes(q)) || (p.pid && String(p.pid).includes(q));
      if (!match) return false;
    }
    if (procFilter === "high_cpu") return (p.cpu_percent || 0) >= 5;
    if (procFilter === "high_mem") return (p.memory_percent || 0) >= 5;
    if (procFilter === "servers") {
      const sKeywords = ["node", "python", "nginx", "dockerd", "systemd", "sshd", "postgres", "redis", "mysql", "apache", "caddy", "uvicorn", "code"];
      return sKeywords.some(kw => (p.name || "").toLowerCase().includes(kw));
    }
    return true;
  }).sort((a, b) => {
    if (procSort === "cpu") return (b.cpu_percent || 0) - (a.cpu_percent || 0);
    if (procSort === "mem") return (b.memory_percent || 0) - (a.memory_percent || 0);
    if (procSort === "name") return String(a.name || "").localeCompare(String(b.name || ""));
    return (a.pid || 0) - (b.pid || 0);
  });

  // Network listening sockets filtering
  const listeningSockets: any[] = network.listening_ports || [];
  const filteredSockets = listeningSockets.filter((s: any) => {
    if (!portSearch.trim()) return true;
    const q = portSearch.toLowerCase();
    const svc = KNOWN_PORTS[s.port] || "";
    return String(s.port).includes(q) || s.protocol?.toLowerCase().includes(q) || s.process?.toLowerCase().includes(q) || svc.toLowerCase().includes(q);
  });

  // Top consumers
  const maxCpuProc = processes.reduce((max, p) => ((p.cpu_percent || 0) > (max?.cpu_percent || 0) ? p : max), null as any);
  const maxMemProc = processes.reduce((max, p) => ((p.memory_percent || 0) > (max?.memory_percent || 0) ? p : max), null as any);

  // Markdown Report Builder
  const generateMarkdownReport = () => {
    return `# Device Diagnostic Report: ${dev.name} (${dev.id})
- **Generated**: ${new Date().toLocaleString()}
- **Status**: ${isOnline ? "ONLINE" : isRevoked ? "REVOKED" : "OFFLINE"} (Heartbeat: ${rel(health.last_seen_ts)})
- **Hostname**: ${dev.hostname || sys.machine || "Unknown"}
- **OS / Kernel**: ${sys.system || dev.os || "Unknown"} ${sys.release || ""} (Build: ${sys.version || "—"})
- **CPU Architecture**: ${sys.machine || "x86_64"} | Processor: ${sys.processor || "—"}
- **Python Runtime**: Python ${sys.python || "—"}

## Real-Time Resource Telemetry
- **CPU Load**: ${cpuVal !== null ? `${cpuVal}%` : "No data"}
- **RAM Memory**: ${res.memory_total_bytes ? `${formatBytes(res.memory_total_bytes - (res.memory_available_bytes || 0))} / ${formatBytes(res.memory_total_bytes)} (${memVal}%)` : "No data"}
- **Storage Disk**: ${res.disk_total_bytes ? `${formatBytes(res.disk_total_bytes - (res.disk_free_bytes || 0))} / ${formatBytes(res.disk_total_bytes)} (${diskUsedPercent}%)` : "No data"}

## Running Servers & Listening Ports (${listeningSockets.length})
${listeningSockets.map(s => `- **${s.protocol} :${s.port}** [${KNOWN_PORTS[s.port] || "Custom Server"}] (Process: ${s.process || "PID " + s.pid})`).join("\n") || "No listening sockets detected."}

## Active Docker Containers (${docker.containers?.length || 0})
${docker.containers?.map((c: any) => `- **${c.name}** (${c.image}): ${c.status}`).join("\n") || "No active Docker containers."}

## Top Resource Consumers
- Highest CPU: ${maxCpuProc ? `${maxCpuProc.name} (PID ${maxCpuProc.pid}) - ${maxCpuProc.cpu_percent}%` : "—"}
- Highest RAM: ${maxMemProc ? `${maxMemProc.name} (PID ${maxMemProc.pid}) - ${maxMemProc.memory_percent}%` : "—"}

## Security Guardrails & Policy
- Custom Device Policy: ${dev.has_custom_policy ? "Yes" : "Inherits Global Baseline"}
- Desktop Automation: ${dev.effective_policy?.desktop_enabled ? "Enabled" : "Disabled"}
- Unattended Ceiling: Tier ${dev.effective_policy?.max_tier_unattended || 2}
- Allowlisted Apps: ${(apps.allowed_apps || []).join(", ") || "None"}
`;
  };

  return (
    <div style={{ display: "grid", gap: 18 }}>
      {/* Top Header Card */}
      <div className="f2-card" style={{ padding: "18px 20px" }}>
        {/* Navigation Breadcrumb & Device Switcher */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 14 }}>
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

          {/* Quick Actions & Switcher */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              className="f2-btn"
              onClick={() => setShowExportModal(true)}
              title="Export complete system diagnostic report in Markdown or JSON"
              style={{ fontSize: 12, padding: "5px 10px", display: "inline-flex", alignItems: "center", gap: 6 }}
            >
              <span>📋</span>
              <span>Export Report</span>
            </button>

            <button
              type="button"
              className="f2-btn"
              onClick={handleRunFullDiagnostics}
              title="Run complete diagnostic suite (System, CPU/RAM, Network Sockets, Processes, Docker, Vision)"
              style={{ fontSize: 12, padding: "5px 10px", display: "inline-flex", alignItems: "center", gap: 6 }}
            >
              <span>⚡</span>
              <span>Full Diagnostic Suite</span>
            </button>

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
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 14, borderTop: "1px solid var(--colorNeutralStroke2)", paddingTop: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            {isRevoked ? (
              <span className="f2-badge" data-tone="red" style={{ padding: "4px 10px" }}>
                ✕ REVOKED
              </span>
            ) : isOnline ? (
              <span className="f2-badge" data-tone="green" style={{ padding: "4px 10px", display: "inline-flex", alignItems: "center", gap: 6 }}>
                <span className="f2-pulse-dot" />
                ONLINE (Live Telemetry)
              </span>
            ) : (
              <span className="f2-badge" data-tone="grey" style={{ padding: "4px 10px" }}>
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
                🌐 Global Baseline
              </span>
            )}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button
              type="button"
              className="f2-btn"
              onClick={() => handleTriggerTelemetry()}
              disabled={refreshing}
              title="Queue telemetry refresh"
              style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
            >
              <span>{refreshing ? "⏳" : "↻"}</span>
              <span>{refreshing ? "Polling..." : "Refresh"}</span>
            </button>

            {onOpenPolicyModal && (
              <button
                type="button"
                className="f2-btn"
                onClick={() => onOpenPolicyModal(deviceId)}
                title="Configure allowed tools, apps, and guardrails for this device"
              >
                🛡️ Abilities
              </button>
            )}

            {onDispatchTask && !isRevoked && (
              <button
                type="button"
                className="f2-btn f2-btn-primary"
                onClick={() => onDispatchTask(deviceId)}
                title="Open task composer to run any tool on this device"
              >
                🚀 Dispatch Task
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Smart Health Insights Banner */}
      {(hasHighCpu || hasHighMem || hasHighDisk || isHeartbeatLag) && (
        <div
          className="f2-messagebar"
          data-intent={hasHighCpu || hasHighMem || hasHighDisk ? "warning" : "info"}
          style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}
        >
          <div>
            <b>System Advisory:</b>{" "}
            {hasHighCpu && `High CPU utilization detected (${cpuVal}%). Top consumer: ${maxCpuProc?.name || "processes"}. `}
            {hasHighMem && `Elevated RAM memory pressure (${memVal}% used). `}
            {hasHighDisk && `Storage space running low (${diskUsedPercent}% used). `}
            {isHeartbeatLag && `Heartbeat latency is ${Math.round(health.latency_seconds || 0)}s. `}
          </div>
          <button
            type="button"
            className="f2-btn f2-btn-sm"
            onClick={() => setActiveTab(hasHighCpu || hasHighMem ? "servers" : "specs")}
          >
            Review Resource Consumers →
          </button>
        </div>
      )}

      {/* Row 1: 4 System Health KPI Gauges with Live Sparklines */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: 14 }}>
        {/* CPU Load Gauge with Sparkline */}
        <div className="f2-card" style={{ padding: "16px 18px", position: "relative" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
            <div>
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--colorNeutralForeground2)" }}>CPU UTILIZATION</span>
              <div style={{ fontSize: 26, fontWeight: 700, color: "var(--colorNeutralForeground1)", marginTop: 2 }}>
                {cpuVal !== null ? `${cpuVal}%` : "—"}
              </div>
            </div>
            <Sparkline data={cpuHistory} color={cpuTone === "danger" ? "#d13438" : cpuTone === "warning" ? "#ffaa44" : "#0078d4"} />
          </div>

          <div className="f2-bar-track" style={{ height: 6, marginBottom: 8 }}>
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
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--colorNeutralForeground3)" }}>
            <span>Arch: <b>{sys.machine || "x86_64"}</b></span>
            <span>Peak: <b>{Math.max(...cpuHistory)}%</b></span>
          </div>
        </div>

        {/* RAM Memory Gauge with Sparkline */}
        <div className="f2-card" style={{ padding: "16px 18px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
            <div>
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--colorNeutralForeground2)" }}>MEMORY (RAM)</span>
              <div style={{ fontSize: 22, fontWeight: 700, color: "var(--colorNeutralForeground1)", marginTop: 2 }}>
                {res.memory_total_bytes
                  ? `${formatBytes(res.memory_total_bytes - (res.memory_available_bytes || 0))} / ${formatBytes(res.memory_total_bytes)}`
                  : (memVal !== null ? `${memVal}%` : "—")}
              </div>
            </div>
            <Sparkline data={memHistory} color={memTone === "danger" ? "#d13438" : memTone === "warning" ? "#ffaa44" : "#2886de"} />
          </div>

          <div className="f2-bar-track" style={{ height: 6, marginBottom: 8 }}>
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
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--colorNeutralForeground3)" }}>
            <span>Available: <b>{res.memory_available_bytes ? formatBytes(res.memory_available_bytes) : "—"}</b></span>
            <span>Load: <b>{memVal !== null ? `${memVal}%` : "—"}</b></span>
          </div>
        </div>

        {/* Storage Capacity Segmented Bar */}
        <div className="f2-card" style={{ padding: "16px 18px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
            <div>
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--colorNeutralForeground2)" }}>STORAGE DISK</span>
              <div style={{ fontSize: 22, fontWeight: 700, color: "var(--colorNeutralForeground1)", marginTop: 2 }}>
                {res.disk_total_bytes
                  ? `${formatBytes(res.disk_total_bytes - (res.disk_free_bytes || 0))} / ${formatBytes(res.disk_total_bytes)}`
                  : "—"}
              </div>
            </div>
            <span className="f2-badge" data-tone={diskTone === "danger" ? "red" : diskTone === "warning" ? "amber" : "green"}>
              {diskUsedPercent !== null ? `${diskUsedPercent}% Used` : "Disk OK"}
            </span>
          </div>

          <div className="f2-segmented-bar" style={{ height: 6, marginBottom: 8 }}>
            <div className="f2-segment-used" style={{ width: `${Math.min(100, Math.max(0, diskUsedPercent || 0))}%` }} />
            <div className="f2-segment-free" style={{ flex: 1 }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--colorNeutralForeground3)" }}>
            <span>Free Space: <b>{res.disk_free_bytes ? formatBytes(res.disk_free_bytes) : "—"}</b></span>
            <span>Root (/) Partition</span>
          </div>
        </div>

        {/* Running Services & Sockets Summary */}
        <div className="f2-card" style={{ padding: "16px 18px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--colorNeutralForeground2)" }}>SERVERS & SOCKETS</span>
            <span className="f2-badge" data-tone="blue">
              {listeningSockets.length} Ports Listening
            </span>
          </div>
          <div style={{ display: "grid", gap: 5, marginTop: 4 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
              <span style={{ color: "var(--colorNeutralForeground3)" }}>Docker Containers:</span>
              <b>{docker.available ? `${docker.containers?.length || 0} active` : "Daemon inactive"}</b>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
              <span style={{ color: "var(--colorNeutralForeground3)" }}>Top CPU Consumer:</span>
              <b style={{ maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {maxCpuProc ? `${maxCpuProc.name} (${maxCpuProc.cpu_percent}%)` : "—"}
              </b>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
              <span style={{ color: "var(--colorNeutralForeground3)" }}>Network Adapters:</span>
              <b>{network.interfaces?.length || 0} interfaces</b>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
              <span style={{ color: "var(--colorNeutralForeground3)" }}>Unattended Ceiling:</span>
              <b>Tier {dev.effective_policy?.max_tier_unattended || 2}</b>
            </div>
          </div>
        </div>
      </div>

      {/* Pending Approvals Alert on this Device */}
      {overview?.pending_approvals && overview.pending_approvals.length > 0 && (
        <div
          style={{
            padding: "14px 18px",
            borderRadius: 8,
            border: "1px solid var(--colorPaletteAmberBorder1)",
            background: "var(--colorPaletteAmberBackground1)",
            display: "grid",
            gap: 10,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 20 }}>⚠️</span>
              <div>
                <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "var(--colorPaletteAmberForeground1)" }}>
                  {overview.pending_approvals.length} Operation{overview.pending_approvals.length > 1 ? "s" : ""} Awaiting Human Approval on this Device
                </h4>
                <div style={{ fontSize: 12, color: "var(--colorNeutralForeground2)" }}>
                  These tasks are paused by policy guardrails. Authorize or deny execution below:
                </div>
              </div>
            </div>
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            {overview.pending_approvals.map((ap: any) => (
              <div
                key={ap.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "10px 14px",
                  borderRadius: 6,
                  background: "var(--colorNeutralBackground1)",
                  border: "1px solid var(--colorNeutralStroke2)",
                  gap: 12,
                  flexWrap: "wrap",
                }}
              >
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                    <span className="f2-badge" data-tone="amber">PENDING</span>
                    <b><code>{ap.tool}</code></b>
                    <span style={{ fontSize: 12, color: "var(--colorNeutralForeground3)" }}>· Tier {ap.tier}</span>
                    <span style={{ fontSize: 12, color: "var(--colorNeutralForeground3)" }}>· Task <code>{ap.task_id}</code></span>
                  </div>
                  <div style={{ fontSize: 12, color: "var(--colorNeutralForeground2)" }}>
                    {ap.reason}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    type="button"
                    className="f2-btn f2-btn-primary f2-btn-sm"
                    style={{ background: "#0e700e", borderColor: "#0e700e", color: "#ffffff", fontWeight: 700 }}
                    onClick={async () => {
                      try {
                        await api.decide(ap.id, "approved");
                        alert(`Approved ${ap.tool} (${ap.id}). Task queued to execute.`);
                        loadData();
                      } catch (e: any) {
                        alert(`Approve failed: ${e.message}`);
                      }
                    }}
                  >
                    ✓ Approve Task
                  </button>
                  <button
                    type="button"
                    className="f2-btn f2-btn-danger f2-btn-sm"
                    onClick={async () => {
                      try {
                        await api.decide(ap.id, "denied");
                        alert(`Denied ${ap.tool} (${ap.id}).`);
                        loadData();
                      } catch (e: any) {
                        alert(`Deny failed: ${e.message}`);
                      }
                    }}
                  >
                    ✕ Deny
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tabs Navigation Header */}
      <div style={{ display: "flex", borderBottom: "1px solid var(--colorNeutralStroke2)", gap: 4, flexWrap: "wrap" }}>
        {[
          { id: "specs", label: "💻 System Full Info", count: null },
          { id: "network", label: "🌐 Network & Listening Ports", count: listeningSockets.length || null },
          { id: "servers", label: "⚙️ Running Servers & Processes", count: processes.length || null },
          { id: "terminal", label: "⚡ Terminal & Shell", count: terminalHistory.length || null },
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
                    <td>{dev.has_custom_policy ? "Custom Device Policy" : "Inherited Global Baseline"}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 2. NETWORK & LISTENING PORTS */}
      {activeTab === "network" && (
        <div style={{ display: "grid", gap: 18 }}>
          {/* Active Listening Sockets */}
          <div className="f2-card" style={{ padding: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
                  <span>🌐 Active Listening Ports & Sockets</span>
                  <span className="f2-badge" data-tone="blue">{listeningSockets.length} Open Sockets</span>
                </h3>
                <div style={{ fontSize: 12, color: "var(--colorNeutralForeground3)", marginTop: 2 }}>
                  Network sockets currently bound and listening for inbound connections on this host.
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <input
                  className="f2-input"
                  placeholder="Filter by port, proto, or service..."
                  value={portSearch}
                  onChange={e => setPortSearch(e.target.value)}
                  style={{ width: 240, padding: "5px 10px", fontSize: 13 }}
                />
                <button
                  type="button"
                  className="f2-btn"
                  onClick={() => handleTriggerTelemetry(["get_network_info"])}
                  disabled={refreshing}
                  title="Probe network sockets"
                >
                  ⚡ Probe Sockets
                </button>
              </div>
            </div>

            {filteredSockets.length === 0 ? (
              <div style={{ padding: 28, textAlign: "center", color: "var(--colorNeutralForeground3)" }}>
                {listeningSockets.length === 0
                  ? "No listening socket telemetry recorded yet. Click 'Probe Sockets' to scan network listeners."
                  : "No sockets match your search query."}
              </div>
            ) : (
              <div className="f2-table-wrap">
                <table className="f2-table">
                  <thead>
                    <tr>
                      <th style={{ width: 90 }}>Protocol</th>
                      <th style={{ width: 120 }}>Port</th>
                      <th>Identified Service</th>
                      <th>Bind Address</th>
                      <th>Owning Process / PID</th>
                      <th style={{ width: 100 }}>State</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSockets.map((s: any, idx: number) => {
                      const svc = KNOWN_PORTS[s.port] || (s.port < 1024 ? "System Daemon" : "Application Server");
                      return (
                        <tr key={`${s.protocol}-${s.port}-${idx}`}>
                          <td><span className="f2-badge" data-tone={s.protocol === "TCP" ? "blue" : "grey"}>{s.protocol}</span></td>
                          <td><b style={{ fontSize: 14 }}>:{s.port}</b></td>
                          <td>
                            <b>{svc}</b>
                          </td>
                          <td><code>{s.address || "0.0.0.0"}</code></td>
                          <td>
                            {s.process ? (
                              <span><b>{s.process}</b> {s.pid && <code style={{ fontSize: 11 }}>({s.pid})</code>}</span>
                            ) : s.pid ? (
                              <code>PID {s.pid}</code>
                            ) : (
                              <span style={{ color: "var(--colorNeutralForeground3)" }}>—</span>
                            )}
                          </td>
                          <td><span className="f2-badge" data-tone="green">LISTEN</span></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Network Adapters & IP Addresses */}
          <div className="f2-card" style={{ padding: 20 }}>
            <div style={{ marginBottom: 14 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>📡 Network Adapters & IP Interfaces</h3>
              <div style={{ fontSize: 12, color: "var(--colorNeutralForeground3)", marginTop: 2 }}>
                Physical and virtual network interfaces configured on the host.
              </div>
            </div>

            {(!network.interfaces || network.interfaces.length === 0) ? (
              <div style={{ padding: 24, textAlign: "center", color: "var(--colorNeutralForeground3)" }}>
                No network interfaces detected. Run "Probe Sockets" to query interface addresses.
              </div>
            ) : (
              <div className="f2-table-wrap">
                <table className="f2-table">
                  <thead>
                    <tr>
                      <th style={{ width: 180 }}>Interface Name</th>
                      <th>IPv4 Addresses</th>
                      <th>IPv6 Addresses</th>
                    </tr>
                  </thead>
                  <tbody>
                    {network.interfaces.map((iface: any) => (
                      <tr key={iface.name}>
                        <td><b>{iface.name}</b></td>
                        <td>
                          {iface.ipv4 && iface.ipv4.length > 0 ? (
                            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                              {iface.ipv4.map((ip: string) => (
                                <code key={ip} style={{ padding: "2px 6px", background: "var(--colorNeutralBackground3)", borderRadius: 4 }}>
                                  {ip}
                                </code>
                              ))}
                            </div>
                          ) : "—"}
                        </td>
                        <td>
                          {iface.ipv6 && iface.ipv6.length > 0 ? (
                            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", fontSize: 11 }}>
                              {iface.ipv6.slice(0, 2).map((ip: string) => (
                                <code key={ip} style={{ padding: "2px 6px", background: "var(--colorNeutralBackground3)", borderRadius: 4 }}>
                                  {ip}
                                </code>
                              ))}
                            </div>
                          ) : "—"}
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

      {/* 3. RUNNING SERVERS & PROCESSES */}
      {activeTab === "servers" && (
        <div style={{ display: "grid", gap: 18 }}>
          {/* Docker Containers Section */}
          <div className="f2-card" style={{ padding: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
                  <span>🐳 Docker Container Services</span>
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
              >
                Scan Docker
              </button>
            </div>

            {!docker.available ? (
              <div className="f2-messagebar" data-intent="info">
                <span>{docker.note || "Docker is not detected on this machine or the Docker daemon is inactive."}</span>
              </div>
            ) : !docker.containers || docker.containers.length === 0 ? (
              <div style={{ padding: 20, textAlign: "center", color: "var(--colorNeutralForeground3)" }}>
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

          {/* Process Tree & Top Consumers */}
          <div className="f2-card" style={{ padding: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>📊 Live Process Tree & Resource Consumers</h3>
                <div style={{ fontSize: 12, color: "var(--colorNeutralForeground3)", marginTop: 2 }}>
                  Real-time active processes sorted by CPU and memory load.
                </div>
              </div>

              {/* Filters & Sorting */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <div className="f2-filter-chips">
                  <button
                    type="button"
                    className="f2-filter-chip"
                    data-active={String(procFilter === "all")}
                    onClick={() => setProcFilter("all")}
                  >
                    All ({processes.length})
                  </button>
                  <button
                    type="button"
                    className="f2-filter-chip"
                    data-active={String(procFilter === "high_cpu")}
                    onClick={() => setProcFilter("high_cpu")}
                  >
                    🔥 High CPU
                  </button>
                  <button
                    type="button"
                    className="f2-filter-chip"
                    data-active={String(procFilter === "high_mem")}
                    onClick={() => setProcFilter("high_mem")}
                  >
                    🧠 High Memory
                  </button>
                  <button
                    type="button"
                    className="f2-filter-chip"
                    data-active={String(procFilter === "servers")}
                    onClick={() => setProcFilter("servers")}
                  >
                    🌐 Server Daemons
                  </button>
                </div>

                <select
                  className="f2-input"
                  value={procSort}
                  onChange={e => setProcSort(e.target.value as any)}
                  style={{ width: 140, padding: "5px 10px", fontSize: 12 }}
                >
                  <option value="cpu">Sort by CPU %</option>
                  <option value="mem">Sort by RAM %</option>
                  <option value="name">Sort by Name</option>
                  <option value="pid">Sort by PID</option>
                </select>

                <input
                  className="f2-input"
                  placeholder="Filter name or PID..."
                  value={procSearch}
                  onChange={e => setProcSearch(e.target.value)}
                  style={{ width: 180, padding: "5px 10px", fontSize: 12 }}
                />

                <button
                  type="button"
                  className="f2-btn"
                  onClick={() => handleTriggerTelemetry(["list_processes"])}
                  disabled={refreshing}
                >
                  Scan Processes
                </button>
              </div>
            </div>

            {filteredProcesses.length === 0 ? (
              <div style={{ padding: 24, textAlign: "center", color: "var(--colorNeutralForeground3)" }}>
                No active processes found matching your filter.
              </div>
            ) : (
              <div className="f2-table-wrap">
                <table className="f2-table">
                  <thead>
                    <tr>
                      <th style={{ width: 90 }}>PID</th>
                      <th>Process Name</th>
                      <th style={{ width: 180 }}>CPU Utilization</th>
                      <th style={{ width: 180 }}>Memory Utilization</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredProcesses.map((p: any, idx: number) => {
                      const cpu = p.cpu_percent || 0;
                      const mem = p.memory_percent || 0;
                      return (
                        <tr key={`${p.pid}-${idx}`}>
                          <td><code>{p.pid}</code></td>
                          <td><b>{p.name}</b></td>
                          <td>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <div className="f2-bar-track" style={{ width: 70, height: 6 }}>
                                <div
                                  className="f2-bar-fill"
                                  style={{
                                    width: `${Math.min(100, Math.max(0, cpu))}%`,
                                    background: cpu > 50 ? "#d13438" : cpu > 15 ? "#ffaa44" : "#0078d4",
                                  }}
                                />
                              </div>
                              <span style={{ fontSize: 12, fontWeight: 600 }}>{cpu.toFixed(1)}%</span>
                            </div>
                          </td>
                          <td>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <div className="f2-bar-track" style={{ width: 70, height: 6 }}>
                                <div
                                  className="f2-bar-fill"
                                  style={{
                                    width: `${Math.min(100, Math.max(0, mem))}%`,
                                    background: mem > 30 ? "#ffaa44" : "#2886de",
                                  }}
                                />
                              </div>
                              <span style={{ fontSize: 12, fontWeight: 600 }}>{mem.toFixed(1)}%</span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 4. INTERACTIVE REMOTE SHELL TERMINAL */}
      {activeTab === "terminal" && (
        <div className="f2-card" style={{ padding: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 14 }}>
            <div>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
                <span>⚡ Remote Interactive Shell Console</span>
                <span className="f2-badge" data-tone="green">Policy Governed (Tier 3)</span>
              </h3>
              <div style={{ fontSize: 12, color: "var(--colorNeutralForeground3)", marginTop: 2 }}>
                Safely dispatch single shell commands directly to this machine's terminal with stdout/stderr capture.
              </div>
            </div>

            <button
              type="button"
              className="f2-btn"
              onClick={() => setTerminalHistory([])}
              style={{ fontSize: 12 }}
            >
              Clear Console
            </button>
          </div>

          {/* Quick Presets Bar */}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--colorNeutralForeground3)" }}>Quick Commands:</span>
            {[
              "uptime",
              "df -h",
              "free -m",
              "docker ps",
              "ip a",
              "netstat -tuln",
              "journalctl -n 25 --no-pager",
              "whoami",
            ].map(cmd => (
              <button
                key={cmd}
                type="button"
                className="f2-preset-pill"
                onClick={() => handleRunShellCommand(cmd)}
                disabled={terminalRunning}
                style={{ fontSize: 11 }}
              >
                {cmd}
              </button>
            ))}
          </div>

          {/* Terminal Window */}
          <div className="f2-terminal-window">
            <div className="f2-terminal-header">
              <div className="f2-terminal-dots">
                <span className="f2-terminal-dot" data-dot="red" />
                <span className="f2-terminal-dot" data-dot="yellow" />
                <span className="f2-terminal-dot" data-dot="green" />
              </div>
              <div>
                <span>{dev.name || "device"}</span> @ <span>{dev.hostname || "remote-host"}</span>
              </div>
              <div style={{ fontSize: 11 }}>
                {terminalRunning ? "● Running command..." : "Ready"}
              </div>
            </div>

            <div className="f2-terminal-body">
              {terminalHistory.map((item, idx) => (
                <div key={idx} className="f2-terminal-line">
                  <div>
                    <span className="f2-terminal-prompt">admin@{dev.hostname || "host"}:~$</span>
                    <b>{item.cmd}</b>
                    <span style={{ float: "right", fontSize: 11, color: "#8b949e" }}>
                      {item.status === "completed" ? "✓" : item.status === "failed" ? "✕" : "⏳"} {rel(item.ts)}
                    </span>
                  </div>
                  <div className="f2-terminal-output">{item.output}</div>
                </div>
              ))}
              {terminalRunning && (
                <div style={{ color: "#58a6ff", fontSize: 13, marginTop: 8 }}>
                  <span>⏳ Executing remote command through control plane...</span>
                </div>
              )}
            </div>

            {/* Terminal Input Bar */}
            <form
              onSubmit={e => {
                e.preventDefault();
                handleRunShellCommand(terminalInput);
              }}
              className="f2-terminal-input-wrap"
            >
              <span className="f2-terminal-prompt">admin@{dev.hostname || "host"}:~$</span>
              <input
                className="f2-terminal-input"
                placeholder="Type command and press Enter (e.g. ls -la, ping -c 3 8.8.8.8)..."
                value={terminalInput}
                onChange={e => setTerminalInput(e.target.value)}
                disabled={terminalRunning}
              />
              <button
                type="submit"
                className="f2-btn f2-btn-primary"
                disabled={terminalRunning || !terminalInput.trim()}
                style={{ padding: "4px 12px", fontSize: 12 }}
              >
                Run
              </button>
            </form>
          </div>
        </div>
      )}

      {/* 5. INSTALLED APPS & PACKAGES */}
      {activeTab === "apps" && (
        <div style={{ display: "grid", gap: 18 }}>
          {/* Allowlisted Desktop Applications */}
          <div className="f2-card" style={{ padding: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>🖥️ Allowlisted Desktop & GUI Applications</h3>
                <div style={{ fontSize: 12, color: "var(--colorNeutralForeground3)", marginTop: 2 }}>
                  Applications authorized by device policy for automated or interactive launch.
                </div>
              </div>
            </div>

            {(!apps.allowed_apps || apps.allowed_apps.length === 0) ? (
              <div style={{ padding: 24, textAlign: "center", color: "var(--colorNeutralForeground3)" }}>
                No allowlisted applications configured for this device.
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12 }}>
                {apps.allowed_apps.map((app: string) => (
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
                        Binary identifier: <code>{app}</code>
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
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>📦 System Packages Installed</h3>
                <div style={{ fontSize: 12, color: "var(--colorNeutralForeground3)", marginTop: 2 }}>
                  Packages deployed via <code>winget</code> (Windows) or <code>apt-get</code> / <code>dnf</code> (Linux).
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

      {/* 6. VISION & DESKTOP INTERACTIVE HUD */}
      {activeTab === "vision" && (
        <div style={{ display: "grid", gap: 16 }}>
          <div className="f2-card" style={{ padding: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 14 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>📸 Interactive Desktop Screen Vision & HUD</h3>
                <div style={{ fontSize: 12, color: "var(--colorNeutralForeground3)", marginTop: 2 }}>
                  Multimodal vision capture. Click anywhere on the image to simulate mouse clicks or keystroke automation.
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <label className="f2-switch-label" title="Automatically capture screenshot every 10 seconds">
                  <input
                    type="checkbox"
                    checked={autoCaptureVision}
                    onChange={e => setAutoCaptureVision(e.target.checked)}
                    style={{ display: "none" }}
                  />
                  <span className="f2-switch" data-checked={String(autoCaptureVision)} />
                  <span style={{ fontSize: 12 }}>Auto-Capture (10s)</span>
                </label>

                <button
                  type="button"
                  className="f2-btn f2-btn-primary"
                  onClick={() => handleTriggerTelemetry(["capture_desktop_screenshot"])}
                  disabled={refreshing}
                >
                  📸 Capture Screen
                </button>
              </div>
            </div>

            {desktop.screenshot?.image_base64 ? (
              <div style={{ textAlign: "center" }}>
                <div className="f2-vision-container">
                  <img
                    src={`data:${desktop.screenshot.mime_type || "image/png"};base64,${desktop.screenshot.image_base64}`}
                    alt="Desktop Screenshot"
                    onMouseMove={handleImageMouseMove}
                    onClick={handleImageClick}
                    style={{
                      maxWidth: "100%",
                      maxHeight: "600px",
                      borderRadius: "var(--borderRadiusMedium)",
                      border: "1px solid var(--colorNeutralStroke1)",
                      boxShadow: "var(--shadow16)",
                    }}
                  />
                  {mouseCoord && (
                    <div className="f2-vision-hud">
                      X: {mouseCoord.x} | Y: {mouseCoord.y} (Click to automate)
                    </div>
                  )}
                </div>

                <div style={{ marginTop: 8, fontSize: 12, color: "var(--colorNeutralForeground3)" }}>
                  Captured: {fmt(desktop.screenshot_updated_at)} ({rel(desktop.screenshot_updated_at)})
                  {desktop.screenshot.size && ` • Resolution: ${Array.isArray(desktop.screenshot.size) ? desktop.screenshot.size.join("x") : desktop.screenshot.size}`}
                </div>
              </div>
            ) : (
              <div style={{ padding: 36, textAlign: "center", color: "var(--colorNeutralForeground3)" }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>🖥️</div>
                <div style={{ fontWeight: 600 }}>No screenshot captured yet</div>
                <div style={{ fontSize: 13, marginTop: 4 }}>Click "Capture Screen" above to take a live high-resolution snapshot.</div>
              </div>
            )}
          </div>

          {/* Active Desktop Windows List */}
          <div className="f2-card" style={{ padding: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
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
                No active windows scanned yet. Click "Scan Windows" to query open windows.
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

      {/* 7. TASK EXECUTION STREAM */}
      {activeTab === "history" && (
        <div className="f2-card" style={{ padding: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
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

      {/* MODAL: Run Full Diagnostics Suite Progress */}
      {showFullDiagModal && (
        <div className="f2-dialog-overlay">
          <div className="f2-dialog" style={{ maxWidth: 440 }}>
            <h3 style={{ margin: "0 0 12px 0", fontSize: 17 }}>Running Full Diagnostics Suite</h3>
            <p style={{ fontSize: 13, color: "var(--colorNeutralForeground2)", marginBottom: 16 }}>
              Dispatching parallel diagnostic probes (System, Resource Gauges, Network Sockets, Processes, Docker, Vision) to <b>{dev.name}</b>...
            </p>
            <div className="f2-bar-track" style={{ height: 10, marginBottom: 14 }}>
              <div
                className="f2-bar-fill"
                style={{ width: `${diagProgress}%`, transition: "width 0.4s ease" }}
              />
            </div>
            <div style={{ fontSize: 12, color: "var(--colorNeutralForeground3)", display: "flex", justifyContent: "space-between" }}>
              <span>Probing device telemetry...</span>
              <span>{diagProgress}%</span>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Export Diagnostic Report */}
      {showExportModal && (
        <div className="f2-dialog-overlay" onClick={() => setShowExportModal(false)}>
          <div className="f2-dialog" onClick={e => e.stopPropagation()} style={{ maxWidth: 680, maxHeight: "80vh", display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <h3 style={{ margin: 0, fontSize: 17 }}>Device Diagnostic Report: {dev.name}</h3>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  className="f2-btn"
                  onClick={() => {
                    const content = exportFormat === "markdown" ? generateMarkdownReport() : JSON.stringify(overview, null, 2);
                    navigator.clipboard?.writeText(content);
                    alert("Report copied to clipboard!");
                  }}
                  style={{ fontSize: 12 }}
                >
                  ✓ Copy to Clipboard
                </button>
                <button type="button" className="f2-btn" style={{ padding: "2px 8px" }} onClick={() => setShowExportModal(false)}>✕</button>
              </div>
            </div>

            <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
              <button
                type="button"
                className="f2-filter-chip"
                data-active={String(exportFormat === "markdown")}
                onClick={() => setExportFormat("markdown")}
              >
                Markdown Report
              </button>
              <button
                type="button"
                className="f2-filter-chip"
                data-active={String(exportFormat === "json")}
                onClick={() => setExportFormat("json")}
              >
                Raw JSON
              </button>
            </div>

            <div style={{ overflowY: "auto", flex: 1, padding: 4 }}>
              <pre style={{ background: "var(--colorNeutralBackground3)", padding: 12, borderRadius: 4, fontSize: 12, whiteSpace: "pre-wrap" }}>
                {exportFormat === "markdown" ? generateMarkdownReport() : JSON.stringify(overview, null, 2)}
              </pre>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: UI Action Simulator (from Vision click) */}
      {uiActionModal && (
        <div className="f2-dialog-overlay" onClick={() => setUiActionModal(null)}>
          <div className="f2-dialog" onClick={e => e.stopPropagation()} style={{ maxWidth: 460 }}>
            <h3 style={{ margin: "0 0 12px 0", fontSize: 17 }}>Perform UI Action at ({uiActionModal.x}, {uiActionModal.y})</h3>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Action Type:</label>
              <select
                className="f2-input"
                value={uiActionModal.action}
                onChange={e => setUiActionModal({ ...uiActionModal, action: e.target.value })}
                style={{ width: "100%" }}
              >
                <option value="click">Single Click (Left Mouse)</option>
                <option value="double_click">Double Click</option>
                <option value="right_click">Right Click (Context Menu)</option>
                <option value="type_text">Type Text at Location</option>
              </select>
            </div>
            {uiActionModal.action === "type_text" && (
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Text to Type:</label>
                <input
                  className="f2-input"
                  placeholder="Text to type..."
                  value={uiActionModal.text || ""}
                  onChange={e => setUiActionModal({ ...uiActionModal, text: e.target.value })}
                  style={{ width: "100%" }}
                />
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 14 }}>
              <button type="button" className="f2-btn" onClick={() => setUiActionModal(null)}>Cancel</button>
              <button type="button" className="f2-btn f2-btn-primary" onClick={handleExecuteUiAction}>
                Dispatch UI Action
              </button>
            </div>
          </div>
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
                Windows winget format: <code>Publisher.App</code>. Linux format: <code>package_name</code>.
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
