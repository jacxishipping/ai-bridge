import React, { useEffect, useState } from "react";
import { GlassModal, JXButton, JXCard } from "../../ui";
import { ApprovalsPanel } from "./ApprovalsPanel";
import { DeviceWorkspace } from "./DeviceWorkspace";
import { Inventory } from "./Inventory";
import { defaultFilters, usePreferences } from "./preferences";
import { Empty, Field, fieldClass, LiveDevice } from "./shared";
import { TasksPanel } from "./TasksPanel";

interface Route { section: "devices" | "tasks" | "approvals"; device?: string; tab: string }
function readWorkspaceRoute(): Route {
  const params = new URLSearchParams(window.location.hash.split("?")[1] || "");
  const section = params.get("section");
  const tab = params.get("tab") || "details";
  return { section: section === "tasks" || section === "approvals" ? section : "devices", device: params.get("device") || undefined,
    tab: ["details", "tasks", "terminal", "desktop"].includes(tab) ? tab : "details" };
}

export function LiveWorkspace({ devices, identity, role, stale, stopped, refresh }:
  { devices: LiveDevice[]; identity: string; role: string; stale: boolean; stopped: boolean; refresh: () => void }) {
  const [route, setRoute] = useState(readWorkspaceRoute);
  const { filters, setFilters, views, setViews, storageError } = usePreferences(identity);
  const [saving, setSaving] = useState(false);
  const [viewName, setViewName] = useState("");
  const [saveError, setSaveError] = useState("");
  useEffect(() => {
    const sync = () => setRoute(readWorkspaceRoute());
    window.addEventListener("popstate", sync); window.addEventListener("hashchange", sync);
    return () => { window.removeEventListener("popstate", sync); window.removeEventListener("hashchange", sync); };
  }, []);
  const navigate = (next: Route) => {
    const params = new URLSearchParams();
    if (next.section !== "devices") params.set("section", next.section);
    if (next.device) { params.set("device", next.device); params.set("tab", next.tab); }
    const hash = `#/live${params.size ? `?${params}` : ""}`;
    if (hash !== window.location.hash) window.history.pushState(null, "", hash);
    setRoute(next);
  };
  const selected = devices.find((device) => device.id === route.device);
  const canAct = !stale && !stopped && ["admin", "operator"].includes(role);
  const listVisible = route.section === "tasks" || (route.section === "devices" && !route.device);
  return <div className="space-y-4">
    <nav aria-label="Control plane sections" className="flex flex-wrap gap-2">
      {(["devices", "tasks", "approvals"] as const).map((section) => <JXButton key={section} color="neutral"
        variant={route.section === section ? "contained" : "text"} aria-current={route.section === section ? "page" : undefined}
        onClick={() => navigate({ ...route, section })}>{section.charAt(0).toUpperCase() + section.slice(1)}</JXButton>)}
    </nav>
    {storageError && <p role="status" className="text-xs text-amber-300">{storageError}</p>}
    {listVisible && <div className="flex flex-wrap items-center gap-2">
      <JXButton color="neutral" variant="text" onClick={() => { setFilters({ ...defaultFilters, status: "offline" }); navigate({ section: "devices", tab: "details" }); }}>Offline devices</JXButton>
      <JXButton color="neutral" variant="text" onClick={() => { setFilters({ ...defaultFilters, taskStatus: "failed" }); navigate({ section: "tasks", tab: "details" }); }}>Failed tasks</JXButton>
      <details className="min-w-0 text-sm">
        <summary className="cursor-pointer p-2 text-slate-300">Saved views ({views.length})</summary>
        <ul className="space-y-2 py-2">{views.map((view, index) => <li key={`${view.name}:${index}`} className="flex flex-wrap items-center gap-2">
          <button className="max-w-full break-all rounded-lg p-2 text-left text-slate-200 underline underline-offset-4" onClick={() => {
            setFilters(view.filters); navigate({ section: view.section, tab: "details" });
          }}>{view.name}</button>
          <button className="rounded-lg p-2 text-xs text-slate-400" aria-label={`Remove saved view ${view.name}`} onClick={() => setViews(views.filter((_, i) => i !== index))}>Remove</button>
        </li>)}</ul>
        {!views.length && <p className="p-2 text-xs text-slate-400">Save your current filters for quick access.</p>}
      </details>
      <JXButton color="neutral" variant="outlined" onClick={() => { setViewName(""); setSaveError(""); setSaving(true); }}>Save view</JXButton>
    </div>}
    <JXCard>
      {route.section === "devices" ? route.device ?
        selected ? <DeviceWorkspace key={selected.id} device={selected} devices={devices} tab={route.tab} canAct={canAct}
          setTab={(tab) => navigate({ ...route, tab })} back={() => navigate({ section: "devices", tab: "details" })} /> :
          <Empty title="Device not available"><p className="text-sm text-slate-400">It may have been removed or be outside your account’s scope.</p><JXButton color="neutral" onClick={() => navigate({ section: "devices", tab: "details" })}>All devices</JXButton></Empty> :
        <Inventory devices={devices} filters={filters} onFilters={setFilters} canAct={canAct} canEnroll={!stale && role === "admin"}
          openDevice={(device, tab = "details") => navigate({ section: "devices", device, tab })} refresh={refresh} /> :
        route.section === "tasks" ? <TasksPanel devices={devices} canAct={canAct} status={filters.taskStatus} onStatus={(taskStatus) => setFilters({ ...filters, taskStatus })} /> :
          <ApprovalsPanel canDecide={!stale && !stopped && role === "admin"} />}
    </JXCard>
    {saving && <GlassModal title="Save current view" onClose={() => setSaving(false)}>
      <form className="space-y-4" onSubmit={(event) => {
        event.preventDefault();
        const name = viewName.trim();
        if (!name) return;
        if (views.some((view) => view.name.toLocaleLowerCase() === name.toLocaleLowerCase())) { setSaveError("Choose a different name. This saved view already exists."); return; }
        if (views.length >= 10) { setSaveError("Remove a saved view before adding another (maximum 10)."); return; }
        if (route.section === "approvals") return;
        setViews([...views, { name, section: route.section, filters: { ...filters } }]); setSaving(false);
      }}>
        <Field label="View name"><input className={fieldClass} value={viewName} maxLength={40} required onChange={(e) => setViewName(e.target.value)} /></Field>
        <p className="text-xs text-slate-400">Saved in this browser for this account and control plane. No credentials or task results are stored.</p>
        {saveError && <p role="alert" className="text-sm text-amber-300">{saveError}</p>}
        <div className="flex justify-end gap-2"><JXButton type="button" color="neutral" variant="outlined" onClick={() => setSaving(false)}>Cancel</JXButton><JXButton type="submit" disabled={!viewName.trim()}>Save</JXButton></div>
      </form>
    </GlassModal>}
  </div>;
}
