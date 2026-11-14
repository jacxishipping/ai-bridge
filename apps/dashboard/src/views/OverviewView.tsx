import React, { useState } from "react";
import { ArrowRight, ListChecks, Server, ShieldCheck } from "lucide-react";
import {
  BentoGrid,
  GlassModal,
  JXButton,
  JXCard,
  JXCardContent,
  MagneticButton,
  ProductGlass,
  ProductMetricCard,
} from "../ui";
import { token, sessionToken } from "../api";
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
  const isLive = Boolean(token() || sessionToken());
  const online = devices.filter((device) => device.status === "online").length;
  const active = tasks.filter((task) => task.status === "running" || task.status === "pending").length;
  const pending = approvals.filter((approval) => approval.status === "pending").length;

  return <div className="space-y-5">
    <header className="flex flex-wrap items-center justify-between gap-4">
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold text-[var(--product-text)]">Fleet overview</h1>
          {!isLive && (
            <span className="rounded-full border border-amber-500/40 bg-amber-950/40 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-amber-200">
              Sample data
            </span>
          )}
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
      <ProductGlass className="p-1">
        <PageEmpty
          demo
          title="Exploring the demo overview"
          description="Numbers and devices on this page are simulated. Connect a control plane to see your real fleet."
          actionLabel="Connect server"
          onAction={() => navigate("login")}
          secondaryLabel="Open live home"
          onSecondary={() => navigate("live")}
        />
      </ProductGlass>
    )}

    <BentoGrid>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
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
      </div>
    </BentoGrid>

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
        <JXCard className="!p-0">
          <JXCardContent>
            <button type="button" onClick={() => navigate("devices")} className="flex w-full items-start gap-3 p-1 text-left">
              <Server className="mt-0.5 h-4 w-4 shrink-0 text-indigo-300" aria-hidden="true" />
              <span>
                <span className="block text-sm font-medium text-[var(--product-text)]">Fleet inventory</span>
                <span className="mt-1 block text-xs text-[var(--product-text-tertiary)]">Enroll agents and inspect nodes</span>
              </span>
            </button>
          </JXCardContent>
        </JXCard>
        <JXCard className="!p-0">
          <JXCardContent>
            <button type="button" onClick={() => navigate("human-approvals")} className="flex w-full items-start gap-3 p-1 text-left">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" aria-hidden="true" />
              <span>
                <span className="block text-sm font-medium text-[var(--product-text)]">Approvals queue</span>
                <span className="mt-1 block text-xs text-[var(--product-text-tertiary)]">{pending} waiting for review</span>
              </span>
            </button>
          </JXCardContent>
        </JXCard>
        <JXCard className="!p-0">
          <JXCardContent>
            <button type="button" onClick={() => navigate("mcp-and-oauth")} className="flex w-full items-start gap-3 p-1 text-left">
              <ListChecks className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" aria-hidden="true" />
              <span>
                <span className="block text-sm font-medium text-[var(--product-text)]">MCP connections</span>
                <span className="mt-1 block text-xs text-[var(--product-text-tertiary)]">ChatGPT, Claude, Gemini setup</span>
              </span>
            </button>
          </JXCardContent>
        </JXCard>
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
