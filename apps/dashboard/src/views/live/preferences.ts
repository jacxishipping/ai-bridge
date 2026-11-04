import { useEffect, useState } from "react";
import { apiOrigin } from "../../api";
import { taskStates } from "./shared";

export interface Filters { query: string; status: string; sort: string; taskStatus: string }
export interface SavedView { name: string; section: "devices" | "tasks"; filters: Filters }
export const defaultFilters: Filters = { query: "", status: "all", sort: "name", taskStatus: "all" };
const statuses = ["all", "online", "offline", "revoked", "unknown"];
export function sanitizeFilters(input: unknown): Filters {
  const value = (input && typeof input === "object" ? input : {}) as Partial<Filters>;
  return {
    query: typeof value.query === "string" ? value.query.slice(0, 200) : "",
    status: statuses.includes(value.status || "") ? value.status! : "all",
    sort: ["name", "last_seen"].includes(value.sort || "") ? value.sort! : "name",
    taskStatus: taskStates.includes(value.taskStatus || "") ? value.taskStatus! : "all",
  };
}
export function usePreferences(identity: string) {
  const key = `ai_bridge_views:v1:${apiOrigin}:${identity}`;
  const [initial] = useState(() => {
    try {
      const parsed = JSON.parse(localStorage.getItem(key) || "{}");
      const views: SavedView[] = Array.isArray(parsed?.views) ? parsed.views.filter((view: any) =>
        typeof view?.name === "string" && view.name.trim() && ["devices", "tasks"].includes(view.section)).slice(0, 10)
        .map((view: any) => ({ name: view.name.slice(0, 40), section: view.section, filters: sanitizeFilters(view.filters) })) : [];
      return { filters: sanitizeFilters(parsed?.filters), views };
    } catch { return { filters: defaultFilters, views: [] }; }
  });
  const [filters, setFilters] = useState(initial.filters);
  const [views, setViews] = useState(initial.views);
  const [storageError, setStorageError] = useState("");
  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify({ filters, views })); setStorageError(""); }
    catch { setStorageError("Browser storage is unavailable. Filters and saved views will not survive a reload."); }
  }, [key, filters, views]);
  return { filters, setFilters, views, setViews, storageError };
}
