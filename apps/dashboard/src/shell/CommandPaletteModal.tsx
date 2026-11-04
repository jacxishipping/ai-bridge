import React, { useEffect, useId, useMemo, useState } from "react";
import { Search, Server, LogIn } from "lucide-react";
import { GlassModal, JXTextField } from "../ui";
import { useDashboardStore } from "../state/dashboardStore";
import { navigationItems } from "./navigation";

export const CommandPaletteModal: React.FC = () => {
  const open = useDashboardStore((s) => s.commandPaletteOpen);
  const setOpen = useDashboardStore((s) => s.setCommandPaletteOpen);
  const navigate = useDashboardStore((s) => s.setCurrentView);
  const devices = useDashboardStore((s) => s.devices);
  const selectDevice = useDashboardStore((s) => s.setSelectedDeviceId);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listId = useId();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen(!open);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, setOpen]);
  useEffect(() => { if (open) { setQuery(""); setActive(0); } }, [open]);

  const items = useMemo(() => [
    ...navigationItems.map((item) => ({
      id: item.id, label: item.label, detail: "", icon: item.icon, select: () => navigate(item.id),
    })),
    { id: "login", label: "Connect to server", detail: "", icon: LogIn, select: () => navigate("login") },
    ...devices.map((device) => ({
      id: device.id, label: device.hostname, detail: device.name, icon: Server,
      select: () => { selectDevice(device.id); navigate("device-360-system"); },
    })),
  ], [devices, navigate, selectDevice]);
  const results = items.filter((item) => `${item.label} ${item.detail}`.toLowerCase().includes(query.toLowerCase().trim())).slice(0, 30);
  const select = (index: number) => { results[index]?.select(); setOpen(false); };
  useEffect(() => {
    if (open) document.getElementById(`${listId}-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [open, active, listId]);
  if (!open) return null;

  return <GlassModal title="Search" onClose={() => setOpen(false)}>
    <div className="space-y-4">
      <JXTextField value={query} onChange={(value) => { setQuery(value); setActive(0); }}
        role="combobox" aria-label="Search pages and devices" aria-expanded="true" aria-autocomplete="list"
        aria-controls={listId} aria-activedescendant={results.length ? `${listId}-${active}` : undefined}
        placeholder="Pages or devices…" startIcon={<Search className="h-4 w-4" />} clearable
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setActive((index) => results.length ? (index + (event.key === "ArrowDown" ? 1 : -1) + results.length) % results.length : 0);
          } else if (event.key === "Enter") { event.preventDefault(); select(active); }
        }} />
      <div id={listId} role="listbox" aria-label="Search results" className="max-h-[45dvh] overflow-y-auto">
        {results.map((item, index) => {
          const Icon = item.icon;
          return <button key={item.id} id={`${listId}-${index}`} type="button" role="option"
            aria-selected={index === active} tabIndex={-1} onClick={() => select(index)}
            className={`flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm ${index === active ? "bg-slate-800 text-white" : "text-slate-400 hover:bg-slate-800/50"}`}>
            <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="min-w-0 break-all">{item.label}</span>
          </button>;
        })}
      </div>
      {results.length === 0 && <p role="status" className="py-6 text-center text-sm text-slate-400">No results.</p>}
    </div>
  </GlassModal>;
};
