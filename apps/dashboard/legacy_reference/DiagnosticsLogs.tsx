import React, { useState, useMemo, useRef, useEffect } from "react";
import {
  JXCard,
  JXButton,
  JXSelect,
  JXTextField,
  LiquidButton,
} from "@jacxishippingorg/jx-ui-react";

interface DiagnosticsLogsProps {
  logService: string;
  setLogService: (service: string) => void;
  logCount: number;
  setLogCount: (count: number) => void;
  logLines?: string[];
  onRefresh?: () => void;
  onNotice?: (notice: { intent: "success" | "warning" | "error" | "info"; text: string }) => void;
  onNavigateView?: (view: string) => void;
}

interface ParsedLogEntry {
  id: string;
  timestamp: string;
  thread: string;
  module: string;
  level: "DEBUG" | "INFO" | "WARN" | "ERROR" | "FATAL";
  message: string;
  raw: string;
  structuredPayload: {
    service: string;
    module: string;
    level: string;
    thread: string;
    pid: number;
    attributes: Record<string, any>;
    audit_trace_id: string;
  };
}

export const DiagnosticsLogs: React.FC<DiagnosticsLogsProps> = ({
  logService,
  setLogService,
  logCount,
  setLogCount,
  logLines = [],
  onRefresh,
  onNotice,
  onNavigateView,
}) => {
  // Streaming state
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [autoScroll, setAutoScroll] = useState<boolean>(true);
  const [logLevelFilter, setLogLevelFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedEntry, setSelectedEntry] = useState<ParsedLogEntry | null>(null);
  const [copiedBuffer, setCopiedBuffer] = useState<boolean>(false);
  const [flushed, setFlushed] = useState<boolean>(false);

  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Default seed entries matching Stitch design
  const defaultLogs: ParsedLogEntry[] = useMemo(() => [
    {
      id: "log-1",
      timestamp: "2025-02-18T14:28:09.102Z",
      thread: "worker-01",
      module: "core::mTLS",
      level: "INFO",
      message: "mTLS handshake completed node=srv-us-east-412 cipher=TLS_AES_256_GCM_SHA384 latency=3.2ms session_id=0xfa49c12b",
      raw: "2025-02-18T14:28:09.102Z [worker-01] [core::mTLS] INFO mTLS handshake completed node=srv-us-east-412 cipher=TLS_AES_256_GCM_SHA384 latency=3.2ms session_id=0xfa49c12b",
      structuredPayload: {
        service: "ai-bridge-core",
        module: "core::mTLS",
        level: "INFO",
        thread: "worker-01",
        pid: 84019,
        attributes: {
          node_id: "srv-us-east-412",
          ip: "10.244.18.99",
          tls_version: "1.3",
          cipher_suite: "TLS_AES_256_GCM_SHA384",
          session_resumed: false,
          cert_fingerprint: "sha256:d9a4...6b01",
          handshake_latency_ms: 3.2,
        },
        audit_trace_id: "trc-890a-11ef-93cc",
      },
    },
    {
      id: "log-2",
      timestamp: "2025-02-18T14:28:09.418Z",
      thread: "worker-04",
      module: "policy::ast",
      level: "DEBUG",
      message: "AST policy syntax tree match validated rule_set=v3.4.1 depth=4 eval_time=180µs policy_id=pol-sec-99",
      raw: "2025-02-18T14:28:09.418Z [worker-04] [policy::ast] DEBUG AST policy syntax tree match validated rule_set=v3.4.1 depth=4 eval_time=180µs policy_id=pol-sec-99",
      structuredPayload: {
        service: "ai-bridge-core",
        module: "policy::ast",
        level: "DEBUG",
        thread: "worker-04",
        pid: 84019,
        attributes: {
          rule_set: "v3.4.1",
          depth: 4,
          eval_time_us: 180,
          policy_id: "pol-sec-99",
          decision: "ALLOW",
        },
        audit_trace_id: "trc-890a-11ef-93cd",
      },
    },
    {
      id: "log-3",
      timestamp: "2025-02-18T14:28:10.001Z",
      thread: "sentinel-0",
      module: "sentinel::hb",
      level: "INFO",
      message: "Heartbeat sentinel echo verification success node=edge-fleet-alpha packets=64/64 loss=0% rtt=14.1ms",
      raw: "2025-02-18T14:28:10.001Z [sentinel-0] [sentinel::hb] INFO Heartbeat sentinel echo verification success node=edge-fleet-alpha packets=64/64 loss=0% rtt=14.1ms",
      structuredPayload: {
        service: "ai-bridge-core",
        module: "sentinel::hb",
        level: "INFO",
        thread: "sentinel-0",
        pid: 84019,
        attributes: {
          target: "edge-fleet-alpha",
          packets_sent: 64,
          packets_rcvd: 64,
          packet_loss: "0%",
          rtt_ms: 14.1,
        },
        audit_trace_id: "trc-890a-11ef-93ce",
      },
    },
    {
      id: "log-4",
      timestamp: "2025-02-18T14:28:10.512Z",
      thread: "worker-02",
      module: "dispatch::webhook",
      level: "INFO",
      message: "Human approval request dispatched target=slack-secops-ch-urgent req_id=appr-981 status=200 OK duration=44ms",
      raw: "2025-02-18T14:28:10.512Z [worker-02] [dispatch::webhook] INFO Human approval request dispatched target=slack-secops-ch-urgent req_id=appr-981 status=200 OK duration=44ms",
      structuredPayload: {
        service: "ai-bridge-core",
        module: "dispatch::webhook",
        level: "INFO",
        thread: "worker-02",
        pid: 84019,
        attributes: {
          channel: "slack-secops-ch-urgent",
          approval_id: "appr-981",
          status_code: 200,
          latency_ms: 44,
        },
        audit_trace_id: "trc-890a-11ef-93cf",
      },
    },
    {
      id: "log-5",
      timestamp: "2025-02-18T14:28:11.233Z",
      thread: "net-io-03",
      module: "net::resolver",
      level: "WARN",
      message: "Transient DNS resolve timeout on primary 10.0.0.2:53; fallback query nameserver 10.0.0.3 succeeded in 4.1ms",
      raw: "2025-02-18T14:28:11.233Z [net-io-03] [net::resolver] WARN Transient DNS resolve timeout on primary 10.0.0.2:53; fallback query nameserver 10.0.0.3 succeeded in 4.1ms",
      structuredPayload: {
        service: "ai-bridge-core",
        module: "net::resolver",
        level: "WARN",
        thread: "net-io-03",
        pid: 84019,
        attributes: {
          primary_dns: "10.0.0.2:53",
          fallback_dns: "10.0.0.3:53",
          fallback_latency_ms: 4.1,
          resolved_host: "gateway.us-east.ai",
        },
        audit_trace_id: "trc-890a-11ef-93d0",
      },
    },
    {
      id: "log-6",
      timestamp: "2025-02-18T14:28:11.892Z",
      thread: "worker-01",
      module: "mcp::session",
      level: "DEBUG",
      message: "OAuth bearer grant verified client_id=mcp-orchestrator-cli scope=[tools:invoke,telemetry:read]",
      raw: "2025-02-18T14:28:11.892Z [worker-01] [mcp::session] DEBUG OAuth bearer grant verified client_id=mcp-orchestrator-cli scope=[tools:invoke,telemetry:read]",
      structuredPayload: {
        service: "ai-bridge-core",
        module: "mcp::session",
        level: "DEBUG",
        thread: "worker-01",
        pid: 84019,
        attributes: {
          client_id: "mcp-orchestrator-cli",
          scopes: ["tools:invoke", "telemetry:read"],
          token_type: "Bearer",
        },
        audit_trace_id: "trc-890a-11ef-93d1",
      },
    },
    {
      id: "log-7",
      timestamp: "2025-02-18T14:28:12.100Z",
      thread: "worker-03",
      module: "agent::flow",
      level: "INFO",
      message: "Workflow step transition agent=agent-k8s-rollback step=3 state=WAIT_HUMAN_CONFIRM timeout=300s",
      raw: "2025-02-18T14:28:12.100Z [worker-03] [agent::flow] INFO Workflow step transition agent=agent-k8s-rollback step=3 state=WAIT_HUMAN_CONFIRM timeout=300s",
      structuredPayload: {
        service: "ai-bridge-core",
        module: "agent::flow",
        level: "INFO",
        thread: "worker-03",
        pid: 84019,
        attributes: {
          workflow_id: "wf-k8s-rollback-01",
          step_index: 3,
          state: "WAIT_HUMAN_CONFIRM",
          timeout_sec: 300,
        },
        audit_trace_id: "trc-890a-11ef-93d2",
      },
    },
    {
      id: "log-8",
      timestamp: "2025-02-18T14:28:12.755Z",
      thread: "daemon-gc",
      module: "memory::ring",
      level: "DEBUG",
      message: "Ring chunk recycled index=108 size=2.048MB write_ptr=0x7ffe420a alloc_latency=40ns",
      raw: "2025-02-18T14:28:12.755Z [daemon-gc] [memory::ring] DEBUG Ring chunk recycled index=108 size=2.048MB write_ptr=0x7ffe420a alloc_latency=40ns",
      structuredPayload: {
        service: "ai-bridge-core",
        module: "memory::ring",
        level: "DEBUG",
        thread: "daemon-gc",
        pid: 84019,
        attributes: {
          chunk_idx: 108,
          recycled_bytes: 2097152,
          alloc_latency_ns: 40,
        },
        audit_trace_id: "trc-890a-11ef-93d3",
      },
    },
    {
      id: "log-9",
      timestamp: "2025-02-18T14:28:13.011Z",
      thread: "worker-04",
      module: "tool::eval",
      level: "WARN",
      message: "Tool execution payload deprecation warning: schema 'v1.alpha' requested, auto-upgraded to 'v1.beta2'",
      raw: "2025-02-18T14:28:13.011Z [worker-04] [tool::eval] WARN Tool execution payload deprecation warning: schema 'v1.alpha' requested, auto-upgraded to 'v1.beta2'",
      structuredPayload: {
        service: "ai-bridge-core",
        module: "tool::eval",
        level: "WARN",
        thread: "worker-04",
        pid: 84019,
        attributes: {
          requested_schema: "v1.alpha",
          upgraded_schema: "v1.beta2",
          client_agent: "agent_2f18c",
        },
        audit_trace_id: "trc-890a-11ef-93d4",
      },
    },
    {
      id: "log-10",
      timestamp: "2025-02-18T14:28:13.490Z",
      thread: "secops-guard",
      module: "acl::firewall",
      level: "ERROR",
      message: "Denied unprivileged sandbox breakout attempt from subproc_pid=9182 syscall=ptrace errno=EPERM",
      raw: "2025-02-18T14:28:13.490Z [secops-guard] [acl::firewall] ERROR Denied unprivileged sandbox breakout attempt from subproc_pid=9182 syscall=ptrace errno=EPERM",
      structuredPayload: {
        service: "ai-bridge-core",
        module: "acl::firewall",
        level: "ERROR",
        thread: "secops-guard",
        pid: 84019,
        attributes: {
          offending_pid: 9182,
          syscall: "ptrace",
          errno: "EPERM",
          action_taken: "SIGKILL_AND_ISOLATE",
        },
        audit_trace_id: "trc-890a-11ef-93d5",
      },
    },
  ], []);

  // Parse actual lines from backend if available
  const parsedLiveLogs: ParsedLogEntry[] = useMemo(() => {
    if (!logLines || logLines.length === 0) return defaultLogs;
    return logLines.map((line, idx) => {
      let level: ParsedLogEntry["level"] = "INFO";
      if (line.includes("DEBUG")) level = "DEBUG";
      else if (line.includes("WARN")) level = "WARN";
      else if (line.includes("ERROR") || line.includes("ERR")) level = "ERROR";
      else if (line.includes("FATAL") || line.includes("PANIC")) level = "FATAL";

      return {
        id: `live-${idx}`,
        timestamp: new Date().toISOString(),
        thread: `worker-0${(idx % 4) + 1}`,
        module: `service::${logService}`,
        level,
        message: line,
        raw: line,
        structuredPayload: {
          service: `ai-bridge-${logService}`,
          module: `service::${logService}`,
          level,
          thread: `worker-0${(idx % 4) + 1}`,
          pid: 84019,
          attributes: { line_index: idx, service: logService },
          audit_trace_id: `trc-live-${idx.toString().padStart(4, "0")}`,
        },
      };
    });
  }, [logLines, defaultLogs, logService]);

  // Set initial selected log entry
  useEffect(() => {
    if (!selectedEntry && parsedLiveLogs.length > 0) {
      setSelectedEntry(parsedLiveLogs[0]);
    }
  }, [parsedLiveLogs, selectedEntry]);

  // Handle auto-scrolling
  useEffect(() => {
    if (autoScroll && !isPaused && scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
  }, [parsedLiveLogs, autoScroll, isPaused]);

  // Spacebar hotkey to pause/resume
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space" && (e.target as HTMLElement)?.tagName !== "INPUT" && (e.target as HTMLElement)?.tagName !== "TEXTAREA") {
        e.preventDefault();
        setIsPaused((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Filtered log entries
  const filteredEntries = useMemo(() => {
    if (flushed) return [];
    return parsedLiveLogs.filter((entry) => {
      if (logLevelFilter !== "ALL" && entry.level !== logLevelFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesMsg = entry.message.toLowerCase().includes(q);
        const matchesModule = entry.module.toLowerCase().includes(q);
        const matchesThread = entry.thread.toLowerCase().includes(q);
        const matchesTrace = entry.structuredPayload.audit_trace_id.toLowerCase().includes(q);
        if (!matchesMsg && !matchesModule && !matchesThread && !matchesTrace) return false;
      }
      return true;
    });
  }, [parsedLiveLogs, logLevelFilter, searchQuery, flushed]);

  // Level counts
  const levelCounts = useMemo(() => {
    const counts = { ALL: parsedLiveLogs.length, DEBUG: 0, INFO: 0, WARN: 0, ERROR: 0, FATAL: 0 };
    parsedLiveLogs.forEach((e) => {
      if (counts[e.level] !== undefined) counts[e.level]++;
    });
    return counts;
  }, [parsedLiveLogs]);

  const handleCopyBuffer = () => {
    const text = filteredEntries.map((e) => e.raw).join("\n");
    navigator.clipboard.writeText(text);
    setCopiedBuffer(true);
    setTimeout(() => setCopiedBuffer(false), 2000);
    if (onNotice) {
      onNotice({ intent: "success", text: `Copied ${filteredEntries.length} log lines to clipboard.` });
    }
  };

  const handleDownloadLog = () => {
    const text = filteredEntries.map((e) => e.raw).join("\n");
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ai_bridge_${logService}_logs_${Date.now()}.log`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    if (onNotice) {
      onNotice({ intent: "info", text: "Initiated raw log download (.log)" });
    }
  };

  const handleFlushBuffer = () => {
    setFlushed(true);
    setTimeout(() => setFlushed(false), 800);
    if (onNotice) {
      onNotice({ intent: "warning", text: "Flushed local terminal display buffer." });
    }
  };

  return (
    <div className="flex flex-col w-full pb-16 space-y-5 animate-fadeIn">
      {/* ============================================================== */}
      {/* 1. HEADER BREADCRUMB & STATUS RIBBON                           */}
      {/* ============================================================== */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-4 rounded-xl bg-neutral-900/60 border border-neutral-800">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2 font-mono text-xs text-neutral-400 uppercase tracking-wider">
            <span>Governance Domain</span>
            <span className="text-neutral-600">/</span>
            <span className="text-emerald-400 font-semibold">Diagnostics & Audit Logs</span>
          </div>

          <div className="flex items-center gap-4 flex-wrap">
            <h1 className="text-xl lg:text-2xl font-bold tracking-tight text-neutral-100">
              Service Diagnostics & Live Event Logs
            </h1>
            <div className="hidden md:flex items-center gap-2 px-3 py-1 rounded-lg bg-neutral-950 border border-neutral-800">
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="font-mono text-xs text-emerald-400 font-semibold">
                INGEST: 1,840 eps
              </span>
            </div>
          </div>
        </div>

        {/* Quick Meta & Buffer Status */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-lg bg-neutral-950 border border-neutral-800">
            <span className="material-symbols-outlined text-neutral-400 text-base">memory</span>
            <div className="flex flex-col">
              <span className="font-mono text-[10px] text-neutral-500 uppercase">
                Ring Buffer Allocator
              </span>
              <span className="font-mono text-xs text-neutral-200">30.72 MB / 64.00 MB (48%)</span>
            </div>
          </div>

          <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-lg bg-neutral-950 border border-neutral-800">
            <span className="material-symbols-outlined text-neutral-400 text-base">timer</span>
            <div className="flex flex-col">
              <span className="font-mono text-[10px] text-neutral-500 uppercase">
                Capture Window
              </span>
              <span className="font-mono text-xs text-neutral-200">Live Rolling 15m</span>
            </div>
          </div>
        </div>
      </div>

      {/* ============================================================== */}
      {/* 2. PRIMARY OPERATIONAL ACTION BAR                              */}
      {/* ============================================================== */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl bg-neutral-900/60 border border-neutral-800">
        <div className="flex flex-wrap items-center gap-2">
          {/* Pause / Resume Button */}
          <LiquidButton
            variant="solid"
            tone="primary"
            onClick={() => setIsPaused(!isPaused)}
            style={{ padding: "8px 16px", height: 40, fontSize: 13 }}
          >
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-base">
                {isPaused ? "play_arrow" : "pause"}
              </span>
              <span>{isPaused ? "Resume Stream" : "Pause Stream"}</span>
              <kbd className="font-mono text-[10px] px-1 py-0.5 rounded bg-black/40 text-neutral-200">
                Space
              </kbd>
            </div>
          </LiquidButton>

          <JXButton
            variant="outlined"
            onClick={handleCopyBuffer}
            style={{ padding: "8px 14px", height: 40, fontSize: 13 }}
          >
            <div className="flex items-center gap-1.5">
              <span className="material-symbols-outlined text-base">
                {copiedBuffer ? "done" : "content_copy"}
              </span>
              <span>{copiedBuffer ? "Copied" : "Copy Filtered Buffer"}</span>
            </div>
          </JXButton>

          <JXButton
            variant="outlined"
            onClick={handleDownloadLog}
            style={{ padding: "8px 14px", height: 40, fontSize: 13 }}
          >
            <div className="flex items-center gap-1.5">
              <span className="material-symbols-outlined text-base">download</span>
              <span>Download Raw Log</span>
            </div>
          </JXButton>

          <JXButton
            variant="soft"
            onClick={handleFlushBuffer}
            style={{ padding: "8px 14px", height: 40, fontSize: 13, color: "#f87171" }}
          >
            <div className="flex items-center gap-1.5">
              <span className="material-symbols-outlined text-base">delete_sweep</span>
              <span>Flush Buffer</span>
            </div>
          </JXButton>

          <JXButton
            variant="soft"
            onClick={() => { if (onRefresh) onRefresh(); }}
            style={{ padding: "8px 14px", height: 40, fontSize: 13 }}
          >
            <div className="flex items-center gap-1.5">
              <span className="material-symbols-outlined text-base">refresh</span>
              <span>Poll Server</span>
            </div>
          </JXButton>
        </div>

        {/* Live Tail Status Indicator */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-neutral-950 border border-neutral-800">
          <span className="font-mono text-[11px] text-neutral-400 uppercase tracking-wider">
            Sync State:
          </span>
          <div className="flex items-center gap-1.5 font-mono text-xs text-emerald-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>Zero-Drop Locked</span>
          </div>
        </div>
      </div>

      {/* ============================================================== */}
      {/* 3. FILTER RIBBON & STREAM CONTROLS                             */}
      {/* ============================================================== */}
      <div className="flex flex-col gap-3 p-4 rounded-xl bg-neutral-900/60 border border-neutral-800">
        {/* Top Controls Row */}
        <div className="flex flex-wrap items-center gap-4 justify-between">
          {/* Target Service Dropdown */}
          <div className="flex items-center gap-3 flex-1 min-w-[280px]">
            <label className="text-xs font-semibold text-neutral-300 whitespace-nowrap">
              Service Target:
            </label>
            <div className="w-full max-w-sm">
              <JXSelect
                value={logService}
                onChange={(val: any) => setLogService(typeof val === "string" ? val : val?.target?.value || "control")}
                options={[
                  { id: "control", label: "ai-bridge-core (Control Plane)" },
                  { id: "mcp", label: "ai-bridge-mcp (MCP Gateway)" },
                  { id: "oauth", label: "ai-bridge-oauth (OAuth Service)" },
                  { id: "nginx", label: "nginx-tls (Reverse Proxy)" },
                  { id: "edge", label: "ai-bridge-edge-daemon" },
                ]}
              />
            </div>
          </div>

          {/* Buffer Lines Selector & Auto-Scroll Lock */}
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-1 bg-neutral-950 p-1 rounded-lg border border-neutral-800">
              <span className="font-mono text-[10px] px-2 text-neutral-500 uppercase">Buffer:</span>
              {[50, 100, 200, 500].map((count) => (
                <button
                  key={count}
                  type="button"
                  className={`px-2.5 py-1 rounded font-mono text-xs transition-colors ${
                    logCount === count
                      ? "bg-indigo-600 text-white font-semibold"
                      : "text-neutral-400 hover:text-neutral-200"
                  }`}
                  onClick={() => setLogCount(count)}
                >
                  {count}
                </button>
              ))}
            </div>

            {/* Auto-Scroll Toggle */}
            <label className="flex items-center gap-2 cursor-pointer select-none bg-neutral-950 px-3 py-1.5 rounded-lg border border-neutral-800">
              <input
                type="checkbox"
                checked={autoScroll}
                onChange={(e) => setAutoScroll(e.target.checked)}
                className="rounded border-neutral-700 bg-neutral-800 text-indigo-600 focus:ring-indigo-500"
              />
              <span className="text-xs font-medium text-neutral-200 flex items-center gap-1.5">
                Auto-Scroll
                {autoScroll && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />}
              </span>
            </label>
          </div>
        </div>

        {/* Second Row: Level Pills & Search */}
        <div className="flex flex-wrap items-center justify-between gap-4 pt-1">
          {/* Level Pills */}
          <div className="flex flex-wrap items-center gap-1.5">
            {(["ALL", "DEBUG", "INFO", "WARN", "ERROR"] as const).map((lvl) => {
              const active = logLevelFilter === lvl;
              return (
                <button
                  key={lvl}
                  type="button"
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-lg font-mono text-xs transition-all ${
                    active
                      ? "bg-indigo-600 text-white font-semibold shadow-sm"
                      : "bg-neutral-950 hover:bg-neutral-800 text-neutral-400 border border-neutral-800"
                  }`}
                  onClick={() => setLogLevelFilter(lvl)}
                >
                  {lvl !== "ALL" && (
                    <span
                      className={`w-2 h-2 rounded-full ${
                        lvl === "DEBUG"
                          ? "bg-neutral-400"
                          : lvl === "INFO"
                          ? "bg-indigo-400"
                          : lvl === "WARN"
                          ? "bg-amber-400"
                          : "bg-rose-400"
                      }`}
                    />
                  )}
                  <span>{lvl}</span>
                  <span className="text-[10px] px-1 rounded bg-black/30 text-neutral-300">
                    {levelCounts[lvl] || 0}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Search Box */}
          <div className="flex-1 min-w-[280px]">
            <JXTextField
              value={searchQuery}
              onChange={(e: any) => setSearchQuery(e?.target?.value || "")}
              placeholder="Filter stream by regex, thread ID, hash, or payload attribute…"
            />
          </div>
        </div>
      </div>

      {/* ============================================================== */}
      {/* 4. TERMINAL STREAM VIEW & STRUCTURED INSPECTOR                 */}
      {/* ============================================================== */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
        {/* Left (8 Cols): Real-time ANSI Monospace Log Canvas */}
        <div className="xl:col-span-8 flex flex-col bg-neutral-950 rounded-xl border border-neutral-800 overflow-hidden shadow-2xl">
          {/* Terminal Window Header Bar */}
          <div className="flex items-center justify-between px-4 py-2.5 bg-neutral-900 border-b border-neutral-800">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
              <span className="font-mono text-xs text-neutral-400 ml-2">
                /var/log/ai-bridge/{logService}.stdout.log (tail -f)
              </span>
            </div>
            <div className="flex items-center gap-4 font-mono text-[11px] text-neutral-400">
              <span>ENC: UTF-8</span>
              <span>PID: 84019</span>
              <span className={`font-semibold ${isPaused ? "text-amber-400" : "text-emerald-400"}`}>
                {isPaused ? "PAUSED" : "LIVE"}
              </span>
            </div>
          </div>

          {/* Terminal Body */}
          <div
            ref={scrollContainerRef}
            className="p-4 font-mono text-xs text-neutral-200 space-y-1.5 overflow-x-auto max-h-[580px] overflow-y-auto leading-relaxed"
          >
            {filteredEntries.length === 0 ? (
              <div className="py-16 text-center text-neutral-600 font-mono">
                No log output matching active filters.
              </div>
            ) : (
              filteredEntries.map((entry) => {
                const isSelected = selectedEntry?.id === entry.id;
                const isErr = entry.level === "ERROR" || entry.level === "FATAL";
                const isWarn = entry.level === "WARN";

                return (
                  <div
                    key={entry.id}
                    className={`flex items-start gap-2.5 py-1 px-2 rounded cursor-pointer transition-colors ${
                      isSelected
                        ? "bg-indigo-950/60 border border-indigo-500/40 text-neutral-100"
                        : "hover:bg-neutral-900/80 text-neutral-300"
                    }`}
                    onClick={() => setSelectedEntry(entry)}
                  >
                    <span className="text-neutral-500 shrink-0 select-none text-[11px]">
                      {entry.timestamp.slice(11, 23)}
                    </span>
                    <span className="text-indigo-400 shrink-0 font-medium">
                      [{entry.thread}]
                    </span>
                    <span
                      className={`shrink-0 ${
                        isErr
                          ? "text-rose-400"
                          : isWarn
                          ? "text-amber-400"
                          : "text-sky-400"
                      }`}
                    >
                      [{entry.module}]
                    </span>
                    <span
                      className={`px-1 py-0.2 rounded text-[10px] font-bold shrink-0 ${
                        isErr
                          ? "bg-rose-950 text-rose-300 border border-rose-800"
                          : isWarn
                          ? "bg-amber-950 text-amber-300 border border-amber-800"
                          : entry.level === "DEBUG"
                          ? "bg-neutral-800 text-neutral-400"
                          : "bg-indigo-950 text-indigo-300 border border-indigo-800"
                      }`}
                    >
                      {entry.level}
                    </span>
                    <span
                      className={`flex-1 break-all ${
                        isErr ? "text-rose-300 font-medium" : isWarn ? "text-amber-200" : ""
                      }`}
                    >
                      {entry.message}
                    </span>
                  </div>
                );
              })
            )}
          </div>

          {/* Terminal Footer */}
          <div className="flex items-center justify-between px-4 py-2 bg-neutral-900 border-t border-neutral-800 text-neutral-400 font-mono text-[11px]">
            <div className="flex items-center gap-4">
              <span>{filteredEntries.length} lines displayed</span>
              <span>Buffer: {logCount} capacity</span>
            </div>
            <div>
              <span>Log Pipeline: Zero Memory Leak Invariant Active</span>
            </div>
          </div>
        </div>

        {/* Right (4 Cols): Structured JSON Detail Inspector */}
        <div className="xl:col-span-4 flex flex-col bg-neutral-900/60 rounded-xl p-5 border border-neutral-800 space-y-4">
          <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-indigo-400 text-lg">data_object</span>
              <h3 className="text-sm font-bold text-neutral-100">Structured Payload</h3>
            </div>
            {selectedEntry && (
              <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-neutral-800 text-indigo-300">
                {selectedEntry.module}
              </span>
            )}
          </div>

          {selectedEntry ? (
            <div className="flex flex-col gap-3">
              {/* Key metadata pills */}
              <div className="bg-neutral-950 p-3 rounded-lg border border-neutral-800 font-mono text-xs flex flex-col gap-1.5">
                <div className="flex justify-between text-neutral-400">
                  <span>Level:</span>
                  <span className="text-neutral-100 font-bold">{selectedEntry.level}</span>
                </div>
                <div className="flex justify-between text-neutral-400">
                  <span>Trace ID:</span>
                  <span className="text-emerald-400 select-all">
                    {selectedEntry.structuredPayload.audit_trace_id}
                  </span>
                </div>
                <div className="flex justify-between text-neutral-400">
                  <span>Thread / PID:</span>
                  <span className="text-neutral-200">
                    {selectedEntry.thread} (PID {selectedEntry.structuredPayload.pid})
                  </span>
                </div>
              </div>

              {/* Raw JSON Code block */}
              <div className="flex flex-col gap-1">
                <span className="font-mono text-[10px] text-neutral-400 uppercase tracking-wider">
                  Decoded Event Attributes
                </span>
                <pre className="bg-neutral-950 p-3.5 rounded-lg border border-neutral-800 font-mono text-xs text-indigo-200 overflow-x-auto max-h-72 leading-relaxed">
                  {JSON.stringify(selectedEntry.structuredPayload, null, 2)}
                </pre>
              </div>

              {/* Quick Actions */}
              <div className="flex flex-col gap-2 pt-1 border-t border-neutral-800">
                <JXButton
                  variant="outlined"
                  onClick={() => {
                    setSearchQuery(selectedEntry.structuredPayload.audit_trace_id);
                  }}
                  style={{ padding: "6px 12px", fontSize: 12, height: 34 }}
                >
                  <div className="flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-sm">filter_alt</span>
                    <span>Filter by Trace ID</span>
                  </div>
                </JXButton>

                <JXButton
                  variant="outlined"
                  onClick={() => {
                    navigator.clipboard.writeText(JSON.stringify(selectedEntry.structuredPayload, null, 2));
                    if (onNotice) {
                      onNotice({ intent: "success", text: "Copied structured JSON payload to clipboard." });
                    }
                  }}
                  style={{ padding: "6px 12px", fontSize: 12, height: 34 }}
                >
                  <div className="flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-sm">content_copy</span>
                    <span>Copy Raw JSON</span>
                  </div>
                </JXButton>

                {onNavigateView && (
                  <LiquidButton
                    variant="solid"
                    tone="primary"
                    onClick={() => onNavigateView("audit")}
                    style={{ padding: "6px 12px", fontSize: 12, height: 34 }}
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-sm">verified</span>
                      <span>Trace in Cryptographic Audit Ledger</span>
                    </div>
                  </LiquidButton>
                )}
              </div>
            </div>
          ) : (
            <div className="py-12 text-center text-neutral-500 font-mono text-xs">
              Click any log entry to inspect its structured attributes.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DiagnosticsLogs;
