/**
 * AI Bridge Enterprise Dashboard — Device360View (Screen 3)
 * Device 360 System Dashboard & Hardware Gauges:
 * Node Selector Dropdown, 4 Hardware Telemetry Gauges (CPU Cores, RAM, Disk, Net),
 * 4 JXTabs Panels (Processes with kill guard, Installed Apps, Network Sockets, Daemons),
 * Security Fingerprint Drawer, Fast Action Command Ribbon with Hold-to-Confirm Reboot.
 * Pure @jacxishippingorg/jx-ui-react, motion/react, and lucide-react. ZERO inline styles.
 */

import React, { useState, useMemo, useCallback } from "react";
import { motion } from "motion/react";
import {
  JXContainer,
  JXStack,
  JXGrid,
  JXGridItem,
  JXCard,
  JXCardHeader,
  JXCardContent,
  JXBadge,
  JXButton,
  JXChip,
  JXTextField,
  JXTabs,
  JXLinearProgress,
  JXAlert,
  JXSelect,
  GlassModal,
  HoldToConfirmButton,
  BreadcrumbTrail,
} from "@jacxishippingorg/jx-ui-react";
import {
  Server,
  Activity,
  Shield,
  ShieldCheck,
  Cpu,
  HardDrive,
  Layers,
  Zap,
  Terminal,
  Monitor,
  Laptop,
  Search,
  ArrowRight,
  Check,
  AlertTriangle,
  XCircle,
  CheckCircle2,
  Play,
  Square,
  RotateCcw,
  RefreshCw,
  Lock,
  Radio,
  Network,
  Settings,
  Trash2,
  Flame,
  Eye,
  KeyRound,
} from "lucide-react";
import { useDashboardStore } from "../state/dashboardStore";
import type { EnrolledDevice } from "../types/dashboard";

interface ProcessItem {
  pid: number;
  name: string;
  user: string;
  cpuPercent: number;
  memoryMb: number;
  threads: number;
  state: "R (Running)" | "S (Sleeping)" | "D (Disk Wait)";
  isProtected?: boolean;
}

interface InstalledApp {
  id: string;
  name: string;
  version: string;
  publisher: string;
  binaryPath: string;
  category: "Runtime" | "Database" | "Container" | "Tooling" | "Browser";
}

interface SocketPort {
  port: number;
  protocol: "TCP" | "UDP";
  localAddress: string;
  foreignAddress: string;
  state: "LISTEN" | "ESTABLISHED" | "TIME_WAIT";
  service: string;
}

interface SystemDaemon {
  name: string;
  description: string;
  status: "active" | "stopped" | "failed";
  pid: number;
  memoryMb: number;
  restarts: number;
}

export const Device360View: React.FC = () => {
  const devices = useDashboardStore((s) => s.devices);
  const selectedDeviceId = useDashboardStore((s) => s.selectedDeviceId);
  const setSelectedDeviceId = useDashboardStore((s) => s.setSelectedDeviceId);
  const setCurrentView = useDashboardStore((s) => s.setCurrentView);
  const dispatchTask = useDashboardStore((s) => s.dispatchTask);

  const selectedDevice = useMemo(
    () => devices.find((d) => d.id === selectedDeviceId) || devices[0],
    [devices, selectedDeviceId]
  );

  const telemetry = selectedDevice.telemetry;

  // Active diagnostic panel tab
  const [activeTab, setActiveTab] = useState<string>("processes");

  // Fast command ribbon feedback
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  // Process manager state
  const [processSearch, setProcessSearch] = useState<string>("");
  const [processSortBy, setProcessSortBy] = useState<"cpu" | "mem" | "pid" | "name">("cpu");
  const [processToKill, setProcessToKill] = useState<ProcessItem | null>(null);
  const [killGuardError, setKillGuardError] = useState<string | null>(null);

  // Initial process list
  const [processes, setProcesses] = useState<ProcessItem[]>([
    {
      pid: 1,
      name: "systemd",
      user: "root",
      cpuPercent: 0.1,
      memoryMb: 24,
      threads: 1,
      state: "S (Sleeping)",
      isProtected: true,
    },
    {
      pid: 1042,
      name: "ai-bridge-agent",
      user: "root",
      cpuPercent: 18.2,
      memoryMb: 182,
      threads: 8,
      state: "R (Running)",
      isProtected: true,
    },
    {
      pid: 1892,
      name: "sshd",
      user: "root",
      cpuPercent: 0.2,
      memoryMb: 16,
      threads: 2,
      state: "S (Sleeping)",
    },
    {
      pid: 3201,
      name: "docker-daemon",
      user: "root",
      cpuPercent: 4.6,
      memoryMb: 420,
      threads: 16,
      state: "S (Sleeping)",
    },
    {
      pid: 4890,
      name: "postgres",
      user: "postgres",
      cpuPercent: 2.1,
      memoryMb: 512,
      threads: 12,
      state: "S (Sleeping)",
    },
    {
      pid: 8912,
      name: "node server.js",
      user: "deploy",
      cpuPercent: 6.8,
      memoryMb: 288,
      threads: 10,
      state: "R (Running)",
    },
    {
      pid: 12040,
      name: "redis-server",
      user: "redis",
      cpuPercent: 1.2,
      memoryMb: 94,
      threads: 4,
      state: "S (Sleeping)",
    },
    {
      pid: 14890,
      name: "python worker.py",
      user: "agent",
      cpuPercent: 8.5,
      memoryMb: 340,
      threads: 6,
      state: "R (Running)",
    },
  ]);

  // Initial installed applications
  const [installedApps, setInstalledApps] = useState<InstalledApp[]>([
    {
      id: "app-1",
      name: "Docker Engine",
      version: "26.1.1",
      publisher: "Docker Inc",
      binaryPath: "/usr/bin/docker",
      category: "Container",
    },
    {
      id: "app-2",
      name: "Node.js Runtime",
      version: "20.14.0 LTS",
      publisher: "OpenJS Foundation",
      binaryPath: "/usr/bin/node",
      category: "Runtime",
    },
    {
      id: "app-3",
      name: "Python 3",
      version: "3.12.3",
      publisher: "Python Software Foundation",
      binaryPath: "/usr/bin/python3",
      category: "Runtime",
    },
    {
      id: "app-4",
      name: "PostgreSQL Database Server",
      version: "16.3",
      publisher: "PostgreSQL Global Development Group",
      binaryPath: "/usr/lib/postgresql/16/bin/postgres",
      category: "Database",
    },
    {
      id: "app-5",
      name: "Google Chrome Headless",
      version: "125.0.6422.112",
      publisher: "Google LLC",
      binaryPath: "/opt/google/chrome/chrome",
      category: "Browser",
    },
    {
      id: "app-6",
      name: "Git SCM",
      version: "2.43.0",
      publisher: "Software Freedom Conservancy",
      binaryPath: "/usr/bin/git",
      category: "Tooling",
    },
  ]);

  // Initial listening sockets and ports
  const listeningSockets: SocketPort[] = [
    {
      port: 8000,
      protocol: "TCP",
      localAddress: "0.0.0.0:8000",
      foreignAddress: "*:*",
      state: "LISTEN",
      service: "AI Bridge Control Plane Gateway",
    },
    {
      port: 22,
      protocol: "TCP",
      localAddress: "0.0.0.0:22",
      foreignAddress: "10.240.0.4:52840",
      state: "ESTABLISHED",
      service: "SSH Secure Shell",
    },
    {
      port: 443,
      protocol: "TCP",
      localAddress: "0.0.0.0:443",
      foreignAddress: "*:*",
      state: "LISTEN",
      service: "HTTPS Reverse Proxy (mTLS Enforced)",
    },
    {
      port: 5432,
      protocol: "TCP",
      localAddress: "127.0.0.1:5432",
      foreignAddress: "*:*",
      state: "LISTEN",
      service: "PostgreSQL Database Engine",
    },
    {
      port: 6379,
      protocol: "TCP",
      localAddress: "127.0.0.1:6379",
      foreignAddress: "*:*",
      state: "LISTEN",
      service: "Redis In-Memory Data Store",
    },
    {
      port: 9090,
      protocol: "TCP",
      localAddress: "0.0.0.0:9090",
      foreignAddress: "*:*",
      state: "LISTEN",
      service: "Prometheus Metrics Exporter",
    },
  ];

  // Initial system daemons
  const [daemons, setDaemons] = useState<SystemDaemon[]>([
    {
      name: "ai-bridge-agent.service",
      description: "AI Bridge Distributed Autonomous Edge Agent",
      status: "active",
      pid: 1042,
      memoryMb: 182,
      restarts: 0,
    },
    {
      name: "sshd.service",
      description: "OpenSSH Server Daemon",
      status: "active",
      pid: 1892,
      memoryMb: 16,
      restarts: 0,
    },
    {
      name: "docker.service",
      description: "Docker Application Container Engine",
      status: "active",
      pid: 3201,
      memoryMb: 420,
      restarts: 1,
    },
    {
      name: "vector-agent.service",
      description: "Observability Vector Metric & Log Shipper",
      status: "active",
      pid: 5820,
      memoryMb: 96,
      restarts: 0,
    },
    {
      name: "systemd-journald.service",
      description: "Journal Service Ring Buffer",
      status: "active",
      pid: 610,
      memoryMb: 64,
      restarts: 0,
    },
  ]);

  // Options for node selector dropdown
  const deviceOptions = useMemo(
    () =>
      devices.map((d) => ({
        id: d.id,
        label: `${d.hostname} (${d.name})`,
        meta: `${d.osRelease} • ${d.platform}`,
        status: (d.status === "online"
          ? "Healthy"
          : d.status === "unresponsive"
          ? "Degraded"
          : "Offline") as "Healthy" | "Degraded" | "Offline",
      })),
    [devices]
  );

  // Fast action command handlers
  const handleCaptureScreen = useCallback(async () => {
    setActionFeedback(null);
    try {
      const task = await dispatchTask({
        deviceId: selectedDevice.id,
        tool: "desktop.capture_screen",
        args: { format: "png", quality: 90 },
        riskTier: "tier1_safe",
      });
      setActionFeedback(`Screen captured for ${selectedDevice.hostname} (#${task.id}).`);
    } catch (err: any) {
      setActionFeedback(`Capture failed: ${err?.message}`);
    }
  }, [dispatchTask, selectedDevice]);

  const handleFlushDns = useCallback(async () => {
    setActionFeedback(null);
    try {
      const task = await dispatchTask({
        deviceId: selectedDevice.id,
        tool: "shell.exec",
        args: { command: "systemd-resolve --flush-caches" },
        riskTier: "tier3_shell",
      });
      setActionFeedback(`DNS cache flush dispatched to ${selectedDevice.hostname} (#${task.id}).`);
    } catch (err: any) {
      setActionFeedback(`Flush failed: ${err?.message}`);
    }
  }, [dispatchTask, selectedDevice]);

  const handleCreateBackup = useCallback(async () => {
    setActionFeedback(null);
    try {
      const task = await dispatchTask({
        deviceId: selectedDevice.id,
        tool: "shell.exec",
        args: { command: "tar -czf /opt/backups/snapshot.tar.gz /opt/ai-bridge/workspace" },
        riskTier: "tier2_workspace",
      });
      setActionFeedback(`Backup archive snapshot initiated (#${task.id}).`);
    } catch (err: any) {
      setActionFeedback(`Backup failed: ${err?.message}`);
    }
  }, [dispatchTask, selectedDevice]);

  const handleRebootNode = useCallback(async () => {
    setActionFeedback(null);
    try {
      const task = await dispatchTask({
        deviceId: selectedDevice.id,
        tool: "shell.exec",
        args: { command: "systemctl reboot" },
        riskTier: "tier4_kernel",
      });
      setActionFeedback(`SIGREBOOT issued for ${selectedDevice.hostname} (#${task.id}).`);
    } catch (err: any) {
      setActionFeedback(`Reboot failed: ${err?.message}`);
    }
  }, [dispatchTask, selectedDevice]);

  // Filtered and sorted processes
  const filteredProcesses = useMemo(() => {
    let list = processes.filter(
      (p) =>
        p.name.toLowerCase().includes(processSearch.toLowerCase()) ||
        p.user.toLowerCase().includes(processSearch.toLowerCase()) ||
        String(p.pid).includes(processSearch)
    );

    list.sort((a, b) => {
      if (processSortBy === "cpu") return b.cpuPercent - a.cpuPercent;
      if (processSortBy === "mem") return b.memoryMb - a.memoryMb;
      if (processSortBy === "pid") return a.pid - b.pid;
      return a.name.localeCompare(b.name);
    });

    return list;
  }, [processes, processSearch, processSortBy]);

  // Process termination handler with protection guard
  const handleConfirmKillProcess = useCallback(() => {
    if (!processToKill) return;

    if (processToKill.isProtected || processToKill.pid === 1 || processToKill.name === "ai-bridge-agent") {
      setKillGuardError(
        `Protected System Process: Cannot terminate "${processToKill.name}" (PID ${processToKill.pid}) without compromising the control plane.`
      );
      return;
    }

    setProcesses((prev) => prev.filter((p) => p.pid !== processToKill.pid));
    setActionFeedback(`Signal SIGTERM sent to PID ${processToKill.pid} (${processToKill.name}).`);
    setProcessToKill(null);
    setKillGuardError(null);
  }, [processToKill]);

  // Daemon state toggle handler
  const handleDaemonAction = useCallback((daemonName: string, action: "start" | "stop" | "restart") => {
    setDaemons((prev) =>
      prev.map((d) => {
        if (d.name !== daemonName) return d;
        if (action === "stop") {
          return { ...d, status: "stopped", pid: 0 };
        }
        if (action === "start") {
          return { ...d, status: "active", pid: Math.floor(1000 + Math.random() * 8000) };
        }
        return {
          ...d,
          status: "active",
          pid: Math.floor(1000 + Math.random() * 8000),
          restarts: d.restarts + 1,
        };
      })
    );
    setActionFeedback(`Daemon ${daemonName}: ${action.toUpperCase()} action dispatched.`);
  }, []);

  return (
    <div className="w-full space-y-6">
      {/* Breadcrumb Navigation & Node Selector Ribbon */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-800/60">
        <div>
          <BreadcrumbTrail
            crumbs={["AI Bridge", "Operations Domain", "Device 360", selectedDevice.hostname]}
          />
          <h1 className="text-xl font-bold tracking-tight text-slate-100 mt-1">
            Device 360 System Dashboard
          </h1>
          <p className="text-xs text-slate-400 font-mono mt-0.5">
            Hardware Telemetry, Process Governance, Sockets & Daemons • mTLS v1.3 Key-Bound
          </p>
        </div>

        {/* Node Switcher Dropdown */}
        <div className="w-full md:w-80">
          <JXSelect
            options={deviceOptions}
            value={selectedDeviceId}
            onChange={(val) => setSelectedDeviceId(val)}
            searchable
            label="Switch Fleet Node"
          />
        </div>
      </div>

      {/* Device Header & Fast Hardware Controls */}
      <JXCard className="bg-slate-900/60 border-slate-800 relative overflow-hidden">
        <JXCardContent>
          <div className="space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-xl bg-indigo-950/60 border border-indigo-800/40 text-indigo-400">
                  {selectedDevice.platform === "windows" ? (
                    <Monitor className="w-6 h-6 text-cyan-400" />
                  ) : selectedDevice.platform === "darwin" ? (
                    <Laptop className="w-6 h-6 text-purple-400" />
                  ) : (
                    <Server className="w-6 h-6 text-indigo-400" />
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-bold text-slate-100">{selectedDevice.hostname}</span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded uppercase bg-slate-800 text-slate-300">
                      {selectedDevice.arch}
                    </span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-semibold">
                      Online • mTLS v1.3 Verified
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 font-mono mt-0.5">
                    {selectedDevice.osRelease} • IP: {telemetry.ipAddress} • Latency: {selectedDevice.latencyMs}ms
                  </p>
                </div>
              </div>

              {/* Fast Action Command Ribbon with Hold-to-Confirm Reboot */}
              <div className="flex items-center gap-2 flex-wrap">
                <JXButton
                  variant="soft"
                  color="neutral"
                  size="sm"
                  onClick={handleCaptureScreen}
                  startIcon={<Monitor className="w-3.5 h-3.5 text-indigo-400" />}
                  className="bg-slate-850 hover:bg-slate-800 text-slate-200 border border-slate-700/60"
                >
                  Capture Screen
                </JXButton>

                <JXButton
                  variant="soft"
                  color="neutral"
                  size="sm"
                  onClick={handleFlushDns}
                  startIcon={<RotateCcw className="w-3.5 h-3.5 text-cyan-400" />}
                  className="bg-slate-850 hover:bg-slate-800 text-slate-200 border border-slate-700/60"
                >
                  Flush DNS
                </JXButton>

                <JXButton
                  variant="soft"
                  color="neutral"
                  size="sm"
                  onClick={handleCreateBackup}
                  startIcon={<HardDrive className="w-3.5 h-3.5 text-amber-400" />}
                  className="bg-slate-850 hover:bg-slate-800 text-slate-200 border border-slate-700/60"
                >
                  Create Backup
                </JXButton>

                {/* Reboot Node Hold-to-Confirm Button */}
                <HoldToConfirmButton
                  label="Reboot Node"
                  tone="danger"
                  holdDurationMs={1800}
                  onConfirm={handleRebootNode}
                />
              </div>
            </div>

            {/* Action Feedback Notification */}
            {actionFeedback && (
              <JXAlert
                severity="success"
                title="Command Executed"
                description={actionFeedback}
              />
            )}
          </div>
        </JXCardContent>
      </JXCard>

      {/* 4 Hardware Telemetry Gauges (Bento Units) */}
      <JXGrid columns={12} gap="md">
        {/* Gauge 1: CPU Utilization */}
        <JXGridItem colSpan={3}>
          <JXCard spotlight hoverLift className="bg-slate-900/60 border-slate-800 h-full">
            <JXCardHeader
              title="CPU Compute"
              subheader={`${telemetry.cpuClockGhz} GHz Xeon Scalable`}
              icon={<Cpu className="w-4 h-4 text-indigo-400" />}
            />
            <JXCardContent>
              <div className="space-y-3">
                <div className="flex items-baseline justify-between">
                  <span className="font-mono text-2xl font-bold text-slate-100 tabular-nums">
                    {telemetry.cpuPercent.toFixed(1)}%
                  </span>
                  <span className="text-[11px] font-mono text-slate-400">Load: 0.45, 0.52, 0.48</span>
                </div>

                {/* Per-core mini bars */}
                <div className="space-y-1.5 p-2 rounded-xl bg-slate-850/80 border border-slate-800">
                  <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
                    <span>CORES ({telemetry.cpuCores.length} vCPU)</span>
                    <span className="text-indigo-400">Active</span>
                  </div>
                  <div className="grid grid-cols-4 gap-1.5 pt-0.5">
                    {telemetry.cpuCores.slice(0, 8).map((core, idx) => (
                      <div key={idx} className="space-y-0.5 text-center">
                        <JXLinearProgress value={core} className="h-1.5" />
                        <span className="text-[9px] font-mono text-slate-400 block tabular-nums">
                          C{idx}: {core}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </JXCardContent>
          </JXCard>
        </JXGridItem>

        {/* Gauge 2: Memory (RAM) */}
        <JXGridItem colSpan={3}>
          <JXCard spotlight hoverLift className="bg-slate-900/60 border-slate-800 h-full">
            <JXCardHeader
              title="Physical Memory"
              subheader="DDR5 ECC Registered"
              icon={<Layers className="w-4 h-4 text-purple-400" />}
            />
            <JXCardContent>
              <div className="space-y-3">
                <div className="flex items-baseline justify-between">
                  <span className="font-mono text-2xl font-bold text-purple-300 tabular-nums">
                    {telemetry.memoryUsedGb} / {telemetry.memoryTotalGb} GB
                  </span>
                  <span className="text-[11px] font-mono text-slate-400">
                    {Math.round((telemetry.memoryUsedGb / telemetry.memoryTotalGb) * 100)}%
                  </span>
                </div>

                {/* Segmented Memory Breakdown Bar */}
                <div className="space-y-1.5 p-2 rounded-xl bg-slate-850/80 border border-slate-800">
                  <div className="w-full h-2 rounded-full bg-slate-800 flex overflow-hidden">
                    <div className="bg-purple-500 h-full w-[45%]" title="Active Allocations" />
                    <div className="bg-indigo-400 h-full w-[25%]" title="Buffers & Cache" />
                    <div className="bg-slate-700 h-full w-[30%]" title="Free Space" />
                  </div>
                  <div className="flex justify-between items-center text-[10px] font-mono text-slate-400 pt-0.5">
                    <span>Active: {(telemetry.memoryUsedGb * 0.7).toFixed(1)}G</span>
                    <span>Cache: {(telemetry.memoryUsedGb * 0.3).toFixed(1)}G</span>
                    <span>Swap: {telemetry.swapUsedGb}G</span>
                  </div>
                </div>
              </div>
            </JXCardContent>
          </JXCard>
        </JXGridItem>

        {/* Gauge 3: Storage Volumes */}
        <JXGridItem colSpan={3}>
          <JXCard spotlight hoverLift className="bg-slate-900/60 border-slate-800 h-full">
            <JXCardHeader
              title="Storage Volumes"
              subheader="NVMe Solid State PCIe 4.0"
              icon={<HardDrive className="w-4 h-4 text-emerald-400" />}
            />
            <JXCardContent>
              <div className="space-y-3">
                <div className="flex items-baseline justify-between">
                  <span className="font-mono text-2xl font-bold text-emerald-300 tabular-nums">
                    {telemetry.diskUsedGb} / {telemetry.diskTotalGb} GB
                  </span>
                  <span className="text-[11px] font-mono text-emerald-400">SMART OK</span>
                </div>

                {/* Partition bars */}
                <div className="space-y-2 p-2 rounded-xl bg-slate-850/80 border border-slate-800">
                  <div className="space-y-1">
                    <div className="flex justify-between text-[10px] font-mono text-slate-400">
                      <span>/ (Root nvme0n1p1)</span>
                      <span className="text-slate-300 tabular-nums">{telemetry.diskPercent}% used</span>
                    </div>
                    <JXLinearProgress value={telemetry.diskPercent} className="h-1.5" />
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between text-[10px] font-mono text-slate-400">
                      <span>/data (Cache nvme1n1)</span>
                      <span className="text-slate-300 tabular-nums">54% used</span>
                    </div>
                    <JXLinearProgress value={54} className="h-1.5" />
                  </div>
                </div>
              </div>
            </JXCardContent>
          </JXCard>
        </JXGridItem>

        {/* Gauge 4: Network Throughput */}
        <JXGridItem colSpan={3}>
          <JXCard spotlight hoverLift className="bg-slate-900/60 border-slate-800 h-full">
            <JXCardHeader
              title="Network Throughput"
              subheader="Bidirectional eth0 / WireGuard"
              icon={<Activity className="w-4 h-4 text-cyan-400" />}
            />
            <JXCardContent>
              <div className="space-y-3">
                <div className="flex items-baseline justify-between font-mono">
                  <div>
                    <span className="text-[11px] text-emerald-400 block font-semibold">RX Rate</span>
                    <span className="text-2xl font-bold text-slate-100 tabular-nums">
                      {telemetry.networkRxMbps} MB/s
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-[11px] text-cyan-400 block font-semibold">TX Rate</span>
                    <span className="text-2xl font-bold text-slate-100 tabular-nums">
                      {telemetry.networkTxMbps} MB/s
                    </span>
                  </div>
                </div>

                {/* Sockets Micro-Telemetry */}
                <div className="space-y-1 p-2 rounded-xl bg-slate-850/80 border border-slate-800 text-[10px] font-mono">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">PUBLIC IP:</span>
                    <span className="text-slate-200">34.201.88.19</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">PRIVATE IP:</span>
                    <span className="text-slate-200">{telemetry.ipAddress}</span>
                  </div>
                </div>
              </div>
            </JXCardContent>
          </JXCard>
        </JXGridItem>
      </JXGrid>

      {/* Main 4 JXTabs Panels & Security Fingerprint Layout */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Left Side: 4 JXTabs Panels (ColSpan 8) */}
        <div className="xl:col-span-8 space-y-4">
          <JXCard className="bg-slate-900/60 border-slate-800 overflow-hidden">
            <JXCardContent>
              <div className="space-y-4">
                {/* 4 JXTabs Switcher */}
                <JXTabs
                  value={activeTab}
                  onChange={(val) => setActiveTab(val)}
                  tabs={[
                    {
                      id: "processes",
                      label: `Running Processes (${processes.length})`,
                      icon: <Cpu className="w-3.5 h-3.5 text-indigo-400" />,
                    },
                    {
                      id: "applications",
                      label: `Installed Applications (${installedApps.length})`,
                      icon: <HardDrive className="w-3.5 h-3.5 text-emerald-400" />,
                    },
                    {
                      id: "sockets",
                      label: `Network Sockets & Ports (${listeningSockets.length})`,
                      icon: <Network className="w-3.5 h-3.5 text-cyan-400" />,
                    },
                    {
                      id: "daemons",
                      label: `System Daemons (${daemons.length})`,
                      icon: <Settings className="w-3.5 h-3.5 text-amber-400" />,
                    },
                  ]}
                />

                {/* Tab 1: Running Processes */}
                {activeTab === "processes" && (
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-3 p-2.5 rounded-xl bg-slate-850/80 border border-slate-800">
                      <div className="flex items-center gap-2 flex-1 min-w-[240px]">
                        <JXTextField
                          value={processSearch}
                          onChange={(val) => setProcessSearch(val)}
                          placeholder="Filter by PID, executable name, or user context..."
                          startIcon={<Search className="w-3.5 h-3.5 text-slate-400" />}
                          size="sm"
                          clearable
                        />
                      </div>

                      <div className="flex items-center gap-2 text-xs font-mono">
                        <span className="text-slate-400">Sort:</span>
                        <button
                          type="button"
                          onClick={() => setProcessSortBy("cpu")}
                          className={`px-2 py-1 rounded-lg ${
                            processSortBy === "cpu" ? "bg-indigo-600 text-white" : "bg-slate-800 text-slate-400"
                          }`}
                        >
                          CPU%
                        </button>
                        <button
                          type="button"
                          onClick={() => setProcessSortBy("mem")}
                          className={`px-2 py-1 rounded-lg ${
                            processSortBy === "mem" ? "bg-indigo-600 text-white" : "bg-slate-800 text-slate-400"
                          }`}
                        >
                          RAM
                        </button>
                        <button
                          type="button"
                          onClick={() => setProcessSortBy("pid")}
                          className={`px-2 py-1 rounded-lg ${
                            processSortBy === "pid" ? "bg-indigo-600 text-white" : "bg-slate-800 text-slate-400"
                          }`}
                        >
                          PID
                        </button>
                      </div>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse text-xs font-mono">
                        <thead>
                          <tr className="border-b border-slate-800 text-slate-400 uppercase tracking-wider">
                            <th className="py-2.5 px-3">PID</th>
                            <th className="py-2.5 px-3">Process Name</th>
                            <th className="py-2.5 px-3">User</th>
                            <th className="py-2.5 px-3">CPU %</th>
                            <th className="py-2.5 px-3">Memory RSS</th>
                            <th className="py-2.5 px-3">State</th>
                            <th className="py-2.5 px-3 text-right">Directives</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60">
                          {filteredProcesses.map((proc) => (
                            <tr key={proc.pid} className="hover:bg-slate-850/60 transition-colors">
                              <td className="py-2.5 px-3 font-bold text-indigo-300 tabular-nums">
                                {proc.pid}
                              </td>
                              <td className="py-2.5 px-3 font-semibold text-slate-200">
                                {proc.name}
                                {proc.isProtected && (
                                  <span className="ml-2 text-[9px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 font-normal">
                                    Protected
                                  </span>
                                )}
                              </td>
                              <td className="py-2.5 px-3 text-slate-400">{proc.user}</td>
                              <td className="py-2.5 px-3 tabular-nums">
                                <span className={proc.cpuPercent > 10 ? "text-amber-400 font-bold" : "text-slate-300"}>
                                  {proc.cpuPercent.toFixed(1)}%
                                </span>
                              </td>
                              <td className="py-2.5 px-3 tabular-nums text-slate-300">
                                {proc.memoryMb} MB
                              </td>
                              <td className="py-2.5 px-3">
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">
                                  {proc.state}
                                </span>
                              </td>
                              <td className="py-2.5 px-3 text-right">
                                <JXButton
                                  variant="soft"
                                  color="error"
                                  size="sm"
                                  onClick={() => {
                                    setProcessToKill(proc);
                                    setKillGuardError(null);
                                  }}
                                  startIcon={<Trash2 className="w-3 h-3 text-rose-400" />}
                                  className="text-[11px] bg-rose-500/10 hover:bg-rose-500/20 text-rose-300"
                                >
                                  Kill
                                </JXButton>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Tab 2: Installed Applications */}
                {activeTab === "applications" && (
                  <div className="space-y-3">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse text-xs font-mono">
                        <thead>
                          <tr className="border-b border-slate-800 text-slate-400 uppercase tracking-wider">
                            <th className="py-2.5 px-3">Application Binary</th>
                            <th className="py-2.5 px-3">Version</th>
                            <th className="py-2.5 px-3">Publisher</th>
                            <th className="py-2.5 px-3">Category</th>
                            <th className="py-2.5 px-3">Binary Location</th>
                            <th className="py-2.5 px-3 text-right">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60">
                          {installedApps.map((app) => (
                            <tr key={app.id} className="hover:bg-slate-850/60 transition-colors">
                              <td className="py-2.5 px-3 font-semibold text-slate-200">
                                {app.name}
                              </td>
                              <td className="py-2.5 px-3 text-indigo-300 font-bold">{app.version}</td>
                              <td className="py-2.5 px-3 text-slate-400">{app.publisher}</td>
                              <td className="py-2.5 px-3">
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">
                                  {app.category}
                                </span>
                              </td>
                              <td className="py-2.5 px-3">
                                <code className="text-[10px] px-1.5 py-0.5 rounded bg-slate-850 text-slate-300">
                                  {app.binaryPath}
                                </code>
                              </td>
                              <td className="py-2.5 px-3 text-right">
                                <JXButton
                                  variant="soft"
                                  color="primary"
                                  size="sm"
                                  onClick={() =>
                                    setActionFeedback(`Application "${app.name}" launch signal dispatched.`)
                                  }
                                  startIcon={<Play className="w-3 h-3 text-emerald-400" />}
                                  className="text-[11px] bg-slate-800 hover:bg-slate-700 text-slate-200"
                                >
                                  Launch
                                </JXButton>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Tab 3: Network Sockets & Ports */}
                {activeTab === "sockets" && (
                  <div className="space-y-3">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse text-xs font-mono">
                        <thead>
                          <tr className="border-b border-slate-800 text-slate-400 uppercase tracking-wider">
                            <th className="py-2.5 px-3">Port</th>
                            <th className="py-2.5 px-3">Protocol</th>
                            <th className="py-2.5 px-3">Local Address</th>
                            <th className="py-2.5 px-3">Foreign Address</th>
                            <th className="py-2.5 px-3">State</th>
                            <th className="py-2.5 px-3">Bound Service Description</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60">
                          {listeningSockets.map((s) => (
                            <tr key={s.port} className="hover:bg-slate-850/60 transition-colors">
                              <td className="py-2.5 px-3 font-bold text-cyan-300 tabular-nums">
                                :{s.port}
                              </td>
                              <td className="py-2.5 px-3 text-indigo-300 font-semibold">{s.protocol}</td>
                              <td className="py-2.5 px-3 text-slate-300">{s.localAddress}</td>
                              <td className="py-2.5 px-3 text-slate-400">{s.foreignAddress}</td>
                              <td className="py-2.5 px-3">
                                <span
                                  className={`text-[10px] px-2 py-0.5 rounded font-bold ${
                                    s.state === "LISTEN"
                                      ? "bg-emerald-500/20 text-emerald-300"
                                      : "bg-indigo-500/20 text-indigo-300"
                                  }`}
                                >
                                  {s.state}
                                </span>
                              </td>
                              <td className="py-2.5 px-3 text-slate-300">{s.service}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Tab 4: System Daemons */}
                {activeTab === "daemons" && (
                  <div className="space-y-3">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse text-xs font-mono">
                        <thead>
                          <tr className="border-b border-slate-800 text-slate-400 uppercase tracking-wider">
                            <th className="py-2.5 px-3">Service Daemon</th>
                            <th className="py-2.5 px-3">Description</th>
                            <th className="py-2.5 px-3">Status</th>
                            <th className="py-2.5 px-3">PID</th>
                            <th className="py-2.5 px-3">RAM</th>
                            <th className="py-2.5 px-3">Restarts</th>
                            <th className="py-2.5 px-3 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60">
                          {daemons.map((daemon) => (
                            <tr key={daemon.name} className="hover:bg-slate-850/60 transition-colors">
                              <td className="py-2.5 px-3 font-bold text-slate-100">{daemon.name}</td>
                              <td className="py-2.5 px-3 text-slate-400">{daemon.description}</td>
                              <td className="py-2.5 px-3">
                                <span
                                  className={`text-[10px] px-2 py-0.5 rounded font-semibold ${
                                    daemon.status === "active"
                                      ? "bg-emerald-500/20 text-emerald-300"
                                      : "bg-rose-500/20 text-rose-300"
                                  }`}
                                >
                                  {daemon.status}
                                </span>
                              </td>
                              <td className="py-2.5 px-3 text-slate-300">{daemon.pid || "—"}</td>
                              <td className="py-2.5 px-3 text-slate-300">{daemon.memoryMb} MB</td>
                              <td className="py-2.5 px-3 text-slate-400">{daemon.restarts}</td>
                              <td className="py-2.5 px-3 text-right">
                                <div className="flex items-center justify-end gap-1.5">
                                  {daemon.status === "active" ? (
                                    <JXButton
                                      variant="soft"
                                      color="error"
                                      size="sm"
                                      onClick={() => handleDaemonAction(daemon.name, "stop")}
                                      className="text-[11px]"
                                    >
                                      Stop
                                    </JXButton>
                                  ) : (
                                    <JXButton
                                      variant="soft"
                                      color="primary"
                                      size="sm"
                                      onClick={() => handleDaemonAction(daemon.name, "start")}
                                      className="text-[11px]"
                                    >
                                      Start
                                    </JXButton>
                                  )}
                                  <JXButton
                                    variant="soft"
                                    color="neutral"
                                    size="sm"
                                    onClick={() => handleDaemonAction(daemon.name, "restart")}
                                    className="text-[11px]"
                                  >
                                    Restart
                                  </JXButton>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            </JXCardContent>
          </JXCard>
        </div>

        {/* Right Side: Security Fingerprint Card (ColSpan 4) */}
        <div className="xl:col-span-4 space-y-4">
          <JXCard className="bg-slate-900/60 border-slate-800">
            <JXCardHeader
              title="Security Fingerprint"
              subheader="Zero-Trust mTLS & TPM PCR Attestation"
              icon={<ShieldCheck className="w-4 h-4 text-emerald-400" />}
            />
            <JXCardContent>
              <div className="space-y-3 font-mono text-xs">
                {/* SHA-256 Fingerprint */}
                <div className="space-y-1 p-2.5 rounded-xl bg-slate-850/80 border border-slate-800">
                  <span className="text-[10px] text-slate-400 uppercase tracking-wider block">
                    Host SHA-256 Fingerprint
                  </span>
                  <code className="text-[10px] text-indigo-300 break-all select-all block">
                    {telemetry.fingerprintSha256}
                  </code>
                </div>

                {/* mTLS Cert Expiry */}
                <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-850/80 border border-slate-800">
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider block">
                      mTLS Cert Expiry
                    </span>
                    <span className="text-emerald-400 font-bold">
                      Expires in {telemetry.certExpiryDays} days
                    </span>
                  </div>
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                </div>

                {/* TPM 2.0 PCR Status */}
                <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-850/80 border border-slate-800">
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider block">
                      TPM 2.0 Status
                    </span>
                    <span className="text-slate-200 font-semibold uppercase">
                      {telemetry.tpmStatus} PCR-7 Key-Bound
                    </span>
                  </div>
                  <Lock className="w-4 h-4 text-indigo-400" />
                </div>

                {/* Cipher Suite */}
                <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-850/80 border border-slate-800">
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider block">
                      Cipher Suite
                    </span>
                    <span className="text-indigo-300 font-semibold">TLS_AES_256_GCM</span>
                  </div>
                  <Shield className="w-4 h-4 text-indigo-400" />
                </div>

                {/* Security Enforcement */}
                <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-850/80 border border-slate-800">
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider block">
                      SELinux / AppArmor
                    </span>
                    <span className="text-emerald-400 font-semibold">Enforcing</span>
                  </div>
                  <Check className="w-4 h-4 text-emerald-400" />
                </div>
              </div>
            </JXCardContent>
          </JXCard>
        </div>
      </div>

      {/* Kill Process Confirmation Modal */}
      {processToKill && (
        <GlassModal
          open={Boolean(processToKill)}
          onClose={() => {
            setProcessToKill(null);
            setKillGuardError(null);
          }}
          title={`Confirm Process Termination: PID ${processToKill.pid}`}
        >
          <div className="space-y-4 max-w-md w-full text-xs font-mono">
            {killGuardError ? (
              <JXAlert severity="error" title="Action Prohibited" description={killGuardError} />
            ) : (
              <p className="text-slate-300">
                Are you sure you want to terminate process <strong className="text-indigo-300">{processToKill.name}</strong> (PID {processToKill.pid}) running under user {processToKill.user}? A SIGTERM signal will be sent to the remote node.
              </p>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <JXButton
                variant="soft"
                color="neutral"
                size="sm"
                onClick={() => {
                  setProcessToKill(null);
                  setKillGuardError(null);
                }}
              >
                Cancel
              </JXButton>
              {!killGuardError && (
                <JXButton
                  variant="contained"
                  color="error"
                  size="sm"
                  onClick={handleConfirmKillProcess}
                  className="bg-rose-600 hover:bg-rose-500"
                >
                  Kill Process
                </JXButton>
              )}
            </div>
          </div>
        </GlassModal>
      )}
    </div>
  );
};

export default Device360View;
