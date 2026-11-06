import React, { useCallback, useState } from "react";
import { api } from "../../api";
import { JXButton } from "../../ui";
import { TaskComposer } from "./TaskComposer";
import { argsOf, deviceName, Empty, Field, fieldClass, LiveDevice, LiveTask, normalizeTaskStatus, Pagination, Payload, ReadState, taskStates, taskStatus, text, time, useRead } from "./shared";

function TaskResult({ task }: { task: LiveTask }) {
  if (task.result == null || task.result === "") return <p className="text-sm text-[var(--product-text-tertiary)]">
    {task.status === "needs_approval" ? "Waiting for an administrator’s decision." : "No result reported yet."}</p>;
  let result = task.result;
  if (typeof result === "string") { try { result = JSON.parse(result); } catch { /* Plain text output. */ } }
  const image = result && typeof result === "object" ? (result as Record<string, unknown>).base64_data : null;
  return <div className="space-y-3">
    {task.tool === "capture_desktop_frame" && typeof image === "string" && /^[A-Za-z0-9+/=\s]+$/.test(image) &&
      <img src={`data:image/${image.startsWith("/9j/") ? "jpeg" : "png"};base64,${image}`} alt="Captured device desktop" className="max-h-[65vh] max-w-full rounded-lg object-contain" />}
    <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-[var(--product-canvas)] p-3 text-xs text-[var(--product-text-secondary)]">
      {text(image ? { ...(result as object), base64_data: "[Image displayed above]" } : result)}
    </pre>
  </div>;
}

export function TasksPanel({ devices, device, canAct, onlyTool, status = "all", onStatus = () => {} }:
  { devices: LiveDevice[]; device?: LiveDevice; canAct: boolean; onlyTool?: string; status?: string; onStatus?: (value: string) => void }) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [history, setHistory] = useState(false);
  const load = useCallback(async () => {
    if (history) {
      const result = await api.taskHistory({ q: query, status, device_id: device?.id || "", tenant: device?.tenant || "default", page });
      if (!Array.isArray(result.items) || !Number.isInteger(result.total)) throw new Error("Invalid task history response.");
      return { items: result.items as LiveTask[], total: result.total as number };
    }
    const result = await api.tasks(device?.id);
    if (!Array.isArray(result)) throw new Error("The server returned an invalid task list.");
    return { items: result as LiveTask[], total: result.length };
  }, [device?.id, device?.tenant, history, history ? query : "", history ? status : "", history ? page : 1]);
  const state = useRead(load, true);
  const { data, error, loading, refresh } = state;
  const [composer, setComposer] = useState<{ tool?: string; args?: Record<string, unknown>; device?: LiveDevice }>();
  const tasks = (data?.items || []).filter((task) => (!onlyTool || task.tool === onlyTool) && (status === "all" || normalizeTaskStatus(task.status) === status) &&
    [task.id, task.tool, task.device_id, devices.find(d => d.id === task.device_id)?.name].some(value => value?.toLowerCase().includes(query.toLowerCase())));
  const total = history ? data?.total || 0 : tasks.length;
  const currentPage = history ? page : Math.min(page, Math.max(1, Math.ceil(total / 25)));
  const shown = history ? tasks : tasks.slice((currentPage - 1) * 25, currentPage * 25);
  const availableDevices = (device ? [device] : devices).filter((item) => !item.revoked);
  return <section aria-label={onlyTool === "run_shell" ? "Command tasks" : onlyTool === "capture_desktop_frame" ? "Desktop snapshots" : "Tasks"} className="space-y-4">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="flex flex-wrap gap-3">
        <Field label="Find task"><input className={fieldClass} value={query} maxLength={200} placeholder={history ? "Task ID or tool" : "Task, tool or device"} onChange={e => { setQuery(e.target.value); setPage(1); }} /></Field>
        <Field label="Task status"><select value={status} className={fieldClass} onChange={(e) => { setPage(1); onStatus(e.target.value); }}>
          {taskStates.map((value) => <option key={value} value={value}>{value === "all" ? "All tasks" : taskStatus(value)}</option>)}
        </select></Field>
        <JXButton color="neutral" variant="outlined" disabled={loading} onClick={refresh}>Refresh tasks</JXButton>
      </div>
      {device && <JXButton disabled={!canAct || !!error || !!device.revoked} onClick={() => setComposer({ tool: onlyTool })}>
        {onlyTool === "run_shell" ? "Run command" : onlyTool === "capture_desktop_frame" ? "Capture snapshot" : "New task"}
      </JXButton>}
    </div>
    {!canAct && <p className="text-xs text-[var(--product-text-tertiary)]">Task submission requires an operator, an active fleet, and current device data.</p>}
    {!onlyTool && <label className="flex items-center gap-2 text-xs text-[var(--product-text-secondary)]"><input type="checkbox" checked={history} onChange={e => { setHistory(e.target.checked); setPage(1); setQuery(""); }} />Search full server history</label>}
    <ReadState {...state} />
    {error && <p role="alert" className="text-sm text-amber-300">{error} Previously loaded tasks may be stale.</p>}
    {loading && !data && <p role="status" className="py-6 text-sm text-[var(--product-text-tertiary)]">Loading tasks…</p>}
    {data && !tasks.length && <Empty title={status !== "all" ? "No matching tasks" : "No tasks yet"}>
      {status !== "all" ? <JXButton color="neutral" variant="outlined" onClick={() => onStatus("all")}>Clear task filter</JXButton> :
        <p className="text-sm text-[var(--product-text-tertiary)]">{device ? "Submit a task to this device to get started." : "Open a device to submit a task."}</p>}
    </Empty>}
    <ul className="divide-y divide-slate-800">{shown.map((task) => {
      const target = devices.find((item) => item.id === task.device_id);
      const safeRetry = task.status === "failed" && ["get_system_info", "get_resource_usage", "get_network_info"].includes(task.tool) &&
        Object.keys(argsOf(task)).length === 0 && target && !target.revoked;
      return <li key={task.id} className="py-4">
        <details className="group min-w-0">
          <summary className="cursor-pointer rounded-lg text-sm">
            <span className="inline-flex max-w-full flex-wrap items-center gap-x-4 gap-y-1 align-middle">
              <span className="break-all font-medium">{task.tool}</span>
              <span className={task.status === "failed" ? "text-rose-300" : "text-[var(--product-text-secondary)]"}>{taskStatus(task.status)}</span>
              {!device && <span className="break-all text-[var(--product-text-tertiary)]">{target ? deviceName(target) : task.device_id}</span>}
              <span className="text-xs text-[var(--product-text-tertiary)]">{time(task.updated_at || task.created_at)}</span>
            </span>
          </summary>
          <div className="mt-4 min-w-0 space-y-4 pl-3">
            <TaskResult task={task} />
            <Payload title="Task details" value={{ id: task.id, device_id: task.device_id, tool: task.tool, tier: task.tier, args: argsOf(task) }} />
            {safeRetry && <JXButton color="neutral" variant="outlined" disabled={!canAct || !!error} onClick={() => setComposer({ tool: task.tool, args: argsOf(task), device: target })}>Review retry</JXButton>}
            {task.status === "failed" && !safeRetry && <p className="text-xs text-[var(--product-text-tertiary)]">No automatic retry. Review the result before creating another task.</p>}
          </div>
        </details>
      </li>;
    })}</ul>
    {total > 25 && <Pagination page={currentPage} total={total} onPage={setPage} />}
    {!history && data && data.items.length >= 200 && <p className="text-xs text-[var(--product-text-tertiary)]">Showing the latest 200 tasks returned by the server. Enable full server history to search older tasks.</p>}
    {composer && <TaskComposer devices={composer.device ? [composer.device] : availableDevices} canAct={canAct && !error}
      initialTool={composer.tool} initialArgs={composer.args}
      onClose={() => setComposer(undefined)} onSubmitted={() => { void refresh(); }} />}
  </section>;
}
