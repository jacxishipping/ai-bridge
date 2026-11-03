import React, { useState } from "react";
import {
  JXCard,
  JXButton,
  JXTextField,
  JXSelect,
  JXCheckbox,
  LiquidButton,
} from "@jacxishippingorg/jx-ui-react";

interface ConnectionsHubProps {
  connections?: any;
  health?: any;
  origin?: string;
  onUpdateOAuthClient?: (clientId: string, body: { client_name?: string; redirect_uris?: string }) => Promise<any>;
  onDeleteOAuthClient?: (clientId: string) => Promise<any>;
  onRefresh?: () => void;
  onNotice?: (notice: { intent: "success" | "warning" | "error" | "info"; text: string }) => void;
}

interface ClientSession {
  id: string;
  name: string;
  version: string;
  pid: number;
  route: string;
  duration: string;
  invocations: number;
  errorRate: string;
  features: string[];
}

export const ConnectionsHub: React.FC<ConnectionsHubProps> = ({
  connections,
  health,
  origin = typeof window !== "undefined" ? window.location.origin : "http://localhost:8000",
  onUpdateOAuthClient,
  onDeleteOAuthClient,
  onRefresh,
  onNotice,
}) => {
  // Modal / drawer states
  const [issueModalOpen, setIssueModalOpen] = useState(false);
  const [newClientName, setNewClientName] = useState("");
  const [newRedirectUri, setNewRedirectUri] = useState("https://chatgpt.com/api/auth/callback");

  const [editClient, setEditClient] = useState<any>(null);
  const [inspectScopes, setInspectScopes] = useState<string | null>(null);
  const [inspectSpecStream, setInspectSpecStream] = useState<string | null>(null);

  // Quick Token Generator state
  const [tokenClient, setTokenClient] = useState("ai-agent-fleet-prod-09");
  const [selectedScopes, setSelectedScopes] = useState<string[]>([
    "fleet:read",
    "fleet:execute:tier2",
    "mcp:stream",
  ]);
  const [tokenLifetime, setTokenLifetime] = useState("24h");
  const [generatedToken, setGeneratedToken] = useState<string | null>(null);
  const [copiedToken, setCopiedToken] = useState(false);

  // Secret rotation simulation state
  const [isRotatingSecret, setIsRotatingSecret] = useState(false);

  // Terminated sessions tracking
  const [terminatedSessions, setTerminatedSessions] = useState<string[]>([]);

  // Default active sessions
  const activeSessions: ClientSession[] = [
    {
      id: "sess_cursor_4912",
      name: "Cursor IDE",
      version: "v0.42.1 (Desktop Extension)",
      pid: 4912,
      route: "10.240.12.8:58420",
      duration: "4h 12m",
      invocations: 1420,
      errorRate: "0.1% err",
      features: ["resources/read", "tools/call"],
    },
    {
      id: "sess_claude_8931",
      name: "Claude Desktop App",
      version: "v0.8.2 (Official Client)",
      pid: 8931,
      route: "10.240.14.99:51104",
      duration: "1h 45m",
      invocations: 482,
      errorRate: "0 err",
      features: ["prompts/get", "tools/call"],
    },
    {
      id: "sess_autoheal_ipc",
      name: "Auto-Heal Daemon v2",
      version: "Internal Enclave Service",
      pid: 1042,
      route: "unix:/run/mcp/heal.sock",
      duration: "18d 04h",
      invocations: 41209,
      errorRate: "0 err",
      features: ["system/remediate", "telemetry/*"],
    },
    {
      id: "sess_python_11204",
      name: "Local Python SDK Client",
      version: "v2.1.0-alpha (stdio bridge)",
      pid: 11204,
      route: "127.0.0.1:40992",
      duration: "0h 24m",
      invocations: 89,
      errorRate: "0 err",
      features: ["tools/call", "roots/list"],
    },
  ];

  // Endpoints specifications
  const streamEndpoints = [
    {
      path: "/mcp/v1/fleet-desktop",
      title: "Desktop Vision & Kinematic Input Bridge",
      latency: "6ms",
      transport: "Streamable SSE",
      clients: "Claude Desktop, Cursor",
      primitives: ["screen_capture", "click_coordinate", "type_keys", "+2 aux"],
      throughput: "840 req/min",
    },
    {
      path: "/mcp/v1/host-terminal",
      title: "Sandboxed PTY Shell & Pipeline Execution",
      latency: "14ms",
      transport: "mTLS SSE (Encrypted)",
      clients: "Agent Orchestrator daemon",
      primitives: ["pty_exec", "tail_logs", "spawn_process"],
      throughput: "312 req/min",
    },
    {
      path: "/mcp/v1/system-telemetry",
      title: "Host Hardware State & IPC Sensor Streams",
      latency: "4ms",
      transport: "Streamable SSE",
      clients: "Auto-Heal Engine v2",
      primitives: ["query_processes", "get_hardware_metrics", "thermal_poll"],
      throughput: "1,940 req/min",
    },
    {
      path: "/mcp/v1/filesystem-sandbox",
      title: "Isolated Ephemeral Workspace Patching",
      latency: "9ms",
      transport: "Enclave Stream (Kernel)",
      clients: "Cursor IDE, Python SDK",
      primitives: ["read_workspace", "apply_diff", "atomic_write"],
      throughput: "620 req/min",
    },
  ];

  const registeredClients = connections?.chatgpt?.clients || [
    {
      client_id: "ai-agent-fleet-prod-09",
      client_id_prefix: "ai-agent-fleet",
      client_name: "Fleet Production Agent (Claude 3.5)",
      redirect_uris: "https://chatgpt.com/api/auth/callback, cursor://ai-bridge/auth",
      created_at: "2025-02-10T14:02:00Z",
    },
    {
      client_id: "secops-triage-operator",
      client_id_prefix: "secops-triage",
      client_name: "SecOps Triage Bot (Operator Sarah)",
      redirect_uris: "https://auth.internal.ai/callback",
      created_at: "2025-01-22T09:15:00Z",
    },
  ];

  const toggleScope = (scope: string) => {
    setSelectedScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope]
    );
  };

  const handleGenerateToken = () => {
    const mockToken =
      "mcp_eyJhGciOiJFUzI1NiIsI" +
      Math.random().toString(36).slice(2, 10) +
      "." +
      Math.random().toString(36).slice(2, 18) +
      "." +
      tokenClient.slice(0, 8);
    setGeneratedToken(mockToken);
    setCopiedToken(false);
    if (onNotice) {
      onNotice({
        intent: "success",
        text: `Issued temporary OAuth 2.1 Bearer Token for ${tokenClient} (${tokenLifetime})`,
      });
    }
  };

  const handleRotateSecret = async () => {
    setIsRotatingSecret(true);
    await new Promise((res) => setTimeout(res, 850));
    setIsRotatingSecret(false);
    if (onNotice) {
      onNotice({
        intent: "warning",
        text: "Gateway Secret rotated successfully. Upstream mTLS sessions will renegotiate keys automatically.",
      });
    }
  };

  const handleTerminateSession = (sessName: string, sessId: string) => {
    setTerminatedSessions((prev) => [...prev, sessId]);
    if (onNotice) {
      onNotice({
        intent: "warning",
        text: `Terminated active SSE Stream for ${sessName}. Socket closed with code 1000.`,
      });
    }
  };

  return (
    <div className="flex flex-col w-full pb-16 space-y-6 animate-fadeIn">
      {/* ============================================================== */}
      {/* 1. TOP BREADCRUMB, PROTOCOL METADATA & ACTION BAR             */}
      {/* ============================================================== */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pt-2">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-xs text-neutral-400 uppercase tracking-wider">
              Governance Domain
            </span>
            <span className="text-neutral-600 font-mono text-xs">/</span>
            <span className="font-mono text-xs text-indigo-400 font-semibold uppercase tracking-wider">
              MCP & OAuth Connections
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              mTLS Stream Synchronized
            </span>
          </div>

          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <h1 className="text-2xl lg:text-3xl font-bold tracking-tight text-neutral-100">
              Model Context Protocol Fabric
            </h1>
            <div className="flex items-center gap-2 text-neutral-400 font-mono text-xs">
              <span className="px-2 py-0.5 rounded bg-neutral-900 border border-neutral-800 text-emerald-400">
                Spec: MCP v1.0.4
              </span>
              <span>•</span>
              <span>Transport: SSE Stream + stdio Bridge</span>
            </div>
          </div>
        </div>

        {/* Action Bar */}
        <div className="flex flex-wrap items-center gap-2.5">
          <JXButton
            variant="outlined"
            onClick={handleRotateSecret}
            style={{ padding: "8px 16px", height: 42, fontSize: 13 }}
          >
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-base">
                {isRotatingSecret ? "sync" : "sync_lock"}
              </span>
              <span>{isRotatingSecret ? "Rotating Keys…" : "Rotate Gateway Secret"}</span>
            </div>
          </JXButton>

          <JXButton
            variant="soft"
            onClick={() => setIssueModalOpen(true)}
            style={{ padding: "8px 16px", height: 42, fontSize: 13 }}
          >
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-base">key</span>
              <span>Issue OAuth Client</span>
            </div>
          </JXButton>

          <LiquidButton
            variant="solid"
            tone="primary"
            onClick={() => {
              if (onNotice) {
                onNotice({
                  intent: "info",
                  text: "Registering new MCP endpoint… Connect an SSE daemon or stdio subprocess.",
                });
              }
            }}
            style={{ padding: "8px 18px", fontSize: 13, height: 42 }}
          >
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-base">add_circle</span>
              <span>Register MCP Endpoint</span>
            </div>
          </LiquidButton>
        </div>
      </div>

      {/* ============================================================== */}
      {/* 2. TELEMETRY SUMMARY CARDS: 4-COLUMN BENTO                    */}
      {/* ============================================================== */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1: Protocol Gateways */}
        <div className="rounded-xl overflow-hidden bg-neutral-900/60 border border-neutral-800 p-5 flex flex-col justify-between group hover:border-neutral-700 transition-all">
          <div className="flex items-center justify-between mb-2">
            <span className="font-mono text-xs text-neutral-400 uppercase tracking-wider">
              Protocol Gateways
            </span>
            <div className="w-8 h-8 rounded-lg bg-neutral-800/80 flex items-center justify-center text-emerald-400">
              <span className="material-symbols-outlined text-base">hub</span>
            </div>
          </div>
          <div>
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-2xl font-bold text-neutral-100 tracking-tight">6</span>
              <span className="text-xs text-emerald-400 font-medium">/ 6 Streamable</span>
            </div>
            <p className="text-xs text-neutral-400 mt-1">Active MCP Endpoints Live</p>
          </div>
          <div className="mt-3 pt-2.5 border-t border-neutral-800/60 flex items-center justify-between font-mono text-[11px] text-neutral-500">
            <span>Health: Nominal</span>
            <span className="text-emerald-400">100% Uptime</span>
          </div>
        </div>

        {/* Metric 2: Concurrent SSE */}
        <div className="rounded-xl overflow-hidden bg-neutral-900/60 border border-neutral-800 p-5 flex flex-col justify-between group hover:border-neutral-700 transition-all">
          <div className="flex items-center justify-between mb-2">
            <span className="font-mono text-xs text-neutral-400 uppercase tracking-wider">
              Concurrent SSE
            </span>
            <div className="w-8 h-8 rounded-lg bg-neutral-800/80 flex items-center justify-center text-sky-400">
              <span className="material-symbols-outlined text-base">stream</span>
            </div>
          </div>
          <div>
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-2xl font-bold text-neutral-100 tracking-tight">42</span>
              <span className="text-xs text-sky-400 font-medium">Clients Connected</span>
            </div>
            <p className="text-xs text-neutral-400 mt-1">Full duplex event pipe</p>
          </div>
          <div className="mt-3 pt-2.5 border-t border-neutral-800/60 flex items-center justify-between font-mono text-[11px] text-neutral-500">
            <span>p99 Roundtrip</span>
            <span className="text-sky-400">18ms Latency</span>
          </div>
        </div>

        {/* Metric 3: OAuth Credentials */}
        <div className="rounded-xl overflow-hidden bg-neutral-900/60 border border-neutral-800 p-5 flex flex-col justify-between group hover:border-neutral-700 transition-all">
          <div className="flex items-center justify-between mb-2">
            <span className="font-mono text-xs text-neutral-400 uppercase tracking-wider">
              OAuth Credentials
            </span>
            <div className="w-8 h-8 rounded-lg bg-neutral-800/80 flex items-center justify-center text-purple-400">
              <span className="material-symbols-outlined text-base">shield_person</span>
            </div>
          </div>
          <div>
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-2xl font-bold text-neutral-100 tracking-tight">18</span>
              <span className="text-xs text-emerald-400 font-medium">Valid Bearers</span>
            </div>
            <p className="text-xs text-neutral-400 mt-1">RFC 6749 Client Credentials</p>
          </div>
          <div className="mt-3 pt-2.5 border-t border-neutral-800/60 flex items-center justify-between font-mono text-[11px] text-neutral-500">
            <span>Compromised</span>
            <span className="text-emerald-400">0 Flagged</span>
          </div>
        </div>

        {/* Metric 4: Exposed Primitives */}
        <div className="rounded-xl overflow-hidden bg-neutral-900/60 border border-neutral-800 p-5 flex flex-col justify-between group hover:border-neutral-700 transition-all">
          <div className="flex items-center justify-between mb-2">
            <span className="font-mono text-xs text-neutral-400 uppercase tracking-wider">
              Exposed Primitives
            </span>
            <div className="w-8 h-8 rounded-lg bg-neutral-800/80 flex items-center justify-center text-indigo-400">
              <span className="material-symbols-outlined text-base">terminal</span>
            </div>
          </div>
          <div>
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-2xl font-bold text-neutral-100 tracking-tight">34</span>
              <span className="text-xs text-indigo-400 font-medium">Tool Schemas</span>
            </div>
            <p className="text-xs text-neutral-400 mt-1">JSON-RPC 2.0 Contract Stubs</p>
          </div>
          <div className="mt-3 pt-2.5 border-t border-neutral-800/60 flex items-center justify-between font-mono text-[11px] text-neutral-500">
            <span>Validation Engine</span>
            <span className="text-indigo-400">Strict Zod v3</span>
          </div>
        </div>
      </div>

      {/* ============================================================== */}
      {/* 3. SECTION 1: REGISTERED MCP SERVER STREAMS                    */}
      {/* ============================================================== */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
            <h2 className="text-lg font-bold text-neutral-100">
              Registered MCP Server Streams
            </h2>
            <span className="font-mono text-xs px-2.5 py-0.5 rounded bg-neutral-800 text-neutral-300">
              Cluster: us-east-gateway-01
            </span>
          </div>
          <div className="hidden sm:flex items-center gap-4 text-neutral-400 font-mono text-xs">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              SSE Live
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-sky-400" />
              mTLS Handshake
            </span>
          </div>
        </div>

        {/* Endpoints Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {streamEndpoints.map((ep, idx) => (
            <div
              key={idx}
              className="p-5 rounded-xl bg-neutral-900/60 border border-neutral-800 flex flex-col justify-between group hover:border-neutral-700 transition-all"
            >
              <div>
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex flex-col">
                    <span className="font-mono text-sm text-indigo-400 font-semibold tracking-wide">
                      {ep.path}
                    </span>
                    <span className="text-xs text-neutral-400 mt-0.5">
                      {ep.title}
                    </span>
                  </div>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 font-mono text-xs text-emerald-400 shrink-0">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                    Online ({ep.latency})
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 p-2.5 rounded-lg bg-neutral-950 border border-neutral-800/60 mb-3">
                  <div>
                    <span className="font-mono text-[10px] text-neutral-500 uppercase block">
                      Transport Mechanism
                    </span>
                    <span className="text-xs text-neutral-200 font-medium">{ep.transport}</span>
                  </div>
                  <div>
                    <span className="font-mono text-[10px] text-neutral-500 uppercase block">
                      Client Subscriptions
                    </span>
                    <span className="text-xs text-neutral-200 truncate block">{ep.clients}</span>
                  </div>
                </div>

                <div>
                  <span className="font-mono text-[10px] text-neutral-500 uppercase mb-1.5 block">
                    Exported Schema Primitives
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {ep.primitives.map((prim, pIdx) => (
                      <span
                        key={pIdx}
                        className="px-2 py-0.5 rounded font-mono text-xs bg-neutral-800 text-indigo-300"
                      >
                        {prim}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-neutral-800/60 flex items-center justify-between">
                <span className="font-mono text-xs text-neutral-400">Throughput: {ep.throughput}</span>
                <button
                  type="button"
                  className="text-indigo-400 hover:text-indigo-300 text-xs font-medium flex items-center gap-1 transition-colors"
                  onClick={() => setInspectSpecStream(ep.path)}
                >
                  <span>Inspect Spec</span>
                  <span className="material-symbols-outlined text-sm">chevron_right</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ============================================================== */}
      {/* 4. SECTION 2: ACTIVE AI CLIENT SESSIONS                        */}
      {/* ============================================================== */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="w-2.5 h-2.5 rounded-full bg-sky-400" />
            <h2 className="text-lg font-bold text-neutral-100">
              Active AI Client Sessions
            </h2>
            <span className="font-mono text-xs px-2.5 py-0.5 rounded bg-neutral-800 text-sky-400">
              SSE Channels: {activeSessions.length - terminatedSessions.length} Concurrent
            </span>
          </div>
          <span className="font-mono text-xs text-neutral-500">
            Transport Keepalive: 15s ping
          </span>
        </div>

        {/* Sessions Table */}
        <div className="overflow-x-auto rounded-xl bg-neutral-900/60 border border-neutral-800">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-neutral-950/60 text-neutral-400 font-mono text-[11px] uppercase tracking-wider border-b border-neutral-800">
                <th className="py-3 px-4">Connected Client Application</th>
                <th className="py-3 px-4">Process ID & Route</th>
                <th className="py-3 px-4">Stream Duration</th>
                <th className="py-3 px-4">Tool Invocations</th>
                <th className="py-3 px-4">Negotiated Features</th>
                <th className="py-3 px-4 text-right">Session Governance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800/60 text-xs text-neutral-200">
              {activeSessions.map((s) => {
                const isTerminated = terminatedSessions.includes(s.id);
                return (
                  <tr
                    key={s.id}
                    className={`hover:bg-neutral-800/30 transition-colors ${
                      isTerminated ? "opacity-35 line-through bg-neutral-950/50" : ""
                    }`}
                  >
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2.5">
                        <span className="w-7 h-7 rounded-lg bg-neutral-800 text-indigo-400 flex items-center justify-center">
                          <span className="material-symbols-outlined text-sm">code</span>
                        </span>
                        <div className="flex flex-col">
                          <span className="font-semibold text-neutral-100">{s.name}</span>
                          <span className="font-mono text-[10px] text-neutral-500">{s.version}</span>
                        </div>
                      </div>
                    </td>

                    <td className="py-3 px-4">
                      <div className="flex flex-col font-mono text-xs">
                        <span className="text-neutral-200">PID {s.pid}</span>
                        <span className="text-neutral-500 text-[11px]">{s.route}</span>
                      </div>
                    </td>

                    <td className="py-3 px-4 font-mono text-xs text-neutral-300">
                      {s.duration}
                    </td>

                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2 font-mono text-xs">
                        <span className="text-indigo-400 font-semibold">{s.invocations.toLocaleString()}</span>
                        <span className="text-neutral-500 text-[10px]">({s.errorRate})</span>
                      </div>
                    </td>

                    <td className="py-3 px-4">
                      <div className="flex flex-wrap gap-1 font-mono text-[10px]">
                        {s.features.map((f, fIdx) => (
                          <span key={fIdx} className="px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-300">
                            {f}
                          </span>
                        ))}
                      </div>
                    </td>

                    <td className="py-3 px-4 text-right">
                      {isTerminated ? (
                        <span className="font-mono text-xs text-rose-400 font-semibold">Terminated</span>
                      ) : (
                        <div className="flex items-center justify-end gap-2">
                          <JXButton
                            variant="outlined"
                            onClick={() => setInspectScopes(s.name)}
                            style={{ padding: "4px 10px", fontSize: 11, height: 30 }}
                          >
                            Inspect Scopes
                          </JXButton>
                          <JXButton
                            variant="soft"
                            onClick={() => handleTerminateSession(s.name, s.id)}
                            style={{ padding: "4px 10px", fontSize: 11, height: 30, color: "#f87171" }}
                          >
                            Terminate
                          </JXButton>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ============================================================== */}
      {/* 5. SECTION 3: OAUTH 2.0 CLIENTS & QUICK TOKEN GENERATOR        */}
      {/* ============================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left (8 Cols): OAuth 2.0 Registered Clients */}
        <div className="lg:col-span-8 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="w-2.5 h-2.5 rounded-full bg-purple-400" />
              <h2 className="text-lg font-bold text-neutral-100">
                OAuth 2.0 Registered Clients
              </h2>
              <span className="font-mono text-xs px-2.5 py-0.5 rounded bg-neutral-800 text-purple-300">
                mTLS Bound
              </span>
            </div>
            <span className="font-mono text-xs text-neutral-400">
              Total Clients: {registeredClients.length}
            </span>
          </div>

          <div className="space-y-3">
            {registeredClients.map((c: any, idx: number) => {
              const cid = c.client_id || c.client_id_prefix;
              return (
                <div
                  key={idx}
                  className="p-4 rounded-xl bg-neutral-900/60 border border-neutral-800 flex flex-col md:flex-row md:items-center justify-between gap-4 group hover:border-neutral-700 transition-all"
                >
                  <div className="flex flex-col gap-1 min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-sm text-neutral-100 font-bold">
                        {c.client_name || cid}
                      </span>
                      <span className="px-2 py-0.5 rounded font-mono text-[10px] bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                        Active
                      </span>
                      <span className="font-mono text-[10px] text-neutral-500">
                        ID: {c.client_id_prefix || cid.slice(0, 12)}…
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 mt-1 font-mono text-[10px]">
                      <span className="px-2 py-0.5 rounded bg-neutral-950 text-indigo-300 border border-neutral-800">
                        fleet:read
                      </span>
                      <span className="px-2 py-0.5 rounded bg-neutral-950 text-indigo-300 border border-neutral-800">
                        fleet:execute:tier2
                      </span>
                      <span className="px-2 py-0.5 rounded bg-neutral-950 text-indigo-300 border border-neutral-800">
                        mcp:stream
                      </span>
                    </div>

                    <div className="text-neutral-500 font-mono text-[11px] mt-1 truncate">
                      Redirect: {c.redirect_uris || "mcp://localhost/oauth/callback"}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <JXButton
                      variant="outlined"
                      onClick={() => setEditClient(c)}
                      style={{ padding: "6px 12px", fontSize: 12, height: 34 }}
                    >
                      Edit
                    </JXButton>
                    <JXButton
                      variant="soft"
                      onClick={async () => {
                        if (confirm(`Revoke and delete OAuth client "${c.client_name || cid}"?`)) {
                          if (onDeleteOAuthClient) {
                            await onDeleteOAuthClient(cid);
                          }
                          if (onRefresh) onRefresh();
                        }
                      }}
                      style={{ padding: "6px 12px", fontSize: 12, height: 34, color: "#f87171" }}
                    >
                      Revoke
                    </JXButton>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right (4 Cols): Quick Token Generator */}
        <div className="lg:col-span-4 flex flex-col gap-3">
          <div className="flex items-center gap-2.5">
            <span className="material-symbols-outlined text-indigo-400 text-lg">token</span>
            <h2 className="text-lg font-bold text-neutral-100">
              Quick Token Generator
            </h2>
          </div>

          <div className="p-5 rounded-xl bg-neutral-900/60 border border-neutral-800 flex flex-col gap-4">
            {/* Target Client */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-neutral-300">
                Target OAuth Client
              </label>
              <JXSelect
                value={tokenClient}
                onChange={(val: any) => setTokenClient(typeof val === "string" ? val : val?.target?.value || "")}
                options={registeredClients.map((c: any) => ({
                  id: c.client_id || c.client_id_prefix,
                  label: c.client_name || c.client_id || c.client_id_prefix,
                }))}
              />
            </div>

            {/* Scope checkboxes */}
            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold text-neutral-300">
                Granted Capabilities (Scopes)
              </label>
              <div className="space-y-1.5 bg-neutral-950 p-3 rounded-lg border border-neutral-800/80">
                {[
                  { id: "fleet:read", label: "fleet:read (List devices & telemetry)" },
                  { id: "fleet:execute:tier2", label: "fleet:execute:tier2 (Run approved tools)" },
                  { id: "mcp:stream", label: "mcp:stream (Full SSE bi-directional stream)" },
                  { id: "admin:all", label: "admin:all (Root fleet privileges)" },
                ].map((sc) => (
                  <label key={sc.id} className="flex items-center gap-2 text-xs text-neutral-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedScopes.includes(sc.id)}
                      onChange={() => toggleScope(sc.id)}
                      className="rounded border-neutral-700 bg-neutral-800 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span className="font-mono text-[11px]">{sc.label}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Lifetime selector */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-neutral-300">
                Token Expiration Window
              </label>
              <JXSelect
                value={tokenLifetime}
                onChange={(val: any) => setTokenLifetime(typeof val === "string" ? val : val?.target?.value || "24h")}
                options={[
                  { id: "1h", label: "1 Hour (Ephemeral testing)" },
                  { id: "8h", label: "8 Hours (Standard working session)" },
                  { id: "24h", label: "24 Hours (Production subagent)" },
                  { id: "30d", label: "30 Days (Standing daemon)" },
                ]}
              />
            </div>

            <LiquidButton
              variant="solid"
              tone="primary"
              onClick={handleGenerateToken}
              style={{ padding: "8px 16px", height: 40, fontSize: 13 }}
            >
              Generate Bearer Token
            </LiquidButton>

            {generatedToken && (
              <div className="p-3 rounded-xl bg-neutral-950 border border-emerald-500/40 flex flex-col gap-2 animate-fadeIn">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-emerald-400 font-semibold">Active Bearer Token:</span>
                  <button
                    type="button"
                    className="text-neutral-400 hover:text-neutral-200 text-xs flex items-center gap-1 font-mono"
                    onClick={() => {
                      navigator.clipboard.writeText(generatedToken);
                      setCopiedToken(true);
                      setTimeout(() => setCopiedToken(false), 2000);
                    }}
                  >
                    <span className="material-symbols-outlined text-xs">
                      {copiedToken ? "done" : "content_copy"}
                    </span>
                    <span>{copiedToken ? "Copied" : "Copy"}</span>
                  </button>
                </div>
                <code className="font-mono text-[11px] text-indigo-300 break-all select-all leading-relaxed">
                  {generatedToken}
                </code>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ============================================================== */}
      {/* 6. SECTION 4: FLEET-WIDE CONNECTION WORKFLOW STEPPER          */}
      {/* ============================================================== */}
      <div className="p-6 rounded-xl bg-neutral-900/60 border border-neutral-800 flex flex-col gap-4">
        <div className="flex items-center gap-2.5">
          <span className="material-symbols-outlined text-indigo-400 text-xl">account_tree</span>
          <h2 className="text-base font-bold text-neutral-100">
            MCP Client Setup & Fleet-Wide AI Connection Workflow
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Step 1 */}
          <div className="p-4 rounded-xl bg-neutral-950 border border-neutral-800/80 flex flex-col gap-2">
            <span className="font-mono text-[10px] text-indigo-400 font-bold uppercase tracking-wider">
              STEP 01 · ADD MCP SERVER
            </span>
            <span className="text-sm font-semibold text-neutral-100">
              Connect Claude / Cursor / ChatGPT
            </span>
            <p className="text-xs text-neutral-400 leading-relaxed">
              Point your MCP client to <code className="text-indigo-300 font-mono">{origin}/mcp</code>. It automatically discovers OAuth 2.1 endpoints or accepts Bearer auth.
            </p>
          </div>

          {/* Step 2 */}
          <div className="p-4 rounded-xl bg-neutral-950 border border-neutral-800/80 flex flex-col gap-2">
            <span className="font-mono text-[10px] text-emerald-400 font-bold uppercase tracking-wider">
              STEP 02 · AUTHENTICATE
            </span>
            <span className="text-sm font-semibold text-neutral-100">
              Enter Admin Token or Bearer
            </span>
            <p className="text-xs text-neutral-400 leading-relaxed">
              Provide your <code className="text-emerald-300 font-mono">AI_BRIDGE_ADMIN_TOKEN</code> or generated OAuth Bearer token. No device-specific tokens needed.
            </p>
          </div>

          {/* Step 3 */}
          <div className="p-4 rounded-xl bg-neutral-950 border border-neutral-800/80 flex flex-col gap-2">
            <span className="font-mono text-[10px] text-purple-400 font-bold uppercase tracking-wider">
              STEP 03 · FLEET CONTROL
            </span>
            <span className="text-sm font-semibold text-neutral-100">
              Access All Enrolled Devices
            </span>
            <p className="text-xs text-neutral-400 leading-relaxed">
              The AI agent can list all devices (<code className="text-purple-300 font-mono">list_devices()</code>), switch targets, or pass <code className="text-purple-300 font-mono">device="..."</code> to any tool.
            </p>
          </div>
        </div>
      </div>

      {/* ============================================================== */}
      {/* 7. MODALS: Issue Client, Edit Client, Inspect Spec            */}
      {/* ============================================================== */}
      {issueModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-fadeIn">
          <div className="w-full max-w-lg bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-2xl flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
              <h3 className="text-base font-bold text-neutral-100">
                Issue New OAuth 2.0 / MCP Client
              </h3>
              <button
                type="button"
                className="text-neutral-400 hover:text-neutral-200"
                onClick={() => setIssueModalOpen(false)}
              >
                <span className="material-symbols-outlined text-base">close</span>
              </button>
            </div>

            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-neutral-300">
                  Client Application Name
                </label>
                <JXTextField
                  value={newClientName}
                  onChange={(e: any) => setNewClientName(e?.target?.value || "")}
                  placeholder="e.g., Cursor IDE Workstation Alpha"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-neutral-300">
                  Authorized Redirect URIs (comma-separated)
                </label>
                <JXTextField
                  value={newRedirectUri}
                  onChange={(e: any) => setNewRedirectUri(e?.target?.value || "")}
                  placeholder="https://chatgpt.com/api/auth/callback"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-neutral-800">
              <JXButton variant="outlined" onClick={() => setIssueModalOpen(false)}>
                Cancel
              </JXButton>
              <JXButton
                variant="contained"
                onClick={() => {
                  setIssueModalOpen(false);
                  if (onNotice) {
                    onNotice({
                      intent: "success",
                      text: `Registered new OAuth Client "${newClientName || "MCP Client"}".`,
                    });
                  }
                  if (onRefresh) onRefresh();
                }}
              >
                Create Client
              </JXButton>
            </div>
          </div>
        </div>
      )}

      {editClient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-fadeIn">
          <div className="w-full max-w-lg bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-2xl flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
              <h3 className="text-base font-bold text-neutral-100">
                Edit OAuth Client: {editClient.client_id || editClient.client_id_prefix}
              </h3>
              <button
                type="button"
                className="text-neutral-400 hover:text-neutral-200"
                onClick={() => setEditClient(null)}
              >
                <span className="material-symbols-outlined text-base">close</span>
              </button>
            </div>

            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-neutral-300">Client Name</label>
                <JXTextField
                  value={editClient.client_name || ""}
                  onChange={(e: any) => setEditClient({ ...editClient, client_name: e?.target?.value })}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-neutral-300">Redirect URIs</label>
                <JXTextField
                  value={editClient.redirect_uris || ""}
                  onChange={(e: any) => setEditClient({ ...editClient, redirect_uris: e?.target?.value })}
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-neutral-800">
              <JXButton variant="outlined" onClick={() => setEditClient(null)}>
                Cancel
              </JXButton>
              <JXButton
                variant="contained"
                onClick={async () => {
                  const cid = editClient.client_id || editClient.client_id_prefix;
                  if (onUpdateOAuthClient) {
                    await onUpdateOAuthClient(cid, {
                      client_name: editClient.client_name,
                      redirect_uris: editClient.redirect_uris,
                    });
                  }
                  setEditClient(null);
                  if (onRefresh) onRefresh();
                }}
              >
                Save Changes
              </JXButton>
            </div>
          </div>
        </div>
      )}

      {inspectScopes && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-fadeIn">
          <div className="w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-2xl flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
              <h3 className="text-base font-bold text-neutral-100">
                Active Scopes: {inspectScopes}
              </h3>
              <button
                type="button"
                className="text-neutral-400 hover:text-neutral-200"
                onClick={() => setInspectScopes(null)}
              >
                <span className="material-symbols-outlined text-base">close</span>
              </button>
            </div>
            <div className="space-y-2 text-xs font-mono">
              <div className="p-2.5 rounded-lg bg-neutral-950 border border-neutral-800 flex justify-between">
                <span className="text-neutral-400">tools/call:</span>
                <span className="text-emerald-400">GRANTED (Tier 1 & Tier 2)</span>
              </div>
              <div className="p-2.5 rounded-lg bg-neutral-950 border border-neutral-800 flex justify-between">
                <span className="text-neutral-400">resources/read:</span>
                <span className="text-emerald-400">GRANTED (/workspace/*)</span>
              </div>
              <div className="p-2.5 rounded-lg bg-neutral-950 border border-neutral-800 flex justify-between">
                <span className="text-neutral-400">prompts/get:</span>
                <span className="text-emerald-400">GRANTED (Fleet Stubs)</span>
              </div>
              <div className="p-2.5 rounded-lg bg-neutral-950 border border-neutral-800 flex justify-between">
                <span className="text-neutral-400">admin/override:</span>
                <span className="text-rose-400">DENIED (Requires WebAuthn)</span>
              </div>
            </div>
            <div className="flex justify-end pt-2 border-t border-neutral-800">
              <JXButton variant="contained" onClick={() => setInspectScopes(null)}>
                Dismiss
              </JXButton>
            </div>
          </div>
        </div>
      )}

      {inspectSpecStream && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-fadeIn">
          <div className="w-full max-w-lg bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-2xl flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
              <h3 className="text-base font-bold text-neutral-100 font-mono">
                Stream Contract: {inspectSpecStream}
              </h3>
              <button
                type="button"
                className="text-neutral-400 hover:text-neutral-200"
                onClick={() => setInspectSpecStream(null)}
              >
                <span className="material-symbols-outlined text-base">close</span>
              </button>
            </div>
            <pre className="p-3.5 rounded-xl bg-neutral-950 border border-neutral-800 font-mono text-xs text-indigo-200 overflow-x-auto max-h-64 leading-relaxed">
{JSON.stringify(
  {
    protocol: "mcp-sse-v1",
    endpoint: inspectSpecStream,
    heartbeat_interval_sec: 15,
    max_payload_size_bytes: 10485760,
    compression: "gzip, zstd",
    tls: { min_version: "TLSv1.3", cipher: "TLS_AES_256_GCM_SHA384" },
    supported_methods: ["tools/list", "tools/call", "resources/subscribe"],
  },
  null,
  2
)}
            </pre>
            <div className="flex justify-end pt-2 border-t border-neutral-800">
              <JXButton variant="contained" onClick={() => setInspectSpecStream(null)}>
                Close Spec
              </JXButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ConnectionsHub;
