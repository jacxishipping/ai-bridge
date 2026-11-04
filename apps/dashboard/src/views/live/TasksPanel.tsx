import React, { useCallback, useState } from "react";
import { api } from "../../api";
import { JXButton } from "../../ui";
import { TaskComposer } from "./TaskComposer";
import { argsOf, deviceName, Empty, Field, fieldClass, LiveDevice, LiveTask, normalizeTaskStatus, Payload, taskStates, taskStatus, text, time, useRead } from "./shared";

function TaskResult({ task }: { task: LiveTask }) {
  if (task.result == null || task.result === "") return <p className="text-sm text-slate-400">
    {task.status === "needs_approval" ? "Waiting for an administrator’s decision." : "No result reported yet."}</p>;
  let result = task.result;
  if (typeof result === "string") { try { result = JSON.parse(result); } catch { /* Plain text output. */ } }
  const image = result && typeof result === "object" ? (result as Record<string, unknown>).base64_data : null;
  return <div className="space-y-3">
    {task.tool === "capture_desktop_frame" && typeof image === "string" && /^[A-Za-z0-9+/=\s]+$/.test(image) &&
      <img src={`data:image/${image.startsWith("/9j/") ? "jpeg" : "png"};base64,${image}`} alt="Captured device desktop" className="max-h-[65vh] max-w-full rounded-lg object-contain" />}
    <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-slate-950 p-3 text-xs text-slate-200">
      {text(image ? { ...(result as object), base64_data: "[Image displayed above]" } : result)}
    </pre>
  </div>;
}

export function TasksPanel({ devices, device, canAct, onlyTool, status = "all", onStatus = () => {} }:
  { devices: LiveDevice[]; device?: LiveDevice; canAct: boolean; onlyTool?: string; status?: string; onStatus?: (value: string) => void }) {
  const load = useCallback(async () => {
    const result = await api.tasks(device?.id);
    if (!Array.isArray(result)) throw new Error("The server returned an invalid task list.");
    return result as LiveTask[];
  }, [device?.id]);
  const { data, error, loading, refresh } = useRead(load, true);
  const [composer, setComposer] = useState<{ tool?: string; args?: Record<string, unknown>; device?: LiveDevice }>();
  const tasks = (data || []).filter((task) => (!onlyTool || task.tool === onlyTool) && (status === "all" || normalizeTaskStatus(task.status) === status));
  const availableDevices = (device ? [device] : devices).filter((item) => !item.revoked);
  return <section aria-label={onlyTool === "run_shell" ? "Command tasks" : onlyTool === "capture_desktop_frame" ? "Desktop snapshots" : "Tasks"} className="space-y-4">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="flex flex-wrap gap-3">
        <Field label="Task status"><select value={status} className={fieldClass} onChange={(e) => onStatus(e.target.value)}>
          {taskStates.map((value) => <option key={value} value={value}>{value === "all" ? "All tasks" : taskStatus(value)}</option>)}
        </select></Field>
        <JXButton color="neutral" variant="outlined" disabled={loading} onClick={refresh}>Refresh tasks</JXButton>
      </div>
      {device && <JXButton disabled={!canAct || !!error || !!device.revoked} onClick={() => setComposer({ tool: onlyTool })}>
        {onlyTool === "run_shell" ? "Run command" : onlyTool === "capture_desktop_frame" ? "Capture snapshot" : "New task"}
      </JXButton>}
    </div>
    {!canAct && <p className="text-xs text-slate-400">Task submission requires an operator, an active fleet, and current device data.</p>}
    {error && <p role="alert" className="text-sm text-amber-300">{error} Previously loaded tasks may be stale.</p>}
    {loading && !data && <p role="status" className="py-6 text-sm text-slate-400">Loading tasks…</p>}
    {data && !tasks.length && <Empty title={status !== "all" ? "No matching tasks" : "No tasks yet"}>
      {status !== "all" ? <JXButton color="neutral" variant="outlined" onClick={() => onStatus("all")}>Clear task filter</JXButton> :
        <p className="text-sm text-slate-400">{device ? "Submit a task to this device to get started." : "Open a device to submit a task."}</p>}
    </Empty>}
    <ul className="divide-y divide-slate-800">{tasks.map((task) => {
      const target = devices.find((item) => item.id === task.device_id);
      const safeRetry = task.status === "failed" && ["get_system_info", "get_resource_usage", "get_network_info"].includes(task.tool) &&
        Object.keys(argsOf(task)).length === 0 && target && !target.revoked;
      return <li key={task.id} className="py-4">
        <details className="group min-w-0">
          <summary className="cursor-pointer rounded-lg text-sm">
            <span className="inline-flex max-w-full flex-wrap items-center gap-x-4 gap-y-1 align-middle">
              <span className="break-all font-medium">{task.tool}</span>
              <span className={task.status === "failed" ? "text-rose-300" : "text-slate-300"}>{taskStatus(task.status)}</span>
              {!device && <span className="break-all text-slate-400">{target ? deviceName(target) : task.device_id}</span>}
              <span className="text-xs text-slate-400">{time(task.updated_at || task.created_at)}</span>
            </span>
          </summary>
          <div className="mt-4 min-w-0 space-y-4 pl-3">
            <TaskResult task={task} />
            <Payload title="Task details" value={{ id: task.id, device_id: task.device_id, tool: task.tool, tier: task.tier, args: argsOf(task) }} />
            {safeRetry && <JXButton color="neutral" variant="outlined" disabled={!canAct || !!error} onClick={() => setComposer({ tool: task.tool, args: argsOf(task), device: target })}>Review retry</JXButton>}
            {task.status === "failed" && !safeRetry && <p className="text-xs text-slate-400">No automatic retry. Review the result before creating another task.</p>}
          </div>
        </details>
      </li>;
    })}</ul>
    {data && data.length >= 200 && <p className="text-xs text-slate-400">Showing the latest 200 tasks returned by the server.</p>}
    {composer && <TaskComposer devices={composer.device ? [composer.device] : availableDevices} canAct={canAct && !error}
      initialTool={composer.tool} initialArgs={composer.args}
      onClose={() => setComposer(undefined)} onSubmitted={() => { void refresh(); }} />}
  </section>;
}
