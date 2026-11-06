const envBase = (import.meta as any).env?.VITE_API_URL || "";
const isProdOrigin =
  typeof window !== "undefined" &&
  window.location.port !== "5173" &&
  window.location.hostname !== "localhost" &&
  window.location.hostname !== "127.0.0.1";
const BASE =
  envBase || (isProdOrigin ? window.location.origin : "http://127.0.0.1:8000");
export const apiOrigin = BASE;

export function token() {
  if (typeof window === "undefined") return "";
  return sessionStorage.getItem("ai_bridge_admin_token") || localStorage.getItem("ai_bridge_admin_token") || "";
}
export function sessionToken() {
  if (typeof window === "undefined") return "";
  return sessionStorage.getItem("ai_bridge_session_token") || localStorage.getItem("ai_bridge_session_token") || "";
}

export function clearCredentials() {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem("ai_bridge_admin_token");
  sessionStorage.removeItem("ai_bridge_session_token");
  localStorage.removeItem("ai_bridge_admin_token");
  localStorage.removeItem("ai_bridge_session_token");
}

/** Consume the server's OIDC redirect once, before rendering or saving history.
 * The live view verifies this session with /api/auth/me before showing any data.
 */
export function consumeIdentityRedirect() {
  const params = new URLSearchParams(window.location.hash.slice(1));
  if (!params.has("session_token")) return false;
  const session = params.get("session_token");
  window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}#/live`);
  clearCredentials();
  if (session) {
    sessionStorage.setItem("ai_bridge_session_token", session);
    localStorage.setItem("ai_bridge_session_token", session);
  }
  return true;
}

export async function authenticate(credentials: { token: string } | { username: string; password: string }) {
  clearCredentials();
  try {
    if ("token" in credentials) {
      const response = await fetch(BASE + "/api/auth/me", {
        headers: { "X-Admin-Token": credentials.token },
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) throw new Error("Token rejected. Check your server's admin token.");
      const identity = await response.json();
      sessionStorage.setItem("ai_bridge_admin_token", credentials.token);
      localStorage.setItem("ai_bridge_admin_token", credentials.token);
      return identity;
    }
    const response = await api.login(credentials.username, credentials.password);
    sessionStorage.setItem("ai_bridge_session_token", response.session_token);
    localStorage.setItem("ai_bridge_session_token", response.session_token);
    return response;
  } catch (error) {
    clearCredentials();
    if (error instanceof TypeError || (error instanceof DOMException && error.name === "TimeoutError")) {
      throw new Error("Cannot reach the control plane. Check that the API is running and try again.");
    }
    throw error;
  }
}

export class ApiError extends Error {
  constructor(message: string, public uncertain = false, public status?: number) { super(message); }
}

async function call(path: string, method = "GET", body?: unknown, extraHeaders: Record<string, string> = {}) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  Object.assign(headers, extraHeaders);
  const st = sessionToken();
  const at = token();
  if (st) headers["X-Session-Token"] = st;
  else if (at) headers["X-Admin-Token"] = at;
  let res: Response;
  try {
    res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15000) });
  } catch {
    throw new ApiError(method === "GET" ? "Cannot reach the control plane. Try refreshing." :
      "Outcome unknown. The server may have received this request. Refresh the relevant records before submitting again.", method !== "GET");
  }
  if (!res.ok) {
    if (res.status === 401) clearCredentials();
    const detail = await res.json().catch(() => null);
    throw new ApiError(res.status === 401 ? "Your session expired. Please sign in again." :
      `${res.status}: ${typeof detail?.detail === "string" ? detail.detail : "The server could not complete this request."}`,
    method !== "GET" && res.status >= 500, res.status);
  }
  try { return await res.json(); }
  catch { throw new ApiError("Response could not be read. Refresh to check the outcome.", method !== "GET"); }
}
export const api = {
  health: () => fetch(BASE + "/health", { signal: AbortSignal.timeout(10000) }).then(r => { if (!r.ok) throw new Error("Health check failed"); return r.json(); }),
  devices: () => call("/api/devices"),
  enroll: (name: string) => call("/api/devices/enroll", "POST", { name }),
  revoke: (id: string) => call(`/api/devices/${id}/revoke`, "POST", {}),
  updateDevice: (id: string, body: { name?: string; hostname?: string; os?: string; revoked?: boolean }) =>
    call(`/api/devices/${encodeURIComponent(id)}`, "PUT", body),
  deleteDevice: (id: string) => call(`/api/devices/${encodeURIComponent(id)}`, "DELETE"),
  devicePolicy: (id: string) => call(`/api/devices/${encodeURIComponent(id)}/policy`),
  setDevicePolicy: (id: string, body: any) => call(`/api/devices/${encodeURIComponent(id)}/policy`, "PUT", body),
  resetDevicePolicy: (id: string) => call(`/api/devices/${encodeURIComponent(id)}/policy`, "DELETE"),
  deviceOverview: (id: string) => call(`/api/devices/${encodeURIComponent(id)}/overview`),
  refreshDeviceTelemetry: (id: string, tools?: string[]) =>
    call(`/api/devices/${encodeURIComponent(id)}/refresh`, "POST", { tools }),
  tasks: (deviceId?: string) => call(`/api/tasks${deviceId ? `?device_id=${encodeURIComponent(deviceId)}` : ""}`),
  taskHistory: (params: { q: string; status: string; device_id: string; tenant: string; page: number }) =>
    call(`/api/tasks/history?${new URLSearchParams(Object.entries(params).map(([key, value]) => [key, String(value)]))}`),
  taskDetail: (id: string) => call(`/api/tasks/${id}`),
  submitTask: (device_id: string, tool: string, args: any = {}, tenant?: string, requestKey = crypto.randomUUID()) =>
    call("/api/tasks", "POST", { device_id, tool, args, tenant }, { "Idempotency-Key": requestKey }),
  users: () => call("/api/auth/users"),
  createUser: (body: { username: string; password: string; role: string }) => call("/api/auth/users", "POST", body),
  updateUser: (username: string, body: { role: string; disabled: boolean }) =>
    call(`/api/auth/users/${encodeURIComponent(username)}`, "PATCH", body),
  deviceMetadata: (id: string, body: { group: string; tags: string[] }) =>
    call(`/api/devices/${encodeURIComponent(id)}/metadata`, "PUT", body),
  notifications: () => call("/api/fleet/notifications"),
  cancelTask: (id: string) => call(`/api/tasks/${id}/cancel`, "POST", {}),
  updateTask: (id: string, body: { tool?: string; args?: any; status?: string }) =>
    call(`/api/tasks/${encodeURIComponent(id)}`, "PUT", body),
  deleteTask: (id: string) => call(`/api/tasks/${encodeURIComponent(id)}`, "DELETE"),
  clearTasks: (status?: string) =>
    call(`/api/tasks${status && status !== "all" ? `?status=${encodeURIComponent(status)}` : ""}`, "DELETE"),
  approvals: () => call("/api/approvals"),
  decide: (id: string, decision: string, reason = "") => call(`/api/approvals/${encodeURIComponent(id)}/decide`, "POST", { decision, reason }),
  deleteApproval: (id: string) => call(`/api/approvals/${encodeURIComponent(id)}`, "DELETE"),
  audit: () => call("/api/audit"),
  exportAudit: () => call("/api/audit/export"),
  emergencyStop: () => call("/api/emergency-stop", "POST", {}),
  emergencyClear: () => call("/api/emergency-stop/clear", "POST", {}),
  login: (username: string, password: string) => fetch(BASE + "/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password }), signal: AbortSignal.timeout(15000) }).then(async r => { if (!r.ok) throw new Error("Username or password rejected."); return r.json(); }),
  logout: () => call("/api/auth/logout", "POST", {}),
  policies: () => call("/api/policies"),
  policyHistory: () => call("/api/policies/history"),
  simulatePolicy: (p: { allow_tier3: boolean; desktop_enabled: boolean; allowed_apps: string[]; allowed_services: string[]; note?: string }) =>
    call("/api/policies/simulate", "POST", p),
  updatePolicyVersion: (version: number, p: { allow_tier3: boolean; desktop_enabled: boolean; allowed_apps: string[]; allowed_services: string[]; note?: string }) =>
    call(`/api/policies/${version}`, "PUT", p),
  deletePolicyVersion: (version: number) => call(`/api/policies/${version}`, "DELETE"),
  connections: () => call("/api/connections"),
  updateOAuthClient: (client_id: string, body: { client_name?: string; redirect_uris?: string }) =>
    call(`/api/connections/clients/${encodeURIComponent(client_id)}`, "PUT", body),
  deleteOAuthClient: (client_id: string) =>
    call(`/api/connections/clients/${encodeURIComponent(client_id)}`, "DELETE"),
  logs: (service: string, lines: number) => call(`/api/logs?service=${service}&lines=${lines}`),
  createPolicy: (p: { allow_tier3: boolean; desktop_enabled: boolean; allowed_apps: string[]; allowed_services: string[]; note?: string }) =>
    call("/api/policies", "POST", {
      allow_tier3: p.allow_tier3,
      desktop_enabled: p.desktop_enabled,
      allowed_apps: p.allowed_apps,
      allowed_services: p.allowed_services,
      note: p.note || "Set from dashboard",
    }),
  getWebhook: () => call("/api/settings/webhook"),
  setWebhook: (webhook_url: string) => call("/api/settings/webhook", "POST", { webhook_url }),
  testWebhook: () => call("/api/settings/webhook/test", "POST", {}),
  oidcConfigured: () => fetch(BASE + "/api/auth/oidc/configured", { signal: AbortSignal.timeout(10000) }).then(r => { if (!r.ok) throw new Error("Identity provider unavailable"); return r.json(); }),
  me: () => call("/api/auth/me"),
  oidcLogin: () => { window.location.href = BASE + "/api/auth/oidc/login"; },
  aiTools: (format = "raw", device?: string) =>
    call(`/api/ai/tools?format=${encodeURIComponent(format)}${device ? `&device=${encodeURIComponent(device)}` : ""}`),
  aiExecute: (body: { tool: string; device?: string; args?: any; timeout?: number }) =>
    call("/api/ai/execute", "POST", body),
  aiAgent: (body: { prompt: string; device?: string; provider?: string; model?: string; api_key?: string; base_url?: string }) =>
    call("/api/ai/agent", "POST", body),
  aiFleet: () => call("/api/ai/devices"),
  getAiSettings: () => call("/api/settings/ai"),
  saveAiSettings: (body: { provider: string; model?: string; api_key?: string; base_url?: string; test_connection?: boolean; clear?: boolean }) =>
    call("/api/settings/ai", "POST", body),
  aiChat: (body: { messages: any[]; provider?: string; model?: string; api_key?: string; base_url?: string; device?: string }) =>
    call("/api/ai/chat", "POST", body),
  workflowTemplates: () => call("/api/workflows/templates"),
  workflows: (status?: string) => call(`/api/workflows${status ? `?status=${encodeURIComponent(status)}` : ""}`),
  workflowDetail: (id: string) => call(`/api/workflows/${encodeURIComponent(id)}`),
  submitWorkflow: (body: { name: string; device_id?: string; steps: any[]; stop_on_failure?: boolean; max_retries?: number }) =>
    call("/api/workflows", "POST", body),
  cancelWorkflow: (id: string) => call(`/api/workflows/${encodeURIComponent(id)}/cancel`, "POST", {}),
  streamWorkflowUrl: (id: string) => `${BASE}/api/workflows/${encodeURIComponent(id)}/stream`,
  fleetTelemetry: () => call("/api/fleet/telemetry"),
  deviceTelemetry: (id: string, limit = 50) => call(`/api/devices/${encodeURIComponent(id)}/telemetry?limit=${limit}`),
  fleetBroadcast: (body: { tool: string; args?: any; target_os?: string; target_device_ids?: string[] }) =>
    call("/api/fleet/broadcast", "POST", body),
  broadcastStatus: (batch_id: string) => call(`/api/fleet/broadcast/${encodeURIComponent(batch_id)}`),
  triggers: () => call("/api/triggers"),
  createTrigger: (body: any) => call("/api/triggers", "POST", body),
  deleteTrigger: (id: string) => call(`/api/triggers/${encodeURIComponent(id)}`, "DELETE"),
  toggleTrigger: (id: string) => call(`/api/triggers/${encodeURIComponent(id)}/toggle`, "POST", {}),
  testTrigger: (id: string) => call(`/api/triggers/${encodeURIComponent(id)}/test`, "POST", {}),
  schedules: () => call("/api/schedules"),
  createSchedule: (body: any) => call("/api/schedules", "POST", body),
  deleteSchedule: (id: string) => call(`/api/schedules/${encodeURIComponent(id)}`, "DELETE"),
  runScheduleNow: (id: string) => call(`/api/schedules/${encodeURIComponent(id)}/run-now`, "POST", {}),
  desktopFrame: (deviceId: string, scale = 0.75, quality = 70) =>
    call(`/api/devices/${encodeURIComponent(deviceId)}/desktop/frame?scale=${scale}&quality=${quality}`),
  fleetDesktopFrames: (os?: string) =>
    call(`/api/fleet/desktop/frames${os ? `?os=${encodeURIComponent(os)}` : ""}`),
  deviceMonitors: (deviceId: string) =>
    call(`/api/devices/${encodeURIComponent(deviceId)}/desktop/monitors`),
  createWebrtcSession: (deviceId: string, scale = 0.75, fps = 10, monitor_index?: number) =>
    call(`/api/devices/${encodeURIComponent(deviceId)}/desktop/webrtc/session`, "POST", { scale, fps, monitor_index }),
  createTerminalSession: (deviceId: string, cols = 120, rows = 35) =>
    call(`/api/devices/${encodeURIComponent(deviceId)}/terminal/sessions`, "POST", { cols, rows }),
  listTerminalSessions: (deviceId?: string) =>
    call(`/api/devices/${encodeURIComponent(deviceId || "local")}/terminal/sessions`),
  writeTerminalInput: (deviceId: string, sessionId: string, input: string) =>
    call(`/api/devices/${encodeURIComponent(deviceId)}/terminal/${encodeURIComponent(sessionId)}/input`, "POST", { input }),
  closeTerminalSession: (deviceId: string, sessionId: string) =>
    call(`/api/devices/${encodeURIComponent(deviceId)}/terminal/${encodeURIComponent(sessionId)}`, "DELETE"),
  terminalStreamUrl: (deviceId: string, sessionId: string, sinceSeq = 0) => {
    const st = sessionToken();
    const at = token();
    const authQuery = st ? `&session_token=${encodeURIComponent(st)}` : at ? `&token=${encodeURIComponent(at)}` : "";
    return `${BASE}/api/devices/${encodeURIComponent(deviceId)}/terminal/${encodeURIComponent(sessionId)}/stream?since_seq=${sinceSeq}${authQuery}`;
  },
  streamTerminalUrl: (deviceId: string, sessionId: string, sinceSeq = 0) => {
    const st = sessionToken();
    const at = token();
    const authQuery = st ? `&session_token=${encodeURIComponent(st)}` : at ? `&token=${encodeURIComponent(at)}` : "";
    return `${BASE}/api/devices/${encodeURIComponent(deviceId)}/terminal/${encodeURIComponent(sessionId)}/stream?since_seq=${sinceSeq}${authQuery}`;
  },
  
  getWebrtcSession: (deviceId: string, sessionId: string) =>
    call(`/api/devices/${encodeURIComponent(deviceId)}/desktop/webrtc/${encodeURIComponent(sessionId)}`),
  postWebrtcAnswer: (deviceId: string, sessionId: string, answer: any) =>
    call(`/api/devices/${encodeURIComponent(deviceId)}/desktop/webrtc/${encodeURIComponent(sessionId)}/answer`, "POST", answer),
  postWebrtcCandidate: (deviceId: string, sessionId: string, candidate: any) =>
    call(`/api/devices/${encodeURIComponent(deviceId)}/desktop/webrtc/${encodeURIComponent(sessionId)}/candidates`, "POST", { candidate }),
  endWebrtcSession: (deviceId: string, sessionId: string) =>
    call(`/api/devices/${encodeURIComponent(deviceId)}/desktop/webrtc/${encodeURIComponent(sessionId)}`, "DELETE"),
  createSessionV1: (body: {
    device_id?: string;
    mode?: "view_only" | "human_control" | "ai_assisted";
    fps?: number;
    scale?: number;
    monitor_index?: number;
  }) => call("/api/v1/sessions", "POST", body),
  getSessionV1: (sessionId: string) =>
    call(`/api/v1/sessions/${encodeURIComponent(sessionId)}`),
  setSessionModeV1: (
    sessionId: string,
    mode: "view_only" | "human_control" | "ai_assisted",
    human_takeover?: boolean
  ) => call(`/api/v1/sessions/${encodeURIComponent(sessionId)}/mode`, "POST", { mode, human_takeover }),
  terminateSessionV1: (sessionId: string) =>
    call(`/api/v1/sessions/${encodeURIComponent(sessionId)}/terminate`, "POST", {}),
  postAnswerV1: (sessionId: string, sdp: string, type = "answer") =>
    call(`/api/v1/sessions/${encodeURIComponent(sessionId)}/answer`, "POST", { sdp, type }),
  postIceV1: (sessionId: string, candidate: any) =>
    call(`/api/v1/sessions/${encodeURIComponent(sessionId)}/ice`, "POST", { candidate }),
  sessionWebSocketUrl: (sessionId: string) => {
    const wsBase = BASE.replace(/^http/, "ws");
    return `${wsBase}/api/v1/ws/sessions/${encodeURIComponent(sessionId)}`;
  },
  getDeviceMonitorsV1: (deviceId: string) =>
    call(`/api/v1/devices/${encodeURIComponent(deviceId)}/monitors`),
  getDeviceUiElementsV1: (deviceId: string) =>
    call(`/api/v1/devices/${encodeURIComponent(deviceId)}/ui-elements`),
  listDeviceFilesV1: (deviceId: string) =>
    call(`/api/v1/devices/${encodeURIComponent(deviceId)}/files`),
  uploadDeviceFileV1: (deviceId: string, filename: string, contentB64: string, sha256?: string, targetDir?: string) =>
    call(`/api/v1/devices/${encodeURIComponent(deviceId)}/files/upload`, "POST", {
      filename,
      content_b64: contentB64,
      sha256,
      target_dir: targetDir,
    }),
  downloadDeviceFileV1: (deviceId: string, path: string) =>
    call(`/api/v1/devices/${encodeURIComponent(deviceId)}/files/download?path=${encodeURIComponent(path)}`),
  updateSessionQualityV1: (
    sessionId: string,
    quality: { bitrate_kbps?: number; fps?: number; monitor_index?: number }
  ) => call(`/api/v1/sessions/${encodeURIComponent(sessionId)}/quality`, "PATCH", quality),
  syncSessionClipboardV1: (sessionId: string, action: "get" | "set", text?: string) =>
    call(`/api/v1/sessions/${encodeURIComponent(sessionId)}/clipboard`, "POST", { action, text }),
  sendDesktopInput: (deviceId: string, body: any) =>
    call(`/api/devices/${encodeURIComponent(deviceId)}/desktop/input`, "POST", body),
  fleetVersion: () => call("/api/fleet/version"),
  updateFleet: (targetOs?: string) =>
    call(`/api/fleet/update${targetOs ? `?target_os=${encodeURIComponent(targetOs)}` : ""}`, "POST", {}),
  updateDeviceAgent: (deviceId: string) =>
    call(`/api/devices/${encodeURIComponent(deviceId)}/update`, "POST", {}),
  resizeTerminal: (deviceId: string, sessionId: string, cols: number, rows: number) =>
    call(`/api/devices/${encodeURIComponent(deviceId)}/terminal/${encodeURIComponent(sessionId)}/resize`, "POST", { cols, rows }),
};

