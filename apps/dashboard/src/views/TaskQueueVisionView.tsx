/**
 * AI Bridge Enterprise Dashboard — Task Queue & Vision Inspector (Screen 4)
 * Split-screen Tool Dispatch Studio & Execution Queue with Set-of-Marks (SoM) Vision Inspector.
 * Strict JXUI Primitives & Lucide Icons. ZERO inline styles.
 */

import React, { useState, useMemo, useEffect, useCallback } from "react";
import {
  JXBox,
  JXStack,
  JXGrid,
  JXGridItem,
  JXCard,
  JXCardHeader,
  JXCardContent,
  JXBadge,
  JXButton,
} from "../ui";
import {
  Zap,
  Send,
  Check,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Sliders,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Copy,
  Terminal,
  Monitor,
  FileText,
  Shield,
  Search,
  Code,
  Clock,
  Layers,
  Bot,
  User,
  Download,
  Eye,
  Crosshair,
  Sparkles,
  Trash2,
  Ban,
  Camera,
} from "lucide-react";
import { api, token, sessionToken } from "../api";
import { useDashboardStore } from "../state/dashboardStore";
import type { TaskInvocation, TaskRiskTier, TaskStatus } from "../types/dashboard";

interface SoMMark {
  id: number;
  label: string;
  category: string;
  bounds: [number, number, number, number]; // [x, y, width, height] in percentage
  color: string;
  positionClass: string;
}

const DEFAULT_SOM_MARKS: SoMMark[] = [
  {
    id: 1,
    label: "Terminal Bounding Box (root@srv-us-east-412)",
    category: "Shell / PTY",
    bounds: [4, 8, 54, 46],
    color: "border-cyan-400 bg-cyan-500/10 text-cyan-300",
    positionClass: "left-[4%] top-[8%] w-[54%] h-[46%]",
  },
  {
    id: 2,
    label: "Bridge Gateway Inspector Web UI",
    category: "Browser Canvas",
    bounds: [62, 8, 34, 46],
    color: "border-indigo-400 bg-indigo-500/10 text-indigo-300",
    positionClass: "left-[62%] top-[8%] w-[34%] h-[46%]",
  },
  {
    id: 3,
    label: "Desktop Status Tray & IPC Channel",
    category: "Taskbar Element",
    bounds: [4, 60, 92, 16],
    color: "border-emerald-400 bg-emerald-500/10 text-emerald-300",
    positionClass: "left-[4%] top-[60%] w-[92%] h-[16%]",
  },
  {
    id: 4,
    label: "System Security Dialog [PCR-7 Active]",
    category: "Authentication Gate",
    bounds: [30, 80, 40, 14],
    color: "border-amber-400 bg-amber-500/10 text-amber-300",
    positionClass: "left-[30%] top-[80%] w-[40%] h-[14%]",
  },
];

const PRESETS = [
  {
    name: "Full 4K Screenshot",
    tool: "desktop.capture_screen",
    tier: "tier1_safe" as TaskRiskTier,
    payload: {
      display_index: 0,
      format: "png",
      compress_quality: 85,
      include_som_metadata: true,
    },
  },
  {
    name: "Active Window Only",
    tool: "desktop.capture_screen",
    tier: "tier1_safe" as TaskRiskTier,
    payload: {
      target_window: "active",
      format: "png",
      crop_decorations: false,
    },
  },
  {
    name: "Top 10 Processes",
    tool: "process.list",
    tier: "tier1_safe" as TaskRiskTier,
    payload: {
      sort: "cpu",
      limit: 10,
      include_threads: false,
    },
  },
  {
    name: "System Specs",
    tool: "system.specs",
    tier: "tier1_safe" as TaskRiskTier,
    payload: {
      format: "json",
      include_hardware: true,
      include_network: true,
    },
  },
  {
    name: "Tail Journal",
    tool: "shell.exec",
    tier: "tier3_shell" as TaskRiskTier,
    payload: {
      command: "journalctl -u ai-bridge-agent -f -n 50",
      timeout_seconds: 30,
    },
  },
];

export const TaskQueueVisionView: React.FC = () => {
  const devices = useDashboardStore((s) => s.devices);
  const selectedDeviceId = useDashboardStore((s) => s.selectedDeviceId);
  const tasks = useDashboardStore((s) => s.tasks);
  const dispatchTask = useDashboardStore((s) => s.dispatchTask);
  const refreshLive = useDashboardStore((s) => s.refreshLive);
  const isLive = typeof window !== "undefined" && Boolean(token() || sessionToken());

  // Studio form states
  const [targetHost, setTargetHost] = useState<string>(selectedDeviceId || "srv-us-east-412");
  const [selectedTool, setSelectedTool] = useState<string>("desktop.capture_screen");
  const [activeRiskTier, setActiveRiskTier] = useState<TaskRiskTier>("tier1_safe");
  const [argsJson, setArgsJson] = useState<string>(
    JSON.stringify(PRESETS[0].payload, null, 2)
  );
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [activePreset, setActivePreset] = useState<string>("Full 4K Screenshot");

  // Queue and inspector states
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedTaskId, setSelectedTaskId] = useState<string>(tasks[0]?.id || "TSK-89213");
  const [zoomLevel, setZoomLevel] = useState<number>(1.0); // 1.0 = Fit, 1.5, 2.0
  const [somEnabled, setSomEnabled] = useState<boolean>(true);
  const [selectedMarkId, setSelectedMarkId] = useState<number | null>(null);
  const [copiedPayload, setCopiedPayload] = useState<boolean>(false);
  const [liveCapturedBase64, setLiveCapturedBase64] = useState<string>("");
  const [taskActionNotice, setTaskActionNotice] = useState<string | null>(null);

  // Sync risk tier when tool changes
  useEffect(() => {
    if (selectedTool.startsWith("desktop.capture") || selectedTool.startsWith("system.specs") || selectedTool.startsWith("process.list")) {
      setActiveRiskTier("tier1_safe");
    } else if (selectedTool.startsWith("desktop.click") || selectedTool.startsWith("desktop.type") || selectedTool.startsWith("file.read") || selectedTool.startsWith("file.write")) {
      setActiveRiskTier("tier2_workspace");
    } else if (selectedTool.startsWith("shell.exec") || selectedTool.startsWith("pty.spawn")) {
      setActiveRiskTier("tier3_shell");
    } else {
      setActiveRiskTier("tier4_kernel");
    }
  }, [selectedTool]);

  // Validate JSON on edit
  const handleJsonChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setArgsJson(val);
    try {
      JSON.parse(val);
      setJsonError(null);
    } catch (err: any) {
      setJsonError(err.message || "Invalid JSON syntax");
    }
  };

  const beautifyJson = () => {
    try {
      const parsed = JSON.parse(argsJson);
      setArgsJson(JSON.stringify(parsed, null, 2));
      setJsonError(null);
    } catch (err: any) {
      setJsonError(err.message || "Cannot format malformed JSON");
    }
  };

  const applyPreset = (preset: typeof PRESETS[0]) => {
    setActivePreset(preset.name);
    setSelectedTool(preset.tool);
    setActiveRiskTier(preset.tier);
    setArgsJson(JSON.stringify(preset.payload, null, 2));
    setJsonError(null);
  };

  // Dispatch invocation handler
  const handleDispatch = useCallback(async () => {
    if (isSubmitting) return;

    let parsedArgs: Record<string, unknown> = {};
    try {
      parsedArgs = JSON.parse(argsJson);
    } catch {
      setJsonError("Cannot dispatch: JSON payload is invalid");
      return;
    }

    setIsSubmitting(true);
    try {
      const newTask = await dispatchTask({
        deviceId: targetHost,
        tool: selectedTool,
        args: parsedArgs,
        riskTier: activeRiskTier,
      });
      const createdId = newTask?.id || (newTask as any)?.task_id;
      if (createdId) setSelectedTaskId(createdId);
      await refreshLive?.();
    } catch (err: any) {
      setJsonError(err.message || "Task dispatch rejected");
    } finally {
      setTimeout(() => {
        setIsSubmitting(false);
      }, 600);
    }
  }, [isSubmitting, argsJson, dispatchTask, targetHost, selectedTool, activeRiskTier, refreshLive]);

  const handleCancelTask = useCallback(
    async (taskId: string, e?: React.MouseEvent) => {
      e?.stopPropagation();
      if (Boolean(token() || sessionToken())) {
        try {
          await api.cancelTask(taskId);
          await refreshLive?.();
          setTaskActionNotice(`Cancelled task #${taskId}.`);
          setTimeout(() => setTaskActionNotice(null), 3000);
        } catch (err: any) {
          setTaskActionNotice(`Cancel failed: ${err?.message || "Unknown error"}`);
        }
        return;
      }
      setTaskActionNotice(`Simulated cancellation for #${taskId}.`);
      setTimeout(() => setTaskActionNotice(null), 3000);
    },
    [refreshLive]
  );

  const handleDeleteTask = useCallback(
    async (taskId: string, e?: React.MouseEvent) => {
      e?.stopPropagation();
      if (Boolean(token() || sessionToken())) {
        try {
          await api.deleteTask(taskId);
          await refreshLive?.();
          setTaskActionNotice(`Deleted task #${taskId}.`);
          setTimeout(() => setTaskActionNotice(null), 3000);
        } catch (err: any) {
          setTaskActionNotice(`Delete failed: ${err?.message || "Unknown error"}`);
        }
        return;
      }
      setTaskActionNotice(`Simulated deletion for #${taskId}.`);
      setTimeout(() => setTaskActionNotice(null), 3000);
    },
    [refreshLive]
  );

  const handleClearTasks = useCallback(async () => {
    if (Boolean(token() || sessionToken())) {
      try {
        const res = await api.clearTasks(statusFilter !== "all" ? statusFilter : undefined);
        await refreshLive?.();
        setTaskActionNotice(`Cleared ${res?.deleted_count ?? 0} tasks.`);
        setTimeout(() => setTaskActionNotice(null), 3000);
      } catch (err: any) {
        setTaskActionNotice(`Clear tasks failed: ${err?.message || "Unknown error"}`);
      }
      return;
    }
    setTaskActionNotice("Simulated clearing finished tasks.");
    setTimeout(() => setTaskActionNotice(null), 3000);
  }, [statusFilter, refreshLive]);

  // Filtered task list
  const filteredTasks = useMemo(() => {
    if (statusFilter === "all") return tasks;
    return tasks.filter((t) => t.status === statusFilter);
  }, [tasks, statusFilter]);

  // Active inspected task
  const activeTask = useMemo(() => {
    return tasks.find((t) => t.id === selectedTaskId) || tasks[0];
  }, [tasks, selectedTaskId]);

  const handleCaptureLiveScreenshot = useCallback(async () => {
    if (Boolean(token() || sessionToken())) {
      const devId = activeTask?.deviceId || targetHost;
      try {
        const frame = await api.desktopFrame(devId);
        if (frame?.base64_data) {
          setLiveCapturedBase64(frame.base64_data);
          setTaskActionNotice(`Captured live frame from ${devId}.`);
          setTimeout(() => setTaskActionNotice(null), 3000);
        } else {
          setTaskActionNotice(frame?.error || "No live frame available from device.");
          setTimeout(() => setTaskActionNotice(null), 3000);
        }
      } catch (err: any) {
        setTaskActionNotice(`Screenshot capture failed: ${err?.message || "Unknown error"}`);
      }
    }
  }, [activeTask, targetHost]);

  // Keyboard shortcut listener (⌘/Ctrl + Enter)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        handleDispatch();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleDispatch]);

  const liveScreenshotDataUrl = useMemo(() => {
    const res: any = activeTask?.result;
    let rawB64 =
      res?.screenshotBase64 ||
      res?.base64_data ||
      res?.outputJson?.base64_data ||
      res?.outputJson?.screenshotBase64 ||
      "";
    if (!rawB64 && typeof res?.stdout === "string") {
      try {
        const parsed = JSON.parse(res.stdout);
        rawB64 = parsed?.base64_data || parsed?.screenshotBase64 || parsed?.image_base64 || "";
      } catch {
        // Not JSON stdout
      }
    }
    if (!rawB64 && liveCapturedBase64) {
      rawB64 = liveCapturedBase64;
    }
    if (!rawB64 || typeof rawB64 !== "string") return "";
    return rawB64.startsWith("data:image/") ? rawB64 : `data:image/jpeg;base64,${rawB64}`;
  }, [activeTask, liveCapturedBase64]);

  const copyToClipboard = () => {
    const payload = JSON.stringify(activeTask?.result || { status: "queued", task: activeTask }, null, 2);
    navigator.clipboard?.writeText(payload);
    setCopiedPayload(true);
    setTimeout(() => setCopiedPayload(false), 2000);
  };

  // Zoom handlers
  const handleZoomIn = () => setZoomLevel((prev) => Math.min(2.5, prev + 0.25));
  const handleZoomOut = () => setZoomLevel((prev) => Math.max(0.75, prev - 0.25));
  const handleZoomReset = () => setZoomLevel(1.0);

  const getRiskBadgeColor = (tier: TaskRiskTier) => {
    switch (tier) {
      case "tier1_safe":
        return "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30";
      case "tier2_workspace":
        return "bg-indigo-500/15 text-indigo-300 border border-indigo-500/30";
      case "tier3_shell":
        return "bg-amber-500/15 text-amber-300 border border-amber-500/30";
      case "tier4_kernel":
        return "bg-rose-500/15 text-rose-300 border border-rose-500/30";
    }
  };

  const getStatusBadge = (status: TaskStatus) => {
    switch (status) {
      case "completed":
        return (
          <span className="inline-flex items-center gap-1 font-mono text-[11px] px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
            <CheckCircle2 className="w-3 h-3 text-emerald-400" /> Completed
          </span>
        );
      case "running":
        return (
          <span className="inline-flex items-center gap-1 font-mono text-[11px] px-2 py-0.5 rounded bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
            <RefreshCw className="w-3 h-3 text-cyan-400 animate-spin" /> Running
          </span>
        );
      case "needs_approval":
        return (
          <span className="inline-flex items-center gap-1 font-mono text-[11px] px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">
            <AlertTriangle className="w-3 h-3 text-amber-400" /> Needs Review
          </span>
        );
      case "failed":
        return (
          <span className="inline-flex items-center gap-1 font-mono text-[11px] px-2 py-0.5 rounded bg-rose-500/15 text-rose-300 border border-rose-500/30">
            <XCircle className="w-3 h-3 text-rose-400" /> Failed
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 font-mono text-[11px] px-2 py-0.5 rounded bg-[var(--product-raised)] text-[var(--product-text-secondary)] border border-[var(--product-line)]">
            <Clock className="w-3 h-3 text-[var(--product-text-tertiary)]" /> {status}
          </span>
        );
    }
  };

  return (
    <div className="space-y-4">
      {/* Main Split Studio Grid */}
      <JXGrid columns={12} gap="lg">
        {/* LEFT COLUMN: Tool Dispatch Studio (5 cols) */}
        <JXGridItem colSpan={5}>
          <JXCard className="bg-[var(--product-surface)]/70 border-[var(--product-line)] shadow-xl">
            <JXCardHeader
              title="Run a task"
              icon={<Zap className="w-4 h-4 text-indigo-400" />}
            />
            <JXCardContent>
              <div className="space-y-4">
              {/* Target Host System */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <label htmlFor="target-host-select" className="font-medium text-[var(--product-text-secondary)]">
                    Device
                  </label>
                </div>
                <select
                  id="target-host-select"
                  value={targetHost}
                  onChange={(e) => setTargetHost(e.target.value)}
                  className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-[var(--product-canvas)]/80 border border-[var(--product-line)] text-[var(--product-text-secondary)] font-mono text-xs focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors cursor-pointer"
                >
                  {devices.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.hostname} ({d.osRelease} • {d.status})
                    </option>
                  ))}
                </select>
              </div>

              {/* Tool Category & Selection */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <label htmlFor="tool-select" className="font-medium text-[var(--product-text-secondary)]">
                    Tool
                  </label>
                  <span className={`font-mono text-[10px] px-2 py-0.5 rounded font-semibold uppercase ${getRiskBadgeColor(activeRiskTier)}`}>
                    {activeRiskTier.replace("_", " ")}
                  </span>
                </div>
                <select
                  id="tool-select"
                  value={selectedTool}
                  onChange={(e) => setSelectedTool(e.target.value)}
                  className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-[var(--product-canvas)]/80 border border-[var(--product-line)] text-[var(--product-text-secondary)] font-mono text-xs focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors cursor-pointer"
                >
                  <optgroup label="Vision & Input Primitives">
                    <option value="desktop.capture_screen">desktop.capture_screen [Tier 1: Safe ReadOnly]</option>
                    <option value="desktop.click_coordinate">desktop.click_coordinate [Tier 2: Workspace Edit]</option>
                    <option value="desktop.type_text">desktop.type_text [Tier 2: Workspace Edit]</option>
                  </optgroup>
                  <optgroup label="Terminal & Shell Execution">
                    <option value="shell.exec">shell.exec [Tier 3: Elevated Shell]</option>
                    <option value="pty.spawn">pty.spawn [Tier 3: Elevated Shell]</option>
                    <option value="process.list">process.list [Tier 1: Safe ReadOnly]</option>
                  </optgroup>
                  <optgroup label="File & System Operations">
                    <option value="file.read">file.read [Tier 1: Safe ReadOnly]</option>
                    <option value="file.write">file.write [Tier 2: Workspace Edit]</option>
                    <option value="file.apply_diff">file.apply_diff [Tier 2: Workspace Edit]</option>
                    <option value="system.specs">system.specs [Tier 1: Safe ReadOnly]</option>
                  </optgroup>
                </select>
              </div>

              {/* Parameter Presets Quick-Chips */}
              <div className="space-y-1.5">
                <span className="font-mono text-[11px] text-[var(--product-text-tertiary)] uppercase tracking-wider block">
                  Parameter Presets
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {PRESETS.map((p) => {
                    const isSelected = activePreset === p.name;
                    return (
                      <button
                        key={p.name}
                        type="button"
                        onClick={() => applyPreset(p)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-mono transition-all ${
                          isSelected
                            ? "bg-indigo-600 text-white font-semibold shadow-md shadow-indigo-600/30"
                            : "bg-[var(--product-canvas)]/70 border border-[var(--product-line)] text-[var(--product-text-secondary)] hover:border-[var(--product-line)] hover:text-[var(--product-text)]"
                        }`}
                      >
                        {p.name}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* JSON Argument Editor */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-[var(--product-text-secondary)]">Invocation Arguments (JSON)</span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={beautifyJson}
                      className="text-[11px] font-mono text-indigo-400 hover:text-indigo-300 transition-colors"
                    >
                      Format JSON
                    </button>
                    <span
                      className={`font-mono text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                        jsonError
                          ? "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                          : "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                      }`}
                    >
                      {jsonError ? "Syntax Error" : "Valid JSON"}
                    </span>
                  </div>
                </div>

                <div className="relative rounded-xl bg-[var(--product-canvas)] border border-[var(--product-line)] p-2 font-mono text-xs">
                  <textarea
                    aria-label="Tool arguments JSON"
                    rows={7}
                    value={argsJson}
                    onChange={handleJsonChange}
                    spellCheck={false}
                    className="w-full bg-transparent text-[var(--product-text-secondary)] font-mono text-xs leading-relaxed outline-none resize-none border-none p-1"
                  />
                </div>
                {jsonError && (
                  <p className="text-[11px] font-mono text-rose-400 mt-1">{jsonError}</p>
                )}
              </div>

              {/* Dispatch Action Button */}
              <div className="pt-2">
                <button
                  type="button"
                  disabled={isSubmitting || Boolean(jsonError)}
                  onClick={handleDispatch}
                  className={`w-full min-h-[44px] px-4 py-2.5 rounded-xl text-white font-semibold text-xs flex items-center justify-between transition-all shadow-lg ${
                    isSubmitting || jsonError
                      ? "bg-[var(--product-raised)] text-[var(--product-text-tertiary)] cursor-not-allowed border border-[var(--product-line)]"
                      : "bg-indigo-600 hover:bg-indigo-500 active:scale-[0.99] shadow-indigo-600/25"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {isSubmitting ? (
                      <RefreshCw className="w-4 h-4 animate-spin text-indigo-300" />
                    ) : (
                      <Send className="w-4 h-4 text-indigo-200" />
                    )}
                    <span>{isSubmitting ? "Dispatching Invocation..." : "Dispatch Tool to Host"}</span>
                  </div>
                  <kbd className="font-mono text-[10px] px-2 py-0.5 rounded bg-black/30 text-indigo-200">
                    ⌘ + Enter
                  </kbd>
                </button>
              </div>

              {/* Security Guardrail Callout */}
              <div className="p-3 rounded-xl bg-[var(--product-canvas)]/70 border border-[var(--product-line)]/80 flex items-center justify-between text-[11px] font-mono text-[var(--product-text-tertiary)]">
                <span className="flex items-center gap-1.5 text-emerald-400">
                  <Shield className="w-3.5 h-3.5" /> Zero-Trust Sandbox Active
                </span>
                <span>Signer: SecOps-CA-2026</span>
              </div>
            </div>
          </JXCardContent>
          </JXCard>
        </JXGridItem>

        {/* RIGHT COLUMN: Execution Queue Table & Vision Screen Inspector (7 cols) */}
        <JXGridItem colSpan={7}>
          <div className="space-y-6">
            {/* Upper: Execution Stream Table */}
            <JXCard className="bg-[var(--product-surface)]/70 border-[var(--product-line)] shadow-xl">
              <JXCardHeader
                title="Tasks"
                icon={<Layers className="w-4 h-4 text-cyan-400" />}
              />
              <JXCardContent>
              <div className="space-y-3">
                {/* Status Filter Chips */}
                <div className="flex flex-wrap items-center gap-2 pb-1">
                  {[
                    { id: "all", label: "All", count: tasks.length },
                    { id: "completed", label: "Completed", count: tasks.filter((t) => t.status === "completed").length },
                    { id: "running", label: "Running", count: tasks.filter((t) => t.status === "running").length },
                    { id: "needs_approval", label: "Needs Approval", count: tasks.filter((t) => t.status === "needs_approval").length },
                    { id: "failed", label: "Failed", count: tasks.filter((t) => t.status === "failed").length },
                  ].map((filter) => {
                    const isSelected = statusFilter === filter.id;
                    return (
                      <button
                        key={filter.id}
                        type="button"
                        onClick={() => setStatusFilter(filter.id)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-mono flex items-center gap-1.5 transition-all ${
                          isSelected
                            ? "bg-indigo-600 text-white font-semibold shadow-md shadow-indigo-600/30"
                            : "bg-[var(--product-canvas)]/80 border border-[var(--product-line)] text-[var(--product-text-secondary)] hover:border-[var(--product-line)]"
                        }`}
                      >
                        <span>{filter.label}</span>
                        <span className="px-1.5 py-0.2 rounded bg-black/30 text-[10px] font-bold">
                          {filter.count}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Task Table */}
                <div className="overflow-x-auto rounded-xl border border-[var(--product-line)]/80 bg-[var(--product-canvas)]/60">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="bg-[var(--product-surface)]/80 text-[var(--product-text-tertiary)] font-mono text-[11px] uppercase border-b border-[var(--product-line)]">
                        <th className="py-2.5 px-3">Task ID</th>
                        <th className="py-2.5 px-3">Target & Tool</th>
                        <th className="py-2.5 px-3">Status</th>
                        <th className="py-2.5 px-3">Invoker</th>
                        <th className="py-2.5 px-3 text-right">Inspect</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-mono">
                      {filteredTasks.map((t) => {
                        const isSelected = selectedTaskId === t.id;
                        return (
                          <tr
                            key={t.id}
                            onClick={() => setSelectedTaskId(t.id)}
                            className={`cursor-pointer transition-colors ${
                              isSelected
                                ? "bg-indigo-950/40 text-[var(--product-text)]"
                                : "hover:bg-[var(--product-surface)]/40 text-[var(--product-text-secondary)]"
                            }`}
                          >
                            <td className="py-2.5 px-3">
                              <span className="font-semibold text-indigo-400">#{t.id}</span>
                            </td>
                            <td className="py-2.5 px-3">
                              <div className="flex flex-col">
                                <span className="font-semibold text-[var(--product-text-secondary)]">{t.tool}</span>
                                <span className="text-[10px] text-[var(--product-text-tertiary)]">{t.deviceHostname || t.deviceId}</span>
                              </div>
                            </td>
                            <td className="py-2.5 px-3">{getStatusBadge(t.status)}</td>
                            <td className="py-2.5 px-3 text-[var(--product-text-tertiary)] text-[11px]">{t.invoker}</td>
                            <td className="py-2.5 px-3 text-right">
                              <button
                                type="button"
                                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all ${
                                  isSelected
                                    ? "bg-indigo-600 text-white"
                                    : "bg-[var(--product-raised)] text-[var(--product-text-secondary)] hover:bg-[var(--product-raised)]"
                                }`}
                              >
                                View
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </JXCardContent>
            </JXCard>

            {/* Lower: Vision Screen Viewer & Output Inspector */}
            <JXCard className="bg-[var(--product-surface)]/70 border-[var(--product-line)] shadow-xl">
              <JXCardHeader
                title={`Vision Inspector — #${activeTask?.id || "N/A"}`}
                icon={<Crosshair className="w-4 h-4 text-emerald-400" />}
              />
              <JXCardContent>
              <div className="space-y-4">
                {/* Control bar: Zoom, SoM toggle, Download */}
                <div className="flex flex-wrap items-center justify-between gap-3 p-2 rounded-xl bg-[var(--product-canvas)]/80 border border-[var(--product-line)]">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-semibold text-indigo-400">
                      {activeTask?.tool}
                    </span>
                    <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-[var(--product-raised)] text-[var(--product-text-secondary)]">
                      {activeTask?.deviceHostname || activeTask?.deviceId}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* SoM Toggle */}
                    <button
                      type="button"
                      onClick={() => setSomEnabled(!somEnabled)}
                      className={`px-3 py-1 rounded-lg text-xs font-mono font-semibold flex items-center gap-1.5 transition-all ${
                        somEnabled
                          ? "bg-emerald-600/20 text-emerald-300 border border-emerald-500/40"
                          : "bg-[var(--product-raised)] text-[var(--product-text-tertiary)] border border-[var(--product-line)]"
                      }`}
                    >
                      <Crosshair className="w-3.5 h-3.5" />
                      <span>SoM Overlay: {somEnabled ? "ON" : "OFF"}</span>
                    </button>

                    {/* Zoom Buttons */}
                    <div className="flex items-center rounded-lg bg-[var(--product-surface)] border border-[var(--product-line)] p-0.5">
                      <button
                        type="button"
                        onClick={handleZoomOut}
                        title="Zoom Out"
                        className="p-1.5 text-[var(--product-text-tertiary)] hover:text-[var(--product-text-secondary)] transition-colors"
                      >
                        <ZoomOut className="w-3.5 h-3.5" />
                      </button>
                      <span className="font-mono text-[11px] px-2 text-[var(--product-text-secondary)] tabular-nums">
                        {Math.round(zoomLevel * 100)}%
                      </span>
                      <button
                        type="button"
                        onClick={handleZoomIn}
                        title="Zoom In"
                        className="p-1.5 text-[var(--product-text-tertiary)] hover:text-[var(--product-text-secondary)] transition-colors"
                      >
                        <ZoomIn className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={handleZoomReset}
                        title="Reset Zoom"
                        className="px-2 py-0.5 font-mono text-[10px] text-indigo-400 hover:text-indigo-300"
                      >
                        Fit
                      </button>
                    </div>
                  </div>
                </div>

                {/* Vision Screen Canvas (Simulated High-Res Desktop Frame Buffer with SoM Marks) */}
                <div className="relative w-full aspect-video rounded-xl bg-[var(--product-canvas)] border border-[var(--product-line)] overflow-hidden select-none">
                  {/* Simulated Desktop Environment */}
                  <div className="absolute inset-0 flex flex-col bg-[var(--product-canvas)]">
                    {/* Top Simulated OS Bar */}
                    <div className="h-6 w-full bg-[var(--product-surface)] border-b border-[var(--product-line)] px-3 flex items-center justify-between font-mono text-[11px] text-[var(--product-text-tertiary)]">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-[var(--product-text-secondary)]">Ubuntu 24.04 LTS</span>
                        <span>{activeTask?.deviceHostname || "srv-us-east-412"}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span>CPU 18%</span>
                        <span>RAM 12.4GB</span>
                        <span>14:38:09 UTC</span>
                      </div>
                    </div>

                    {/* Window Area */}
                    <div className="flex-1 p-3 grid grid-cols-12 gap-3 relative overflow-hidden">
                      {/* Simulated Window 1: Terminal */}
                      <div className="col-span-7 rounded-lg bg-[var(--product-surface)]/95 border border-[var(--product-line)] p-2.5 font-mono text-xs flex flex-col relative shadow-lg">
                        <div className="flex items-center justify-between pb-1.5 border-b border-[var(--product-line)]/80 mb-2">
                          <div className="flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 rounded-full bg-rose-500/80"></span>
                            <span className="w-2.5 h-2.5 rounded-full bg-amber-500/80"></span>
                            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80"></span>
                            <span className="ml-2 text-[10px] text-[var(--product-text-tertiary)]">bash — 80x24</span>
                          </div>
                        </div>
                        <div className="space-y-1 text-[var(--product-text-secondary)] text-[11px]">
                          <p><span className="text-emerald-400">root@srv-us-east-412:~#</span> systemctl status ai-bridge-agent</p>
                          <p className="text-emerald-400">● ai-bridge-agent.service - Active (running)</p>
                          <p className="text-[var(--product-text-tertiary)]">Main PID: 18492 (agent_worker)</p>
                          <p className="text-cyan-300">WebSocket channel: verified (TLS 1.3)</p>
                        </div>
                      </div>

                      {/* Simulated Window 2: Web Preview */}
                      <div className="col-span-5 rounded-lg bg-[var(--product-surface)]/90 border border-[var(--product-line)] p-2.5 flex flex-col relative shadow-lg">
                        <div className="flex items-center justify-between pb-1.5 border-b border-[var(--product-line)]/80 mb-2 text-[10px] text-[var(--product-text-tertiary)] font-mono">
                          <span>Bridge Gateway Inspector</span>
                          <span className="text-emerald-400">● Live</span>
                        </div>
                        <div className="flex-1 flex flex-col justify-end gap-1">
                          <div className="h-14 w-full flex items-end gap-1 px-1">
                            <div className="flex-1 bg-indigo-500/40 rounded-t h-[40%]"></div>
                            <div className="flex-1 bg-indigo-500/60 rounded-t h-[65%]"></div>
                            <div className="flex-1 bg-indigo-500/80 rounded-t h-[85%]"></div>
                            <div className="flex-1 bg-cyan-400 rounded-t h-[95%]"></div>
                          </div>
                          <span className="font-mono text-[10px] text-[var(--product-text-dim)] text-center">Packets/Sec</span>
                        </div>
                      </div>

                      {/* Bottom Taskbar */}
                      <div className="col-span-12 h-8 rounded-lg bg-[var(--product-surface)]/90 border border-[var(--product-line)] flex items-center justify-between px-3 text-[11px] font-mono text-[var(--product-text-tertiary)]">
                        <div className="flex items-center gap-3">
                          <Terminal className="w-3.5 h-3.5 text-indigo-400" />
                          <Monitor className="w-3.5 h-3.5 text-emerald-400" />
                          <FileText className="w-3.5 h-3.5 text-[var(--product-text-tertiary)]" />
                        </div>
                        <span>IPC Channel: OK • 14ms</span>
                      </div>
                    </div>
                  </div>

                  {/* Set-of-Marks (SoM) Bounding Boxes Overlay */}
                  {somEnabled && (
                    <div className="absolute inset-0 pointer-events-none">
                      {DEFAULT_SOM_MARKS.map((mark) => (
                        <div
                          key={mark.id}
                          onClick={() => setSelectedMarkId(mark.id)}
                          className={`absolute border-2 rounded-lg pointer-events-auto cursor-pointer transition-all ${mark.color} ${mark.positionClass} ${
                            selectedMarkId === mark.id ? "ring-2 ring-white shadow-xl scale-[1.01]" : ""
                          }`}
                        >
                          <span className="absolute -top-3 -left-1 px-1.5 py-0.2 rounded text-[10px] font-mono font-bold bg-[var(--product-surface)] text-white shadow-md border border-[var(--product-line)]">
                            [{mark.id}]
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Bottom Telemetry Overlay Inside Canvas */}
                  <div className="absolute bottom-2 left-2 right-2 px-3 py-1.5 rounded-lg bg-[var(--product-canvas)]/85 backdrop-blur-md border border-[var(--product-line)] flex items-center justify-between font-mono text-[11px] text-[var(--product-text-tertiary)]">
                    <span className="text-emerald-400 flex items-center gap-1.5">
                      <Crosshair className="w-3.5 h-3.5" />
                      4 Target Marks Bound (SoM Alpha 1.4)
                    </span>
                    <span className="tabular-nums">3840×2160 native (DPI: 2.0)</span>
                  </div>
                </div>

                {/* Mark Details Inspection if a mark is selected */}
                {selectedMarkId && (
                  <div className="p-3 rounded-xl bg-[var(--product-canvas)]/90 border border-indigo-500/40 text-xs font-mono space-y-1">
                    <div className="flex items-center justify-between text-indigo-300 font-bold">
                      <span>Selected SoM Mark [{selectedMarkId}]</span>
                      <button
                        type="button"
                        onClick={() => setSelectedMarkId(null)}
                        className="text-[var(--product-text-tertiary)] hover:text-[var(--product-text-secondary)]"
                      >
                        Dismiss
                      </button>
                    </div>
                    {(() => {
                      const m = DEFAULT_SOM_MARKS.find((mark) => mark.id === selectedMarkId);
                      if (!m) return null;
                      return (
                        <div className="text-[var(--product-text-secondary)] space-y-0.5">
                          <div>Label: {m.label}</div>
                          <div>Category: {m.category}</div>
                          <div>Bounding Box: [X: {m.bounds[0]}%, Y: {m.bounds[1]}%, W: {m.bounds[2]}%, H: {m.bounds[3]}%]</div>
                        </div>
                      );
                    })()}
                  </div>
                )}

                {/* Execution Return Payload Drawer */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-[var(--product-text-secondary)]">Execution Return Payload</span>
                      <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                        200 OK
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={copyToClipboard}
                      className="px-2.5 py-1 rounded-lg bg-[var(--product-raised)] hover:bg-[var(--product-raised)] text-[var(--product-text-secondary)] font-mono text-[11px] flex items-center gap-1.5 transition-colors"
                    >
                      {copiedPayload ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5 text-[var(--product-text-tertiary)]" />
                          <span>Copy JSON</span>
                        </>
                      )}
                    </button>
                  </div>

                  <pre tabIndex={0} aria-label="Task output" className="p-3 rounded-xl bg-[var(--product-canvas)] border border-[var(--product-line)] font-mono text-xs text-[var(--product-text-secondary)] overflow-x-auto max-h-36">
                    <code>
                      {JSON.stringify(
                        {
                          status: "success",
                          taskId: activeTask?.id,
                          tool: activeTask?.tool,
                          targetNode: activeTask?.deviceHostname || activeTask?.deviceId,
                          captureTimeMs: activeTask?.durationMs || 28.4,
                          resolution: "3840x2160",
                          elementsDetected: 14,
                          somCount: 4,
                          sha256: "sha256:7f83b1657ff1709bcfa488b0a501a399d91f28b49911e3b2e5a8f4c",
                        },
                        null,
                        2
                      )}
                    </code>
                  </pre>
                </div>
              </div>
            </JXCardContent>
            </JXCard>
          </div>
        </JXGridItem>
      </JXGrid>
    </div>
  );
};

export default TaskQueueVisionView;
