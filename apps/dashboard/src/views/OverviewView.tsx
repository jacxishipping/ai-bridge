/**
 * AI Bridge Enterprise Dashboard — OverviewView (Screen 1)
 * Command Overview & Bento Metrics: 4-Metric Bento Header, 2-Column Analytics,
 * 4 Quick Launchpad Dispatch Chips, Live Activity Audit Feed with Inspector Drawer.
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
  JXLinearProgress,
  JXAlert,
  GlassModal,
  BreadcrumbTrail,
} from "@jacxishippingorg/jx-ui-react";
import {
  Server,
  Activity,
  Shield,
  Zap,
  Layers,
  ArrowRight,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Terminal,
  Monitor,
  HardDrive,
  RefreshCw,
  Eye,
  Play,
  Flame,
  Lock,
  Cpu,
  Bot,
  Sliders,
  Check,
} from "lucide-react";
import { useDashboardStore } from "../state/dashboardStore";
import type { TaskInvocation, TaskRiskTier } from "../types/dashboard";

export const OverviewView: React.FC = () => {
  const devices = useDashboardStore((s) => s.devices);
  const selectedDeviceId = useDashboardStore((s) => s.selectedDeviceId);
  const setSelectedDeviceId = useDashboardStore((s) => s.setSelectedDeviceId);
  const setCurrentView = useDashboardStore((s) => s.setCurrentView);
  const tasks = useDashboardStore((s) => s.tasks);
  const dispatchTask = useDashboardStore((s) => s.dispatchTask);
  const approvals = useDashboardStore((s) => s.approvals);
  const gatewayLatencyMs = useDashboardStore((s) => s.gatewayLatencyMs);

  const onlineCount = useMemo(() => devices.filter((d) => d.status === "online").length, [devices]);
  const pendingApprovals = useMemo(() => approvals.filter((a) => a.status === "pending"), [approvals]);
  const windowsCount = useMemo(() => devices.filter((d) => d.platform === "windows").length, [devices]);
  const linuxCount = useMemo(() => devices.filter((d) => d.platform === "linux").length, [devices]);
  const macCount = useMemo(() => devices.filter((d) => d.platform === "darwin").length, [devices]);

  const selectedDevice = useMemo(
    () => devices.find((d) => d.id === selectedDeviceId) || devices[0],
    [devices, selectedDeviceId]
  );

  // Inspector modal state
  const [inspectedTask, setInspectedTask] = useState<TaskInvocation | null>(null);
  const [dispatchFeedback, setDispatchFeedback] = useState<string | null>(null);
  const [isDispatching, setIsDispatching] = useState<boolean>(false);

  // Quick launchpad handler
  const handleLaunchpadDispatch = useCallback(
    async (toolName: string, label: string, args: Record<string, any>, riskTier: TaskRiskTier) => {
      setIsDispatching(true);
      setDispatchFeedback(null);
      try {
        const newTask = await dispatchTask({
          deviceId: selectedDevice.id,
          tool: toolName,
          args,
          riskTier,
        });
        setDispatchFeedback(
          `Dispatched "${label}" (${toolName}) to ${selectedDevice.hostname} (#${newTask.id}).`
        );
      } catch (err: any) {
        setDispatchFeedback(`Dispatch failed: ${err?.message || "Unknown error"}`);
      } finally {
        setIsDispatching(false);
      }
    },
    [dispatchTask, selectedDevice]
  );

  return (
    <div className="w-full space-y-6">
      {/* Breadcrumb Navigation & Top Action Ribbon */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-800/60">
        <div>
          <BreadcrumbTrail crumbs={["AI Bridge", "Operations Domain", "Command Overview"]} />
          <h1 className="text-xl font-bold tracking-tight text-slate-100 mt-1">
            Command Overview & Bento Metrics
          </h1>
          <p className="text-xs text-slate-400 font-mono mt-0.5">
            Operations Domain • 40 Enrolled Nodes • mTLS v1.3 Zero-Trust Synchronized
          </p>
        </div>

        <JXStack direction="row" spacing="sm" className="items-center flex-wrap">
          {pendingApprovals.length > 0 && (
            <JXButton
              variant="soft"
              color="warning"
              size="sm"
              onClick={() => setCurrentView("human-approvals")}
              startIcon={<AlertTriangle className="w-3.5 h-3.5 text-amber-400" />}
              className="bg-amber-500/10 text-amber-300 border border-amber-500/30"
            >
              {pendingApprovals.length} Urgent Approvals
            </JXButton>
          )}

          <JXButton
            variant="outlined"
            color="neutral"
            size="sm"
            onClick={() => setCurrentView("devices")}
            startIcon={<Server className="w-3.5 h-3.5" />}
          >
            Manage Fleet ({onlineCount}/{devices.length})
          </JXButton>

          <JXButton
            variant="contained"
            color="primary"
            size="sm"
            onClick={() => setCurrentView("device-360-system")}
            startIcon={<Activity className="w-3.5 h-3.5" />}
          >
            Inspect 360 System
          </JXButton>
        </JXStack>
      </div>

      {/* 4-Metric Bento Header Ribbon */}
      <JXGrid columns={12} gap="md">
        <JXGridItem colSpan={3}>
          <JXCard spotlight hoverLift className="bg-slate-900/60 border-slate-800 h-full">
            <JXCardHeader
              title="Active Fleet Nodes"
              subheader={`${Math.round((onlineCount / devices.length) * 100)}% availability`}
              icon={<Server className="w-4 h-4 text-emerald-400" />}
            />
            <JXCardContent>
              <div className="space-y-2">
                <div className="flex items-baseline justify-between">
                  <span className="font-mono text-2xl font-bold text-slate-100 tabular-nums">
                    {onlineCount} / {devices.length}
                  </span>
                  <JXBadge color="success" statusText="Online" />
                </div>
                <div className="text-[11px] font-mono text-slate-400">
                  {windowsCount} Windows • {linuxCount} Linux • {macCount} macOS
                </div>
              </div>
            </JXCardContent>
          </JXCard>
        </JXGridItem>

        <JXGridItem colSpan={3}>
          <JXCard spotlight hoverLift className="bg-slate-900/60 border-slate-800 h-full">
            <JXCardHeader
              title="Task Throughput (24h)"
              subheader="99.87% success rate"
              icon={<Activity className="w-4 h-4 text-indigo-400" />}
            />
            <JXCardContent>
              <div className="space-y-2">
                <div className="flex items-baseline justify-between">
                  <span className="font-mono text-2xl font-bold text-slate-100 tabular-nums">
                    14,291
                  </span>
                  <JXBadge color="primary" statusText={`${tasks.length} active`} />
                </div>
                <div className="text-[11px] font-mono text-slate-400">
                  18 failed • 0 timeout drop
                </div>
              </div>
            </JXCardContent>
          </JXCard>
        </JXGridItem>

        <JXGridItem colSpan={3}>
          <JXCard spotlight hoverLift className="bg-slate-900/60 border-slate-800 h-full">
            <JXCardHeader
              title="Pending Approvals"
              subheader="SecOps review queue"
              icon={<Shield className="w-4 h-4 text-amber-400" />}
            />
            <JXCardContent>
              <div className="space-y-2">
                <div className="flex items-baseline justify-between">
                  <span className="font-mono text-2xl font-bold text-slate-100 tabular-nums">
                    {pendingApprovals.length} Urgent
                  </span>
                  <JXBadge
                    color={pendingApprovals.length > 0 ? "warning" : "success"}
                    statusText={pendingApprovals.length > 0 ? "Action Required" : "All Clear"}
                  />
                </div>
                <div className="text-[11px] font-mono text-slate-400">
                  Tier-3 Shell & Tier-4 Kernel
                </div>
              </div>
            </JXCardContent>
          </JXCard>
        </JXGridItem>

        <JXGridItem colSpan={3}>
          <JXCard spotlight hoverLift className="bg-slate-900/60 border-slate-800 h-full">
            <JXCardHeader
              title="Median Fleet Heartbeat"
              subheader="mTLS gateway latency"
              icon={<Zap className="w-4 h-4 text-cyan-400" />}
            />
            <JXCardContent>
              <div className="space-y-2">
                <div className="flex items-baseline justify-between">
                  <span className="font-mono text-2xl font-bold text-slate-100 tabular-nums">
                    {gatewayLatencyMs}ms
                  </span>
                  <span className="text-xs font-mono text-cyan-400 font-semibold">
                    p99: 22ms
                  </span>
                </div>
                <div className="text-[11px] font-mono text-slate-400">
                  AES-256-GCM authenticated • mTLS v1.3
                </div>
              </div>
            </JXCardContent>
          </JXCard>
        </JXGridItem>
      </JXGrid>

      {/* Quick Launchpad Dispatch Ribbon */}
      <JXCard className="bg-slate-900/60 border-slate-800">
        <JXCardHeader
          title="Instant Fleet Launchpad"
          subheader={`Target Node: ${selectedDevice.hostname} (${selectedDevice.platform})`}
          icon={<Play className="w-4 h-4 text-indigo-400" />}
        />
        <JXCardContent>
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2.5">
              <JXButton
                variant="soft"
                color="primary"
                size="sm"
                disabled={isDispatching}
                onClick={() =>
                  handleLaunchpadDispatch(
                    "desktop.capture_screen",
                    "Capture Remote Screen",
                    { format: "png", quality: 90 },
                    "tier1_safe"
                  )
                }
                startIcon={<Monitor className="w-3.5 h-3.5 text-indigo-400" />}
                className="bg-indigo-950/60 hover:bg-indigo-900/60 text-indigo-200 border border-indigo-800/40"
              >
                Capture Remote Screen
              </JXButton>

              <JXButton
                variant="soft"
                color="neutral"
                size="sm"
                disabled={isDispatching}
                onClick={() =>
                  handleLaunchpadDispatch(
                    "desktop.list_windows",
                    "Query Active Windows",
                    {},
                    "tier1_safe"
                  )
                }
                startIcon={<Layers className="w-3.5 h-3.5 text-cyan-400" />}
                className="bg-slate-850 hover:bg-slate-800 text-slate-200 border border-slate-700/60"
              >
                Query Active Windows
              </JXButton>

              <JXButton
                variant="soft"
                color="neutral"
                size="sm"
                disabled={isDispatching}
                onClick={() =>
                  handleLaunchpadDispatch(
                    "process.list",
                    "Inspect Top Processes",
                    { limit: 20, sort: "cpu" },
                    "tier1_safe"
                  )
                }
                startIcon={<Cpu className="w-3.5 h-3.5 text-emerald-400" />}
                className="bg-slate-850 hover:bg-slate-800 text-slate-200 border border-slate-700/60"
              >
                Inspect Top Processes
              </JXButton>

              <JXButton
                variant="soft"
                color="neutral"
                size="sm"
                disabled={isDispatching}
                onClick={() =>
                  handleLaunchpadDispatch(
                    "system_info",
                    "Fetch System Specs",
                    {},
                    "tier1_safe"
                  )
                }
                startIcon={<HardDrive className="w-3.5 h-3.5 text-amber-400" />}
                className="bg-slate-850 hover:bg-slate-800 text-slate-200 border border-slate-700/60"
              >
                Fetch System Specs
              </JXButton>
            </div>

            {/* Launch feedback banner */}
            {dispatchFeedback && (
              <JXAlert
                severity="success"
                title="Command Dispatched"
                description={dispatchFeedback}
              />
            )}
          </div>
        </JXCardContent>
      </JXCard>

      {/* 2-Column Analytics: Risk Tier Breakdown & Task Status Breakdown */}
      <JXGrid columns={12} gap="md">
        {/* Left Column: Risk Tier Execution Volume Breakdown */}
        <JXGridItem colSpan={6}>
          <JXCard className="bg-slate-900/60 border-slate-800 h-full">
            <JXCardHeader
              title="Risk Tier Execution Volume"
              subheader="24h governance categorization breakdown"
              icon={<Shield className="w-4 h-4 text-indigo-400" />}
            />
            <JXCardContent>
              <div className="space-y-4">
                {/* Tier 1 */}
                <div className="space-y-1.5 p-3 rounded-xl bg-slate-850/60 border border-slate-800">
                  <div className="flex items-center justify-between text-xs font-mono">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-400" />
                      <span className="font-semibold text-slate-200">Tier 1: Safe Observation</span>
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300">
                        Auto-Allowed
                      </span>
                    </div>
                    <span className="text-slate-300 font-bold tabular-nums">9,718 (68.0%)</span>
                  </div>
                  <JXLinearProgress value={68} className="h-1.5" />
                  <p className="text-[11px] text-slate-400 font-mono">
                    Read queries, screenshots, process listing, telemetry streaming.
                  </p>
                </div>

                {/* Tier 2 */}
                <div className="space-y-1.5 p-3 rounded-xl bg-slate-850/60 border border-slate-800">
                  <div className="flex items-center justify-between text-xs font-mono">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-indigo-400" />
                      <span className="font-semibold text-slate-200">Tier 2: Workspace Modification</span>
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-indigo-500/20 text-indigo-300">
                        Sandboxed
                      </span>
                    </div>
                    <span className="text-slate-300 font-bold tabular-nums">3,430 (24.0%)</span>
                  </div>
                  <JXLinearProgress value={24} className="h-1.5" />
                  <p className="text-[11px] text-slate-400 font-mono">
                    File writes, workspace diff application, project test execution.
                  </p>
                </div>

                {/* Tier 3 */}
                <div className="space-y-1.5 p-3 rounded-xl bg-slate-850/60 border border-slate-800">
                  <div className="flex items-center justify-between text-xs font-mono">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-amber-400" />
                      <span className="font-semibold text-slate-200">Tier 3: Arbitrary Shell & Deletion</span>
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300">
                        Review Required
                      </span>
                    </div>
                    <span className="text-slate-300 font-bold tabular-nums">1,114 (7.8%)</span>
                  </div>
                  <JXLinearProgress value={7.8} className="h-1.5" />
                  <p className="text-[11px] text-slate-400 font-mono">
                    Interactive bash/sh, pty spawn, file system deletion, process termination.
                  </p>
                </div>

                {/* Tier 4 */}
                <div className="space-y-1.5 p-3 rounded-xl bg-slate-850/60 border border-slate-800">
                  <div className="flex items-center justify-between text-xs font-mono">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-rose-400" />
                      <span className="font-semibold text-slate-200">Tier 4: Kernel & System Deploy</span>
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-rose-500/20 text-rose-300">
                        Dual Sign-off
                      </span>
                    </div>
                    <span className="text-slate-300 font-bold tabular-nums">29 (0.2%)</span>
                  </div>
                  <JXLinearProgress value={0.2} className="h-1.5" />
                  <p className="text-[11px] text-slate-400 font-mono">
                    Kernel modules, driver installations, iptables flush, firmware updates.
                  </p>
                </div>
              </div>
            </JXCardContent>
          </JXCard>
        </JXGridItem>

        {/* Right Column: Task Status Breakdown */}
        <JXGridItem colSpan={6}>
          <JXCard className="bg-slate-900/60 border-slate-800 h-full">
            <JXCardHeader
              title="Task Status Breakdown"
              subheader="Execution lifecycle across 14,328 lifetime invocations"
              icon={<Activity className="w-4 h-4 text-indigo-400" />}
            />
            <JXCardContent>
              <div className="space-y-4">
                {/* Horizontal proportional bar */}
                <div className="w-full h-3 rounded-full bg-slate-800 flex overflow-hidden">
                  <div className="bg-emerald-500 h-full w-[99.7%]" title="Completed (14,291)" />
                  <div className="bg-indigo-500 h-full w-[0.1%]" title="Running (12)" />
                  <div className="bg-amber-500 h-full w-[0.05%]" title="Pending (3)" />
                  <div className="bg-rose-500 h-full w-[0.15%]" title="Failed (18)" />
                </div>

                {/* Status Grid Badges */}
                <div className="grid grid-cols-2 gap-3 pt-2">
                  <div className="p-3 rounded-xl bg-slate-850/60 border border-slate-800 flex items-center justify-between">
                    <div>
                      <span className="text-[11px] font-mono text-slate-400 uppercase tracking-wider block">
                        Completed
                      </span>
                      <span className="text-xl font-bold font-mono text-emerald-400 tabular-nums">
                        14,291
                      </span>
                    </div>
                    <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                  </div>

                  <div className="p-3 rounded-xl bg-slate-850/60 border border-slate-800 flex items-center justify-between">
                    <div>
                      <span className="text-[11px] font-mono text-slate-400 uppercase tracking-wider block">
                        Running Active
                      </span>
                      <span className="text-xl font-bold font-mono text-indigo-400 tabular-nums">
                        12
                      </span>
                    </div>
                    <Activity className="w-5 h-5 text-indigo-400 animate-pulse" />
                  </div>

                  <div className="p-3 rounded-xl bg-slate-850/60 border border-slate-800 flex items-center justify-between">
                    <div>
                      <span className="text-[11px] font-mono text-slate-400 uppercase tracking-wider block">
                        Needs Approval
                      </span>
                      <span className="text-xl font-bold font-mono text-amber-400 tabular-nums">
                        {pendingApprovals.length}
                      </span>
                    </div>
                    <AlertTriangle className="w-5 h-5 text-amber-400" />
                  </div>

                  <div className="p-3 rounded-xl bg-slate-850/60 border border-slate-800 flex items-center justify-between">
                    <div>
                      <span className="text-[11px] font-mono text-slate-400 uppercase tracking-wider block">
                        Failed / Timeout
                      </span>
                      <span className="text-xl font-bold font-mono text-rose-400 tabular-nums">
                        18
                      </span>
                    </div>
                    <Flame className="w-5 h-5 text-rose-400" />
                  </div>
                </div>

                {/* Queue link action */}
                <div className="pt-2">
                  <JXButton
                    variant="soft"
                    color="neutral"
                    size="sm"
                    fullWidth
                    onClick={() => setCurrentView("task-queue-and-vision")}
                    endIcon={<ArrowRight className="w-3.5 h-3.5" />}
                    className="justify-between bg-slate-850 hover:bg-slate-800 text-slate-200 border border-slate-700/60"
                  >
                    <span>Inspect Full Task Queue & Vision Studio</span>
                    <span className="text-[11px] font-mono text-indigo-400">12 Active</span>
                  </JXButton>
                </div>
              </div>
            </JXCardContent>
          </JXCard>
        </JXGridItem>
      </JXGrid>

      {/* Live Activity Audit Feed */}
      <JXCard className="bg-slate-900/60 border-slate-800">
        <JXCardHeader
          title="Live Tool Dispatches & Activity Feed"
          subheader="Real-time execution activity across 40 nodes"
          icon={<Activity className="w-4 h-4 text-indigo-400" />}
        />
        <JXCardContent>
          <div className="space-y-3">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 font-mono uppercase tracking-wider">
                    <th className="py-2.5 px-3">Task ID</th>
                    <th className="py-2.5 px-3">Target Node</th>
                    <th className="py-2.5 px-3">Tool Invocations</th>
                    <th className="py-2.5 px-3">Risk Tier</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3">Duration</th>
                    <th className="py-2.5 px-3 text-right">Inspect</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {tasks.slice(0, 8).map((task) => (
                    <tr key={task.id} className="hover:bg-slate-850/60 transition-colors">
                      <td className="py-3 px-3 font-semibold text-indigo-300">{task.id}</td>
                      <td className="py-3 px-3 text-slate-200">{task.deviceHostname}</td>
                      <td className="py-3 px-3">
                        <code className="text-[11px] px-1.5 py-0.5 rounded bg-slate-800 text-indigo-300 border border-slate-700/50">
                          {task.tool}
                        </code>
                      </td>
                      <td className="py-3 px-3">
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded uppercase font-semibold ${
                            task.riskTier === "tier4_kernel"
                              ? "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                              : task.riskTier === "tier3_shell"
                              ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                              : task.riskTier === "tier2_workspace"
                              ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30"
                              : "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                          }`}
                        >
                          {task.riskTier.replace("tier", "T").replace("_", " ")}
                        </span>
                      </td>
                      <td className="py-3 px-3">
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded uppercase font-semibold ${
                            task.status === "completed"
                              ? "bg-emerald-500/20 text-emerald-300"
                              : task.status === "running"
                              ? "bg-indigo-500/20 text-indigo-300 animate-pulse"
                              : task.status === "needs_approval"
                              ? "bg-amber-500/20 text-amber-300"
                              : "bg-rose-500/20 text-rose-300"
                          }`}
                        >
                          {task.status.replace("_", " ")}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-slate-400">
                        {task.durationMs ? `${task.durationMs}ms` : "Active"}
                      </td>
                      <td className="py-3 px-3 text-right">
                        <JXButton
                          variant="soft"
                          color="neutral"
                          size="sm"
                          onClick={() => setInspectedTask(task)}
                          startIcon={<Eye className="w-3 h-3 text-slate-400" />}
                          className="text-[11px] bg-slate-800 hover:bg-slate-700 text-slate-200"
                        >
                          Inspect
                        </JXButton>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </JXCardContent>
      </JXCard>

      {/* Task Inspection Modal */}
      {inspectedTask && (
        <GlassModal
          open={Boolean(inspectedTask)}
          onClose={() => setInspectedTask(null)}
          title={`Task Inspector: ${inspectedTask.id}`}
        >
          <div className="space-y-4 max-w-2xl w-full text-xs font-mono">
            <div className="grid grid-cols-2 gap-3 p-3 rounded-xl bg-slate-900 border border-slate-800">
              <div>
                <span className="text-slate-500 block text-[10px] uppercase">Target Node</span>
                <span className="text-slate-200 font-semibold">{inspectedTask.deviceHostname}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px] uppercase">Tool Executable</span>
                <span className="text-indigo-300 font-semibold">{inspectedTask.tool}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px] uppercase">Invoker Identity</span>
                <span className="text-slate-200">{inspectedTask.invoker}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px] uppercase">Status</span>
                <span className="text-emerald-400 uppercase font-bold">{inspectedTask.status}</span>
              </div>
            </div>

            {/* Arguments Payload */}
            <div className="space-y-1">
              <span className="text-slate-400 text-[11px] uppercase tracking-wider block">
                Invocation Arguments
              </span>
              <pre className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-indigo-200 overflow-x-auto text-[11px]">
                {JSON.stringify(inspectedTask.args, null, 2)}
              </pre>
            </div>

            {/* Execution Result Payload if available */}
            {inspectedTask.result && (
              <div className="space-y-1">
                <span className="text-slate-400 text-[11px] uppercase tracking-wider block">
                  Execution Output / Result
                </span>
                <pre className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-emerald-300 overflow-x-auto text-[11px]">
                  {JSON.stringify(inspectedTask.result, null, 2)}
                </pre>
              </div>
            )}

            <div className="flex items-center justify-between pt-2 border-t border-slate-800 text-slate-500 text-[11px]">
              <span>Created: {new Date(inspectedTask.createdAt).toLocaleTimeString()}</span>
              <JXButton
                variant="soft"
                color="neutral"
                size="sm"
                onClick={() => setInspectedTask(null)}
              >
                Close Inspector
              </JXButton>
            </div>
          </div>
        </GlassModal>
      )}
    </div>
  );
};

export default OverviewView;
