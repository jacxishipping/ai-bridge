import React, { useState } from "react";
import { ArrowRight } from "lucide-react";
import { GlassModal, JXButton, JXCard, JXCardContent } from "../ui";
import { useDashboardStore } from "../state/dashboardStore";
import type { TaskInvocation } from "../types/dashboard";

export const OverviewView: React.FC = () => {
  const devices = useDashboardStore((s) => s.devices);
  const tasks = useDashboardStore((s) => s.tasks);
  const approvals = useDashboardStore((s) => s.approvals);
  const navigate = useDashboardStore((s) => s.setCurrentView);
  const [selectedTask, setSelectedTask] = useState<TaskInvocation | null>(null);
  const online = devices.filter((device) => device.status === "online").length;
  const active = tasks.filter((task) => task.status === "running" || task.status === "pending").length;
  const pending = approvals.filter((approval) => approval.status === "pending").length;
  const summary = [
    { label: "Devices online", value: `${online} / ${devices.length}`, view: "devices" as const },
    { label: "Active tasks", value: active, view: "task-queue-and-vision" as const },
    { label: "Awaiting approval", value: pending, view: "human-approvals" as const },
  ];

  return <div className="space-y-4">
    <header className="flex flex-wrap items-center justify-between gap-4">
      <h1 className="text-xl font-semibold text-[var(--product-text)]">Fleet overview</h1>
      <JXButton variant="outlined" color="neutral" onClick={() => navigate("devices")}
        endIcon={<ArrowRight className="h-4 w-4" />}>View devices</JXButton>
    </header>

    <dl className="grid grid-cols-1 rounded-xl border border-[var(--product-line)] bg-[var(--product-surface)]/40 sm:grid-cols-3">
      {summary.map((item, idx) => <div key={item.label} className={`p-3.5 ${idx > 0 ? "border-t border-[var(--product-line)]/60 sm:border-t-0 sm:border-l sm:border-[var(--product-line)]" : ""}`}>
        <dt className="text-sm text-[var(--product-text-tertiary)]">{item.label}</dt>
        <dd className="mt-1">
          <button type="button" onClick={() => navigate(item.view)}
            aria-label={`${item.label}: ${item.value}`}
            className="rounded text-xl font-semibold tabular-nums text-[var(--product-text)] hover:text-indigo-300">
            {item.value}
          </button>
        </dd>
      </div>)}
    </dl>

    <JXCard>
      <JXCardContent>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold text-[var(--product-text)]">Recent tasks</h2>
          <JXButton variant="text" color="neutral" size="sm" onClick={() => navigate("task-queue-and-vision")}>View all</JXButton>
        </div>
        {tasks.length === 0 ? <p className="py-8 text-sm text-[var(--product-text-tertiary)]">No tasks yet.</p> :
          <ul className="divide-y divide-slate-800">
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
      </JXCardContent>
    </JXCard>

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
