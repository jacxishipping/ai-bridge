import React, { useRef, useState } from "react";
import { api, ApiError } from "../../api";
import { GlassModal, JXButton } from "../../ui";
import { deviceName, Field, fieldClass, LiveDevice, message, taskStatus, text } from "./shared";

export const taskTools = [
  { id: "get_system_info", label: "System information", risk: "Read-only" },
  { id: "get_resource_usage", label: "Resource usage", risk: "Read-only" },
  { id: "get_network_info", label: "Network information", risk: "Read-only" },
  { id: "run_shell", label: "Shell command", risk: "Sensitive · may change files or services" },
  { id: "capture_desktop_frame", label: "Desktop snapshot", risk: "Sensitive · captures screen contents" },
];
interface Outcome { device: LiveDevice; status: string; id?: string; error?: string }

/** Use the policy-checked per-device endpoint, never the unchecked fleet broadcast endpoint. */
export function TaskComposer({ devices, initialTool = "get_system_info", initialArgs, canAct, onClose, onSubmitted }:
  { devices: LiveDevice[]; initialTool?: string; initialArgs?: Record<string, unknown>; canAct: boolean; onClose: () => void; onSubmitted: () => void }) {
  const [tool, setTool] = useState(initialTool);
  const [command, setCommand] = useState(typeof initialArgs?.command === "string" ? initialArgs.command : "");
  const [review, setReview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [outcomes, setOutcomes] = useState<Outcome[]>([]);
  const lock = useRef(false);
  const args = tool === "run_shell" ? { command: command.trim() } : initialArgs && tool === initialTool ? initialArgs : {};
  const submit = async () => {
    if (lock.current || !canAct) return;
    lock.current = true; setBusy(true);
    const results: Outcome[] = [];
    let unknown = false;
    for (const device of devices) {
      if (unknown) results.push({ device, status: "Not submitted", error: "Stopped after an unknown outcome." });
      else {
        try {
          const result = await api.submitTask(device.id, tool, args, device.tenant);
          if (!result.task_id) throw new ApiError("The response did not include a task ID.", true);
          results.push({ device, status: taskStatus(result.status || "queued"), id: result.task_id });
        } catch (err) {
          unknown = err instanceof ApiError && err.uncertain;
          results.push({ device, status: unknown ? "Outcome unknown" : "Rejected", error: message(err) });
        }
      }
      setOutcomes([...results]);
    }
    setBusy(false); onSubmitted();
  };
  const selectedTool = taskTools.find((item) => item.id === tool);
  return <GlassModal title={outcomes.length ? "Submission results" : review ? "Review task" : "New task"} onClose={() => { if (!busy) onClose(); }}>
    <div className="space-y-5">
      {outcomes.length > 0 ? <>
        <p className="text-sm text-slate-300">{busy ? "Submitting…" : "Submission is not completion. Follow progress in Tasks."}</p>
        <ul aria-live="polite" className="divide-y divide-slate-700">{outcomes.map((outcome) => <li key={outcome.device.id} className="space-y-1 py-3 text-sm">
          <p className="break-all font-medium">{deviceName(outcome.device)} — {outcome.status}</p>
          {outcome.id && <p className="break-all font-mono text-xs text-slate-400">Task {outcome.id}</p>}
          {outcome.error && <p className="text-amber-300">{outcome.error}</p>}
        </li>)}</ul>
        <JXButton color="neutral" disabled={busy} onClick={onClose}>Done</JXButton>
      </> : <>
        {!review && <Field label="Action"><select className={fieldClass} value={tool} onChange={(e) => setTool(e.target.value)}>
          {!selectedTool && <option value={tool}>{tool}</option>}
          {taskTools.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
        </select></Field>}
        {!review && tool === "run_shell" && <Field label="Command"><textarea className={`${fieldClass} min-h-28 font-mono`} value={command} onChange={(e) => setCommand(e.target.value)} maxLength={4096} /></Field>}
        <p className={`text-sm ${selectedTool?.risk === "Read-only" ? "text-slate-300" : "text-amber-300"}`}>{selectedTool?.risk || "Review the original task’s risk and arguments before retrying."}</p>
        <div><h3 className="mb-2 text-sm font-medium">Target devices ({devices.length})</h3>
          <ul className="max-h-48 space-y-2 overflow-auto text-sm">{devices.map((device) => <li key={device.id} className="break-all">
            {deviceName(device)} <span className="text-xs text-slate-400">({device.id})</span>
          </li>)}</ul>
        </div>
        {review && <>
          <p className="text-sm">Submit <strong>{tool}</strong> to these exact devices?</p>
          {Object.keys(args).length > 0 && <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-slate-950 p-3 text-xs">{text(args)}</pre>}
          <p className="text-sm text-slate-400">Device policy is checked for each request. Approval may be required.</p>
        </>}
        <div className="flex flex-wrap justify-end gap-2">
          <JXButton color="neutral" variant="outlined" disabled={busy} onClick={() => review ? setReview(false) : onClose()}>{review ? "Back" : "Cancel"}</JXButton>
          <JXButton disabled={busy || !canAct || !devices.length || (tool === "run_shell" && !command.trim())} loading={busy} loadingLabel="Submitting…"
            onClick={() => review ? void submit() : setReview(true)}>{review ? "Submit task" : "Review task"}</JXButton>
        </div>
      </>}
    </div>
  </GlassModal>;
}
