/**
 * Service Diagnostics & Systemd Log Stream Hub (Screen 14)
 * Reconstructed with pure JXUI primitives, motion/react, and lucide-react.
 * ZERO inline styles. ZERO custom CSS.
 */

import React, { useState, useEffect, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  JXCard,
  JXCardHeader,
  JXCardContent,
  JXButton,
  JXBadge,
  JXSwitch,
  JXSelect,
  JXTextField,
  JXGrid,
  JXGridItem,
  JXLinearProgress,
} from "../ui";
import {
  Terminal,
  Activity,
  Pause,
  Play,
  Copy,
  Check,
  Download,
  Trash2,
  Search,
  Filter,
  Server,
  Layers,
  Shield,
  Clock,
  Pin,
  ExternalLink,
  ChevronRight,
  HardDrive,
  Cpu,
  FileCode,
} from "lucide-react";
import { useDashboardStore } from "../state/dashboardStore";
import type { LogRecord } from "../types/dashboard";

interface StructuredLogEntry {
  id: string;
  timestamp: string;
  service: string;
  moduleTag: string;
  workerThread: string;
  level: "DEBUG" | "INFO" | "WARN" | "ERROR" | "FATAL";
  message: string;
  pid: number;
  traceId: string;
  details: Record<string, unknown>;
}

export const DiagnosticsLogsView: React.FC = () => {
  const storeLogs = useDashboardStore((s) => s.logs);
  const setCurrentView = useDashboardStore((s) => s.setCurrentView);

  // Stream state
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [autoScroll, setAutoScroll] = useState<boolean>(true);
  const [logLevelFilter, setLogLevelFilter] = useState<string>("ALL");
  const [targetService, setTargetService] = useState<string>("ai-bridge-core.service");
  const [bufferSize, setBufferSize] = useState<number>(500);
  const [regexQuery, setRegexQuery] = useState<string>("");
  const [copiedBuffer, setCopiedBuffer] = useState<boolean>(false);
  const [activeTraceFilter, setActiveTraceFilter] = useState<string | null>(null);

  // Selected entry for structured JSON drawer
  const [selectedEntry, setSelectedEntry] = useState<StructuredLogEntry | null>(null);

  // Spacebar hotkey for stream pause
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        e.code === "Space" &&
        target.tagName !== "INPUT" &&
        target.tagName !== "TEXTAREA" &&
        !target.isContentEditable
      ) {
        e.preventDefault();
        setIsPaused((prev) => !prev);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Default seed entries matching Stitch reference
  const defaultLogs: StructuredLogEntry[] = useMemo(
    () => [
      {
        id: "log-01",
        timestamp: "2026-11-02T14:28:09.102Z",
        service: "ai-bridge-core.service",
        moduleTag: "core::mTLS",
        workerThread: "worker-01",
        level: "INFO",
        message: "mTLS handshake completed node=srv-us-east-412 cipher=TLS_AES_256_GCM_SHA384 latency=3.2ms session_id=0xfa49c12b",
        pid: 84019,
        traceId: "trc-890a-11ef-93cc",
        details: {
          node_id: "srv-us-east-412",
          ip: "10.244.18.99",
          tls_version: "1.3",
          cipher_suite: "TLS_AES_256_GCM_SHA384",
          session_resumed: false,
          cert_fingerprint: "sha256:d9a4...6b01",
          handshake_latency_ms: 3.2,
        },
      },
      {
        id: "log-02",
        timestamp: "2026-11-02T14:28:09.418Z",
        service: "ai-bridge-core.service",
        moduleTag: "policy::ast",
        workerThread: "worker-04",
        level: "DEBUG",
        message: "AST policy syntax tree match validated rule_set=v3.4.1 depth=4 eval_time=180µs policy_id=pol-sec-99",
        pid: 84022,
        traceId: "trc-890a-11ef-93cc",
        details: {
          rule_set: "v3.4.1",
          depth: 4,
          eval_time_us: 180,
          policy_id: "pol-sec-99",
          verdict: "allow",
        },
      },
      {
        id: "log-03",
        timestamp: "2026-11-02T14:28:10.005Z",
        service: "ai-bridge-mcp-gateway",
        moduleTag: "mcp::stream",
        workerThread: "worker-02",
        level: "INFO",
        message: "SSE client connected client_id=cursor-ide route=/mcp/v1/fleet-desktop pid=4912 buffer_depth=128",
        pid: 84100,
        traceId: "trc-991b-44ec-10aa",
        details: {
          client_id: "cursor-ide",
          route: "/mcp/v1/fleet-desktop",
          client_pid: 4912,
          buffer_depth: 128,
        },
      },
      {
        id: "log-04",
        timestamp: "2026-11-02T14:28:11.190Z",
        service: "ai-bridge-edge-daemon",
        moduleTag: "agent::telemetry",
        workerThread: "worker-03",
        level: "WARN",
        message: "Memory RSS utilization approaching high threshold node=srv-us-east-412 used=18.4GB total=64.0GB pct=28.7%",
        pid: 84033,
        traceId: "trc-104d-77ef-22ba",
        details: {
          node_id: "srv-us-east-412",
          memory_used_gb: 18.4,
          memory_total_gb: 64.0,
          memory_pct: 28.7,
        },
      },
      {
        id: "log-05",
        timestamp: "2026-11-02T14:28:12.802Z",
        service: "systemd-journald",
        moduleTag: "kernel::filter",
        workerThread: "kernel-io",
        level: "ERROR",
        message: "Execution blocked by eBPF allowlist binary=/usr/bin/nc target_path=/usr/bin/nc pid=90118 reason=blocked_unauthorized_socket",
        pid: 90118,
        traceId: "trc-5591-99ad-ff41",
        details: {
          blocked_binary: "/usr/bin/nc",
          target_pid: 90118,
          violation_rule: "RESTRICTED_BINARY_POLICY",
          enforcement_point: "ebpf_sys_enter_execve",
        },
      },
    ],
    []
  );

  // Initialize selected entry
  useEffect(() => {
    if (!selectedEntry && defaultLogs.length > 0) {
      setSelectedEntry(defaultLogs[0]);
    }
  }, [defaultLogs, selectedEntry]);

  // Ring Buffer calculations (F30)
  const ringBufferUsedMb = 30.72;
  const ringBufferTotalMb = 64.0;
  const ringBufferPercent = Math.round((ringBufferUsedMb / ringBufferTotalMb) * 100); // 48%

  const getRingBufferColor = (pct: number) => {
    if (pct >= 90) return "text-rose-400";
    if (pct >= 80) return "text-amber-400";
    return "text-emerald-400";
  };

  // Filtered logs
  const filteredLogs = useMemo(() => {
    return defaultLogs.filter((entry) => {
      if (logLevelFilter !== "ALL" && entry.level !== logLevelFilter) return false;
      if (activeTraceFilter && entry.traceId !== activeTraceFilter) return false;
      if (regexQuery) {
        try {
          const reg = new RegExp(regexQuery, "i");
          if (!reg.test(entry.message) && !reg.test(entry.moduleTag)) return false;
        } catch {
          // invalid regex: fallback to simple string check
          if (!entry.message.toLowerCase().includes(regexQuery.toLowerCase())) return false;
        }
      }
      return true;
    });
  }, [defaultLogs, logLevelFilter, activeTraceFilter, regexQuery]);

  const handleCopyBuffer = () => {
    const raw = filteredLogs.map((l) => `${l.timestamp} [${l.workerThread}] [${l.moduleTag}] ${l.level} ${l.message}`).join("\n");
    navigator.clipboard.writeText(raw);
    setCopiedBuffer(true);
    setTimeout(() => setCopiedBuffer(false), 2000);
  };

  const handleDownloadLog = () => {
    const raw = filteredLogs.map((l) => `${l.timestamp} [${l.workerThread}] [${l.moduleTag}] ${l.level} ${l.message}`).join("\n");
    const blob = new Blob([raw], { type: "application/gzip" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `diagnostics-journal-${Date.now()}.log.gz`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleFlushBuffer = () => {
    setActiveTraceFilter(null);
    setRegexQuery("");
    setLogLevelFilter("ALL");
  };

  return (
    <div className="space-y-4">
      {/* Status Ribbon with Ingest EPS and Ring Buffer Meter */}
      <JXCard className="bg-slate-900/60 border-slate-800">
        <div className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 text-xs font-mono">
          <div className="flex items-center gap-2 flex-wrap">
            <JXButton
              variant={isPaused ? "contained" : "soft"}
              color={isPaused ? "warning" : "neutral"}
              size="sm"
              onClick={() => setIsPaused(!isPaused)}
              startIcon={isPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
            >
              {isPaused ? "Resume" : "Pause"}
            </JXButton>

            <JXButton
              variant="outlined"
              color="neutral"
              size="sm"
              onClick={handleCopyBuffer}
              startIcon={copiedBuffer ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            >
              {copiedBuffer ? "Copied" : "Copy Buffer"}
            </JXButton>

            <JXButton
              variant="outlined"
              color="neutral"
              size="sm"
              onClick={handleDownloadLog}
              startIcon={<Download className="w-3.5 h-3.5" />}
            >
              Download (.gz)
            </JXButton>

            <JXButton
              variant="soft"
              color="error"
              size="sm"
              onClick={handleFlushBuffer}
              startIcon={<Trash2 className="w-3.5 h-3.5" />}
            >
              Flush
            </JXButton>
          </div>
        </div>
      </JXCard>

      {/* Filter Ribbon */}
      <JXCard className="bg-slate-900/60 border-slate-800">
        <div className="p-4 flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
          <div className="flex items-center gap-2 flex-wrap">
            {/* Target Service Dropdown */}
            <select
              aria-label="Target log service"
              value={targetService}
              onChange={(e) => setTargetService(e.target.value)}
              className="p-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 focus:outline-none"
            >
              <option value="ai-bridge-core.service">ai-bridge-core.service</option>
              <option value="ai-bridge-mcp-gateway">ai-bridge-mcp-gateway</option>
              <option value="ai-bridge-edge-daemon">ai-bridge-edge-daemon</option>
              <option value="systemd-journald">systemd-journald</option>
              <option value="nginx-tls-proxy">nginx-tls-proxy</option>
            </select>

            {/* Buffer Size Selector */}
            <select
              aria-label="Log buffer size"
              value={bufferSize}
              onChange={(e) => setBufferSize(Number(e.target.value))}
              className="p-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 focus:outline-none"
            >
              <option value={250}>Buffer: 250 lines</option>
              <option value={500}>Buffer: 500 lines</option>
              <option value={1000}>Buffer: 1000 lines</option>
            </select>

            {/* Auto-Scroll Toggle */}
            <div className="flex items-center gap-2 p-1.5 rounded-lg bg-slate-950 border border-slate-800">
              <span className="text-slate-400">Auto-Scroll</span>
              <JXSwitch label="Auto-scroll logs" checked={autoScroll} onChange={() => setAutoScroll(!autoScroll)} />
            </div>

            {/* Regex Query Input */}
            <div className="relative">
              <input
                type="text"
                placeholder="Regex search pattern..."
                value={regexQuery}
                onChange={(e) => setRegexQuery(e.target.value)}
                className="p-2 pr-16 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 placeholder-slate-500 focus:outline-none w-64"
              />
              <span className="absolute right-2 top-2 px-1 rounded bg-slate-800 text-[10px] text-indigo-400 font-bold">
                .* REGEX
              </span>
            </div>
          </div>

          {/* Log Level Pills */}
          <div className="flex items-center gap-1.5 p-1 rounded-lg bg-slate-950 border border-slate-800">
            {["ALL", "DEBUG", "INFO", "WARN", "ERROR"].map((lvl) => (
              <button
                key={lvl}
                type="button"
                onClick={() => setLogLevelFilter(lvl)}
                className={`px-2.5 py-1 rounded text-[11px] font-bold transition-colors ${
                  logLevelFilter === lvl
                    ? "bg-indigo-600 text-white"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {lvl}
              </button>
            ))}
          </div>
        </div>

        {activeTraceFilter && (
          <div className="px-4 pb-3 flex items-center justify-between text-xs font-mono text-cyan-300">
            <span>Filtered by Distributed Trace ID: {activeTraceFilter}</span>
            <button
              type="button"
              onClick={() => setActiveTraceFilter(null)}
              className="text-rose-400 hover:underline"
            >
              Clear Trace Filter
            </button>
          </div>
        )}
      </JXCard>

      {/* Main Split: Left 8 cols Monospace Log Canvas, Right 4 cols Structured JSON Inspector */}
      <JXGrid columns={12} gap="lg">
        {/* Monospace Log Canvas */}
        <JXGridItem colSpan={8}>
          <JXCard className="bg-slate-900/60 border-slate-800">
            <div className="p-3 bg-slate-950 border-b border-slate-800 flex items-center justify-between text-xs font-mono text-slate-400">
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-indigo-400" />
                <span className="text-slate-200 font-bold">/var/log/ai-bridge/core.stdout.log (tail -f)</span>
              </div>
              <div className="flex items-center gap-3">
                <span>UTF-8</span>
                <span>PID 84019</span>
                <span className="flex items-center gap-1 text-emerald-400 font-bold">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  LIVE
                </span>
              </div>
            </div>

            <JXCardContent>
              <div className="p-3 space-y-1 font-mono text-xs max-h-[520px] overflow-y-auto leading-relaxed">
                {filteredLogs.map((log) => {
                  const isSelected = selectedEntry?.id === log.id;
                  return (
                    <div
                      key={log.id}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelectedEntry(log); }
                      }}
                      onClick={() => setSelectedEntry(log)}
                      className={`p-2 rounded-lg cursor-pointer transition-colors flex flex-wrap items-start gap-3 ${
                        isSelected
                          ? "bg-indigo-950/60 border border-indigo-500/60 text-slate-100"
                          : "hover:bg-slate-950/60 text-slate-300"
                      }`}
                    >
                      <span className="text-slate-400 text-[11px] shrink-0">{log.timestamp.slice(11, 23)}</span>
                      <span className="text-indigo-400 font-semibold shrink-0">[{log.workerThread}]</span>
                      <span className="text-cyan-400 font-semibold shrink-0">[{log.moduleTag}]</span>
                      <span
                        className={`px-1.5 py-0.2 rounded text-[10px] font-bold uppercase shrink-0 ${
                          log.level === "INFO"
                            ? "bg-emerald-500/20 text-emerald-300"
                            : log.level === "DEBUG"
                            ? "bg-slate-800 text-slate-400"
                            : log.level === "WARN"
                            ? "bg-amber-500/20 text-amber-300"
                            : "bg-rose-500/20 text-rose-300"
                        }`}
                      >
                        {log.level}
                      </span>
                      <span className="break-all">{log.message}</span>
                    </div>
                  );
                })}
              </div>
            </JXCardContent>
          </JXCard>
        </JXGridItem>

        {/* Structured JSON Detail Inspection Drawer */}
        <JXGridItem colSpan={4}>
          <JXCard className="bg-slate-900/60 border-slate-800">
            <JXCardHeader
              title="Log details"
              icon={<FileCode className="w-5 h-5 text-indigo-400" />}
            />
            <JXCardContent>
              {selectedEntry ? (
                <div className="space-y-4 text-xs font-mono">
                  <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Service:</span>
                      <span className="text-slate-200 font-semibold">{selectedEntry.service}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Worker PID:</span>
                      <span className="text-slate-200">{selectedEntry.pid}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Trace ID:</span>
                      <span className="text-cyan-400 font-bold">{selectedEntry.traceId}</span>
                    </div>
                  </div>

                  {/* Actions: Filter by Trace ID & Pin to Audit Trail */}
                  <div className="flex flex-wrap gap-2">
                    <JXButton
                      variant="soft"
                      color="primary"
                      size="sm"
                      onClick={() => setActiveTraceFilter(selectedEntry.traceId)}
                      startIcon={<Search className="w-3.5 h-3.5" />}
                    >
                      Filter by Trace ID
                    </JXButton>
                    <JXButton
                      variant="outlined"
                      color="neutral"
                      size="sm"
                      onClick={() => setCurrentView("audit-trail")}
                      startIcon={<Pin className="w-3.5 h-3.5" />}
                    >
                      Pin to Audit Trail
                    </JXButton>
                  </div>

                  {/* Formatted JSON Payload Attributes */}
                  <div className="space-y-1.5">
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider block">
                      Parsed Structured Attributes
                    </span>
                    <pre className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-[11px] text-slate-300 overflow-x-auto max-h-56 overflow-y-auto">
                      <code>{JSON.stringify(selectedEntry.details, null, 2)}</code>
                    </pre>
                  </div>

                </div>
              ) : (
                <div className="p-8 text-center text-slate-400 text-sm">
                  Select a log to see its details.
                </div>
              )}
            </JXCardContent>
          </JXCard>
        </JXGridItem>
      </JXGrid>

    </div>
  );
};

export default DiagnosticsLogsView;

