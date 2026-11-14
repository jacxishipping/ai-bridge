/**
 * AI Bridge Enterprise Dashboard — DevicesView (Screen 2)
 * Enrolled Devices & Cross-Platform Agent Enroller (SmartDataTable Inventory).
 * Pure @jacxishippingorg/jx-ui-react, motion/react, and lucide-react. ZERO inline styles.
 */

import React, { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { motion } from "motion/react";
import { useScrollShadow } from "../hooks/useScrollShadow";
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
  FloatingActionButton,
  MagneticButton,
  ProductGlass,
  ProductMetricCard,
  ProductModePill,
  ProductNotice,
  ProductSegmented,
  ProductStatusDot,
  ProductStepProgress,
} from "../ui";
import { PageEmpty } from "../components/PageEmpty";
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
import { api, apiOrigin, token, sessionToken } from "../api";
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
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const scrollShadow = useScrollShadow(tableScrollRef);

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
  const [enrollArchRole, setEnrollArchRole] = useState<string>("Desktop Automation Host (Windows)");
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
  const [dispatchTool, setDispatchTool] = useState<string>("capture_desktop_screenshot");
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

  const controlUrl = apiOrigin.replace(/\/$/, "") || "http://127.0.0.1:8000";
  const hasRealToken = Boolean(enrolledToken);
  const linuxEnrollCommand = hasRealToken
    ? `curl -sSL ${controlUrl}/install.sh | bash -s -- -y --device-token=${enrolledToken} --control-url=${controlUrl}`
    : `# Generate an enrollment token first, then run:\n# curl -sSL ${controlUrl}/install.sh | bash -s -- -y --device-token=<TOKEN> --control-url=${controlUrl}`;
  const windowsEnrollCommand = hasRealToken
    ? `iwr ${controlUrl}/install.ps1 -OutFile install-ai-bridge.ps1; powershell -ExecutionPolicy Bypass -File .\\install-ai-bridge.ps1 -ControlUrl '${controlUrl}' -DeviceToken '${enrolledToken}'`
    : `# Generate an enrollment token first, then:\n# iwr ${controlUrl}/install.ps1 -OutFile install-ai-bridge.ps1; powershell -File .\\install-ai-bridge.ps1 -ControlUrl '${controlUrl}' -DeviceToken <TOKEN>`;

  const handleCopyEnrollCommand = useCallback(async () => {
    if (!hasRealToken) {
      setClipboardError(isLive
        ? "Generate an enrollment token before copying the install command."
        : "Connect to a control plane to issue a real device token.");
      return;
    }
    const text = enrollPlatformTab === "linux" ? linuxEnrollCommand : windowsEnrollCommand;
    setClipboardError("");
    try {
      await navigator.clipboard.writeText(text);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    } catch {
      setClipboardError("Clipboard access was denied. Select and copy the install command manually.");
    }
  }, [enrollPlatformTab, hasRealToken, isLive, linuxEnrollCommand, windowsEnrollCommand]);

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
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-[var(--product-text)] mt-1">
              Devices
            </h1>
            <ProductModePill live={isLive} />
          </div>
        </div>

        <JXStack direction="row" spacing="sm" className="items-center flex-wrap">
          <MagneticButton
            variant="solid"
            tone="primary"
            className="hidden sm:inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm"
            onClick={() => {
              setEnrollError("");
              setEnrollModalOpen(true);
            }}
          >
            <PlusCircle className="w-3.5 h-3.5" aria-hidden="true" />
            Add device
          </MagneticButton>

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

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <ProductMetricCard label="Total" value={totalCount} hint="Enrolled" onClick={() => setStatusFilter("all")} />
        <ProductMetricCard label="Online" value={onlineCount} hint="Heartbeat ok" trend={onlineCount > 0 ? "up" : "flat"} onClick={() => setStatusFilter("online")} />
        <ProductMetricCard label="Unresponsive" value={unresponsiveCount} hint="Needs check" trend={unresponsiveCount > 0 ? "down" : "flat"} onClick={() => setStatusFilter("unresponsive")} />
        <ProductMetricCard label="Offline" value={offlineCount} hint="No heartbeat" onClick={() => setStatusFilter("offline")} />
      </div>

      {deviceActionNotice && (
        <ProductNotice tone={deviceActionNotice.includes("failed") || deviceActionNotice.includes("Failed") ? "error" : "info"}>
          {deviceActionNotice}
        </ProductNotice>
      )}

      {/* Filter Toolbar: Status Chips, Platform Segmented Controls, Search */}
      <ProductGlass className="p-4">
          <div className="space-y-4">
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-mono text-[var(--product-text-tertiary)] uppercase tracking-wider shrink-0">
                  Status
                </span>
                <ProductSegmented
                  ariaLabel="Filter by status"
                  value={statusFilter}
                  onChange={setStatusFilter}
                  options={[
                    { id: "all", label: `All (${totalCount})` },
                    { id: "online", label: `Online (${onlineCount})` },
                    { id: "unresponsive", label: `Unresponsive (${unresponsiveCount})` },
                    { id: "offline", label: `Offline (${offlineCount})` },
                  ]}
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-mono text-[var(--product-text-tertiary)] uppercase tracking-wider shrink-0">
                  Platform
                </span>
                <ProductSegmented
                  ariaLabel="Filter by platform"
                  value={platformFilter}
                  onChange={setPlatformFilter}
                  options={[
                    { id: "all", label: "All" },
                    { id: "windows", label: `Windows (${windowsCount})` },
                    { id: "linux", label: `Linux (${linuxCount})` },
                    { id: "darwin", label: `macOS (${macCount})` },
                  ]}
                />
              </div>
            </div>

            {/* Monospace Search and Sorting Row */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center pt-3 border-t border-[var(--product-line)]">
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

              <div className="md:col-span-4 flex items-center gap-2 text-xs font-mono flex-wrap">
                <span className="text-[var(--product-text-tertiary)] flex-shrink-0">Sort by:</span>
                <select
                  aria-label="Sort devices by"
                  value={sortField}
                  onChange={(e) => setSortField(e.target.value as any)}
                  className="bg-[var(--product-raised)] border border-[var(--product-line)] text-[var(--product-text-secondary)] rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-indigo-500 flex-1 min-w-[100px]"
                >
                  <option value="hostname">Hostname</option>
                  <option value="latency">Latency</option>
                  <option value="heartbeat">Heartbeat</option>
                </select>
                <button
                  type="button"
                  onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")}
                  className="px-2.5 py-1.5 rounded-lg bg-[var(--product-raised)] hover:bg-[var(--product-raised)] text-[var(--product-text-secondary)] border border-[var(--product-line)] flex-shrink-0"
                >
                  {sortOrder === "asc" ? "ASC ↑" : "DESC ↓"}
                </button>
              </div>
            </div>
          </div>
      </ProductGlass>

      {/* SmartDataTable: 7 Columns Device Inventory */}
      <JXCard className="bg-[var(--product-surface)]/60 border-[var(--product-line)] overflow-hidden">
        <JXCardHeader
          title={`Devices (${filteredDevices.length})`}
          icon={<Server className="w-4 h-4 text-indigo-400" />}
        />
        <JXCardContent>
          <div className="space-y-2">
            <div ref={tableScrollRef} tabIndex={0} role="region" aria-label="Device inventory" className="overflow-x-auto scroll-shadow" data-scroll-left={scrollShadow.left} data-scroll-right={scrollShadow.right}>
              <table className="product-table-sticky-first w-full text-left border-collapse text-sm min-w-[640px]">
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
                      <td colSpan={5} className="p-4">
                        <PageEmpty
                          title="No matching devices"
                          description="Try clearing filters, or enroll a new edge agent."
                          actionLabel="Add device"
                          onAction={() => {
                            setEnrollError("");
                            setEnrollModalOpen(true);
                          }}
                          secondaryLabel="Reset filters"
                          onSecondary={() => {
                            setSearchQuery("");
                            setStatusFilter("all");
                            setPlatformFilter("all");
                          }}
                        />
                      </td>
                    </tr>
                  ) : (
                    filteredDevices.map((device) => {
                      const isOnline = device.status === "online";
                      const isUnresponsive = device.status === "unresponsive";
                      const isSelected = device.id === selectedDeviceId;
                      const statusTone = isOnline ? "online" : isUnresponsive ? "warn" : "offline";

                      return (
                        <tr
                          key={device.id}
                          className={`hover:bg-[var(--product-raised)]/70 transition-colors group ${
                            isSelected ? "bg-indigo-950/20" : ""
                          }`}
                        >
                          {/* 1. Status ping dot */}
                          <td className="py-3 px-3 whitespace-nowrap">
                            <ProductStatusDot
                              status={statusTone}
                              pulse={isOnline}
                              label={isOnline ? "Online" : isUnresponsive ? "Unresponsive" : "Offline"}
                            />
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
                            <div className="flex items-center justify-end gap-1.5 sm:gap-2">
                              <JXButton
                                variant="text"
                                color="neutral"
                                size="sm"
                                onClick={() => {
                                  setSelectedDeviceId(device.id);
                                  setCurrentView("device-360-system");
                                }}
                                endIcon={<ArrowRight className="w-3 h-3 sm:w-4 sm:h-4" />}
                                className="text-xs sm:text-sm hidden sm:inline-flex"
                              >
                                Details
                              </JXButton>
                              <JXButton
                                variant="text"
                                color="neutral"
                                size="sm"
                                onClick={() => {
                                  setSelectedDeviceId(device.id);
                                  setCurrentView("device-360-system");
                                }}
                                aria-label="Details"
                                className="sm:hidden p-2"
                              >
                                <ArrowRight className="w-4 h-4" />
                              </JXButton>

                              <JXButton
                                variant="soft"
                                color="neutral"
                                size="sm"
                                onClick={() => setDispatchModalDevice(device)}
                                startIcon={<Play className="w-3 h-3 sm:w-4 sm:h-4 text-emerald-400" />}
                                className="text-[11px] sm:text-xs bg-[var(--product-raised)] hover:bg-[var(--product-raised)] text-[var(--product-text-secondary)] hidden sm:inline-flex"
                              >
                                Run task
                              </JXButton>
                              <JXButton
                                variant="soft"
                                color="neutral"
                                size="sm"
                                onClick={() => setDispatchModalDevice(device)}
                                aria-label="Run task"
                                className="sm:hidden p-2 bg-[var(--product-raised)] hover:bg-[var(--product-raised)]"
                              >
                                <Play className="w-4 h-4 text-emerald-400" />
                              </JXButton>

                              <JXButton
                                variant="soft"
                                color="warning"
                                size="sm"
                                onClick={() => handleRevokeDevice(device)}
                                startIcon={<Ban className="w-3 h-3 sm:w-4 sm:h-4" />}
                                className="text-[11px] sm:text-xs hidden sm:inline-flex"
                              >
                                Revoke
                              </JXButton>
                              <JXButton
                                variant="soft"
                                color="warning"
                                size="sm"
                                onClick={() => handleRevokeDevice(device)}
                                aria-label="Revoke"
                                className="sm:hidden p-2"
                              >
                                <Ban className="w-4 h-4" />
                              </JXButton>

                              <JXButton
                                variant="soft"
                                color="error"
                                size="sm"
                                onClick={() => handleDeleteDevice(device)}
                                startIcon={<Trash2 className="w-3 h-3 sm:w-4 sm:h-4" />}
                                className="text-[11px] sm:text-xs hidden sm:inline-flex"
                              >
                                Delete
                              </JXButton>
                              <JXButton
                                variant="soft"
                                color="error"
                                size="sm"
                                onClick={() => handleDeleteDevice(device)}
                                aria-label="Delete"
                                className="sm:hidden p-2"
                              >
                                <Trash2 className="w-4 h-4" />
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

      <div className="fixed bottom-5 right-4 z-30 sm:hidden">
        <FloatingActionButton
          label="Add"
          aria-label="Add device"
          onClick={() => {
            setEnrollError("");
            setEnrollModalOpen(true);
          }}
        />
      </div>

      {/* Enroll Device Modal */}
      {enrollModalOpen && (
        <GlassModal
          open={enrollModalOpen}
          onClose={() => setEnrollModalOpen(false)}
          title={isLive ? "Enroll new device" : "Preview device enrollment"}
        >
          <div className="space-y-4 max-w-xl w-full text-xs font-mono">
            <ProductStepProgress
              steps={["Name", "Token", "Install", "Heartbeat"]}
              current={hasRealToken ? 2 : 0}
            />
            <p className="text-[var(--product-text-tertiary)] text-xs">
              {isLive
                ? `Installers are served from the control plane (${controlUrl}/install.sh). After install, open Live home and wait for the first heartbeat.`
                : "Demo preview only — no real device token is issued. Connect a control plane to enroll."}
            </p>
            {hasRealToken && (
              <ProductNotice tone="success">
                Token ready. Copy the install command, run it on the host, then watch Live home for the first heartbeat.
              </ProductNotice>
            )}
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

            {/* Target Architecture & Role — UI hint only; enroll API does not consume this field */}
            <div className="space-y-1">
              <label className="text-[var(--product-text-secondary)] font-semibold text-xs block">
                Target Architecture & Role{" "}
                <span className="font-normal text-[var(--product-text-tertiary)]">(display only — not sent to enroll)</span>
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
                <option value="Desktop Automation Host (Windows)">
                  Desktop Automation Host (Windows only — WebRTC stream / SoM)
                </option>
                <option value="Confidential Compute Isolated Enclave (Intel SGX / AMD SEV) — not wired">
                  Confidential Compute (SGX / SEV) — decorative, not wired
                </option>
              </select>
            </div>

            {/* Sandbox Path — decorative; enroll API does not accept sandbox_dir */}
            <div className="space-y-1">
              <label className="text-[var(--product-text-secondary)] font-semibold text-xs block">
                Sandbox Home Directory{" "}
                <span className="font-normal text-[var(--product-text-tertiary)]">(not wired to enroll API)</span>
              </label>
              <JXTextField
                value={sandboxDir}
                onChange={(val) => setSandboxDir(val)}
                placeholder="/opt/ai-bridge/workspace"
                size="md"
              />
              <span className="text-[11px] text-[var(--product-text-tertiary)]">
                Preview-only path label. Enrollment issues a device token only; agent workspace is configured on the host install script / policy, not by this field.
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
                  disabled={!hasRealToken}
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
                  {copiedCode ? "Copied!" : hasRealToken ? "Copy" : "Token first"}
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
                <option value="capture_desktop_screenshot">capture_desktop_screenshot (read / capture)</option>
                <option value="list_processes">list_processes (read)</option>
                <option value="get_system_info">get_system_info (read)</option>
                <option value="list_desktop_windows">list_desktop_windows (desktop)</option>
                <option value="get_desktop_status">get_desktop_status (desktop honesty)</option>
                <option value="run_shell">run_shell (shell — requires approval / tier)</option>
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
