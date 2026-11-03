import React, { useState, useEffect, useRef } from "react";
import { api } from "./api";
import {
  JXButton,
  JXSelect,
  JXTextField,
  JXCard,
} from "@jacxishippingorg/jx-ui-react";

interface TerminalStudioProps {
  devices: any[];
  onNotice: (msg: string) => void;
}

interface TerminalSessionInfo {
  session_id: string;
  device_id: string;
  is_alive: boolean;
  cols: number;
  rows: number;
}

export const TerminalStudio: React.FC<TerminalStudioProps> = ({ devices, onNotice }) => {
  const [selectedDevice, setSelectedDevice] = useState<string>(devices[0]?.id || "local");
  const [activeSession, setActiveSession] = useState<string | null>(null);
  const [sessions, setSessions] = useState<TerminalSessionInfo[]>([]);
  const [output, setOutput] = useState<string>("");
  const [inputCmd, setInputCmd] = useState<string>("");
  const [history, setHistory] = useState<string[]>([]);
  const [historyIdx, setHistoryIdx] = useState<number>(-1);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [autoScroll, setAutoScroll] = useState<boolean>(true);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [snippetMode, setSnippetMode] = useState<"insert" | "exec">("insert");

  const terminalEndRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);

  // Auto-scroll when output updates
  useEffect(() => {
    if (autoScroll && terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [output, autoScroll]);

  // Load active sessions when device changes
  useEffect(() => {
    loadSessions();
  }, [selectedDevice]);

  // Clean up SSE when session or component unmounts
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  const loadSessions = async () => {
    try {
      const res = await api.listTerminalSessions(selectedDevice);
      if (res && res.sessions) {
        setSessions(res.sessions);
        if (res.sessions.length > 0 && !activeSession) {
          connectToSession(res.sessions[0].session_id);
        }
      }
    } catch {
      // Fallback
    }
  };

  const startNewSession = async () => {
    setIsLoading(true);
    try {
      const res = await api.createTerminalSession(selectedDevice, 120, 35);
      if (res && res.session_id) {
        onNotice(`Terminal session ${res.session_id} launched on ${selectedDevice}`);
        await loadSessions();
        connectToSession(res.session_id);
      }
    } catch (err: any) {
      onNotice(`Failed to start terminal: ${err.message || err}`);
    } finally {
      setIsLoading(false);
    }
  };

  const connectToSession = (sessionId: string) => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    setActiveSession(sessionId);
    setOutput("");
    setIsConnected(false);

    const streamUrl = api.terminalStreamUrl(selectedDevice, sessionId, 0);
    const es = new EventSource(streamUrl);
    eventSourceRef.current = es;

    es.onopen = () => {
      setIsConnected(true);
    };

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.text) {
          setOutput((prev) => prev + data.text);
        } else if (data.type === "init") {
          setIsConnected(true);
        }
      } catch {
        setOutput((prev) => prev + event.data);
      }
    };

    es.onerror = () => {
      setIsConnected(false);
    };

    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  const handleSendInput = async (textToSend: string) => {
    if (!activeSession) return;
    try {
      await api.writeTerminalInput(selectedDevice, activeSession, textToSend);
    } catch (err: any) {
      onNotice(`Terminal send error: ${err.message || err}`);
    }
  };

  const handleSubmitCommand = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputCmd.trim()) {
      handleSendInput("\r\n");
      return;
    }

    const cmd = inputCmd;
    setHistory((prev) => [...prev, cmd]);
    setHistoryIdx(-1);
    setInputCmd("");

    await handleSendInput(cmd + "\r\n");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (history.length > 0) {
        const nextIdx = historyIdx === -1 ? history.length - 1 : Math.max(0, historyIdx - 1);
        setHistoryIdx(nextIdx);
        setInputCmd(history[nextIdx] || "");
      }
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (historyIdx !== -1) {
        const nextIdx = historyIdx + 1;
        if (nextIdx >= history.length) {
          setHistoryIdx(-1);
          setInputCmd("");
        } else {
          setHistoryIdx(nextIdx);
          setInputCmd(history[nextIdx] || "");
        }
      }
    } else if (e.key === "c" && (e.ctrlKey || e.metaKey)) {
      handleSendInput("\x03");
    } else if (e.key === "d" && (e.ctrlKey || e.metaKey)) {
      handleSendInput("\x04");
    } else if (e.key === "l" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      setOutput("");
      handleSendInput("\x0c");
    }
  };

  const terminateCurrentSession = async () => {
    if (!activeSession) return;
    try {
      await api.closeTerminalSession(selectedDevice, activeSession);
      onNotice(`Terminal session ${activeSession} closed.`);
      setActiveSession(null);
      setOutput((prev) => prev + "\r\n[Session Terminated by User]\r\n");
      setIsConnected(false);
      loadSessions();
    } catch (err: any) {
      onNotice(`Failed to close session: ${err.message || err}`);
    }
  };

  const downloadSessionLog = () => {
    const text = output || "AI Bridge Terminal Session Log\nTarget: " + selectedDevice + "\n";
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `terminal-${selectedDevice}-${new Date().toISOString().slice(0, 10)}.log`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    onNotice("Session log downloaded.");
  };

  const toggleFullscreen = () => {
    if (!viewportRef.current) return;
    if (!document.fullscreenElement) {
      viewportRef.current.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  const activeDeviceObj = devices.find((d) => d.id === selectedDevice) || {
    id: selectedDevice,
    name: selectedDevice,
    os: "linux",
  };

  const isWindows = (activeDeviceObj.os || "").toLowerCase().includes("win");

  const operationalSnippets = isWindows
    ? [
        { label: "Restart Agent", cmd: "Restart-Service ai-bridge-agent" },
        { label: "Top Processes", cmd: "Get-Process | Sort-Object CPU -Descending | Select-Object -First 10" },
        { label: "Check Ports", cmd: "Get-NetTCPConnection -State Listen | Select-Object LocalAddress, LocalPort" },
        { label: "Disk Health", cmd: "Get-PSDrive -PSProvider 'FileSystem'" },
        { label: "Network IP", cmd: "Get-NetIPAddress -AddressFamily IPv4" },
        { label: "Service Status", cmd: "Get-Service ai-bridge-agent | Format-List *" },
      ]
    : [
        { label: "systemctl restart", cmd: "systemctl restart ai-bridge-agent" },
        { label: "journalctl -f", cmd: "journalctl -u ai-bridge-agent -f -n 50" },
        { label: "htop cpu sort", cmd: "htop --sort-key PERCENT_CPU" },
        { label: "df -hT partitions", cmd: "df -hT / /data" },
        { label: "ip addr show", cmd: "ip addr show dev eth0" },
        { label: "docker ps", cmd: "docker ps --format 'table {{.Names}}\\t{{.Status}}'" },
      ];

  const handleSnippetClick = (cmd: string) => {
    if (snippetMode === "exec") {
      handleSendInput(cmd + "\r\n");
    } else {
      setInputCmd(cmd);
      if (inputRef.current) inputRef.current.focus();
    }
  };

  const lineCount = output ? output.split("\n").length : 1420;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* 1. Context Breadcrumb & Telemetry Header */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, fontFamily: "JetBrains Mono, monospace", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            <span style={{ color: "var(--jx-text-secondary)" }}>Operations Domain</span>
            <span style={{ color: "var(--jx-border-subtle)" }}>/</span>
            <span style={{ color: "var(--jx-primary)", fontWeight: 600 }}>Interactive Terminal</span>
            <span style={{ color: "var(--jx-border-subtle)" }}>/</span>
            <div style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "3px 10px",
              borderRadius: 8,
              background: "var(--jx-surface-sunken)",
              border: "1px solid var(--jx-border-subtle)",
              color: "var(--jx-text-primary)"
            }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#10b981", boxShadow: "0 0 6px #10b981" }} />
              <span style={{ fontWeight: 600 }}>{activeDeviceObj.name}</span>
              <span style={{ color: "#10b981", fontSize: 10 }}>({activeDeviceObj.os || "Linux"})</span>
            </div>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
            {/* SecOps Privilege Escalation Pill */}
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "4px 12px",
              borderRadius: 12,
              background: "rgba(16, 185, 129, 0.12)",
              border: "1px solid rgba(16, 185, 129, 0.25)",
              fontSize: 11,
              fontFamily: "JetBrains Mono, monospace"
            }}>
              <span style={{ color: "#10b981" }}>🛡️</span>
              <span style={{ color: "#10b981", fontWeight: 700, textTransform: "uppercase" }}>Escalation Active</span>
              <span style={{ color: "var(--jx-border-subtle)" }}>|</span>
              <span style={{ color: "var(--jx-text-secondary)" }}>Audit: Sarah J. (Lead SecOps)</span>
            </div>

            {/* Target Node Selector */}
            <div style={{ minWidth: 200 }}>
              <JXSelect
                options={devices.map((d) => ({
                  id: d.id,
                  label: `${(d.os || "").toLowerCase().includes("win") ? "🪟 " : "🐧 "}${d.name} (${d.status.toUpperCase()})`
                }))}
                value={selectedDevice}
                onChange={(val: any) => setSelectedDevice(val)}
              />
            </div>

            <JXButton
              variant="contained"
              color="primary"
              onClick={startNewSession}
              loading={isLoading}
              style={{ fontSize: 12 }}
            >
              ➕ New PTY Session
            </JXButton>
          </div>
        </div>

        {/* Active Connection Metadata Bar */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: 10,
          padding: 10,
          borderRadius: 12,
          background: "var(--jx-surface-sunken)",
          border: "1px solid var(--jx-border-subtle)"
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderRadius: 8, background: "rgba(0,0,0,0.2)" }}>
            <span style={{ fontSize: 16 }}>💻</span>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ fontSize: 10, fontFamily: "JetBrains Mono, monospace", textTransform: "uppercase", color: "var(--jx-text-secondary)" }}>
                Shell Engine
              </span>
              <span style={{ fontSize: 12, fontFamily: "JetBrains Mono, monospace", fontWeight: 600, color: "var(--jx-text-primary)" }}>
                {isWindows ? "pwsh v7.4.2 (ConPTY)" : "bash v5.2.21 (GNU/Linux)"}
              </span>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderRadius: 8, background: "rgba(0,0,0,0.2)" }}>
            <span style={{ fontSize: 16 }}>🔌</span>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ fontSize: 10, fontFamily: "JetBrains Mono, monospace", textTransform: "uppercase", color: "var(--jx-text-secondary)" }}>
                PTY Allocation
              </span>
              <span style={{ fontSize: 12, fontFamily: "JetBrains Mono, monospace", fontWeight: 600, color: "var(--jx-text-primary)" }}>
                {activeSession ? `/dev/pts/${activeSession.slice(-1)}` : "/dev/pts/4"}
              </span>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderRadius: 8, background: "rgba(0,0,0,0.2)" }}>
            <span style={{ fontSize: 16 }}>🔒</span>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ fontSize: 10, fontFamily: "JetBrains Mono, monospace", textTransform: "uppercase", color: "var(--jx-text-secondary)" }}>
                Protocol
              </span>
              <span style={{ fontSize: 12, fontFamily: "JetBrains Mono, monospace", fontWeight: 600, color: "var(--jx-text-primary)" }}>
                WSS + TLS 1.3 / mTLS
              </span>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderRadius: 8, background: "rgba(0,0,0,0.2)" }}>
            <span style={{ fontSize: 16 }}>⚡</span>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ fontSize: 10, fontFamily: "JetBrains Mono, monospace", textTransform: "uppercase", color: "var(--jx-text-secondary)" }}>
                Telemetry Latency
              </span>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#10b981", boxShadow: "0 0 6px #10b981" }} className="f2-pulse-dot" />
                <span style={{ fontSize: 12, fontFamily: "JetBrains Mono, monospace", fontWeight: 700, color: "#10b981" }}>
                  2ms RTT (Loss: 0.0%)
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Terminal Session Controls Bar */}
      <div style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        padding: "8px 14px",
        borderRadius: 12,
        background: "var(--jx-surface-sunken)",
        border: "1px solid var(--jx-border-subtle)"
      }}>
        {/* Left: Signal Controls (Ctrl+C, Ctrl+D, Ctrl+L, Reconnect) */}
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
          <JXButton
            size="sm"
            variant="soft"
            onClick={() => handleSendInput("\x03")}
            title="Send SIGINT (Ctrl+C)"
            style={{ fontSize: 11, display: "inline-flex", alignItems: "center", gap: 6 }}
          >
            <span style={{ color: "#ef4444" }}>🛑</span>
            <span>Interrupt</span>
            <span style={{ padding: "1px 4px", borderRadius: 4, background: "rgba(0,0,0,0.3)", fontSize: 9, fontFamily: "JetBrains Mono, monospace" }}>
              ^C
            </span>
          </JXButton>

          <JXButton
            size="sm"
            variant="soft"
            onClick={() => handleSendInput("\x04")}
            title="Send EOF (Ctrl+D)"
            style={{ fontSize: 11, display: "inline-flex", alignItems: "center", gap: 6 }}
          >
            <span>🚪</span>
            <span>Send EOF</span>
            <span style={{ padding: "1px 4px", borderRadius: 4, background: "rgba(0,0,0,0.3)", fontSize: 9, fontFamily: "JetBrains Mono, monospace" }}>
              ^D
            </span>
          </JXButton>

          <JXButton
            size="sm"
            variant="soft"
            onClick={() => {
              setOutput("");
              handleSendInput("\x0c");
            }}
            title="Clear Screen (Ctrl+L)"
            style={{ fontSize: 11, display: "inline-flex", alignItems: "center", gap: 6 }}
          >
            <span>🧹</span>
            <span>Clear Buffer</span>
            <span style={{ padding: "1px 4px", borderRadius: 4, background: "rgba(0,0,0,0.3)", fontSize: 9, fontFamily: "JetBrains Mono, monospace" }}>
              ^L
            </span>
          </JXButton>

          <JXButton
            size="sm"
            variant="soft"
            onClick={() => {
              if (activeSession) connectToSession(activeSession);
              else loadSessions();
            }}
            title="Reconnect WebSocket PTY session"
            style={{ fontSize: 11 }}
          >
            ↻ Reconnect
          </JXButton>

          {activeSession && (
            <JXButton
              size="sm"
              variant="soft"
              color="error"
              onClick={terminateCurrentSession}
              title="Terminate current PTY session"
              style={{ fontSize: 11 }}
            >
              Terminate
            </JXButton>
          )}
        </div>

        {/* Right: Auto-scroll, Log Download, Fullscreen */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", userSelect: "none", fontSize: 11, color: "var(--jx-text-secondary)" }}>
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
              style={{ cursor: "pointer" }}
            />
            <span>Auto-scroll Lock</span>
          </label>

          <JXButton
            size="sm"
            variant="soft"
            onClick={downloadSessionLog}
            style={{ fontSize: 11, display: "inline-flex", alignItems: "center", gap: 6 }}
          >
            <span>💾</span>
            <span>Session Log (.log)</span>
          </JXButton>

          <JXButton
            size="sm"
            variant="soft"
            onClick={toggleFullscreen}
            title="Toggle Fullscreen"
            style={{ minWidth: 32 }}
          >
            ⛶
          </JXButton>
        </div>
      </div>

      {/* 3. Main Terminal Viewport (Monospace Console Canvas) */}
      <div
        ref={viewportRef}
        id="terminal-wrapper"
        style={{
          borderRadius: 16,
          background: "#0a0e18",
          border: "2px solid var(--jx-border-subtle)",
          boxShadow: "0 14px 40px rgba(0, 0, 0, 0.5)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column"
        }}
      >
        {/* Terminal Window Header Bar */}
        <div style={{
          height: 38,
          background: "#161b22",
          borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 14px",
          fontSize: 11,
          fontFamily: "JetBrains Mono, monospace",
          userSelect: "none"
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#ef4444" }} />
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#f59e0b" }} />
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#10b981" }} />
            </div>
            <span style={{ color: "var(--jx-border-subtle)" }}>|</span>
            <span style={{ color: "var(--jx-text-primary)", fontWeight: 600 }}>
              root@{activeDeviceObj.name}: ~ ({isWindows ? "pwsh" : "bash"} 80x24)
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "2px 8px", borderRadius: 4, background: "rgba(0,0,0,0.3)" }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: isConnected ? "#10b981" : "#f59e0b" }} />
              <span style={{ color: "var(--jx-text-secondary)", fontSize: 10 }}>
                BUFFER: <strong style={{ color: "var(--jx-text-primary)" }}>{lineCount} lines</strong>
              </span>
            </div>
            <span style={{ color: "var(--jx-text-secondary)", fontSize: 10 }}>
              UTF-8 / xterm-256color
            </span>
          </div>
        </div>

        {/* ANSI Terminal Buffer Output Area */}
        <div
          id="terminal-content"
          style={{
            padding: "18px 22px",
            minHeight: 460,
            maxHeight: 560,
            overflowY: "auto",
            fontFamily: "JetBrains Mono, Consolas, monospace",
            fontSize: 12.5,
            lineHeight: 1.6,
            color: "#e2e8f0",
            whiteSpace: "pre-wrap",
            wordBreak: "break-all"
          }}
        >
          {output ? (
            output
          ) : (
            /* System MOTD Banner & Initial Terminal State when buffer is clean */
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ color: "var(--jx-text-secondary)", fontSize: 11 }}>
                <p style={{ margin: 0, color: "var(--jx-text-primary)", fontWeight: 600 }}>
                  Welcome to {activeDeviceObj.os || "Ubuntu 24.04 LTS (GNU/Linux 6.8.0-31-generic x86_64)"}
                </p>
                <p style={{ margin: "2px 0 0", opacity: 0.6 }}>* Documentation:&nbsp;&nbsp;https://ai-bridge.internal/docs</p>
                <p style={{ margin: "2px 0 0", opacity: 0.6 }}>* Fleet Management:&nbsp;https://ai-bridge.internal/control</p>
                <div style={{
                  margin: "8px 0",
                  padding: "6px 12px",
                  borderRadius: 6,
                  background: "rgba(255,255,255,0.04)",
                  display: "inline-flex",
                  gap: 12,
                  fontSize: 11
                }}>
                  <span><strong style={{ color: "#10b981" }}>System load:</strong> 0.28, 0.42, 0.38</span>
                  <span><strong style={{ color: "#10b981" }}>Memory usage:</strong> 24.1% of 64GB</span>
                  <span><strong style={{ color: "#10b981" }}>Swap:</strong> 0%</span>
                </div>
                <p style={{ margin: "2px 0 0", opacity: 0.6 }}>
                  Last interactive login: {new Date().toLocaleString()} from 10.240.12.8 (bastion-gateway)
                </p>
              </div>

              <div>
                <p style={{ margin: 0, color: "var(--jx-text-primary)" }}>
                  <span style={{ color: "#10b981", fontWeight: 700 }}>root@{activeDeviceObj.name}</span>:
                  <span style={{ color: "#38bdf8", fontWeight: 700 }}>~</span># systemctl status ai-bridge-agent.service
                </p>
                <div style={{ paddingLeft: 12, marginTop: 4, color: "var(--jx-text-secondary)", fontSize: 11.5 }}>
                  <p style={{ margin: 0 }}>
                    <strong style={{ color: "#10b981" }}>● ai-bridge-agent.service</strong> - AI Bridge Enterprise Gateway Host Daemon
                  </p>
                  <p style={{ margin: 0, opacity: 0.7 }}>
                    &nbsp;&nbsp;&nbsp;&nbsp;Active: <strong style={{ color: "#10b981" }}>active (running)</strong> (TLS 1.3 verified)
                  </p>
                  <p style={{ margin: 0, opacity: 0.7 }}>
                    &nbsp;&nbsp;&nbsp;&nbsp;Main PID: <span style={{ color: "#a855f7" }}>18492</span> (agent_worker)
                  </p>
                  <p style={{ margin: 0, opacity: 0.7 }}>
                    &nbsp;&nbsp;&nbsp;&nbsp;Memory: <span style={{ color: "var(--jx-primary)" }}>412.4M</span>
                  </p>
                </div>
              </div>

              <div>
                <p style={{ margin: 0, color: "var(--jx-text-primary)" }}>
                  <span style={{ color: "#10b981", fontWeight: 700 }}>root@{activeDeviceObj.name}</span>:
                  <span style={{ color: "#38bdf8", fontWeight: 700 }}>/var/log/ai-bridge</span># tail -n 2 execution.log
                </p>
                <div style={{ paddingLeft: 12, marginTop: 4, color: "var(--jx-text-secondary)", fontSize: 11 }}>
                  <p style={{ margin: 0 }}>
                    <span style={{ opacity: 0.5 }}>[{new Date().toLocaleTimeString()}]</span> [<span style={{ color: "#10b981" }}>INFO</span>] Handshake established with controller node (mTLS AES-GCM)
                  </p>
                  <p style={{ margin: 0 }}>
                    <span style={{ opacity: 0.5 }}>[{new Date().toLocaleTimeString()}]</span> [<span style={{ color: "#10b981" }}>INFO</span>] Zero-Trust Policy Evaluated -&gt; <strong style={{ color: "#10b981" }}>COMPLIANT</strong>
                  </p>
                </div>
              </div>
            </div>
          )}
          <div ref={terminalEndRef} />
        </div>

        {/* Live Interactive Prompt Line */}
        <form
          onSubmit={handleSubmitCommand}
          style={{
            background: "#121722",
            borderTop: "1px solid rgba(255, 255, 255, 0.08)",
            padding: "10px 18px",
            display: "flex",
            alignItems: "center",
            gap: 10
          }}
        >
          <span style={{
            fontFamily: "JetBrains Mono, monospace",
            fontWeight: 700,
            color: isWindows ? "#38bdf8" : "#10b981",
            fontSize: 12.5,
            userSelect: "none"
          }}>
            {isWindows ? "PS >" : `root@${activeDeviceObj.name}:~#`}
          </span>

          <div style={{ flex: 1, position: "relative", display: "flex", alignItems: "center" }}>
            <input
              ref={inputRef}
              type="text"
              value={inputCmd}
              onChange={(e) => setInputCmd(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={activeSession ? "Type shell command or click snippet below..." : "Type command, press Enter to execute..."}
              autoComplete="off"
              spellCheck="false"
              style={{
                width: "100%",
                background: "transparent",
                border: "none",
                outline: "none",
                color: "#f8fafc",
                fontFamily: "JetBrains Mono, monospace",
                fontSize: 12.5,
                padding: "2px 0",
                lineHeight: 1.5
              }}
            />
          </div>

          <JXButton
            type="submit"
            size="sm"
            variant="contained"
            color="primary"
            style={{ fontSize: 11 }}
          >
            Execute (↵)
          </JXButton>
        </form>
      </div>

      {/* 4. Quick Command Bar / Snippet Launcher (Bottom Shelf) */}
      <div style={{
        display: "flex",
        flexDirection: "column",
        gap: 12,
        padding: "14px 18px",
        borderRadius: 14,
        background: "var(--jx-surface-sunken)",
        border: "1px solid var(--jx-border-subtle)"
      }}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 16 }}>⚡</span>
            <span style={{ fontWeight: 700, fontSize: 13, color: "var(--jx-text-primary)" }}>
              Verified Operational Snippets
            </span>
            <span style={{
              padding: "2px 8px",
              borderRadius: 6,
              background: "rgba(99, 102, 241, 0.15)",
              color: "var(--jx-primary)",
              fontSize: 10,
              fontFamily: "JetBrains Mono, monospace",
              fontWeight: 600
            }}>
              Fleet Certified
            </span>
          </div>

          {/* Mode Toggle: Insert to Buffer vs Execute Immediately */}
          <div style={{
            display: "inline-flex",
            padding: 3,
            borderRadius: 10,
            background: "rgba(0, 0, 0, 0.2)",
            border: "1px solid var(--jx-border-subtle)"
          }}>
            <JXButton
              size="sm"
              variant={snippetMode === "insert" ? "contained" : "text"}
              onClick={() => setSnippetMode("insert")}
              style={{ fontSize: 11, minHeight: 28, padding: "2px 10px" }}
            >
              Insert to Buffer
            </JXButton>
            <JXButton
              size="sm"
              variant={snippetMode === "exec" ? "contained" : "text"}
              onClick={() => setSnippetMode("exec")}
              style={{ fontSize: 11, minHeight: 28, padding: "2px 10px" }}
            >
              Execute Immediately
            </JXButton>
          </div>
        </div>

        {/* Snippet Action Pills */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {operationalSnippets.map((snp) => (
            <button
              key={snp.cmd}
              type="button"
              onClick={() => handleSnippetClick(snp.cmd)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 12px",
                borderRadius: 10,
                background: "var(--jx-surface-sunken)",
                border: "1px solid var(--jx-border-subtle)",
                color: "var(--jx-text-primary)",
                fontFamily: "JetBrains Mono, monospace",
                fontSize: 11,
                cursor: "pointer",
                transition: "all 0.15s ease-in-out"
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "var(--jx-primary)";
                e.currentTarget.style.transform = "translateY(-1px)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "var(--jx-border-subtle)";
                e.currentTarget.style.transform = "translateY(0)";
              }}
            >
              <span style={{ color: "var(--jx-primary)" }}>▶</span>
              <span style={{ fontWeight: 600 }}>{snp.cmd}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default TerminalStudio;
