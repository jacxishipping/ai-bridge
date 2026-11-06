/**
 * AI Bridge Enterprise Dashboard â€” Interactive Terminal (Screen 6)
 * Live mode (signed in): real session on the control plane via the terminal API
 * (create / SSE stream via fetch / input / resize / close). No fabricated output.
 * Demo mode (not signed in): clearly labelled local simulation using DEMO_* fixtures only.
 * ZERO inline styles.
 */

import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  Terminal as TerminalIcon,
  Zap,
  Download,
  RotateCcw,
  Trash2,
  StopCircle,
  Play,
  ArrowRight,
} from "lucide-react";
import { useDashboardStore } from "../state/dashboardStore";
import { api, apiOrigin, token, sessionToken } from "../api";

interface TerminalLine {
  id: string;
  type: "motd" | "command" | "output" | "error" | "warn" | "info";
  text: string;
  commandText?: string;
  cwd?: string;
}

// ---------------------------------------------------------------------------
// DEMO-ONLY fixtures (never used when signed in)
// ---------------------------------------------------------------------------
const DEMO_TERMINAL_LINES: TerminalLine[] = [
  {
    id: "line-motd-1",
    type: "motd",
    text: "Welcome to Ubuntu 24.04.1 LTS (GNU/Linux 6.8.0-31-generic x86_64)",
  },
  {
    id: "line-motd-2",
    type: "motd",
    text: "System load: 0.28, 0.42, 0.38 | Memory usage: 24.1% of 64GB | Swap: 0%",
  },
  {
    id: "line-motd-3",
    type: "motd",
    text: "Last interactive login: Mon Oct 28 14:18:02 2024 from 10.240.12.8 (bastion-gateway)",
  },
  {
    id: "line-cmd-1",
    type: "command",
    commandText: "systemctl status ai-bridge-agent.service",
    cwd: "~",
    text: "",
  },
  {
    id: "line-out-1",
    type: "output",
    text: "â— ai-bridge-agent.service - AI Bridge Enterprise Gateway Host Daemon\n   Loaded: loaded (/etc/systemd/system/ai-bridge-agent.service; enabled; vendor preset: enabled)\n   Active: active (running) since Sun 2024-10-27 06:12:44 UTC; 1 day 8h ago\n Main PID: 18492 (agent_worker)\n    Tasks: 28 (limit: 77174)\n   Memory: 412.4M (peak: 512.0M, limit: 2.0G)\n      CPU: 18min 42.129s\n   CGroup: /system.slice/ai-bridge-agent.service\n           â”œâ”€18492 /opt/ai-bridge/bin/agent_worker --config /etc/ai-bridge/fleet.yaml --mtls-strict\n           â””â”€18504 /opt/ai-bridge/bin/pty_multiplexer --unix-socket /run/ai-bridge/pty.sock",
  },
  {
    id: "line-cmd-2",
    type: "command",
    commandText: "ps aux | grep agent_worker",
    cwd: "~",
    text: "",
  },
  {
    id: "line-out-2",
    type: "output",
    text: "USER       PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND\nai-ops   18492  1.2  0.6 1420944 422312 ?        Ssl  Oct27  18:42 /opt/ai-bridge/bin/agent_worker --tier=edge\nai-ops   18504  0.4  0.1  324810  68420 ?        Sl   Oct27   4:11 /opt/ai-bridge/bin/pty_multiplexer --max-channels=16\nroot     24108  0.0  0.0    8920   2412 pts/4    S+   14:22   0:00 grep --color=auto agent_worker",
  },
  {
    id: "line-cmd-3",
    type: "command",
    commandText: "ss -tulpn | grep -E ':(22|8080|8443)'",
    cwd: "~",
    text: "",
  },
  {
    id: "line-out-3",
    type: "output",
    text: "Netid State  Recv-Q Send-Q  Local Address:Port   Peer Address:Port Process\ntcp   LISTEN 0      128           0.0.0.0:22          0.0.0.0:*     users:((\"sshd\",pid=1120,fd=3))\ntcp   LISTEN 0      512         127.0.0.1:8080        0.0.0.0:*     users:((\"envoy\",pid=1432,fd=18))\ntcp   LISTEN 0      1024          0.0.0.0:8443        0.0.0.0:*     users:((\"agent_worker\",pid=18492,fd=7))",
  },
  {
    id: "line-cmd-4",
    type: "command",
    commandText: "tail -n 4 execution.log",
    cwd: "/var/log/ai-bridge",
    text: "",
  },
  {
    id: "line-out-4",
    type: "output",
    text: "2024-10-28T14:21:40.118Z [INFO] [grpc:channel] Handshake established with controller node cluster-east-ingress-04 (TLS 1.3 AES-GCM)\n2024-10-28T14:21:48.502Z [INFO] [task:runner] Dispatched execution task tsk_9482bf01 to isolated sandbox namespace ns_isolated_02\n2024-10-28T14:22:01.094Z [WARN] [vitals:watchdog] High disk IOPS on NVMe partition /data (utilization spiked to 88.2% for 2.4s)\n2024-10-28T14:22:15.931Z [INFO] [agent:sync] Policy posture evaluated against Zero-Trust Baseline v2.1 -> COMPLIANT",
  },
];

const SNIPPETS: { label: string; cmd: string; color: string; os?: "linux" | "windows" }[] = [
  { label: "systemctl restart ai-bridge-agent", cmd: "systemctl restart ai-bridge-agent", color: "text-emerald-400", os: "linux" },
  { label: "journalctl -u ai-bridge-agent -f -n 50", cmd: "journalctl -u ai-bridge-agent -f -n 50", color: "text-indigo-400", os: "linux" },
  { label: "htop --sort-key PERCENT_CPU", cmd: "htop --sort-key PERCENT_CPU", color: "text-cyan-400", os: "linux" },
  { label: "df -hT / /data", cmd: "df -hT / /data", color: "text-purple-400", os: "linux" },
  { label: "ip addr show dev eth0", cmd: "ip addr show dev eth0", color: "text-emerald-300", os: "linux" },
  { label: "docker ps --format 'table {{.Names}}\\t{{.Status}}'", cmd: "docker ps --format 'table {{.Names}}\\t{{.Status}}'", color: "text-amber-400" },
  { label: "ipconfig /all", cmd: "ipconfig /all", color: "text-cyan-300", os: "windows" },
  { label: "Get-Process | Sort CPU -Desc | Select -First 10", cmd: "Get-Process | Sort CPU -Desc | Select -First 10", color: "text-indigo-300", os: "windows" },
];

type LiveStatus = "idle" | "connecting" | "connected" | "closed" | "error";

interface LiveDevice {
  id: string;
  name?: string;
  hostname?: string;
  os?: string;
  status?: string;
  revoked?: number | boolean;
}

// eslint-disable-next-line no-control-regex
const ANSI_RE = /\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[()][A-Za-z0-9]|\x1b[=>]/g;
const MAX_LIVE_CHARS = 200_000;

/** Strip ANSI escapes and normalise carriage returns / backspaces for plain-text display. */
export function cleanTerminalText(raw: string): string {
  let s = raw.replace(ANSI_RE, "").replace(/\r\n/g, "\n").replace(/\r/g, "");
  // eslint-disable-next-line no-control-regex
  while (/[^\n\x08]\x08/.test(s)) s = s.replace(/[^\n\x08]\x08/g, "");
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x08/g, "").replace(/\x07/g, "");
}

function describeLiveError(e: unknown): string {
  const status = (e as { status?: number })?.status;
  const msg = e instanceof Error ? e.message : "Unknown error.";
  if (status === 401) return "Your session expired. Please sign in again.";
  if (status === 403) return `Terminal access denied or approval required. ${msg}`;
  if (status === 404) return `Terminal session or device not found. ${msg}`;
  if (status === 409 || status === 423) return `Terminal blocked by policy or device state. ${msg}`;
  return `Terminal session failed. ${msg}`;
}

export const TerminalView: React.FC = () => {
  const live = typeof window !== "undefined" && !!(token() || sessionToken());

  const demoDevices = useDashboardStore((s) => s.devices);
  const selectedDeviceId = useDashboardStore((s) => s.selectedDeviceId);
  const [targetNodeId, setTargetNodeId] = useState<string>(selectedDeviceId || "srv-us-east-412");

  // Live device list (the store only holds demo fixtures)
  const [liveDevices, setLiveDevices] = useState<LiveDevice[]>([]);
  const [liveDeviceId, setLiveDeviceId] = useState<string>("");
  const [devicesError, setDevicesError] = useState<string | null>(null);

  const demoTarget = demoDevices.find((d) => d.id === targetNodeId) || demoDevices[0];
  const liveTarget = liveDevices.find((d) => d.id === liveDeviceId);
  const isWindows = live
    ? (liveTarget?.os || "").toLowerCase().startsWith("win")
    : demoTarget?.platform === "windows";
  const targetHostname = live
    ? liveTarget?.hostname || liveTarget?.name || liveDeviceId || "device"
    : demoTarget?.hostname || "demo-node";

  const [lines, setLines] = useState<TerminalLine[]>(DEMO_TERMINAL_LINES);
  const [liveText, setLiveText] = useState<string>("");
  const [liveStatus, setLiveStatus] = useState<LiveStatus>("idle");
  const [liveError, setLiveError] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState<string>("");
  const [snippetMode, setSnippetMode] = useState<"insert" | "exec">("insert");
  const [autoScroll, setAutoScroll] = useState<boolean>(true);
  const [reconnectNotice, setReconnectNotice] = useState<string | null>(null);

  const terminalEndRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);

  const sessionRef = useRef<{ deviceId: string; id: string } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const genRef = useRef(0);
  const seqRef = useRef(0);
  const decoderRef = useRef<TextDecoder | null>(null);

  useEffect(() => {
    if (autoScroll) terminalEndRef.current?.scrollIntoView?.({ behavior: "smooth" });
  }, [lines, liveText, autoScroll]);

  const measureSize = useCallback(() => {
    const w = viewportRef.current?.clientWidth || 0;
    const cols = w > 0 ? Math.max(40, Math.min(300, Math.floor((w - 48) / 7.4))) : 120;
    return { cols, rows: 35 };
  }, []);

  // ---------------------------------------------------------------- live session
  const teardown = useCallback(() => {
    genRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    const s = sessionRef.current;
    sessionRef.current = null;
    if (s) api.closeTerminalSession(s.deviceId, s.id).catch(() => undefined);
  }, []);

  const appendLive = useCallback((text: string) => {
    setLiveText((prev) => {
      const next = prev + text;
      return next.length > MAX_LIVE_CHARS ? next.slice(next.length - MAX_LIVE_CHARS) : next;
    });
  }, []);

  const runStream = useCallback(
    async (deviceId: string, sessionId: string, gen: number) => {
      let failures = 0;
      while (genRef.current === gen) {
        const ctrl = new AbortController();
        abortRef.current = ctrl;
        try {
          const headers: Record<string, string> = { Accept: "text/event-stream" };
          const st = sessionToken();
          const at = token();
          if (st) headers["X-Session-Token"] = st;
          else if (at) headers["X-Admin-Token"] = at;
          const url = `${apiOrigin}/api/devices/${encodeURIComponent(deviceId)}/terminal/${encodeURIComponent(sessionId)}/stream?since_seq=${seqRef.current}`;
          const res = await fetch(url, { headers, signal: ctrl.signal });
          if (!res.ok || !res.body) {
            const err = new Error(`${res.status}: stream rejected`) as Error & { status?: number };
            err.status = res.status;
            if (res.status === 401 || res.status === 403 || res.status === 404) {
              if (genRef.current === gen) {
                setLiveError(describeLiveError(err));
                setLiveStatus(res.status === 404 ? "closed" : "error");
              }
              return;
            }
            throw err;
          }
          failures = 0;
          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          decoderRef.current = decoder;
          let buf = "";
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            buf += decoder.decode(value, { stream: true });
            let idx: number;
            while ((idx = buf.indexOf("\n\n")) >= 0) {
              const block = buf.slice(0, idx);
              buf = buf.slice(idx + 2);
              for (const ln of block.split("\n")) {
                if (!ln.startsWith("data:")) continue;
                try {
                  const ev = JSON.parse(ln.slice(5).trim());
                  if (genRef.current !== gen) return;
                  if (ev.type === "init") {
                    setLiveStatus("connected");
                  } else if (typeof ev.seq === "number" && typeof ev.text === "string") {
                    if (ev.seq > seqRef.current) {
                      seqRef.current = ev.seq;
                      appendLive(ev.text);
                    }
                  }
                } catch {
                  /* ignore malformed event */
                }
              }
            }
          }
          // Server ended the stream: the shell process exited.
          if (genRef.current === gen) setLiveStatus("closed");
          return;
        } catch (e) {
          if (genRef.current !== gen || (e as Error)?.name === "AbortError") return;
          failures += 1;
          if (failures > 3) {
            setLiveError("Lost connection to the terminal stream. Use Reconnect to start a new session.");
            setLiveStatus("error");
            return;
          }
          await new Promise((r) => setTimeout(r, 1000 * failures));
        }
      }
    },
    [appendLive],
  );

  const connect = useCallback(
    async (deviceId: string) => {
      teardown();
      const gen = genRef.current;
      seqRef.current = 0;
      setLiveText("");
      setLiveError(null);
      const dev = liveDevices.find((d) => d.id === deviceId);
      if (!dev) {
        setLiveStatus("idle");
        return;
      }
      if (dev.revoked || (dev.status || "").toLowerCase() !== "online") {
        setLiveStatus("error");
        setLiveError(`Device ${dev.hostname || dev.name || dev.id} is ${dev.revoked ? "revoked" : dev.status || "offline"}. A terminal can only be opened on an online device.`);
        return;
      }
      setLiveStatus("connecting");
      try {
        const { cols, rows } = measureSize();
        const sess = await api.createTerminalSession(deviceId, cols, rows);
        if (genRef.current !== gen) {
          api.closeTerminalSession(deviceId, sess.session_id).catch(() => undefined);
          return;
        }
        sessionRef.current = { deviceId, id: sess.session_id };
        void runStream(deviceId, sess.session_id, gen);
      } catch (e) {
        if (genRef.current !== gen) return;
        setLiveStatus("error");
        setLiveError(describeLiveError(e));
      }
    },
    [teardown, liveDevices, measureSize, runStream],
  );

  // Load real devices in live mode
  useEffect(() => {
    if (!live) return;
    let cancelled = false;
    api
      .devices()
      .then((list: LiveDevice[]) => {
        if (cancelled) return;
        const arr = Array.isArray(list) ? list : [];
        setLiveDevices(arr);
        setDevicesError(null);
        setLiveDeviceId((cur) => {
          if (cur && arr.some((d) => d.id === cur)) return cur;
          const pref = arr.find((d) => d.id === selectedDeviceId && d.status === "online");
          return (pref || arr.find((d) => d.status === "online") || arr[0])?.id || "";
        });
      })
      .catch((e) => {
        if (!cancelled) setDevicesError(describeLiveError(e));
      });
    return () => {
      cancelled = true;
    };
  }, [live, selectedDeviceId]);

  // Open (and on device switch, re-open) a session; clean up on unmount
  useEffect(() => {
    if (!live || !liveDeviceId) return;
    void connect(liveDeviceId);
    return () => teardown();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, liveDeviceId, liveDevices.length]);

  // Resize on window resize (debounced)
  useEffect(() => {
    if (!live) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onResize = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const s = sessionRef.current;
        if (!s) return;
        const { cols, rows } = measureSize();
        api.resizeTerminal(s.deviceId, s.id, cols, rows).catch(() => undefined);
      }, 250);
    };
    window.addEventListener("resize", onResize);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", onResize);
    };
  }, [live, measureSize]);

  const sendLive = useCallback(async (data: string) => {
    const s = sessionRef.current;
    if (!s) {
      setLiveError("No active terminal session. Use Reconnect.");
      return;
    }
    try {
      await api.writeTerminalInput(s.deviceId, s.id, data);
    } catch (e) {
      setLiveError(describeLiveError(e));
    }
  }, []);

  // ---------------------------------------------------------------- demo only
  const demoExecute = useCallback(
    (trimmed: string) => {
      const newCmdLine: TerminalLine = {
        id: `cmd-${Date.now()}`,
        type: "command",
        commandText: trimmed,
        cwd: isWindows ? "C:\\ai-bridge\\workspace" : "~",
        text: "",
      };
      const lower = trimmed.toLowerCase();
      if (lower === "clear" || lower === "cls") {
        setLines([]);
        return;
      }
      const outputText = `[demo] Simulated output only â€” "${trimmed}" was not run anywhere.`;
      setLines((prev) => [...prev, newCmdLine, { id: `out-${Date.now()}`, type: "output", text: outputText }]);
    },
    [isWindows],
  );

  const executeCommand = useCallback(
    (cmd: string) => {
      const trimmed = cmd.trim();
      if (!trimmed) return;
      if (live) {
        if (liveStatus !== "connected") {
          setLiveError("Terminal is not connected.");
          return;
        }
        void sendLive(trimmed + "\n");
      } else {
        demoExecute(trimmed);
      }
      setInputValue("");
    },
    [live, liveStatus, sendLive, demoExecute],
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (live && liveStatus === "connected" && inputValue === "") {
        void sendLive("\n");
        return;
      }
      executeCommand(inputValue);
    } else if (live && e.ctrlKey && e.key.toLowerCase() === "c" && !window.getSelection()?.toString()) {
      e.preventDefault();
      void sendLive("\x03");
    }
  };

  const sendSigint = () => {
    if (live) {
      void sendLive("\x03");
      return;
    }
    setLines((prev) => [...prev, { id: `int-${Date.now()}`, type: "warn", text: "^C (demo only â€” nothing was interrupted)" }]);
  };

  const sendEof = () => {
    if (live) {
      void sendLive("\x04");
      return;
    }
    setLines((prev) => [...prev, { id: `eof-${Date.now()}`, type: "info", text: "^D (demo only â€” nothing was sent)" }]);
  };

  const clearBuffer = () => {
    if (live) setLiveText("");
    else setLines([]);
    setInputValue("");
  };

  const reconnectSession = () => {
    if (live) {
      if (liveDeviceId) void connect(liveDeviceId);
      return;
    }
    setReconnectNotice("Demo: reconnect simulated.");
    setTimeout(() => setReconnectNotice(null), 600);
  };

  const downloadLog = () => {
    const logContent = live
      ? cleanTerminalText(liveText)
      : lines.map((l) => (l.type === "command" ? `${promptPrefix} ${l.commandText}` : l.text)).join("\n\n");
    const blob = new Blob([logContent], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `terminal-${targetHostname}-${Date.now()}.log`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSnippetClick = (cmd: string) => {
    if (snippetMode === "exec") {
      executeCommand(cmd);
    } else {
      setInputValue(cmd);
      inputRef.current?.focus();
    }
  };

  const promptPrefix = live
    ? "$"
    : isWindows
      ? `PS C:\\ai-bridge\\workspace>`
      : `root@${targetHostname.split(".")[0]}:~#`;

  const devicesForSelect: { id: string; label: string }[] = live
    ? liveDevices.map((d) => ({
        id: d.id,
        label: `${d.hostname || d.name || d.id} (${d.os || "unknown"}) â€” ${d.revoked ? "revoked" : d.status || "unknown"}`,
      }))
    : demoDevices.map((d) => ({ id: d.id, label: `${d.hostname} (${d.osRelease})` }));

  const statusLabel: Record<LiveStatus, string> = {
    idle: "No session",
    connecting: "Connectingâ€¦",
    connected: "Connected",
    closed: "Session ended",
    error: "Error",
  };
  const inputDisabled = live && liveStatus !== "connected";

  return (
    <div className="space-y-5">
      {!live && (
        <div role="note" className="rounded-xl border border-amber-700/50 bg-amber-950/30 px-4 py-2 text-xs text-amber-300">
          <strong className="font-semibold">Demo mode:</strong> this terminal is a local simulation. Sign in to open a real session.
        </div>
      )}
      {live && (
        <div role="note" className="rounded-xl border border-sky-700/50 bg-sky-950/30 px-4 py-2 text-xs text-sky-300">
          <strong className="font-semibold">Live session.</strong> Commands run in a real shell relayed by the control plane to the selected device
          ({targetHostname}). All sessions and commands are audited.
        </div>
      )}
      {live && devicesError && (
        <div role="alert" className="rounded-xl border border-rose-700/50 bg-rose-950/30 px-4 py-2 text-xs text-rose-300">{devicesError}</div>
      )}
      {live && liveError && (
        <div role="alert" className="rounded-xl border border-rose-700/50 bg-rose-950/30 px-4 py-2 text-xs text-rose-300">{liveError}</div>
      )}

      {/* Top Header & Breadcrumb Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-800/60">
        <div className="flex flex-wrap items-center gap-3">
          <select
            aria-label="Terminal target node"
            value={live ? liveDeviceId : targetNodeId}
            onChange={(e) => (live ? setLiveDeviceId(e.target.value) : setTargetNodeId(e.target.value))}
            className="min-h-[40px] px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-200 font-mono text-xs focus:outline-none focus:border-indigo-500 transition-colors cursor-pointer"
          >
            {live && devicesForSelect.length === 0 && <option value="">No devices enrolled</option>}
            {devicesForSelect.map((d) => (
              <option key={d.id} value={d.id}>
                {d.label}
              </option>
            ))}
          </select>
          {live && (
            <span role="status" className="font-mono text-xs px-2 py-1 rounded bg-slate-950 border border-slate-800 text-slate-300">
              {statusLabel[liveStatus]}
            </span>
          )}
        </div>
      </div>

      {/* Terminal Session Controls Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-2.5 rounded-xl bg-slate-900/90 border border-slate-800 shadow-md">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={sendSigint}
            disabled={inputDisabled}
            title="Send SIGINT (Ctrl+C)"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 hover:border-slate-700 text-slate-200 font-mono text-xs transition-all active:scale-95 disabled:opacity-50"
          >
            <StopCircle className="w-3.5 h-3.5 text-rose-400" />
            <span>Interrupt</span>
            <kbd className="text-[10px] px-1 py-0.2 rounded bg-slate-800 text-slate-400">^C</kbd>
          </button>

          <button
            type="button"
            onClick={sendEof}
            disabled={inputDisabled}
            title="Send EOF (Ctrl+D)"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 hover:border-slate-700 text-slate-200 font-mono text-xs transition-all active:scale-95 disabled:opacity-50"
          >
            <ArrowRight className="w-3.5 h-3.5 text-cyan-400" />
            <span>Send EOF</span>
            <kbd className="text-[10px] px-1 py-0.2 rounded bg-slate-800 text-slate-400">^D</kbd>
          </button>

          <button
            type="button"
            onClick={clearBuffer}
            title="Clear Screen"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 hover:border-slate-700 text-slate-200 font-mono text-xs transition-all active:scale-95"
          >
            <Trash2 className="w-3.5 h-3.5 text-indigo-400" />
            <span>Clear Buffer</span>
            <kbd className="text-[10px] px-1 py-0.2 rounded bg-slate-800 text-slate-400">^L</kbd>
          </button>

          <button
            type="button"
            onClick={reconnectSession}
            title={live ? "Close and open a new terminal session" : "Demo: simulated reconnect"}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 hover:border-slate-700 text-slate-200 font-mono text-xs transition-all active:scale-95"
          >
            <RotateCcw className="w-3.5 h-3.5 text-emerald-400" />
            <span>Reconnect</span>
          </button>
        </div>

        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 cursor-pointer select-none text-xs font-mono text-slate-400">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
              className="rounded bg-slate-950 border-slate-800 text-indigo-600 focus:ring-0"
            />
            <span>Auto-scroll</span>
          </label>

          <button
            type="button"
            onClick={downloadLog}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 hover:border-slate-700 text-slate-200 font-mono text-xs transition-all active:scale-95"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Log (.log)</span>
          </button>
        </div>
      </div>

      {reconnectNotice && (
        <div role="status" className="p-3 rounded-xl bg-indigo-950/70 border border-indigo-500/40 text-xs font-mono text-indigo-300 text-center">
          {reconnectNotice}
        </div>
      )}

      {/* Main Terminal Viewport */}
      <div ref={viewportRef} className="rounded-2xl bg-[#090d16] border border-slate-800 shadow-2xl overflow-hidden flex flex-col font-mono text-xs">
        <div className="h-9 px-4 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between select-none">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-rose-500/80"></div>
            <div className="w-3 h-3 rounded-full bg-amber-500/80"></div>
            <div className="w-3 h-3 rounded-full bg-emerald-500/80"></div>
            <TerminalIcon className="w-3.5 h-3.5 ml-2 text-slate-400" />
            <span className="font-semibold text-slate-300">
              {live ? `${targetHostname} â€” live session` : `${promptPrefix} (demo)`}
            </span>
          </div>

          <div className="flex items-center gap-3 text-[11px] text-slate-400">
            <span className="px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-indigo-300">
              {live ? `BUFFER: ${liveText.length} chars` : `BUFFER: ${lines.length} items`}
            </span>
            <span>{live ? "plain text (ANSI stripped)" : "DEMO"}</span>
          </div>
        </div>

        <div className="p-4 md:p-6 overflow-y-auto max-h-[520px] min-h-[420px] space-y-3 font-normal leading-relaxed text-slate-200 select-text">
          {live ? (
            <pre aria-label="Terminal output" className="font-mono text-xs text-slate-300 leading-relaxed whitespace-pre-wrap break-words">
              {liveStatus === "connecting" ? "Opening terminal sessionâ€¦" : cleanTerminalText(liveText)}
            </pre>
          ) : (
            lines.map((line) => {
              if (line.type === "motd") {
                return (
                  <div key={line.id} className="text-slate-400 text-[11px]">
                    {line.text}
                  </div>
                );
              }
              if (line.type === "command") {
                return (
                  <div key={line.id} className="flex items-center gap-2 text-slate-100">
                    <span className="text-emerald-400 font-bold">{promptPrefix}</span>
                    <span className="text-slate-100 font-semibold">{line.commandText}</span>
                  </div>
                );
              }
              if (line.type === "warn") {
                return (
                  <div key={line.id} className="text-amber-400 text-xs">
                    {line.text}
                  </div>
                );
              }
              if (line.type === "info") {
                return (
                  <div key={line.id} className="text-cyan-400 text-xs">
                    {line.text}
                  </div>
                );
              }
              return (
                <pre key={line.id} className="pl-2 font-mono text-xs text-slate-300 leading-relaxed whitespace-pre-wrap">
                  {line.text}
                </pre>
              );
            })
          )}

          {/* Interactive Shell Input Line */}
          <div className="flex items-center gap-2 pt-2 border-t border-slate-800/40">
            <span className="text-emerald-400 font-bold select-none">{promptPrefix}</span>
            <div className="relative flex-1 flex items-center">
              <input
                ref={inputRef}
                type="text"
                aria-label="Terminal command input"
                value={inputValue}
                disabled={inputDisabled}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  live
                    ? liveStatus === "connected"
                      ? "Type a command and press Enterâ€¦"
                      : "Waiting for a connected sessionâ€¦"
                    : "Demo only â€” commands are not executed anywhereâ€¦"
                }
                autoComplete="off"
                spellCheck={false}
                className="w-full bg-transparent text-slate-100 outline-none border-none p-0 m-0 font-mono text-xs placeholder-slate-600 focus:ring-0"
              />
              <span className="inline-block w-2.5 h-4 bg-emerald-400 ml-1 animate-pulse"></span>
            </div>
          </div>
          <div ref={terminalEndRef} />
        </div>
      </div>

      {/* Snippet Quick-Bar */}
      <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-xl space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-indigo-400" />
            <h3 className="text-sm font-bold text-slate-100">Operational Snippets</h3>
          </div>

          <div className="flex p-1 rounded-xl bg-slate-950 border border-slate-800 font-mono text-xs">
            <button
              type="button"
              onClick={() => setSnippetMode("insert")}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                snippetMode === "insert" ? "bg-indigo-600 text-white font-semibold shadow" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Insert to Buffer
            </button>
            <button
              type="button"
              onClick={() => setSnippetMode("exec")}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                snippetMode === "exec" ? "bg-rose-600 text-white font-semibold shadow" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Execute Immediately
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 pt-1">
          {SNIPPETS.filter((s) => !live || (isWindows ? s.os !== "linux" : s.os !== "windows")).map((snip) => (
            <button
              key={snip.cmd}
              type="button"
              onClick={() => handleSnippetClick(snip.cmd)}
              className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 hover:border-slate-700 hover:bg-slate-900 text-slate-200 font-mono text-xs transition-all active:scale-95 text-left group min-h-[40px]"
            >
              <Play className="w-3 h-3 text-slate-500 group-hover:text-indigo-400 transition-colors" />
              <span className={snip.color}>{snip.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default TerminalView;
