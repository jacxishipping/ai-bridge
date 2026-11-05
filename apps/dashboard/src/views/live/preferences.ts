import { useEffect, useState } from "react";
import { apiOrigin } from "../../api";
import { taskStates } from "./shared";

export interface Filters { query: string; status: string; sort: string; taskStatus: string; group?: string; tag?: string }
export interface SavedView { name: string; section: "devices" | "tasks"; filters: Filters }
export const defaultFilters: Filters = { query: "", status: "all", sort: "name", taskStatus: "all" };
const statuses = ["all", "online", "offline", "attention", "revoked", "unknown"];
export function sanitizeFilters(input: unknown): Filters {
  const value = (input && typeof input === "object" ? input : {}) as Partial<Filters>;
  return {
    query: typeof value.query === "string" ? value.query.slice(0, 200) : "",
    status: statuses.includes(value.status || "") ? value.status! : "all",
    sort: ["name", "last_seen"].includes(value.sort || "") ? value.sort! : "name",
    taskStatus: taskStates.includes(value.taskStatus || "") ? value.taskStatus! : "all",
    group: typeof value.group === "string" ? value.group.slice(0, 60) : "",
    tag: typeof value.tag === "string" ? value.tag.slice(0, 40) : "",
  };
}
export function usePreferences(identity: string) {
  const key = `ai_bridge_views:v1:${apiOrigin}:${identity}`;
  const [initial] = useState(() => {
    const params = new URLSearchParams(window.location.hash.split("?")[1] || "");
    const shared = params.get("filters") === "1" ? sanitizeFilters(Object.fromEntries(params)) : undefined;
    try {
      const parsed = JSON.parse(localStorage.getItem(key) || "{}");
      const views: SavedView[] = Array.isArray(parsed?.views) ? parsed.views.filter((view: any) =>
        typeof view?.name === "string" && view.name.trim() && ["devices", "tasks"].includes(view.section)).slice(0, 10)
        .map((view: any) => ({ name: view.name.slice(0, 40), section: view.section, filters: sanitizeFilters(view.filters) })) : [];
      return { filters: shared || sanitizeFilters(parsed?.filters), views };
    } catch { return { filters: shared || defaultFilters, views: [] }; }
  });
  const [filters, setFilters] = useState(initial.filters);
  const [views, setViews] = useState(initial.views);
  const [storageError, setStorageError] = useState("");
  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify({ filters, views })); setStorageError(""); }
    catch { setStorageError("Browser storage is unavailable. Filters and saved views will not survive a reload."); }
  }, [key, filters, views]);
  useEffect(() => {
    const sync = () => {
      const params = new URLSearchParams(window.location.hash.split("?")[1] || "");
      if (params.get("filters") === "1") setFilters(sanitizeFilters(Object.fromEntries(params)));
    };
    window.addEventListener("popstate", sync); window.addEventListener("hashchange", sync);
    return () => { window.removeEventListener("popstate", sync); window.removeEventListener("hashchange", sync); };
  }, []);
  useEffect(() => {
    const [route] = window.location.hash.split("?");
    const params = new URLSearchParams(window.location.hash.split("?")[1] || "");
    const active = Object.entries(filters).some(([name, value]) => value && value !== defaultFilters[name as keyof Filters]);
    if (!active && !params.has("filters")) return;
    params.set("filters", "1");
    for (const [name, value] of Object.entries(filters)) {
      if (value) params.set(name, value); else params.delete(name);
    }
    window.history.replaceState(null, "", `${route}?${params}`);
  }, [filters]);
  return { filters, setFilters, views, setViews, storageError };
}
