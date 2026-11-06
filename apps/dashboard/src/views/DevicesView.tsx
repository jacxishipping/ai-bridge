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
} from "../ui";
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
  RefreshCw,
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
  Ban,
  Trash2,
} from "lucide-react";
import { api, token, sessionToken } from "../api";
import { useDashboardStore } from "../state/dashboardStore";
import type { EnrolledDevice, PlatformType, DeviceStatus } from "../types/dashboard";

export const DevicesView: React.FC = () => {
  const devices = useDashboardStore((s) => s.devices);
  const selectedDeviceId = useDashboardStore((s) => s.selectedDeviceId);
  const setSelectedDeviceId = useDashboardStore((s) => s.setSelectedDeviceId);
  const setCurrentView = useDashboardStore((s) => s.setCurrentView);
  const dispatchTask = useDashboardStore((s) => s.dispatchTask);
  const refreshLive = useDashboardStore((s) => s.refreshLive);
  const isLive = typeof window !== "undefined" && Boolean(token() || sessionToken());

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
  const [clipboardError, setClipboardError] = useState("");
  const [enrollDeviceName, setEnrollDeviceName] = useState<string>("edge-worker-node");
  const [enrollArchRole, setEnrollArchRole] = useState<string>("Standard Worker (Linux x86_64 / arm64)");
  const [sandboxDir, setSandboxDir] = useState<string>("/opt/ai-bridge/workspace");
  const [tokenExpiry, setTokenExpiry] = useState<string>("24h");
  const [tokenProvisioned, setTokenProvisioned] = useState<boolean>(false);
  const [enrolledToken, setEnrolledToken] = useState<string>("");
  const [enrolledDeviceId, setEnrolledDeviceId] = useState<string>("");
  const [enrollError, setEnrollError] = useState<string>("");
  const [isEnrolling, setIsEnrolling] = useState<boolean>(false);
  const [deviceActionNotice, setDeviceActionNotice] = useState<string | null>(null);

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

  const originUrl =
    typeof window !== "undefined" && window.location?.origin
      ? window.location.origin
      : "http://127.0.0.1:8000";
  const activeEnrollToken = enrolledToken || "brg_enroll_99a8b172f3e84ac91b4";
  const linuxEnrollCommand = `curl -sSL ${originUrl}/install.sh | bash -s -- --token=${activeEnrollToken} --gateway=${originUrl} --env=production`;
  const windowsEnrollCommand = `irm ${originUrl}/install.ps1 | iex -ArgumentList "-Token ${activeEnrollToken} -Gateway ${originUrl} -Env production"`;

  const handleCopyEnrollCommand = useCallback(async () => {
    const text = enrollPlatformTab === "linux" ? linuxEnrollCommand : windowsEnrollCommand;
    setClipboardError("");
    try {
      await navigator.clipboard.writeText(text);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    } catch {
      setClipboardError("Clipboard access was denied. Select and copy the sample command manually.");
    }
  }, [enrollPlatformTab, linuxEnrollCommand, windowsEnrollCommand]);

  const handleEnrollDevice = useCallback(async () => {
    setEnrollError("");
    if (Boolean(token() || sessionToken())) {
      setIsEnrolling(true);
      try {
        const res = await api.enroll(enrollDeviceName.trim() || "edge-worker-node");
        setEnrolledToken(res?.device_token || "");
        setEnrolledDeviceId(res?.device_id || "");
        setTokenProvisioned(true);
        await refreshLive?.();
      } catch (err: any) {
        setEnrollError(err?.message || "Failed to enroll device.");
      } finally {
        setIsEnrolling(false);
      }
      return;
    }
    setTokenProvisioned(true);
    setTimeout(() => {
      setTokenProvisioned(false);
      setEnrollModalOpen(false);
    }, 800);
  }, [enrollDeviceName, refreshLive]);

  const handleRevokeDevice = useCallback(
    async (device: EnrolledDevice) => {
      if (Boolean(token() || sessionToken())) {
        try {
          await api.revoke(device.id);
          await refreshLive?.();
          setDeviceActionNotice(`Revoked credentials for ${device.hostname}.`);
          setTimeout(() => setDeviceActionNotice(null), 3000);
        } catch (err: any) {
          setDeviceActionNotice(`Revoke failed: ${err?.message || "Unknown error"}`);
        }
        return;
      }
      setDeviceActionNotice(`Simulated revocation for ${device.hostname}.`);
      setTimeout(() => setDeviceActionNotice(null), 3000);
    },
    [refreshLive]
  );

  const handleDeleteDevice = useCallback(
    async (device: EnrolledDevice) => {
      if (Boolean(token() || sessionToken())) {
        try {
          await api.deleteDevice(device.id);
          await refreshLive?.();
          setDeviceActionNotice(`Deleted device ${device.hostname}.`);
          setTimeout(() => setDeviceActionNotice(null), 3000);
        } catch (err: any) {
          setDeviceActionNotice(`Delete failed: ${err?.message || "Unknown error"}`);
        }
        return;
      }
      setDeviceActionNotice(`Simulated deletion for ${device.hostname}.`);
      setTimeout(() => setDeviceActionNotice(null), 3000);
    },
    [refreshLive]
  );

  const handleQuickDispatch = useCallback(
    async (device: EnrolledDevice) => {
      try {
        const newTask = await dispatchTask({
          deviceId: device.id,
          tool: dispatchTool,
          args: { format: "png", quality: 90 },
          riskTier: "tier1_safe",
        });
        const taskId = newTask?.id || (newTask as any)?.task_id || "queued";
        setDispatchSuccessMsg(
          `Dispatched ${dispatchTool} to ${device.hostname} (#${taskId}).`
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
    <div className="w-full space-y-4">
      {/* Top Context & Header Ribbon */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-[var(--product-line)]">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-[var(--product-text)] mt-1">
            Devices
          </h1>
        </div>

        <JXStack direction="row" spacing="sm" className="items-center flex-wrap">
          <JXButton
            variant="contained"
            color="primary"
            size="sm"
            onClick={() => {
              setEnrollError("");
              setEnrollModalOpen(true);
            }}
            startIcon={<PlusCircle className="w-3.5 h-3.5" />}
            className="bg-indigo-600 hover:bg-indigo-500 font-semibold"
          >
            <span>Add device</span>
          </JXButton>

          <JXButton
            variant="outlined"
            color="neutral"
            size="sm"
            onClick={() => {
              void refreshLive?.();
            }}
            startIcon={<RefreshCw className="w-3.5 h-3.5" />}
          >
            Refresh
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

      {deviceActionNotice && (
        <div className="p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/30 text-xs font-mono text-indigo-300">
          {deviceActionNotice}
        </div>
      )}

      {/* Filter Toolbar: Status Chips, Platform Segmented Controls, Search */}
      <JXCard className="bg-[var(--product-surface)]/60 border-[var(--product-line)]">
        <JXCardContent>
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              {/* Status Filter Chips */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-mono text-[var(--product-text-tertiary)] uppercase tracking-wider mr-1">
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
              <div className="flex items-center gap-1.5 p-1 rounded-xl bg-[var(--product-raised)]/80 border border-[var(--product-line)] flex-wrap">
                <button
                  type="button"
                  onClick={() => setPlatformFilter("all")}
                  className={`px-3 py-1 rounded-lg text-xs font-mono transition-all ${
                    platformFilter === "all"
                      ? "bg-indigo-600 text-white font-semibold"
                      : "text-[var(--product-text-tertiary)] hover:text-[var(--product-text-secondary)]"
                  }`}
                >
                  All
                </button>
                <button
                  type="button"
                  onClick={() => setPlatformFilter("windows")}
                  className={`px-3 py-1 rounded-lg text-xs font-mono transition-all ${
                    platformFilter === "windows"
                      ? "bg-indigo-600 text-white font-semibold"
                      : "text-[var(--product-text-tertiary)] hover:text-[var(--product-text-secondary)]"
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
                      : "text-[var(--product-text-tertiary)] hover:text-[var(--product-text-secondary)]"
                  }`}
                >
                  Linux ({linuxCount})
                </button>
                <button
                  type="button"
                  onClick={() => setPlatformFilter("darwin")}
                  className={`px-3 py-1 rounded-lg text-xs font-mono transition-all ${
                    platformFilter === "darwin"
                      ? "bg-indigo-600 text-white font-semibold"
                      : "text-[var(--product-text-tertiary)] hover:text-[var(--product-text-secondary)]"
                  }`}
                >
                  macOS ({macCount})
                </button>
              </div>
            </div>

            {/* Monospace Search and Sorting Row */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center pt-1 border-t border-[var(--product-line)]">
              <div className="md:col-span-8">
                <JXTextField
                  value={searchQuery}
                  onChange={(val) => setSearchQuery(val)}
                  placeholder="Search devices…"
                  startIcon={<Search className="w-4 h-4 text-[var(--product-text-tertiary)]" />}
                  size="md"
                  clearable
                />
              </div>

              <div className="md:col-span-4 flex items-center justify-end gap-2 text-xs font-mono">
                <span className="text-[var(--product-text-tertiary)]">Sort by:</span>
                <select
                  aria-label="Sort devices by"
                  value={sortField}
                  onChange={(e) => setSortField(e.target.value as any)}
                  className="bg-[var(--product-raised)] border border-[var(--product-line)] text-[var(--product-text-secondary)] rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-indigo-500"
                >
                  <option value="hostname">Hostname</option>
                  <option value="latency">Latency</option>
                  <option value="heartbeat">Heartbeat</option>
                </select>
                <button
                  type="button"
                  onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")}
                  className="px-2 py-1.5 rounded-lg bg-[var(--product-raised)] hover:bg-[var(--product-raised)] text-[var(--product-text-secondary)] border border-[var(--product-line)]"
                >
                  {sortOrder === "asc" ? "ASC ↑" : "DESC ↓"}
                </button>
              </div>
            </div>
          </div>
        </JXCardContent>
      </JXCard>

      {/* SmartDataTable: 7 Columns Device Inventory */}
      <JXCard className="bg-[var(--product-surface)]/60 border-[var(--product-line)] overflow-hidden">
        <JXCardHeader
          title={`Devices (${filteredDevices.length})`}
          icon={<Server className="w-4 h-4 text-indigo-400" />}
        />
        <JXCardContent>
          <div className="space-y-2">
            <div tabIndex={0} role="region" aria-label="Device inventory" className="overflow-x-auto scroll-shadow">
              <table className="w-full text-left border-collapse text-sm min-w-[640px]">
                <thead>
                  <tr className="border-b border-[var(--product-line)] text-xs text-[var(--product-text-tertiary)]">
                    <th className="py-3 px-3">Status</th>
                    <th className="py-3 px-3">Device</th>
                    <th className="py-3 px-3">OS</th>
                    <th className="py-3 px-3">Last seen</th>
                    <th className="py-3 px-3 sticky right-0 bg-[var(--product-raised)] text-right pr-4">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {filteredDevices.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-[var(--product-text-tertiary)]">
                        No matching devices.
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
                          className={`hover:bg-[var(--product-raised)]/70 transition-colors group ${
                            isSelected ? "bg-indigo-950/20" : ""
                          }`}
                        >
                          {/* 1. Status ping dot */}
                          <td className="py-3 px-3 whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              <span className="relative flex h-2.5 w-2.5">
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
                                {isOnline ? "Online" : isUnresponsive ? "Unresponsive" : "Offline"}
                              </span>
                            </div>
                          </td>

                          {/* 2. Device Identity & UUID & Arch */}
                          <td className="py-3 px-3">
                            <div className="flex flex-col">
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-[var(--product-text)]">
                                  {device.hostname}
                                </span>
                              </div>
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
                                <span className="text-[var(--product-text-secondary)] font-medium">{device.osRelease}</span>
                              </div>
                            </div>
                          </td>

                          {/* 4. Cadence / Latency */}
                          <td className="py-3 px-3">
                            <span className="text-xs tabular-nums text-[var(--product-text-tertiary)]">{new Date(device.lastHeartbeat).toLocaleTimeString()}</span>
                          </td>

                          {/* 7. Sticky Actions (Right) */}
                          <td className="py-3 px-3 sticky right-0 bg-[var(--product-surface)] group-hover:bg-[var(--product-raised)]/70 transition-colors text-right pr-4">
                            <div className="flex items-center justify-end gap-1.5">
                              <JXButton
                                variant="text"
                                color="neutral"
                                size="sm"
                                onClick={() => {
                                  setSelectedDeviceId(device.id);
                                  setCurrentView("device-360-system");
                                }}
                                endIcon={<ArrowRight className="w-3 h-3" />}
                                className="text-xs"
                              >
                                Details
                              </JXButton>

                              <JXButton
                                variant="soft"
                                color="neutral"
                                size="sm"
                                onClick={() => setDispatchModalDevice(device)}
                                startIcon={<Play className="w-3 h-3 text-emerald-400" />}
                                className="text-[11px] bg-[var(--product-raised)] hover:bg-[var(--product-raised)] text-[var(--product-text-secondary)]"
                              >
                                Run task
                              </JXButton>

                              <JXButton
                                variant="soft"
                                color="warning"
                                size="sm"
                                onClick={() => handleRevokeDevice(device)}
                                startIcon={<Ban className="w-3 h-3" />}
                                className="text-[11px]"
                              >
                                Revoke
                              </JXButton>

                              <JXButton
                                variant="soft"
                                color="error"
                                size="sm"
                                onClick={() => handleDeleteDevice(device)}
                                startIcon={<Trash2 className="w-3 h-3" />}
                                className="text-[11px]"
                              >
                                Delete
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
          title={isLive ? "Enroll new device" : "Preview device enrollment"}
        >
          <div className="space-y-4 max-w-xl w-full text-xs font-mono">
            <p className="text-[var(--product-text-tertiary)] text-xs">
              {isLive
                ? "Generate a live enrollment token from the control plane and run the provisioning command on the target host."
                : "This is an enrollment preview. The token and commands are examples, not valid credentials. Do not run these sample commands."}
            </p>
            {clipboardError && <p role="alert" className="text-rose-300">{clipboardError}</p>}
            {enrollError && <p role="alert" className="text-rose-300">{enrollError}</p>}

            {/* Device Name */}
            <div className="space-y-1">
              <label className="text-[var(--product-text-secondary)] font-semibold text-xs block">
                Device Name
              </label>
              <JXTextField
                value={enrollDeviceName}
                onChange={(val) => setEnrollDeviceName(val)}
                placeholder="edge-worker-node"
                size="md"
              />
            </div>

            {enrolledToken && (
              <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 space-y-1">
                <div className="text-emerald-300 font-semibold">
                  Enrolled Device ID: {enrolledDeviceId}
                </div>
                <div className="text-[var(--product-text-secondary)] break-all">
                  Device Token: <span className="text-emerald-400">{enrolledToken}</span>
                </div>
              </div>
            )}

            {/* Target Architecture & Role selector */}
            <div className="space-y-1">
              <label className="text-[var(--product-text-secondary)] font-semibold text-xs block">
                Target Architecture & Role
              </label>
              <select
                aria-label="Target architecture and role"
                value={enrollArchRole}
                onChange={(e) => setEnrollArchRole(e.target.value)}
                className="w-full bg-[var(--product-raised)] border border-[var(--product-line)] text-[var(--product-text-secondary)] rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-indigo-500"
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
              <label className="text-[var(--product-text-secondary)] font-semibold text-xs block">
                Sandbox Home Directory
              </label>
              <JXTextField
                value={sandboxDir}
                onChange={(val) => setSandboxDir(val)}
                placeholder="/opt/ai-bridge/workspace"
                size="md"
              />
              <span className="text-[11px] text-[var(--product-text-tertiary)]">
                Directory path where remote agent task processes will isolate execution.
              </span>
            </div>

            {/* Expiration choices */}
            <div className="space-y-1">
              <label className="text-[var(--product-text-secondary)] font-semibold text-xs block">
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
                        : "bg-[var(--product-raised)] border-[var(--product-line)] text-[var(--product-text-tertiary)] hover:text-[var(--product-text-secondary)]"
                    }`}
                  >
                    {exp === "1h" ? "1 Hour" : exp === "24h" ? "24 Hours" : "7 Days"}
                  </button>
                ))}
              </div>
            </div>

            {/* Script Platform Tabs */}
            <div className="space-y-2 pt-2 border-t border-[var(--product-line)]">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-[var(--product-text-secondary)] font-semibold text-xs">
                  Provisioning One-Liner
                </span>
                <div className="flex items-center gap-1.5 p-1 rounded-lg bg-[var(--product-raised)] border border-[var(--product-line)]">
                  <button
                    type="button"
                    onClick={() => setEnrollPlatformTab("linux")}
                    className={`px-2.5 py-1 rounded text-[11px] transition-all ${
                      enrollPlatformTab === "linux"
                        ? "bg-indigo-600 text-white font-semibold"
                        : "text-[var(--product-text-tertiary)] hover:text-[var(--product-text-secondary)]"
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
                        : "text-[var(--product-text-tertiary)] hover:text-[var(--product-text-secondary)]"
                    }`}
                  >
                    Windows PowerShell
                  </button>
                </div>
              </div>

              {/* Command box */}
              <div className="relative p-3.5 rounded-xl bg-[var(--product-canvas)] border border-[var(--product-line)]">
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
            <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-[var(--product-line)]">
              <span className="text-[11px] text-[var(--product-text-tertiary)]">
                {enrolledToken
                  ? `Token issued for ${enrolledDeviceId}`
                  : isLive
                  ? "Live control plane enrollment"
                  : "Preview only · no key is issued"}
              </span>
              <div className="flex items-center gap-2">
                <JXButton
                  variant="soft"
                  color="neutral"
                  size="sm"
                  onClick={() => setEnrollModalOpen(false)}
                >
                  {enrolledToken ? "Close" : "Cancel"}
                </JXButton>
                <JXButton
                  variant="contained"
                  color="primary"
                  size="sm"
                  loading={isEnrolling}
                  onClick={handleEnrollDevice}
                  className="bg-indigo-600 hover:bg-indigo-500"
                >
                  {isLive
                    ? enrolledToken
                      ? "Issue another token"
                      : "Generate enrollment token"
                    : tokenProvisioned
                    ? "Preview complete"
                    : "Simulate key generation"}
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
            <p className="text-[var(--product-text-tertiary)]">
              Execute a remote MCP diagnostic or automation tool invocation on node {dispatchModalDevice.id}.
            </p>

            <div className="space-y-1">
              <label className="text-[var(--product-text-secondary)] font-semibold">Select Tool</label>
              <select
                aria-label="Select dispatch tool"
                value={dispatchTool}
                onChange={(e) => setDispatchTool(e.target.value)}
                className="w-full bg-[var(--product-raised)] border border-[var(--product-line)] text-[var(--product-text-secondary)] rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-indigo-500"
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

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--product-line)]">
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
