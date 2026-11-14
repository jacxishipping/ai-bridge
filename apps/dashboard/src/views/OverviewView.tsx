import React, { useEffect, useState } from "react";
import { ArrowRight, ListChecks, Server, ShieldCheck } from "lucide-react";
import {
  BentoGrid,
  GlassModal,
  InteractiveCard,
  JXButton,
  MagneticButton,
  ProductGlass,
  ProductMetricCard,
  ProductModePill,
} from "../ui";
import { api, token, sessionToken } from "../api";
import { PageEmpty } from "../components/PageEmpty";
import { Freshness } from "../components/Freshness";
import { useDashboardStore } from "../state/dashboardStore";
import type { TaskInvocation } from "../types/dashboard";

export const OverviewView: React.FC = () => {
  const devices = useDashboardStore((s) => s.devices);
  const tasks = useDashboardStore((s) => s.tasks);
  const approvals = useDashboardStore((s) => s.approvals);
  const navigate = useDashboardStore((s) => s.setCurrentView);
  const [selectedTask, setSelectedTask] = useState<TaskInvocation | null>(null);
  const [metricsSummary, setMetricsSummary] = useState<{
    completed_1h?: number;
    failed_1h?: number;
    queue_depth?: number;
    stale_device_count?: number;
    avg_task_duration_sec?: number | null;
  } | null>(null);
  const [recentFailures, setRecentFailures] = useState<{ id: string; tool: string; role?: string }[]>([]);
  const isLive = Boolean(token() || sessionToken());
  const online = devices.filter((device) => device.status === "online").length;
  const active = tasks.filter((task) => task.status === "running" || task.status === "pending").length;
  const pending = approvals.filter((approval) => approval.status === "pending").length;

  useEffect(() => {
    if (!isLive) return;
    let cancelled = false;
    void (async () => {
      try {
        const [summary, activity] = await Promise.all([
          api.metricsSummary().catch(() => null),
          api.liveActivity(20).catch(() => null),
        ]);
        if (cancelled) return;
        if (summary) setMetricsSummary(summary);
        if (activity?.recent_failures) setRecentFailures(activity.recent_failures.slice(0, 5));
      } catch {
        /* keep store KPIs */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isLive]);

  return <div className="space-y-5">
    <header className="flex flex-wrap items-center justify-between gap-4">
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold text-[var(--product-text)]">Fleet overview</h1>
          <ProductModePill live={isLive} detail={isLive ? "Control plane" : "Sample fleet"} />
        </div>
        <Freshness checkedAt={Date.now()} label={isLive ? "Live snapshot" : "Demo snapshot"} />
      </div>
      <MagneticButton
        variant="outline"
        tone="primary"
        className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm"
        onClick={() => navigate("devices")}
      >
        View devices <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </MagneticButton>
    </header>

    {!isLive && (
      <PageEmpty
        demo
        title="Exploring the demo overview"
        description="Numbers and devices on this page are simulated. Connect a control plane to see your real fleet."
        actionLabel="Connect server"
        onAction={() => navigate("login")}
        secondaryLabel="Open live home"
        onSecondary={() => navigate("live")}
      />
    )}

    <BentoGrid>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <ProductMetricCard
          label="Devices online"
          value={`${online} / ${devices.length}`}
          hint={isLive ? "Enrolled fleet" : "Simulated inventory"}
          trend={online > 0 ? "up" : "flat"}
          onClick={() => navigate("devices")}
        />
        <ProductMetricCard
          label="Active tasks"
          value={active}
          hint="Running or queued"
          trend={active > 0 ? "up" : "flat"}
          onClick={() => navigate("task-queue-and-vision")}
        />
        <ProductMetricCard
          label="Awaiting approval"
          value={pending}
          hint="Human-in-the-loop queue"
          trend={pending > 0 ? "down" : "flat"}
          onClick={() => navigate("human-approvals")}
        />
        <ProductMetricCard
          label="Completed (1h)"
          value={metricsSummary?.completed_1h ?? "—"}
          hint="Control-plane throughput"
          trend="flat"
          onClick={() => navigate("task-queue-and-vision")}
        />
        <ProductMetricCard
          label="Failed (1h)"
          value={metricsSummary?.failed_1h ?? "—"}
          hint={
            metricsSummary?.stale_device_count
              ? `${metricsSummary.stale_device_count} stale heartbeats`
              : "Recent failures"
          }
          trend={(metricsSummary?.failed_1h ?? 0) > 0 ? "down" : "flat"}
          onClick={() => navigate("live")}
        />
        <ProductMetricCard
          label="Queue depth"
          value={metricsSummary?.queue_depth ?? "—"}
          hint={
            metricsSummary?.avg_task_duration_sec != null
              ? `avg ${metricsSummary.avg_task_duration_sec}s`
              : "Queued tasks"
          }
          trend="flat"
          onClick={() => navigate("task-queue-and-vision")}
        />
      </div>
    </BentoGrid>

    {isLive && recentFailures.length > 0 && (
      <ProductGlass className="p-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-[var(--product-text)]">Recent failures</h2>
          <JXButton
            variant="outlined"
            color="neutral"
            size="sm"
            onClick={async () => {
              const role = recentFailures.find((f) => f.role)?.role || "developer";
              try {
                await api.supervisorRecover({ role });
                const activity = await api.liveActivity(20).catch(() => null);
                if (activity?.recent_failures) setRecentFailures(activity.recent_failures.slice(0, 5));
              } catch {
                /* ignore */
              }
            }}
          >
            Recover failed role
          </JXButton>
        </div>
        <ul className="divide-y divide-[var(--product-line)]/80 text-sm">
          {recentFailures.map((f) => (
            <li key={f.id} className="flex flex-wrap justify-between gap-2 py-2 text-[var(--product-text-tertiary)]">
              <span className="break-all text-[var(--product-text-secondary)]">{f.tool}</span>
              <span>{f.role || f.id}</span>
            </li>
          ))}
        </ul>
      </ProductGlass>
    )}

    <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
      <ProductGlass className="p-4 lg:col-span-2">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <ListChecks className="h-4 w-4 text-indigo-300" aria-hidden="true" />
            <h2 className="font-semibold text-[var(--product-text)]">Recent tasks</h2>
          </div>
          <JXButton variant="text" color="neutral" size="sm" onClick={() => navigate("task-queue-and-vision")}>View all</JXButton>
        </div>
        {tasks.length === 0 ? <p className="py-8 text-sm text-[var(--product-text-tertiary)]">No tasks yet.</p> :
          <ul className="divide-y divide-[var(--product-line)]/80">
            {tasks.slice(0, 5).map((task) => <li key={task.id}>
              <button type="button" onClick={() => setSelectedTask(task)}
                className="flex w-full flex-wrap items-center justify-between gap-3 rounded-lg py-2.5 text-left hover:bg-[var(--product-raised)]/40">
                <span className="min-w-0">
                  <span className="block break-all text-sm text-[var(--product-text-secondary)]">{task.tool}</span>
                  <span className="mt-1 block break-all text-xs text-[var(--product-text-tertiary)]">{task.deviceHostname}</span>
                </span>
                <span className={`text-xs ${task.status === "failed" ? "text-rose-300" : task.status === "needs_approval" ? "text-amber-200" : "text-[var(--product-text-tertiary)]"}`}>
                  {task.status.replace(/_/g, " ")}
                </span>
              </button>
            </li>)}
          </ul>}
      </ProductGlass>

      <div className="space-y-3">
        {([
          { view: "devices" as const, icon: Server, tone: "text-indigo-300", title: "Fleet inventory", hint: "Enroll agents and inspect nodes" },
          { view: "human-approvals" as const, icon: ShieldCheck, tone: "text-amber-300", title: "Approvals queue", hint: `${pending} waiting for review` },
          { view: "mcp-and-oauth" as const, icon: ListChecks, tone: "text-emerald-300", title: "MCP connections", hint: "ChatGPT, Claude, Gemini setup" },
        ]).map((item) => (
          <InteractiveCard
            key={item.view}
            hoverLift
            className="product-surface rounded-xl! border border-[var(--product-line)]! bg-[var(--product-surface)]/70! p-0! shadow-none!"
          >
            <button type="button" onClick={() => navigate(item.view)} className="flex w-full items-start gap-3 p-4 text-left">
              <item.icon className={`mt-0.5 h-4 w-4 shrink-0 ${item.tone}`} aria-hidden="true" />
              <span>
                <span className="block text-sm font-medium text-[var(--product-text)]">{item.title}</span>
                <span className="mt-1 block text-xs text-[var(--product-text-tertiary)]">{item.hint}</span>
              </span>
            </button>
          </InteractiveCard>
        ))}
      </div>
    </div>

    {selectedTask && <GlassModal title="Task details" onClose={() => setSelectedTask(null)}>
      <div className="space-y-5">
        <dl className="grid grid-cols-2 gap-4 text-sm">
          {[
            ["Device", selectedTask.deviceHostname], ["Status", selectedTask.status.replace(/_/g, " ")],
            ["Tool", selectedTask.tool], ["Risk", selectedTask.riskTier.replace(/_/g, " ")],
          ].map(([label, value]) => <div key={label}><dt className="text-[var(--product-text-tertiary)]">{label}</dt><dd className="mt-1 break-all text-[var(--product-text-secondary)]">{value}</dd></div>)}
        </dl>
        <div><h3 className="mb-2 text-sm font-medium">Arguments</h3>
          <pre tabIndex={0} aria-label="Task arguments" className="overflow-auto rounded-lg bg-[var(--product-canvas)] p-3 text-xs text-[var(--product-text-secondary)]">{JSON.stringify(selectedTask.args, null, 2)}</pre>
        </div>
        {selectedTask.result && <div><h3 className="mb-2 text-sm font-medium">Result</h3>
          <pre tabIndex={0} aria-label="Task result" className="max-h-64 overflow-auto rounded-lg bg-[var(--product-canvas)] p-3 text-xs text-[var(--product-text-secondary)]">{JSON.stringify(selectedTask.result, null, 2)}</pre>
        </div>}
      </div>
    </GlassModal>}
  </div>;
};

export default OverviewView;
