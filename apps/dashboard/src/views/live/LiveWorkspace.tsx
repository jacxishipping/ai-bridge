import React, { useEffect, useState } from "react";
import { Bell, FileText, Layers3, Plug, ScrollText, Server, ShieldCheck, SlidersHorizontal, Users } from "lucide-react";
import { GlassModal, JXButton, JXCard } from "../../ui";
import { ApprovalsPanel } from "./ApprovalsPanel";
import { DeviceWorkspace } from "./DeviceWorkspace";
import { Inventory } from "./Inventory";
import { defaultFilters, usePreferences } from "./preferences";
import { Empty, Field, fieldClass, LiveDevice } from "./shared";
import { TasksPanel } from "./TasksPanel";
import { AccountsPanel } from "./AccountsPanel";
import { AuditPanel, ConnectionsPanel, LogsPanel, PoliciesPanel } from "./ManagementPanels";
import { NotificationsPanel } from "./NotificationsPanel";
import { useLanguage, type Message } from "../../i18n";

const sections = ["devices", "tasks", "approvals", "notifications", "audit", "policies", "connections", "logs", "users"] as const;
type Section = typeof sections[number];
const sectionLabels: Record<Section, Message> = {
  devices: "Devices", tasks: "Tasks", approvals: "Approvals", notifications: "Notifications",
  audit: "Audit", policies: "Policies", connections: "Connections", logs: "Logs", users: "Users",
};
interface Route { section: Section; device?: string; tab: string }
function readWorkspaceRoute(): Route {
  const params = new URLSearchParams(window.location.hash.split("?")[1] || "");
  const section = params.get("section");
  const tab = params.get("tab") || "details";
  return { section: sections.includes(section as Section) ? section as Section : "devices", device: params.get("device") || undefined,
    tab: ["details", "tasks", "terminal", "desktop"].includes(tab) ? tab : "details" };
}

export function LiveWorkspace({ devices, identity, role, stale, stopped, refresh }:
  { devices: LiveDevice[]; identity: string; role: string; stale: boolean; stopped: boolean; refresh: () => void }) {
  const { t, number } = useLanguage();
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
    const params = new URLSearchParams(window.location.hash.split("?")[1] || "");
    params.delete("section"); params.delete("device"); params.delete("tab");
    if (next.section !== "devices") params.set("section", next.section);
    if (next.device) { params.set("device", next.device); params.set("tab", next.tab); }
    const hash = `#/live${params.size ? `?${params}` : ""}`;
    if (hash !== window.location.hash) window.history.pushState(null, "", hash);
    setRoute(next);
  };
  const selected = devices.find((device) => device.id === route.device);
  const canAct = !stale && !stopped && ["admin", "operator"].includes(role);
  const listVisible = route.section === "tasks" || (route.section === "devices" && !route.device);
  return <div className="workspace-layout">
    <nav aria-label={t("Workspace")} className="workspace-navigation">
      <p className="workspace-navigation-label product-kicker">{t("Workspace")}</p>
      {sections.slice(0, 3).map((section) => {
        const Icon = { devices: Server, tasks: Layers3, approvals: ShieldCheck }[section as "devices" | "tasks" | "approvals"];
        return <button key={section} className="product-nav-link" aria-current={route.section === section ? "page" : undefined}
          onClick={() => navigate({ ...route, section })}>
          <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
          {t(sectionLabels[section])}
        </button>;
      })}
      <div className="workspace-management-links">
        {sections.slice(3).map(section => {
          const Icon = { notifications: Bell, audit: ScrollText, policies: SlidersHorizontal, connections: Plug, logs: FileText, users: Users }[section as "notifications" | "audit" | "policies" | "connections" | "logs" | "users"];
          return <button key={section} className="product-nav-link" aria-current={route.section === section ? "page" : undefined} onClick={() => navigate({ ...route, section })}>
            <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />{t(sectionLabels[section])}
          </button>;
        })}
      </div>
      <select aria-label={t("Management & notifications")} className="product-input workspace-management-select w-full border text-sm" value={sections.indexOf(route.section) >= 3 ? route.section : ""}
        onChange={event => { if (event.target.value) navigate({ ...route, section: event.target.value as Section }); }}>
        <option value="">{t("Management & notifications")}</option>
        {sections.slice(3).map(section => <option key={section} value={section}>{t(sectionLabels[section])}</option>)}
      </select>
    </nav>
    <div className="min-w-0 space-y-3">
    {(route.section !== "devices" || !route.device) && <div className="flex items-center gap-3">
      <h2 className="text-base font-semibold tracking-tight">{t(sectionLabels[route.section])}</h2>
      {route.section === "devices" && <span lang="en" dir="ltr" className="text-xs tabular-nums text-slate-400">{number(devices.length)} total</span>}
    </div>}
    {storageError && <p role="status" lang="en" dir="ltr" className="text-xs text-amber-300">{storageError}</p>}
    {listVisible && <div lang="en" dir="ltr" className="flex flex-wrap items-center gap-2 border-b border-slate-800 pb-2">
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
      <div lang="en" dir="ltr">
      {route.section === "devices" ? route.device ?
        selected ? <DeviceWorkspace key={selected.id} device={selected} devices={devices} tab={route.tab} canAct={canAct} admin={!stale && role === "admin"} refreshFleet={refresh}
          setTab={(tab) => navigate({ ...route, tab })} back={() => navigate({ section: "devices", tab: "details" })} /> :
          <Empty title="Device not available"><p className="text-sm text-slate-400">It may have been removed or be outside your account’s scope.</p><JXButton color="neutral" onClick={() => navigate({ section: "devices", tab: "details" })}>All devices</JXButton></Empty> :
        <Inventory devices={devices} filters={filters} onFilters={setFilters} canAct={canAct} canEnroll={!stale && role === "admin"}
          openDevice={(device, tab = "details") => navigate({ section: "devices", device, tab })} refresh={refresh} /> :
        route.section === "tasks" ? <TasksPanel devices={devices} canAct={canAct} status={filters.taskStatus} onStatus={(taskStatus) => setFilters({ ...filters, taskStatus })} /> :
        route.section === "approvals" ? <ApprovalsPanel canDecide={!stale && !stopped && role === "admin"} /> :
        route.section === "audit" ? <AuditPanel admin={role === "admin"} /> :
        route.section === "policies" ? <PoliciesPanel admin={!stale && role === "admin"} /> :
        route.section === "connections" ? <ConnectionsPanel admin={!stale && role === "admin"} /> :
        route.section === "logs" ? <LogsPanel admin={role === "admin"} /> :
        route.section === "users" ? <AccountsPanel admin={!stale && role === "admin"} /> :
        <NotificationsPanel open={(section, filter) => {
          if (section === "devices") setFilters({ ...defaultFilters, status: filter || "all" });
          if (section === "tasks") setFilters({ ...defaultFilters, taskStatus: filter || "all" });
          navigate({ section, tab: "details" });
        }} />}
      </div>
    </JXCard>
    </div>
    {saving && <div lang="en" dir="ltr"><GlassModal title="Save current view" onClose={() => setSaving(false)}>
      <form className="space-y-4" onSubmit={(event) => {
        event.preventDefault();
        const name = viewName.trim();
        if (!name) return;
        if (views.some((view) => view.name.toLocaleLowerCase() === name.toLocaleLowerCase())) { setSaveError("Choose a different name. This saved view already exists."); return; }
        if (views.length >= 10) { setSaveError("Remove a saved view before adding another (maximum 10)."); return; }
        if (route.section !== "devices" && route.section !== "tasks") return;
        setViews([...views, { name, section: route.section, filters: { ...filters } }]); setSaving(false);
      }}>
        <Field label="View name"><input className={fieldClass} value={viewName} maxLength={40} required onChange={(e) => setViewName(e.target.value)} /></Field>
        <p className="text-xs text-slate-400">Saved in this browser for this account and control plane. No credentials or task results are stored.</p>
        {saveError && <p role="alert" className="text-sm text-amber-300">{saveError}</p>}
        <div className="flex justify-end gap-2"><JXButton type="button" color="neutral" variant="outlined" onClick={() => setSaving(false)}>Cancel</JXButton><JXButton type="submit" disabled={!viewName.trim()}>Save</JXButton></div>
      </form>
    </GlassModal></div>}
  </div>;
}
