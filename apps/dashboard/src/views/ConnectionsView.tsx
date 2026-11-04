/**
 * MCP & OAuth Connections Hub (Screen 13)
 * Reconstructed with pure JXUI primitives, motion/react, and lucide-react.
 * ZERO inline styles. ZERO custom CSS.
 */

import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  GlassModal,
  JXCard,
  JXCardHeader,
  JXCardContent,
  JXButton,
  JXBadge,
  JXSelect,
  JXTextField,
  JXGrid,
  JXGridItem,
} from "../ui";
import {
  Network,
  Zap,
  KeyRound,
  ShieldCheck,
  Radio,
  Activity,
  Layers,
  Terminal,
  RotateCcw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Play,
  Copy,
  Check,
  Eye,
  Trash2,
  Lock,
  ChevronRight,
  RefreshCw,
  Clock,
  Sparkles,
} from "lucide-react";
import { useDashboardStore } from "../state/dashboardStore";
import type { MCPConnection, OAuthClient } from "../types/dashboard";

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

interface WireFrame {
  id: number;
  timestamp: string;
  direction: "inbound" | "outbound";
  method: string;
  latencyMs: number;
  payload: Record<string, unknown>;
}

export const ConnectionsView: React.FC = () => {
  const mcpConnections = useDashboardStore((s) => s.mcpConnections);
  const oauthClients = useDashboardStore((s) => s.oauthClients);

  // Gateway secret rotation state
  const [isRotatingSecret, setIsRotatingSecret] = useState(false);
  const [rotateNotice, setRotateNotice] = useState<string | null>(null);

  // Active AI Client Sessions
  const [sessions, setSessions] = useState<ClientSession[]>([
    {
      id: "sess-01",
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
      id: "sess-02",
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
      id: "sess-03",
      name: "Auto-Heal Daemon v2",
      version: "Internal Enclave Service",
      pid: 1042,
      route: "unix:/run/mcp/heal.sock",
      duration: "18d 04h",
      invocations: 41209,
      errorRate: "0 err",
      features: ["resources/read", "tools/call"],
    },
    {
      id: "sess-04",
      name: "Local Python SDK",
      version: "ai-bridge-sdk v2.1",
      pid: 6118,
      route: "127.0.0.1:49012",
      duration: "32m",
      invocations: 84,
      errorRate: "0 err",
      features: ["tools/call"],
    },
  ]);

  // 2-step click confirmation to terminate session
  const [confirmTerminateId, setConfirmTerminateId] = useState<string | null>(null);

  // Handshake interactive token generation state
  const [targetClientId, setTargetClientId] = useState<string>(oauthClients[0]?.id || "ai-agent-orchestrator-01");
  const [selectedScopes, setSelectedScopes] = useState<string[]>([
    "fleet:read",
    "mcp:stream",
    "fleet:execute:tier2",
  ]);
  const [generatedJwt, setGeneratedJwt] = useState<string>(
    "eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCIsImRwb3AiOiJ0cnVlIn0.eyJzdWIiOiJhaS1hZ2VudC1vcmNoZXN0cmF0b3ItMDEiLCJzY29wZXMiOlsicmVhZCIsInN0cmVhbSJdLCJpYXQiOjE3MDgwODAwMDB9.d9A4fG81k..."
  );
  const [copiedToken, setCopiedToken] = useState(false);

  // Wire Protocol Audit Drawer & Frame list
  const [wireFilter, setWireFilter] = useState<string>("all");
  const [wireFrames, setWireFrames] = useState<WireFrame[]>([
    {
      id: 101,
      timestamp: "14:28:11.892",
      direction: "inbound",
      method: "tools/call",
      latencyMs: 14,
      payload: {
        jsonrpc: "2.0",
        id: 101,
        method: "tools/call",
        params: { name: "system_info", arguments: { node_id: "srv-us-east-412" } },
      },
    },
    {
      id: 102,
      timestamp: "14:28:12.014",
      direction: "outbound",
      method: "tools/call",
      latencyMs: 12,
      payload: {
        jsonrpc: "2.0",
        id: 101,
        result: { status: "fulfilled", cpu_percent: 28.4, mem_gb: 18.4 },
      },
    },
    {
      id: 103,
      timestamp: "14:28:13.410",
      direction: "inbound",
      method: "resources/read",
      latencyMs: 18,
      payload: {
        jsonrpc: "2.0",
        id: 102,
        method: "resources/read",
        params: { uri: "mcp://desktop/windows/active" },
      },
    },
    {
      id: 104,
      timestamp: "14:28:15.901",
      direction: "inbound",
      method: "tools/list",
      latencyMs: 8,
      payload: {
        jsonrpc: "2.0",
        id: 103,
        method: "tools/list",
        params: {},
      },
    },
  ]);

  // Inspect Spec Modal
  const [inspectSpecStream, setInspectSpecStream] = useState<MCPConnection | null>(null);

  const handleRotateSecret = () => {
    setIsRotatingSecret(true);
    setTimeout(() => {
      setIsRotatingSecret(false);
      setRotateNotice("Master Gateway Secret successfully rotated. New ephemeral keys deployed to all active SSE streams.");
      setTimeout(() => setRotateNotice(null), 4000);
    }, 800);
  };

  const handleTerminateSession = (sessionId: string) => {
    if (confirmTerminateId === sessionId) {
      // 2nd click: terminate
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
      setConfirmTerminateId(null);
    } else {
      // 1st click: request confirmation
      setConfirmTerminateId(sessionId);
    }
  };

  const handleSignToken = () => {
    const header = btoa(JSON.stringify({ alg: "ES256", typ: "JWT", dpop: true }));
    const payload = btoa(
      JSON.stringify({
        sub: targetClientId,
        scopes: selectedScopes,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 86400,
        pkce: "S256",
      })
    );
    const sig = "MEQCID3k8e8...ed25519";
    setGeneratedJwt(`${header}.${payload}.${sig}`);
  };

  const handleCopyJwt = () => {
    navigator.clipboard.writeText(generatedJwt);
    setCopiedToken(true);
    setTimeout(() => setCopiedToken(false), 2000);
  };

  const handleClearWireLog = () => {
    setWireFrames([]);
  };

  const filteredWireFrames = wireFrames.filter((f) => {
    if (wireFilter !== "all" && f.method !== wireFilter) return false;
    return true;
  });

  return (
    <div className="space-y-4">
      {/* Protocol Header & Action Ribbon */}
      <JXCard className="bg-slate-900/60 border-slate-800">
        <div className="p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-2 flex-wrap">
            <JXButton
              variant="outlined"
              color="warning"
              size="md"
              loading={isRotatingSecret}
              onClick={handleRotateSecret}
              startIcon={<RotateCcw className="w-4 h-4" />}
            >
              Rotate secret
            </JXButton>
            <JXButton
              variant="contained"
              color="primary"
              size="md"
              onClick={handleSignToken}
              startIcon={<KeyRound className="w-4 h-4" />}
            >
              Add client
            </JXButton>
          </div>
        </div>

        {rotateNotice && (
          <div className="px-5 pb-4">
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-mono">
              {rotateNotice}
            </div>
          </div>
        )}
      </JXCard>

      {/* SECTION 1: Registered MCP Server Streams Grid */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Radio className="w-5 h-5 text-indigo-400" />
            <h2 className="text-base font-semibold text-slate-100">MCP servers</h2>
          </div>
        </div>

        <JXGrid columns={12} gap="md">
          {mcpConnections.map((conn) => (
            <JXGridItem key={conn.id} colSpan={6}>
              <JXCard className="bg-slate-900/60 border-slate-800">
                <div className="p-4 border-b border-slate-800/60 flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-semibold text-slate-100">{conn.name}</h4>
                    <code className="text-[11px] font-mono text-indigo-400">{conn.route}</code>
                  </div>
                  <JXButton
                    variant="soft"
                    color="neutral"
                    size="sm"
                    onClick={() => setInspectSpecStream(conn)}
                    startIcon={<Eye className="w-3.5 h-3.5" />}
                  >
                    Inspect Spec
                  </JXButton>
                </div>

                <JXCardContent>
                  <div className="space-y-3 pt-1 text-xs font-mono">
                    <div className="grid grid-cols-3 gap-2">
                      <div className="p-2 rounded bg-slate-950 border border-slate-800/80">
                        <span className="text-[10px] text-slate-400 uppercase block">Transport</span>
                        <span className="text-slate-200 font-semibold">{conn.transport.toUpperCase()}</span>
                      </div>
                      <div className="p-2 rounded bg-slate-950 border border-slate-800/80">
                        <span className="text-[10px] text-slate-400 uppercase block">Subscribers</span>
                        <span className="text-cyan-400 font-semibold">{conn.connectedClients} active</span>
                      </div>
                      <div className="p-2 rounded bg-slate-950 border border-slate-800/80">
                        <span className="text-[10px] text-slate-400 uppercase block">Throughput</span>
                        <span className="text-emerald-400 font-semibold">{conn.throughputReqMin} req/m</span>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-1 pt-1">
                      {conn.exportedSchemas.map((schema) => (
                        <span
                          key={schema}
                          className="px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-slate-300 text-[11px]"
                        >
                          {schema}
                        </span>
                      ))}
                    </div>
                  </div>
                </JXCardContent>
              </JXCard>
            </JXGridItem>
          ))}
        </JXGrid>
      </div>

      {/* SECTION 2: Active AI Client Sessions Table */}
      <JXCard className="bg-slate-900/60 border-slate-800">
        <JXCardHeader
          title="Client sessions"
          icon={<Terminal className="w-5 h-5 text-indigo-400" />}
        />
        <JXCardContent>
          <div className="overflow-x-auto rounded-xl border border-slate-800">
            <table className="w-full text-left text-xs border-collapse font-mono">
              <thead>
                <tr className="bg-slate-950 border-b border-slate-800 text-slate-400 uppercase">
                  <th className="p-3 font-sans">Connected Application</th>
                  <th className="p-3">PID & Route</th>
                  <th className="p-3">Duration</th>
                  <th className="p-3">Invocations</th>
                  <th className="p-3">Negotiated Features</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {sessions.map((sess) => (
                  <tr key={sess.id} className="hover:bg-slate-950/40 transition-colors">
                    <td className="p-3">
                      <div className="font-semibold text-slate-200 font-sans">{sess.name}</div>
                      <div className="text-[11px] text-slate-400 font-sans">{sess.version}</div>
                    </td>
                    <td className="p-3 text-slate-300">
                      PID {sess.pid} • {sess.route}
                    </td>
                    <td className="p-3 text-slate-300">{sess.duration}</td>
                    <td className="p-3">
                      <span className="text-indigo-400 font-semibold">{sess.invocations}</span>
                    </td>
                    <td className="p-3">
                      <div className="flex gap-1 flex-wrap">
                        {sess.features.map((feat) => (
                          <span
                            key={feat}
                            className="px-1.5 py-0.5 rounded bg-slate-950 border border-slate-800 text-slate-300 text-[10px]"
                          >
                            {feat}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="p-3 text-right">
                      <JXButton
                        variant={confirmTerminateId === sess.id ? "contained" : "soft"}
                        color="error"
                        size="sm"
                        onClick={() => handleTerminateSession(sess.id)}
                        startIcon={<Trash2 className="w-3.5 h-3.5" />}
                      >
                        {confirmTerminateId === sess.id ? "Click to Confirm" : "Terminate"}
                      </JXButton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </JXCardContent>
      </JXCard>

      {/* SECTION 3: OAuth 2.0 Credential Vault & Interactive Client Handshake Preview */}
      <JXGrid columns={12} gap="lg">
        {/* OAuth 2.0 Registered Clients */}
        <JXGridItem colSpan={6}>
          <JXCard className="bg-slate-900/60 border-slate-800">
            <JXCardHeader
              title="OAuth clients"
              icon={<KeyRound className="w-5 h-5 text-indigo-400" />}
            />
            <JXCardContent>
              <div className="space-y-3 font-mono text-xs">
                {oauthClients.map((client) => (
                  <div
                    key={client.id}
                    className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-bold text-slate-200">{client.clientName}</span>
                        <div className="text-[11px] text-slate-400 font-sans">
                          ID: {client.id} • {client.pkceType}
                        </div>
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold ${
                          client.status === "active"
                            ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                            : "bg-rose-500/20 text-rose-300 border border-rose-500/40"
                        }`}
                      >
                        {client.status}
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-1">
                      {client.scopes.map((s) => (
                        <span
                          key={s}
                          className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-indigo-300 text-[10px]"
                        >
                          {s}
                        </span>
                      ))}
                    </div>

                    <div className="flex items-center justify-between pt-1 border-t border-slate-800/80 text-[11px] text-slate-500">
                      <span>Secret: {client.tokenSecretMasked}</span>
                      <span>Expires: {client.expiresAt.slice(0, 10)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </JXCardContent>
          </JXCard>
        </JXGridItem>

        {/* Interactive Client Handshake Preview */}
        <JXGridItem colSpan={6}>
          <JXCard className="bg-slate-900/60 border-slate-800">
            <JXCardHeader
              title="Token preview"
              icon={<Sparkles className="w-5 h-5 text-cyan-400" />}
            />
            <JXCardContent>
              <div className="space-y-4 text-xs font-mono">
                <div>
                  <label className="block text-slate-400 mb-1">Target Client ID</label>
                  <select
                    aria-label="Target OAuth client"
                    value={targetClientId}
                    onChange={(e) => setTargetClientId(e.target.value)}
                    className="w-full p-2.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 focus:outline-none"
                  >
                    {oauthClients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.clientName} ({c.id})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 mb-1.5">Scope Entitlements</label>
                  <div className="grid grid-cols-2 gap-2 p-3 rounded-xl bg-slate-950 border border-slate-800">
                    {["fleet:read", "mcp:stream", "fleet:execute:tier2", "system:telemetry"].map(
                      (scope) => (
                        <label key={scope} className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={selectedScopes.includes(scope)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedScopes((prev) => [...prev, scope]);
                              } else {
                                setSelectedScopes((prev) => prev.filter((s) => s !== scope));
                              }
                            }}
                            className="w-3.5 h-3.5 rounded bg-slate-900 border-slate-700 accent-indigo-500 cursor-pointer"
                          />
                          <span className="text-slate-300">{scope}</span>
                        </label>
                      )
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Live Signed JWT Bearer Token</span>
                    <JXButton
                      variant="soft"
                      color="primary"
                      size="sm"
                      onClick={handleCopyJwt}
                      startIcon={
                        copiedToken ? (
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )
                      }
                    >
                      {copiedToken ? "Copied" : "Copy Token"}
                    </JXButton>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-[11px] text-emerald-400 break-all leading-relaxed max-h-24 overflow-y-auto">
                    {generatedJwt}
                  </div>
                </div>

                <div className="flex justify-end pt-1">
                  <JXButton
                    variant="contained"
                    color="primary"
                    size="md"
                    onClick={handleSignToken}
                    startIcon={<KeyRound className="w-4 h-4" />}
                  >
                    Test Handshake & Sign Token
                  </JXButton>
                </div>
              </div>
            </JXCardContent>
          </JXCard>
        </JXGridItem>
      </JXGrid>

      {/* SECTION 4: Realtime Wire Protocol Audit Drawer */}
      <JXCard className="bg-slate-900/60 border-slate-800">
        <div className="p-4 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
          <div className="flex items-center gap-3">
            <span className="font-bold text-slate-200">Wire Protocol Realtime Audit Drawer</span>
            <span className="text-slate-400">SSE JSON-RPC 2.0 Live Frame Stream</span>
          </div>

          <div className="flex items-center gap-2">
            <select
              aria-label="Filter protocol methods"
              value={wireFilter}
              onChange={(e) => setWireFilter(e.target.value)}
              className="p-1.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 text-xs focus:outline-none"
            >
              <option value="all">All Methods</option>
              <option value="tools/call">tools/call</option>
              <option value="resources/read">resources/read</option>
              <option value="tools/list">tools/list</option>
            </select>

            <JXButton
              variant="soft"
              color="neutral"
              size="sm"
              onClick={handleClearWireLog}
              startIcon={<Trash2 className="w-3.5 h-3.5" />}
            >
              Clear Log
            </JXButton>
          </div>
        </div>

        <JXCardContent>
          <div className="space-y-2 font-mono text-xs max-h-64 overflow-y-auto">
            {filteredWireFrames.map((frame) => (
              <div
                key={frame.id}
                className="p-3 rounded-lg bg-slate-950 border border-slate-800 flex items-start justify-between gap-4"
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`px-1.5 py-0.2 rounded text-[10px] uppercase font-bold ${
                        frame.direction === "inbound"
                          ? "bg-cyan-500/20 text-cyan-300"
                          : "bg-emerald-500/20 text-emerald-300"
                      }`}
                    >
                      {frame.direction}
                    </span>
                    <span className="text-indigo-400 font-bold">{frame.method}</span>
                    <span className="text-slate-400">[{frame.timestamp}]</span>
                  </div>
                  <pre tabIndex={0} aria-label="Protocol frame payload" className="text-slate-300 text-[11px] overflow-x-auto">
                    <code>{JSON.stringify(frame.payload)}</code>
                  </pre>
                </div>
                <span className="text-slate-400 shrink-0">{frame.latencyMs}ms</span>
              </div>
            ))}
          </div>
        </JXCardContent>
      </JXCard>

      {/* Inspect Spec Modal */}
      <AnimatePresence>
        {inspectSpecStream && (
          <GlassModal onClose={() => setInspectSpecStream(null)} title="MCP connection details">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="space-y-4"
            >
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2 text-indigo-400 font-bold">
                  <Eye className="w-5 h-5" />
                  <span>Inspect MCP Spec: {inspectSpecStream.name}</span>
                </div>
                <button
                  type="button"
                  aria-label="Close MCP details"
                  onClick={() => setInspectSpecStream(null)}
                  className="text-slate-400 hover:text-slate-200"
                >
                  <XCircle className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-3 text-xs font-mono">
                <div>
                  <span className="text-slate-400">Route Endpoint:</span>
                  <div className="text-slate-200 font-bold">{inspectSpecStream.route}</div>
                </div>
                <div>
                  <span className="text-slate-400">Spec Version:</span>
                  <div className="text-indigo-400 font-bold">{inspectSpecStream.specVersion}</div>
                </div>
                <div>
                  <span className="text-slate-400">Exported Tool Contract Schemas:</span>
                  <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-1">
                    {inspectSpecStream.exportedSchemas.map((s) => (
                      <div key={s} className="text-emerald-400">
                        • {s} (JSON-RPC 2.0 contract)
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <JXButton
                  variant="outlined"
                  color="neutral"
                  size="sm"
                  onClick={() => setInspectSpecStream(null)}
                >
                  Close
                </JXButton>
              </div>
            </motion.div>
          </GlassModal>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ConnectionsView;

