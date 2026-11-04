import type { ViewId } from "../types/dashboard";

export const viewIds: ViewId[] = [
  "login", "live", "overview", "devices", "device-360-system",
  "task-queue-and-vision", "live-desktop-studio", "interactive-terminal",
  "autonomous-workflows", "fleet-operations", "ai-api-and-agents",
  "human-approvals", "security-policies", "audit-trail", "mcp-and-oauth",
  "diagnostics-and-logs",
];

export function readRoute(): { view: ViewId; device?: string } {
  if (typeof window === "undefined") return { view: "login" };
  const [path, query] = window.location.hash.replace(/^#\/?/, "").split("?");
  return {
    view: viewIds.includes(path as ViewId) ? path as ViewId : "login",
    device: new URLSearchParams(query).get("device") || undefined,
  };
}

export function writeRoute(view: ViewId, device?: string) {
  if (typeof window === "undefined") return;
  const next = `#/${view}${device ? `?device=${encodeURIComponent(device)}` : ""}`;
  if (window.location.hash !== next) window.history.pushState(null, "", next);
}
