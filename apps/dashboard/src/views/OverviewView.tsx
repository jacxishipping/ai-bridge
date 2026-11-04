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
      <h1 className="text-xl font-semibold text-slate-100">Fleet overview</h1>
      <JXButton variant="outlined" color="neutral" onClick={() => navigate("devices")}
        endIcon={<ArrowRight className="h-4 w-4" />}>View devices</JXButton>
    </header>

    <dl className="grid grid-cols-1 divide-y divide-slate-800 rounded-xl border border-slate-800 bg-slate-900/40 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
      {summary.map((item) => <div key={item.label} className="p-3.5">
        <dt className="text-sm text-slate-400">{item.label}</dt>
        <dd className="mt-1">
          <button type="button" onClick={() => navigate(item.view)}
            aria-label={`${item.label}: ${item.value}`}
            className="rounded text-xl font-semibold tabular-nums text-slate-100 hover:text-indigo-300">
            {item.value}
          </button>
        </dd>
      </div>)}
    </dl>

    <JXCard>
      <JXCardContent>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold text-slate-100">Recent tasks</h2>
          <JXButton variant="text" color="neutral" size="sm" onClick={() => navigate("task-queue-and-vision")}>View all</JXButton>
        </div>
        {tasks.length === 0 ? <p className="py-8 text-sm text-slate-400">No tasks yet.</p> :
          <ul className="divide-y divide-slate-800">
            {tasks.slice(0, 5).map((task) => <li key={task.id}>
              <button type="button" onClick={() => setSelectedTask(task)}
                className="flex w-full flex-wrap items-center justify-between gap-3 rounded-lg py-2.5 text-left hover:bg-slate-800/40">
                <span className="min-w-0">
                  <span className="block break-all text-sm text-slate-200">{task.tool}</span>
                  <span className="mt-1 block break-all text-xs text-slate-400">{task.deviceHostname}</span>
                </span>
                <span className={`text-xs ${task.status === "failed" ? "text-rose-300" : task.status === "needs_approval" ? "text-amber-200" : "text-slate-400"}`}>
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
          ].map(([label, value]) => <div key={label}><dt className="text-slate-400">{label}</dt><dd className="mt-1 break-all text-slate-200">{value}</dd></div>)}
        </dl>
        <div><h3 className="mb-2 text-sm font-medium">Arguments</h3>
          <pre tabIndex={0} aria-label="Task arguments" className="overflow-auto rounded-lg bg-slate-950 p-3 text-xs text-slate-300">{JSON.stringify(selectedTask.args, null, 2)}</pre>
        </div>
        {selectedTask.result && <div><h3 className="mb-2 text-sm font-medium">Result</h3>
          <pre tabIndex={0} aria-label="Task result" className="max-h-64 overflow-auto rounded-lg bg-slate-950 p-3 text-xs text-slate-300">{JSON.stringify(selectedTask.result, null, 2)}</pre>
        </div>}
      </div>
    </GlassModal>}
  </div>;
};

export default OverviewView;
