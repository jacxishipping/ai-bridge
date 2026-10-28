import React, { useState, useEffect, useRef } from "react";
import { api } from "./api";

interface LiveDesktopStudioProps {
  devices: any[];
  onNotice?: (notice: { intent: "success" | "error" | "info"; text: string }) => void;
}

export const LiveDesktopStudio: React.FC<LiveDesktopStudioProps> = ({ devices, onNotice }) => {
  const [selectedDevice, setSelectedDevice] = useState<string>("local");
  const [isStreaming, setIsStreaming] = useState<boolean>(true);
  const [dualControlActive, setDualControlActive] = useState<boolean>(false);
  const [scale, setScale] = useState<number>(0.75);
  const [quality, setQuality] = useState<number>(70);
  const [currentFrame, setCurrentFrame] = useState<any | null>(null);
  const [fps, setFps] = useState<number>(0);
  const [latencyMs, setLatencyMs] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Fleet update state
  const [fleetVersionInfo, setFleetVersionInfo] = useState<any | null>(null);
  const [updating, setUpdating] = useState<boolean>(false);

  const canvasRef = useRef<HTMLImageElement | null>(null);
  const isFetchingRef = useRef<boolean>(false);
  const frameCountRef = useRef<number>(0);

  // Auto-select primary Windows device if available
  useEffect(() => {
    const winDev = devices.find((d) => d.os && d.os.toLowerCase().includes("windows"));
    if (winDev && selectedDevice === "local") {
      setSelectedDevice(winDev.id);
    }
  }, [devices]);

  // Load fleet version
  const loadVersion = async () => {
    try {
      const v = await api.fleetVersion();
      setFleetVersionInfo(v);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadVersion();
  }, []);

  // Frame fetch loop
  useEffect(() => {
    if (!isStreaming) return;

    let active = true;
    const fetchFrame = async () => {
      if (!active || isFetchingRef.current) return;
      isFetchingRef.current = true;
      const t0 = performance.now();
      try {
        const frame = await api.desktopFrame(selectedDevice, scale, quality);
        if (active && frame && frame.base64_data) {
          setCurrentFrame(frame);
          setError(null);
          setLatencyMs(Math.round(performance.now() - t0));
          frameCountRef.current += 1;
        } else if (frame && frame.error) {
          setError(frame.error);
        }
      } catch (err: any) {
        if (active) setError(err.message);
      } finally {
        isFetchingRef.current = false;
      }
    };

    const streamInterval = setInterval(fetchFrame, 1200);

    // FPS counter loop
    const fpsInterval = setInterval(() => {
      setFps(frameCountRef.current);
      frameCountRef.current = 0;
    }, 1000);

    return () => {
      active = false;
      clearInterval(streamInterval);
      clearInterval(fpsInterval);
    };
  }, [isStreaming, selectedDevice, scale, quality]);

  // Handle canvas clicks (Dual Control)
  const handleCanvasClick = async (e: React.MouseEvent<HTMLImageElement>) => {
    if (!dualControlActive || !canvasRef.current || !currentFrame) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    const normX = Math.max(0.0, Math.min(1.0, clickX / rect.width));
    const normY = Math.max(0.0, Math.min(1.0, clickY / rect.height));

    const isRightClick = e.button === 2;

    try {
      await api.sendDesktopInput(selectedDevice, {
        action: isRightClick ? "right_click" : "click",
        x: normX,
        y: normY,
        normalized: true,
        button: isRightClick ? "right" : "left",
        screen_width: currentFrame.orig_width || currentFrame.width || 1920,
        screen_height: currentFrame.orig_height || currentFrame.height || 1080,
      });
      setNotice(`Sent ${isRightClick ? "right-click" : "click"} at (${Math.round(normX * 100)}%, ${Math.round(normY * 100)}%)`);
    } catch (err: any) {
      setError(err.message);
    }
  };

  // Quick action dispatch
  const handleSendHotkey = async (combo: string) => {
    try {
      await api.sendDesktopInput(selectedDevice, {
        action: "hotkey",
        key: combo,
      });
      setNotice(`Dispatched shortcut: ${combo}`);
      if (onNotice) onNotice({ intent: "info", text: `Dispatched shortcut: ${combo}` });
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleSendText = async (text: string) => {
    if (!text) return;
    try {
      await api.sendDesktopInput(selectedDevice, {
        action: "type",
        text,
      });
      setNotice(`Typed: "${text}"`);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleUpdateFleet = async () => {
    if (!confirm("Dispatch 1-Click Update to entire fleet? Agents will update and refresh.")) return;
    setUpdating(true);
    try {
      const res = await api.updateFleet();
      setNotice(`Fleet update initiated! Batch ID: ${res.batch_id} (${res.device_count} devices)`);
      loadVersion();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setUpdating(false);
    }
  };

  const handleUpdateSingleDevice = async (id: string) => {
    try {
      const res = await api.updateDeviceAgent(id);
      setNotice(`Update dispatched to node ${id}: status=${res.status}`);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleEmergencyHalt = async () => {
    try {
      await api.emergencyStop();
      setNotice("🛑 EMERGENCY STOP TRIGGERED: All agent tasks blocked.");
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Studio Header & Device Bar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}>
            <span>📺</span> Live Desktop Studio & Dual-Control
          </h2>
          <p style={{ margin: "4px 0 0", color: "#8a8886", fontSize: 13 }}>
            Real-time visual screen stream, direct human operator mouse/keyboard takeover, and fleet software updater.
          </p>
        </div>

        {/* Target Machine Selector */}
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: "#8a8886" }}>Target Node:</label>
          <select
            value={selectedDevice}
            onChange={(e) => setSelectedDevice(e.target.value)}
            style={{
              padding: "7px 12px",
              borderRadius: 6,
              border: "1px solid rgba(125,125,125,0.3)",
              background: "rgba(125,125,125,0.1)",
              color: "inherit",
              fontWeight: 600,
            }}
          >
            <option value="local">Local Control Host</option>
            {devices.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} ({d.os || "node"}) — {d.status}
              </option>
            ))}
          </select>
        </div>
      </div>

      {notice && (
        <div style={{ padding: "10px 14px", background: "rgba(16,124,65,0.15)", border: "1px solid #107c41", borderRadius: 8, color: "#107c41", fontSize: 13 }}>
          {notice}
        </div>
      )}
      {error && (
        <div style={{ padding: "10px 14px", background: "rgba(232,17,35,0.15)", border: "1px solid #e81123", borderRadius: 8, color: "#e81123", fontSize: 13 }}>
          {error}
        </div>
      )}

      {/* Stream Controls & Dual-Control Toggle Bar */}
      <div
        style={{
          background: "rgba(125,125,125,0.06)",
          border: "1px solid rgba(125,125,125,0.2)",
          borderRadius: 10,
          padding: "12px 16px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button
            onClick={() => setIsStreaming(!isStreaming)}
            style={{
              padding: "6px 14px",
              background: isStreaming ? "rgba(232,17,35,0.15)" : "#0078d4",
              color: isStreaming ? "#e81123" : "#fff",
              border: isStreaming ? "1px solid #e81123" : "none",
              borderRadius: 6,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {isStreaming ? "⏸ Pause Stream" : "▶ Resume Stream"}
          </button>

          <button
            onClick={() => setDualControlActive(!dualControlActive)}
            style={{
              padding: "6px 14px",
              background: dualControlActive ? "#107c41" : "rgba(125,125,125,0.15)",
              color: dualControlActive ? "#fff" : "inherit",
              border: "none",
              borderRadius: 6,
              fontWeight: 600,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <span>🎮</span> Dual-Control Takeover: {dualControlActive ? "ENABLED" : "OFF"}
          </button>
        </div>

        {/* Stream Metrics & Settings */}
        <div style={{ display: "flex", gap: 14, alignItems: "center", fontSize: 12, color: "#8a8886" }}>
          <div>
            FPS: <span style={{ color: "#107c41", fontWeight: 700 }}>{fps}</span>
          </div>
          <div>
            Latency: <span style={{ color: "inherit", fontWeight: 600 }}>{latencyMs}ms</span>
          </div>
          <div>
            Res:{" "}
            <span style={{ color: "inherit", fontWeight: 600 }}>
              {currentFrame ? `${currentFrame.width}x${currentFrame.height}` : "—"}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span>Quality:</span>
            <select
              value={scale}
              onChange={(e) => setScale(Number(e.target.value))}
              style={{ padding: "4px 8px", borderRadius: 4, border: "1px solid rgba(125,125,125,0.3)", background: "transparent", color: "inherit", fontSize: 11 }}
            >
              <option value={0.5}>50% Scale (High FPS)</option>
              <option value={0.75}>75% Scale (Balanced)</option>
              <option value={1.0}>100% Native Scale</option>
            </select>
          </div>
        </div>
      </div>

      {/* Dual Control Notice Banner */}
      {dualControlActive && (
        <div
          style={{
            padding: "8px 14px",
            background: "rgba(0,120,212,0.12)",
            border: "1px solid #0078d4",
            borderRadius: 8,
            color: "#0078d4",
            fontSize: 12,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span>
            ⚡ <b>Human Operator Dual-Control Active</b>: Click directly on the viewport below to dispatch mouse actions to the remote desktop.
          </span>
          <button
            onClick={handleEmergencyHalt}
            style={{ padding: "4px 10px", background: "#e81123", color: "#fff", border: "none", borderRadius: 4, fontWeight: 700, cursor: "pointer", fontSize: 11 }}
          >
            🛑 Emergency Stop
          </button>
        </div>
      )}

      {/* Interactive Desktop Canvas Viewport */}
      <div
        style={{
          background: "#0c0d0e",
          border: "2px solid rgba(125,125,125,0.3)",
          borderRadius: 12,
          overflow: "hidden",
          position: "relative",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          minHeight: 450,
          boxShadow: "0 10px 30px rgba(0,0,0,0.4)",
        }}
        onContextMenu={(e) => e.preventDefault()}
      >
        {currentFrame?.base64_data ? (
          <img
            ref={canvasRef}
            src={`data:${currentFrame.mime_type || "image/jpeg"};base64,${currentFrame.base64_data}`}
            alt="Live Remote Desktop"
            onClick={handleCanvasClick}
            onContextMenu={handleCanvasClick}
            style={{
              maxWidth: "100%",
              maxHeight: "75vh",
              objectFit: "contain",
              cursor: dualControlActive ? "crosshair" : "default",
              userSelect: "none",
            }}
          />
        ) : (
          <div style={{ textAlign: "center", color: "#8a8886", padding: 40 }}>
            <div style={{ fontSize: 42, marginBottom: 10 }}>📡</div>
            <div style={{ fontWeight: 600, fontSize: 16 }}>Connecting to remote desktop feed...</div>
            <div style={{ fontSize: 12, marginTop: 4 }}>Target machine: {selectedDevice}</div>
          </div>
        )}
      </div>

      {/* Virtual Operator Action Ribbon */}
      <div
        style={{
          background: "rgba(125,125,125,0.06)",
          border: "1px solid rgba(125,125,125,0.2)",
          borderRadius: 10,
          padding: 14,
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <div style={{ fontWeight: 700, fontSize: 13, textTransform: "uppercase", color: "#8a8886" }}>
          Virtual Operator Controls & Shortcuts
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <button
            onClick={() => handleSendHotkey("win+r")}
            style={{ padding: "6px 12px", background: "rgba(125,125,125,0.15)", border: "1px solid rgba(125,125,125,0.25)", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer" }}
          >
            ⌨️ Win + R (Run)
          </button>
          <button
            onClick={() => handleSendHotkey("ctrl+s")}
            style={{ padding: "6px 12px", background: "rgba(125,125,125,0.15)", border: "1px solid rgba(125,125,125,0.25)", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer" }}
          >
            💾 Ctrl + S (Save)
          </button>
          <button
            onClick={() => handleSendHotkey("alt+tab")}
            style={{ padding: "6px 12px", background: "rgba(125,125,125,0.15)", border: "1px solid rgba(125,125,125,0.25)", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer" }}
          >
            🔄 Alt + Tab
          </button>
          <button
            onClick={() => handleSendHotkey("ctrl+shift+esc")}
            style={{ padding: "6px 12px", background: "rgba(125,125,125,0.15)", border: "1px solid rgba(125,125,125,0.25)", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer" }}
          >
            📊 Task Manager
          </button>
          <button
            onClick={() => handleSendHotkey("enter")}
            style={{ padding: "6px 12px", background: "rgba(125,125,125,0.15)", border: "1px solid rgba(125,125,125,0.25)", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer" }}
          >
            ⏎ Enter
          </button>
          <button
            onClick={() => handleSendHotkey("esc")}
            style={{ padding: "6px 12px", background: "rgba(125,125,125,0.15)", border: "1px solid rgba(125,125,125,0.25)", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer" }}
          >
            ⎋ Escape
          </button>

          {/* Direct typing field */}
          <div style={{ display: "flex", gap: 6, flex: 1, minWidth: 240 }}>
            <input
              id="remote-typing-input"
              type="text"
              placeholder="Type string to send to focused control..."
              style={{ flex: 1, padding: "6px 10px", borderRadius: 6, border: "1px solid rgba(125,125,125,0.3)", background: "transparent", color: "inherit", fontSize: 12 }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleSendText((e.target as HTMLInputElement).value);
                  (e.target as HTMLInputElement).value = "";
                }
              }}
            />
            <button
              onClick={() => {
                const el = document.getElementById("remote-typing-input") as HTMLInputElement;
                if (el) {
                  handleSendText(el.value);
                  el.value = "";
                }
              }}
              style={{ padding: "6px 12px", background: "#0078d4", color: "#fff", border: "none", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer" }}
            >
              Send Text
            </button>
          </div>
        </div>
      </div>

      {/* Fleet Software Lifecycle & 1-Click Updater Section */}
      <div
        style={{
          background: "rgba(125,125,125,0.06)",
          border: "1px solid rgba(125,125,125,0.2)",
          borderRadius: 10,
          padding: 16,
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 16, display: "flex", alignItems: "center", gap: 8 }}>
              <span>🚀</span> Fleet 1-Click Agent Auto-Updater
            </h3>
            <div style={{ fontSize: 12, color: "#8a8886", marginTop: 2 }}>
              Deploy updates to all Linux and Windows nodes simultaneously directly from origin/main.
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            {fleetVersionInfo && (
              <span style={{ fontSize: 12, color: "#8a8886" }}>
                Commit: <code>{fleetVersionInfo.git_commit}</code> ({fleetVersionInfo.git_branch})
              </span>
            )}
            <button
              onClick={handleUpdateFleet}
              disabled={updating}
              style={{
                padding: "8px 16px",
                background: "#107c41",
                color: "#fff",
                border: "none",
                borderRadius: 6,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              {updating ? "Updating Fleet..." : "🚀 Update Entire Fleet"}
            </button>
          </div>
        </div>

        {/* Device Status Table */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 10 }}>
          {devices.map((d) => (
            <div
              key={d.id}
              style={{
                background: "rgba(125,125,125,0.08)",
                borderRadius: 8,
                padding: "10px 14px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{d.name}</div>
                <div style={{ fontSize: 11, color: "#8a8886" }}>{d.os || "Device"}</div>
              </div>
              <button
                onClick={() => handleUpdateSingleDevice(d.id)}
                style={{
                  padding: "4px 10px",
                  background: "rgba(0,120,212,0.12)",
                  color: "#0078d4",
                  border: "1px solid #0078d4",
                  borderRadius: 6,
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Update
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
