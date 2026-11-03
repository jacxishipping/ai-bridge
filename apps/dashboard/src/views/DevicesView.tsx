/**
 * AI Bridge Enterprise Dashboard — DevicesView (Screen 2)
 * Enrolled Devices & Cross-Platform Agent Enroller (SmartDataTable Inventory).
 * Pure @jacxishippingorg/jx-ui-react, motion/react, and lucide-react. ZERO inline styles.
 */

import React, { useState, useMemo, useCallback, useEffect } from "react";
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
  JXAlert,
  GlassModal,
  BreadcrumbTrail,
} from "@jacxishippingorg/jx-ui-react";
import {
  Server,
  Activity,
  Shield,
  Zap,
  Terminal,
  Monitor,
  Laptop,
  Search,
  PlusCircle,
  KeyRound,
  RotateCcw,
  Check,
  Copy,
  ArrowRight,
  Filter,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Play,
  HardDrive,
  Cpu,
} from "lucide-react";
import { useDashboardStore } from "../state/dashboardStore";
import type { EnrolledDevice, PlatformType, DeviceStatus } from "../types/dashboard";

export const DevicesView: React.FC = () => {
  const devices = useDashboardStore((s) => s.devices);
  const selectedDeviceId = useDashboardStore((s) => s.selectedDeviceId);
  const setSelectedDeviceId = useDashboardStore((s) => s.setSelectedDeviceId);
  const setCurrentView = useDashboardStore((s) => s.setCurrentView);
  const dispatchTask = useDashboardStore((s) => s.dispatchTask);

  // Filter toolbar state
  const [statusFilter, setStatusFilter] = useState<"all" | "online" | "offline" | "unresponsive">("all");
  const [platformFilter, setPlatformFilter] = useState<"all" | "windows" | "linux" | "darwin">("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [sortField, setSortField] = useState<"hostname" | "latency" | "heartbeat">("hostname");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");

  // Enrollment Modal state
  const [enrollModalOpen, setEnrollModalOpen] = useState<boolean>(false);
  const [enrollPlatformTab, setEnrollPlatformTab] = useState<string>("linux");
  const [copiedCode, setCopiedCode] = useState<boolean>(false);
  const [enrollArchRole, setEnrollArchRole] = useState<string>("Standard Worker (Linux x86_64 / arm64)");
  const [sandboxDir, setSandboxDir] = useState<string>("/opt/ai-bridge/workspace");
  const [tokenExpiry, setTokenExpiry] = useState<string>("24h");
  const [tokenProvisioned, setTokenProvisioned] = useState<boolean>(false);

  // Quick Dispatch Modal state
  const [dispatchModalDevice, setDispatchModalDevice] = useState<EnrolledDevice | null>(null);
  const [dispatchTool, setDispatchTool] = useState<string>("desktop.capture_screen");
  const [dispatchSuccessMsg, setDispatchSuccessMsg] = useState<string | null>(null);

  // Metrics counters
  const totalCount = devices.length;
  const onlineCount = useMemo(() => devices.filter((d) => d.status === "online").length, [devices]);
  const offlineCount = useMemo(() => devices.filter((d) => d.status === "offline").length, [devices]);
  const unresponsiveCount = useMemo(() => devices.filter((d) => d.status === "unresponsive").length, [devices]);
  const windowsCount = useMemo(() => devices.filter((d) => d.platform === "windows").length, [devices]);
  const linuxCount = useMemo(() => devices.filter((d) => d.platform === "linux").length, [devices]);
  const macCount = useMemo(() => devices.filter((d) => d.platform === "darwin").length, [devices]);

  // Global key listener for ⌘N / Ctrl+N to open enrollment modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "n") {
        e.preventDefault();
        setEnrollModalOpen(true);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Filtered and sorted devices
  const filteredDevices = useMemo(() => {
    let list = [...devices];

    // Status filter
    if (statusFilter !== "all") {
      list = list.filter((d) => d.status === statusFilter);
    }

    // Platform filter
    if (platformFilter !== "all") {
      list = list.filter((d) => d.platform === platformFilter);
    }

    // Search query
    const q = searchQuery.toLowerCase().trim();
    if (q) {
      list = list.filter(
        (d) =>
          d.hostname.toLowerCase().includes(q) ||
          d.id.toLowerCase().includes(q) ||
          d.osRelease.toLowerCase().includes(q) ||
          d.arch.toLowerCase().includes(q) ||
          d.assignedModels.some((m) => m.toLowerCase().includes(q))
      );
    }

    // Sorting
    list.sort((a, b) => {
      let comparison = 0;
      if (sortField === "hostname") {
        comparison = a.hostname.localeCompare(b.hostname);
      } else if (sortField === "latency") {
        comparison = a.latencyMs - b.latencyMs;
      } else if (sortField === "heartbeat") {
        comparison = new Date(b.lastHeartbeat).getTime() - new Date(a.lastHeartbeat).getTime();
      }
      return sortOrder === "asc" ? comparison : -comparison;
    });

    return list;
  }, [devices, statusFilter, platformFilter, searchQuery, sortField, sortOrder]);

  const linuxEnrollCommand =
    "curl -sSL https://bridge.internal.ai/install.sh | bash -s -- --token=brg_enroll_99a8b172f3e84ac91b4 --gateway=gateway.internal.ai:8443 --env=production";
  const windowsEnrollCommand =
    'irm https://bridge.internal.ai/install.ps1 | iex -ArgumentList "-Token brg_enroll_99a8b172f3e84ac91b4 -Gateway gateway.internal.ai:8443 -Env production"';

  const handleCopyEnrollCommand = useCallback(async () => {
    const text = enrollPlatformTab === "linux" ? linuxEnrollCommand : windowsEnrollCommand;
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(text);
      }
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    } catch {
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    }
  }, [enrollPlatformTab, linuxEnrollCommand, windowsEnrollCommand]);

  const handleQuickDispatch = useCallback(
    async (device: EnrolledDevice) => {
      try {
        const newTask = await dispatchTask({
          deviceId: device.id,
          tool: dispatchTool,
          args: { format: "png", quality: 90 },
          riskTier: "tier1_safe",
        });
        setDispatchSuccessMsg(
          `Dispatched ${dispatchTool} to ${device.hostname} (#${newTask.id}).`
        );
        setTimeout(() => {
          setDispatchModalDevice(null);
          setDispatchSuccessMsg(null);
        }, 1200);
      } catch (err: any) {
        setDispatchSuccessMsg(`Dispatch error: ${err?.message || "Failed"}`);
      }
    },
    [dispatchTask, dispatchTool]
  );

  return (
    <div className="w-full space-y-6">
      {/* Top Context & Header Ribbon */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-800/60">
        <div>
          <BreadcrumbTrail crumbs={["AI Bridge", "Operations Domain", "Enrolled Devices"]} />
          <h1 className="text-xl font-bold tracking-tight text-slate-100 mt-1">
            Enrolled Fleet Devices
          </h1>
          <p className="text-xs text-slate-400 font-mono mt-0.5">
            40 connected nodes across distributed infrastructure with cryptographic mTLS attestation.
          </p>
        </div>

        <JXStack direction="row" spacing="sm" className="items-center flex-wrap">
          <JXButton
            variant="contained"
            color="primary"
            size="sm"
            onClick={() => setEnrollModalOpen(true)}
            startIcon={<PlusCircle className="w-3.5 h-3.5" />}
            className="bg-indigo-600 hover:bg-indigo-500 font-semibold"
          >
            <span>Enroll Device</span>
            <kbd className="ml-1.5 px-1 py-0.5 rounded bg-black/30 text-[10px] font-mono">⌘N</kbd>
          </JXButton>

          <JXButton
            variant="outlined"
            color="neutral"
            size="sm"
            onClick={() => {
              setSearchQuery("");
              setStatusFilter("all");
              setPlatformFilter("all");
            }}
            startIcon={<RotateCcw className="w-3.5 h-3.5" />}
          >
            Reset Filters
          </JXButton>
        </JXStack>
      </div>

      {/* Top Metrics Ribbon */}
      <JXGrid columns={12} gap="md">
        <JXGridItem colSpan={3}>
          <JXCard spotlight hoverLift className="bg-slate-900/60 border-slate-800">
            <JXCardHeader
              title="Total Enrolled"
              subheader="Active node registry"
              icon={<Server className="w-4 h-4 text-indigo-400" />}
            />
            <JXCardContent>
              <div className="space-y-1">
                <span className="font-mono text-2xl font-bold text-slate-100 tabular-nums">
                  {totalCount} Nodes
                </span>
                <div className="text-[11px] font-mono text-emerald-400">
                  +12 provisioned this month
                </div>
              </div>
            </JXCardContent>
          </JXCard>
        </JXGridItem>

        <JXGridItem colSpan={3}>
          <JXCard spotlight hoverLift className="bg-slate-900/60 border-slate-800">
            <JXCardHeader
              title="Online & Healthy"
              subheader="95.0% fleet SLA"
              icon={<Activity className="w-4 h-4 text-emerald-400" />}
            />
            <JXCardContent>
              <div className="space-y-1">
                <span className="font-mono text-2xl font-bold text-emerald-400 tabular-nums">
                  {onlineCount} Nodes
                </span>
                <div className="text-[11px] font-mono text-slate-400">
                  Heartbeat latency &lt; 20ms
                </div>
              </div>
            </JXCardContent>
          </JXCard>
        </JXGridItem>

        <JXGridItem colSpan={3}>
          <JXCard spotlight hoverLift className="bg-slate-900/60 border-slate-800">
            <JXCardHeader
              title="Windows Nodes"
              subheader="Datacenter & Workstation"
              icon={<Monitor className="w-4 h-4 text-cyan-400" />}
            />
            <JXCardContent>
              <div className="space-y-1">
                <span className="font-mono text-2xl font-bold text-cyan-400 tabular-nums">
                  {windowsCount} Nodes
                </span>
                <div className="text-[11px] font-mono text-slate-400">
                  Server 2022 / Win 11 Pro
                </div>
              </div>
            </JXCardContent>
          </JXCard>
        </JXGridItem>

        <JXGridItem colSpan={3}>
          <JXCard spotlight hoverLift className="bg-slate-900/60 border-slate-800">
            <JXCardHeader
              title="Linux / macOS"
              subheader="Cloud compute & Apple Silicon"
              icon={<Terminal className="w-4 h-4 text-amber-400" />}
            />
            <JXCardContent>
              <div className="space-y-1">
                <span className="font-mono text-2xl font-bold text-amber-400 tabular-nums">
                  {linuxCount + macCount} Nodes
                </span>
                <div className="text-[11px] font-mono text-slate-400">
                  {linuxCount} Linux • {macCount} macOS
                </div>
              </div>
            </JXCardContent>
          </JXCard>
        </JXGridItem>
      </JXGrid>

      {/* Filter Toolbar: Status Chips, Platform Segmented Controls, Search */}
      <JXCard className="bg-slate-900/60 border-slate-800">
        <JXCardContent>
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              {/* Status Filter Chips */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-mono text-slate-400 uppercase tracking-wider mr-1">
                  Status:
                </span>
                <JXButton
                  variant={statusFilter === "all" ? "contained" : "soft"}
                  color={statusFilter === "all" ? "primary" : "neutral"}
                  size="sm"
                  onClick={() => setStatusFilter("all")}
                  className="text-xs"
                >
                  All ({totalCount})
                </JXButton>
                <JXButton
                  variant={statusFilter === "online" ? "contained" : "soft"}
                  color={statusFilter === "online" ? "success" : "neutral"}
                  size="sm"
                  onClick={() => setStatusFilter("online")}
                  className="text-xs"
                >
                  Online ({onlineCount})
                </JXButton>
                <JXButton
                  variant={statusFilter === "unresponsive" ? "contained" : "soft"}
                  color={statusFilter === "unresponsive" ? "warning" : "neutral"}
                  size="sm"
                  onClick={() => setStatusFilter("unresponsive")}
                  className="text-xs"
                >
                  Unresponsive ({unresponsiveCount})
                </JXButton>
                <JXButton
                  variant={statusFilter === "offline" ? "contained" : "soft"}
                  color={statusFilter === "offline" ? "error" : "neutral"}
                  size="sm"
                  onClick={() => setStatusFilter("offline")}
                  className="text-xs"
                >
                  Offline ({offlineCount})
                </JXButton>
              </div>

              {/* Platform Segmented Buttons */}
              <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-850/80 border border-slate-700/60 flex-wrap">
                <button
                  type="button"
                  onClick={() => setPlatformFilter("all")}
                  className={`px-3 py-1 rounded-lg text-xs font-mono transition-all ${
                    platformFilter === "all"
                      ? "bg-indigo-600 text-white font-semibold"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  All Platforms
                </button>
                <button
                  type="button"
                  onClick={() => setPlatformFilter("windows")}
                  className={`px-3 py-1 rounded-lg text-xs font-mono transition-all ${
                    platformFilter === "windows"
                      ? "bg-indigo-600 text-white font-semibold"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  Windows ({windowsCount})
                </button>
                <button
                  type="button"
                  onClick={() => setPlatformFilter("linux")}
                  className={`px-3 py-1 rounded-lg text-xs font-mono transition-all ${
                    platformFilter === "linux"
                      ? "bg-indigo-600 text-white font-semibold"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  Ubuntu / Debian ({linuxCount})
                </button>
                <button
                  type="button"
                  onClick={() => setPlatformFilter("darwin")}
                  className={`px-3 py-1 rounded-lg text-xs font-mono transition-all ${
                    platformFilter === "darwin"
                      ? "bg-indigo-600 text-white font-semibold"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  macOS Sonoma ({macCount})
                </button>
              </div>
            </div>

            {/* Monospace Search and Sorting Row */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center pt-1 border-t border-slate-800/60">
              <div className="md:col-span-8">
                <JXTextField
                  value={searchQuery}
                  onChange={(val) => setSearchQuery(val)}
                  placeholder="Search by hostname, node UUID, architecture, or model (e.g. srv-us-east, x86_64, Claude)..."
                  startIcon={<Search className="w-4 h-4 text-slate-400" />}
                  size="md"
                  clearable
                />
              </div>

              <div className="md:col-span-4 flex items-center justify-end gap-2 text-xs font-mono">
                <span className="text-slate-400">Sort by:</span>
                <select
                  value={sortField}
                  onChange={(e) => setSortField(e.target.value as any)}
                  className="bg-slate-800 border border-slate-700 text-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-indigo-500"
                >
                  <option value="hostname">Hostname</option>
                  <option value="latency">Latency</option>
                  <option value="heartbeat">Heartbeat</option>
                </select>
                <button
                  type="button"
                  onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")}
                  className="px-2 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
                >
                  {sortOrder === "asc" ? "ASC ↑" : "DESC ↓"}
                </button>
              </div>
            </div>
          </div>
        </JXCardContent>
      </JXCard>

      {/* SmartDataTable: 7 Columns Device Inventory */}
      <JXCard className="bg-slate-900/60 border-slate-800 overflow-hidden">
        <JXCardHeader
          title="Fleet Inventory Table"
          subheader={`Displaying ${filteredDevices.length} of ${devices.length} enrolled compute agents`}
          icon={<Server className="w-4 h-4 text-indigo-400" />}
        />
        <JXCardContent>
          <div className="space-y-2">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs min-w-[1050px]">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-850/60 text-slate-400 font-mono uppercase tracking-wider">
                    <th className="py-3 px-3">Status</th>
                    <th className="py-3 px-3">Device Identity & UUID</th>
                    <th className="py-3 px-3">Operating System</th>
                    <th className="py-3 px-3">Cadence / Latency</th>
                    <th className="py-3 px-3">Workspace Path</th>
                    <th className="py-3 px-3">Assigned Models</th>
                    <th className="py-3 px-3 sticky right-0 bg-slate-850 text-right pr-4">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {filteredDevices.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-slate-400">
                        No enrolled devices match the current query & platform filter.
                      </td>
                    </tr>
                  ) : (
                    filteredDevices.map((device) => {
                      const isOnline = device.status === "online";
                      const isUnresponsive = device.status === "unresponsive";
                      const isSelected = device.id === selectedDeviceId;

                      return (
                        <tr
                          key={device.id}
                          className={`hover:bg-slate-850/70 transition-colors group ${
                            isSelected ? "bg-indigo-950/20" : ""
                          }`}
                        >
                          {/* 1. Status ping dot */}
                          <td className="py-3 px-3 whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              <span className="relative flex h-2.5 w-2.5">
                                {isOnline && (
                                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                                )}
                                <span
                                  className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
                                    isOnline
                                      ? "bg-emerald-400"
                                      : isUnresponsive
                                      ? "bg-amber-400"
                                      : "bg-rose-500"
                                  }`}
                                />
                              </span>
                              <span
                                className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                                  isOnline
                                    ? "bg-emerald-500/10 text-emerald-400"
                                    : isUnresponsive
                                    ? "bg-amber-500/10 text-amber-400"
                                    : "bg-rose-500/10 text-rose-400"
                                }`}
                              >
                                {isOnline ? "Online (mTLS)" : isUnresponsive ? "Unresponsive" : "Offline"}
                              </span>
                            </div>
                          </td>

                          {/* 2. Device Identity & UUID & Arch */}
                          <td className="py-3 px-3">
                            <div className="flex flex-col">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-slate-100 group-hover:text-indigo-300 transition-colors">
                                  {device.id}
                                </span>
                                <span
                                  className={`text-[10px] px-1.5 py-0.2 rounded uppercase ${
                                    device.arch === "aarch64"
                                      ? "bg-indigo-500/20 text-indigo-300"
                                      : "bg-slate-800 text-slate-300"
                                  }`}
                                >
                                  {device.arch}
                                </span>
                              </div>
                              <span className="text-[10px] text-slate-400 truncate max-w-[200px]">
                                {device.hostname}
                              </span>
                            </div>
                          </td>

                          {/* 3. Operating System with platform icon */}
                          <td className="py-3 px-3">
                            <div className="flex items-center gap-2">
                              {device.platform === "windows" ? (
                                <Monitor className="w-4 h-4 text-cyan-400 flex-shrink-0" />
                              ) : device.platform === "darwin" ? (
                                <Laptop className="w-4 h-4 text-purple-400 flex-shrink-0" />
                              ) : (
                                <Terminal className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                              )}
                              <div className="flex flex-col">
                                <span className="text-slate-200 font-medium">{device.osRelease}</span>
                                <span className="text-[10px] text-slate-400 capitalize">
                                  {device.platform} kernel
                                </span>
                              </div>
                            </div>
                          </td>

                          {/* 4. Cadence / Latency */}
                          <td className="py-3 px-3">
                            <div className="flex flex-col">
                              <div className="flex items-center gap-1.5">
                                <span className="text-emerald-400 font-bold tabular-nums">
                                  {device.latencyMs}ms ping
                                </span>
                                <span className="text-slate-400 text-[10px]">
                                  ({device.pollIntervalSec}s poll)
                                </span>
                              </div>
                              <span className="text-[10px] text-slate-400">
                                Heartbeat: {new Date(device.lastHeartbeat).toLocaleTimeString()}
                              </span>
                            </div>
                          </td>

                          {/* 5. Workspace Path */}
                          <td className="py-3 px-3">
                            <code className="text-[11px] px-2 py-0.5 rounded bg-slate-850 text-indigo-200 border border-slate-700/60 select-all truncate block max-w-[220px]">
                              {device.workspacePath}
                            </code>
                          </td>

                          {/* 6. Assigned Models */}
                          <td className="py-3 px-3">
                            <div className="flex items-center gap-1 flex-wrap max-w-[220px]">
                              {device.assignedModels.map((model) => (
                                <span
                                  key={model}
                                  className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-950/60 text-indigo-300 border border-indigo-800/40"
                                >
                                  {model}
                                </span>
                              ))}
                            </div>
                          </td>

                          {/* 7. Sticky Actions (Right) */}
                          <td className="py-3 px-3 sticky right-0 bg-slate-900 group-hover:bg-slate-850/70 transition-colors text-right pr-4">
                            <div className="flex items-center justify-end gap-1.5">
                              <JXButton
                                variant="contained"
                                color="primary"
                                size="sm"
                                onClick={() => {
                                  setSelectedDeviceId(device.id);
                                  setCurrentView("device-360-system");
                                }}
                                endIcon={<ArrowRight className="w-3 h-3" />}
                                className="text-[11px] bg-indigo-600 hover:bg-indigo-500"
                              >
                                Inspect 360
                              </JXButton>

                              <JXButton
                                variant="soft"
                                color="neutral"
                                size="sm"
                                onClick={() => setDispatchModalDevice(device)}
                                startIcon={<Play className="w-3 h-3 text-emerald-400" />}
                                className="text-[11px] bg-slate-800 hover:bg-slate-700 text-slate-200"
                              >
                                Dispatch
                              </JXButton>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </JXCardContent>
      </JXCard>

      {/* Enroll Device Modal */}
      {enrollModalOpen && (
        <GlassModal
          open={enrollModalOpen}
          onClose={() => setEnrollModalOpen(false)}
          title="Enroll New Compute Node"
        >
          <div className="space-y-4 max-w-xl w-full text-xs font-mono">
            <p className="text-slate-400 text-xs">
              Generate cryptographic provisioning tokens and execution one-liners to bootstrap agents into the zero-trust mesh.
            </p>

            {/* Target Architecture & Role selector */}
            <div className="space-y-1">
              <label className="text-slate-300 font-semibold text-xs block">
                Target Architecture & Role
              </label>
              <select
                value={enrollArchRole}
                onChange={(e) => setEnrollArchRole(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 text-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-indigo-500"
              >
                <option value="Standard Worker (Linux x86_64 / arm64)">
                  Standard Worker (Linux x86_64 / arm64)
                </option>
                <option value="Desktop Automation Host (Windows / macOS)">
                  Desktop Automation Host (Windows / macOS)
                </option>
                <option value="Confidential Compute Isolated Enclave (Intel SGX / AMD SEV)">
                  Confidential Compute Isolated Enclave (Intel SGX / AMD SEV)
                </option>
              </select>
            </div>

            {/* Sandbox Path */}
            <div className="space-y-1">
              <label className="text-slate-300 font-semibold text-xs block">
                Sandbox Home Directory
              </label>
              <JXTextField
                value={sandboxDir}
                onChange={(val) => setSandboxDir(val)}
                placeholder="/opt/ai-bridge/workspace"
                size="md"
              />
              <span className="text-[11px] text-slate-500">
                Directory path where remote agent task processes will isolate execution.
              </span>
            </div>

            {/* Expiration choices */}
            <div className="space-y-1">
              <label className="text-slate-300 font-semibold text-xs block">
                Token Expiration Window
              </label>
              <div className="grid grid-cols-3 gap-2">
                {["1h", "24h", "7d"].map((exp) => (
                  <button
                    key={exp}
                    type="button"
                    onClick={() => setTokenExpiry(exp)}
                    className={`py-2 px-3 rounded-xl border text-center transition-all ${
                      tokenExpiry === exp
                        ? "bg-indigo-600/30 border-indigo-500 text-indigo-200 font-bold"
                        : "bg-slate-850 border-slate-700 text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    {exp === "1h" ? "1 Hour" : exp === "24h" ? "24 Hours" : "7 Days"}
                  </button>
                ))}
              </div>
            </div>

            {/* Script Platform Tabs */}
            <div className="space-y-2 pt-2 border-t border-slate-800">
              <div className="flex items-center justify-between">
                <span className="text-slate-300 font-semibold text-xs">
                  Provisioning One-Liner
                </span>
                <div className="flex items-center gap-1.5 p-1 rounded-lg bg-slate-850 border border-slate-700">
                  <button
                    type="button"
                    onClick={() => setEnrollPlatformTab("linux")}
                    className={`px-2.5 py-1 rounded text-[11px] transition-all ${
                      enrollPlatformTab === "linux"
                        ? "bg-indigo-600 text-white font-semibold"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    Linux / macOS
                  </button>
                  <button
                    type="button"
                    onClick={() => setEnrollPlatformTab("windows")}
                    className={`px-2.5 py-1 rounded text-[11px] transition-all ${
                      enrollPlatformTab === "windows"
                        ? "bg-indigo-600 text-white font-semibold"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    Windows PowerShell
                  </button>
                </div>
              </div>

              {/* Command box */}
              <div className="relative p-3.5 rounded-xl bg-slate-950 border border-slate-800">
                <pre className="text-emerald-400 whitespace-pre-wrap break-all text-[11px] pr-20 select-all font-mono">
                  {enrollPlatformTab === "linux" ? linuxEnrollCommand : windowsEnrollCommand}
                </pre>
                <div className="absolute right-3 top-3">
                  <JXButton
                    variant="contained"
                    color="primary"
                    size="sm"
                    onClick={handleCopyEnrollCommand}
                    startIcon={
                      copiedCode ? (
                        <Check className="w-3.5 h-3.5 text-emerald-300" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )
                    }
                    className="bg-indigo-600 hover:bg-indigo-500 text-xs"
                  >
                    {copiedCode ? "Copied!" : "Copy"}
                  </JXButton>
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-between pt-3 border-t border-slate-800">
              <span className="text-[11px] text-slate-500">
                SHA-256 Signature verification enforced
              </span>
              <div className="flex items-center gap-2">
                <JXButton
                  variant="soft"
                  color="neutral"
                  size="sm"
                  onClick={() => setEnrollModalOpen(false)}
                >
                  Cancel
                </JXButton>
                <JXButton
                  variant="contained"
                  color="primary"
                  size="sm"
                  onClick={() => {
                    setTokenProvisioned(true);
                    setTimeout(() => {
                      setTokenProvisioned(false);
                      setEnrollModalOpen(false);
                    }, 800);
                  }}
                  className="bg-indigo-600 hover:bg-indigo-500"
                >
                  {tokenProvisioned ? "Key Provisioned!" : "Generate Node Key"}
                </JXButton>
              </div>
            </div>
          </div>
        </GlassModal>
      )}

      {/* Quick Dispatch Tool Modal */}
      {dispatchModalDevice && (
        <GlassModal
          open={Boolean(dispatchModalDevice)}
          onClose={() => setDispatchModalDevice(null)}
          title={`Dispatch Tool: ${dispatchModalDevice.hostname}`}
        >
          <div className="space-y-4 max-w-md w-full text-xs font-mono">
            <p className="text-slate-400">
              Execute a remote MCP diagnostic or automation tool invocation on node {dispatchModalDevice.id}.
            </p>

            <div className="space-y-1">
              <label className="text-slate-300 font-semibold">Select Tool</label>
              <select
                value={dispatchTool}
                onChange={(e) => setDispatchTool(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 text-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-indigo-500"
              >
                <option value="desktop.capture_screen">desktop.capture_screen (Tier 1 Safe)</option>
                <option value="process.list">process.list (Tier 1 Safe)</option>
                <option value="system_info">system_info (Tier 1 Safe)</option>
                <option value="desktop.list_windows">desktop.list_windows (Tier 1 Safe)</option>
                <option value="shell.exec">shell.exec (Tier 3 Shell)</option>
              </select>
            </div>

            {dispatchSuccessMsg && (
              <JXAlert severity="success" title="Dispatch Status" description={dispatchSuccessMsg} />
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <JXButton
                variant="soft"
                color="neutral"
                size="sm"
                onClick={() => setDispatchModalDevice(null)}
              >
                Cancel
              </JXButton>
              <JXButton
                variant="contained"
                color="primary"
                size="sm"
                onClick={() => handleQuickDispatch(dispatchModalDevice)}
                className="bg-indigo-600 hover:bg-indigo-500"
              >
                Execute Tool
              </JXButton>
            </div>
          </div>
        </GlassModal>
      )}
    </div>
  );
};

export default DevicesView;
