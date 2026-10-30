import React, { useState, useEffect, useRef } from "react";
import { api } from "./api";

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

  const terminalEndRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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
      if (history.length > 0 && historyIdx !== -1) {
        const nextIdx = historyIdx + 1;
        if (nextIdx >= history.length) {
          setHistoryIdx(-1);
          setInputCmd("");
        } else {
          setHistoryIdx(nextIdx);
          setInputCmd(history[nextIdx] || "");
        }
      }
    } else if (e.key === "c" && e.ctrlKey) {
      e.preventDefault();
      handleSendInput("\x03"); // SIGINT / Ctrl+C
    } else if (e.key === "Tab") {
      e.preventDefault();
      handleSendInput("\t");
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

  const activeDeviceObj = devices.find((d) => d.id === selectedDevice) || {
    id: selectedDevice,
    name: selectedDevice,
    os: "linux",
  };

  const isWindows = (activeDeviceObj.os || "").toLowerCase().includes("win");

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {/* Header & Controls Toolbar */}
      <div
        className="f2-card"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 12,
          padding: "12px 18px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ fontSize: 22 }}>💻</div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16, display: "flex", alignItems: "center", gap: 8 }}>
              <span>Interactive Live Terminal</span>
              <span
                style={{
                  fontSize: 10,
                  padding: "2px 8px",
                  borderRadius: 12,
                  background: isWindows ? "rgba(0, 120, 212, 0.15)" : "rgba(16, 124, 65, 0.15)",
                  color: isWindows ? "#0078d4" : "var(--colorActionGreen)",
                  fontWeight: 700,
                }}
              >
                {isWindows ? "PowerShell (ConPTY)" : "Bash / PTY (Linux)"}
              </span>
            </div>
            <div style={{ fontSize: 12, color: "var(--colorNeutralForeground3)", marginTop: 2 }}>
              Ultra-low latency streaming shell with full ANSI color support and bi-directional I/O
            </div>
          </div>
        </div>

        {/* Target Device Selector & New Session */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <select
            className="f2-select"
            value={selectedDevice}
            onChange={(e) => setSelectedDevice(e.target.value)}
            style={{ fontWeight: 600, minWidth: 180 }}
          >
            {devices.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} ({d.os || "Linux"})
              </option>
            ))}
          </select>

          <button
            type="button"
            className="f2-btn f2-btn-primary"
            onClick={startNewSession}
            disabled={isLoading}
            style={{ display: "flex", alignItems: "center", gap: 6 }}
          >
            <span>➕</span>
            <span>New Shell Session</span>
          </button>
        </div>
      </div>

      {/* Main Terminal Window Frame */}
      <div
        style={{
          borderRadius: 8,
          overflow: "hidden",
          border: "1px solid var(--colorNeutralStroke2)",
          background: "#0c0d0e",
          boxShadow: "0 8px 24px rgba(0, 0, 0, 0.35)",
        }}
      >
        {/* Terminal Title Bar */}
        <div
          style={{
            background: "#16181a",
            padding: "8px 16px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            borderBottom: "1px solid #23272a",
          }}
        >
          {/* Active Tabs */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, overflowX: "auto" }}>
            {sessions.length > 0 ? (
              sessions.map((s) => (
                <button
                  key={s.session_id}
                  onClick={() => connectToSession(s.session_id)}
                  style={{
                    padding: "4px 10px",
                    borderRadius: 4,
                    fontSize: 11,
                    fontWeight: 600,
                    border: "none",
                    cursor: "pointer",
                    background: activeSession === s.session_id ? "#272a2e" : "transparent",
                    color: activeSession === s.session_id ? "#38bdf8" : "#94a3b8",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: s.is_alive ? "var(--colorActionGreen)" : "#ef4444",
                    }}
                  />
                  <span>Session {s.session_id.slice(0, 6)}</span>
                </button>
              ))
            ) : (
              <span style={{ fontSize: 11, color: "#94a3b8" }}>No active sessions</span>
            )}
          </div>

          {/* Quick Actions */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11 }}>
            <span
              style={{
                color: isConnected ? "var(--colorActionGreen)" : "#f59e0b",
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                gap: 5,
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: isConnected ? "var(--colorActionGreen)" : "#f59e0b",
                  display: "inline-block",
                }}
              />
              {isConnected ? "LIVE STREAMING" : "CONNECTING..."}
            </span>

            <button
              className="f2-btn f2-btn-sm"
              onClick={() => setOutput("")}
              title="Clear terminal buffer"
              style={{ fontSize: 10, padding: "2px 8px" }}
            >
              Clear
            </button>

            <button
              className="f2-btn f2-btn-sm"
              onClick={() => handleSendInput("\x03")}
              title="Send Ctrl+C"
              style={{ fontSize: 10, padding: "2px 8px", color: "#f87171" }}
            >
              Ctrl+C
            </button>

            {activeSession && (
              <button
                className="f2-btn f2-btn-sm"
                onClick={terminateCurrentSession}
                title="Terminate Session"
                style={{ fontSize: 10, padding: "2px 8px", background: "rgba(239, 68, 68, 0.2)", color: "#fca5a5" }}
              >
                Close
              </button>
            )}
          </div>
        </div>

        {/* ANSI Terminal Screen */}
        <div
          style={{
            padding: "16px 20px",
            minHeight: "420px",
            maxHeight: "65vh",
            overflowY: "auto",
            fontFamily: "Consolas, 'Cascadia Code', 'Fira Code', Menlo, monospace",
            fontSize: 13,
            lineHeight: 1.5,
            color: "#e2e8f0",
            whiteSpace: "pre-wrap",
            wordBreak: "break-all",
          }}
        >
          {output ? (
            output
          ) : (
            <div style={{ color: "#64748b", fontStyle: "italic", padding: "40px 0", textAlign: "center" }}>
              {activeSession
                ? "Connecting to interactive shell stream..."
                : "No terminal session selected. Click 'New Shell Session' above to begin."}
            </div>
          )}
          <div ref={terminalEndRef} />
        </div>

        {/* Interactive Command Input Ribbon */}
        <form
          onSubmit={handleSubmitCommand}
          style={{
            background: "#121416",
            borderTop: "1px solid #23272a",
            padding: "10px 16px",
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <span
            style={{
              fontFamily: "Consolas, monospace",
              fontWeight: 700,
              color: isWindows ? "#38bdf8" : "var(--colorActionGreen)",
              fontSize: 13,
            }}
          >
            {isWindows ? "PS >" : "user@ai-bridge:~#"}
          </span>

          <input
            ref={inputRef}
            type="text"
            className="f2-input"
            value={inputCmd}
            onChange={(e) => setInputCmd(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={activeSession ? "Type command, press Enter to execute, Up/Down for history..." : "Start a session first"}
            disabled={!activeSession}
            style={{
              flex: 1,
              fontFamily: "Consolas, monospace",
              background: "#181a1d",
              color: "#f8fafc",
              border: "1px solid #334155",
            }}
          />

          <button
            type="submit"
            className="f2-btn f2-btn-primary f2-btn-sm"
            disabled={!activeSession}
            style={{ padding: "6px 14px" }}
          >
            Execute
          </button>
        </form>

        {/* Preset Command Shortcuts Ribbon */}
        <div
          style={{
            background: "#0d0e10",
            borderTop: "1px solid #1a1c1e",
            padding: "6px 16px",
            display: "flex",
            alignItems: "center",
            gap: 6,
            flexWrap: "wrap",
            fontSize: 11,
          }}
        >
          <span style={{ color: "#64748b", fontWeight: 600, marginRight: 4 }}>Quick Commands:</span>
          {(isWindows
            ? ["dir", "Get-Process | select -first 10", "whoami", "ipconfig", "git status", "Clear-Host"]
            : ["ls -la", "ps aux | head -n 15", "whoami", "df -h", "docker ps", "uname -a", "clear"]
          ).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => handleSendInput(c + "\r\n")}
              disabled={!activeSession}
              style={{
                background: "#1e2226",
                color: "#94a3b8",
                border: "1px solid #334155",
                borderRadius: 4,
                padding: "2px 8px",
                fontSize: 10,
                cursor: "pointer",
                fontFamily: "Consolas, monospace",
              }}
            >
              {c}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
