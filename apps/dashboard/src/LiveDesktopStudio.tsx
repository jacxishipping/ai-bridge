import React, { useState, useEffect, useRef } from "react";
import { api } from "./api";
import { ConfirmDialog, type ConfirmRequest } from "./ConfirmDialog";

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
  // WebRTC is the default; screenshot frames are the fallback when ICE
  // cannot connect, the agent lacks aiortc, or the session errors.
  const [streamMode, setStreamMode] = useState<"webrtc" | "frames">("webrtc");
  const [webrtcStatus, setWebrtcStatus] = useState<string>("idle");
  const [confirmReq, setConfirmReq] = useState<ConfirmRequest | null>(null);
  const [emergencyArmed, setEmergencyArmed] = useState<boolean>(false);
  const emergencyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fleet update state
  const [fleetVersionInfo, setFleetVersionInfo] = useState<any | null>(null);
  const [updating, setUpdating] = useState<boolean>(false);

  const canvasRef = useRef<HTMLImageElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const webrtcSessionRef = useRef<string | null>(null);
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
      setError(`Failed to load fleet version: ${(e as any)?.message || e}`);
    }
  };

  useEffect(() => {
    loadVersion();
  }, []);

  // Frame fetch loop (fallback mode only; WebRTC mode uses the video element)
  useEffect(() => {
    if (!isStreaming || streamMode !== "frames") return;

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
  }, [isStreaming, selectedDevice, scale, quality, streamMode]);

  // WebRTC streaming: signal through the control plane (HTTP), media
  // peer-to-peer. On any failure, fall back to screenshot frames.
  useEffect(() => {
    if (!isStreaming || streamMode !== "webrtc") return;
    let cancelled = false;
    let pc: RTCPeerConnection | null = null;
    let sessionId = "";
    let seenAgentCandidates = 0;
    let statsTimer: ReturnType<typeof setInterval> | null = null;
    let lastFrames = 0;

    const stop = async () => {
      if (statsTimer) clearInterval(statsTimer);
      if (pc) {
        try { pc.close(); } catch { /* already closed */ }
        pc = null;
        pcRef.current = null;
      }
      if (sessionId) {
        const id = sessionId;
        sessionId = "";
        webrtcSessionRef.current = null;
        try { await api.endWebrtcSession(selectedDevice, id); } catch { /* session expires on its own */ }
      }
    };

    const fallback = (msg: string) => {
      if (cancelled) return;
      setNotice(`${msg} Falling back to screenshot frames.`);
      setStreamMode("frames");
    };

    (async () => {
      try {
        setWebrtcStatus("connecting");
        const sess = await api.createWebrtcSession(selectedDevice, scale, 10);
        if (cancelled) return;
        sessionId = sess.session_id;
        webrtcSessionRef.current = sessionId;

        // Wait for the agent's offer (it starts on a queued task).
        let offer: any = null;
        for (let i = 0; i < 30 && !cancelled; i++) {
          const s = await api.getWebrtcSession(selectedDevice, sessionId);
          if (s.status === "error") throw new Error(s.error || "Stream failed on the agent.");
          if (s.offer) { offer = s.offer; break; }
          await new Promise(r => setTimeout(r, 1000));
        }
        if (cancelled) return;
        if (!offer) throw new Error("Timed out waiting for the agent to offer a stream.");

        pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
        pcRef.current = pc;
        pc.onicecandidate = (e) => {
          if (e.candidate && sessionId) {
            api.postWebrtcCandidate(selectedDevice, sessionId, {
              candidate: e.candidate.candidate,
              sdpMid: e.candidate.sdpMid,
              sdpMLineIndex: e.candidate.sdpMLineIndex,
            }).catch(() => {});
          }
        };
        pc.ontrack = (e) => {
          if (videoRef.current) {
            videoRef.current.srcObject = e.streams[0];
            videoRef.current.play().catch(() => {});
          }
        };
        pc.onconnectionstatechange = () => {
          if (!pc) return;
          setWebrtcStatus(pc.connectionState);
          if (pc.connectionState === "failed" || pc.connectionState === "closed") {
            fallback("WebRTC connection failed.");
          }
        };
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        // Wait for ICE gathering so the answer carries candidates inline
        // (the agent side does not trickle; it reads them from the SDP).
        for (let i = 0; i < 50 && pc.iceGatheringState !== "complete"; i++) {
          await new Promise(r => setTimeout(r, 100));
        }
        await api.postWebrtcAnswer(selectedDevice, sessionId, { sdp: pc.localDescription?.sdp || answer.sdp, type: answer.type });

        // Trickle agent candidates in the background.
        const candTimer = setInterval(async () => {
          if (!pc || !sessionId || cancelled) return;
          try {
            const s = await api.getWebrtcSession(selectedDevice, sessionId);
            for (const cand of (s.agent_candidates || []).slice(seenAgentCandidates)) {
              try {
                await pc.addIceCandidate(new RTCIceCandidate({
                  candidate: cand.candidate, sdpMid: cand.sdpMid, sdpMLineIndex: cand.sdpMLineIndex,
                }));
              } catch { /* stale candidate */ }
              seenAgentCandidates += 1;
            }
          } catch { /* session poll will surface errors on the next pass */ }
        }, 1000);
        // Tie the candidate timer to this effect's cleanup via pc close.
        const origClose = pc.close.bind(pc);
        pc.close = () => { clearInterval(candTimer); origClose(); };

        // FPS from WebRTC stats (frames received per second).
        statsTimer = setInterval(async () => {
          if (!pc) return;
          try {
            const stats = await pc.getStats();
            let frames = 0;
            stats.forEach((r: any) => { if (r.type === "inbound-rtp" && r.kind === "video") frames = r.framesReceived || 0; });
            if (lastFrames) setFps(frames - lastFrames);
            lastFrames = frames;
          } catch { /* stats unavailable */ }
        }, 1000);
      } catch (err: any) {
        fallback(`WebRTC unavailable: ${err.message}`);
      }
    })();

    return () => {
      cancelled = true;
      setWebrtcStatus("idle");
      void stop();
    };
  }, [isStreaming, streamMode, selectedDevice, scale]);

  // Handle canvas clicks (Dual Control)
  const handleCanvasClick = async (e: React.MouseEvent<HTMLElement>) => {
    if (!dualControlActive) return;

    const rect = e.currentTarget.getBoundingClientRect();
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
        screen_width: currentFrame?.orig_width || currentFrame?.width || (videoRef.current?.videoWidth || 1920),
        screen_height: currentFrame?.orig_height || currentFrame?.height || (videoRef.current?.videoHeight || 1080),
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
    setConfirmReq({
      title: "Update the entire fleet?",
      message: "Every enrolled agent will update and refresh. Devices may briefly go offline during the update.",
      confirmLabel: "Update fleet",
      onConfirm: async () => {
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
      },
    });
  };

  const handleUpdateSingleDevice = async (id: string) => {
    try {
      const res = await api.updateDeviceAgent(id);
      setNotice(`Update dispatched to node ${id}: status=${res.status}`);
    } catch (err: any) {
      setError(err.message);
    }
  };

  // Two-step confirmation, matching the topbar Emergency Stop in App.tsx:
  // a single stray click must not halt the whole task queue.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setEmergencyArmed(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      if (emergencyTimer.current) clearTimeout(emergencyTimer.current);
    };
  }, []);

  const handleEmergencyHalt = async () => {
    if (!emergencyArmed) {
      setEmergencyArmed(true);
      if (emergencyTimer.current) clearTimeout(emergencyTimer.current);
      emergencyTimer.current = setTimeout(() => setEmergencyArmed(false), 6000);
      return;
    }
    if (emergencyTimer.current) clearTimeout(emergencyTimer.current);
    setEmergencyArmed(false);
    try {
      await api.emergencyStop();
      setNotice("🛑 EMERGENCY STOP TRIGGERED: All agent tasks blocked.");
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <ConfirmDialog request={confirmReq} onClose={() => setConfirmReq(null)} />
      {/* Target Machine Selector only: the page title/subtitle are
          rendered once by the App shell. */}
      <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <label className="f2-label" style={{ marginBottom: 0 }}>Target Node:</label>
          <select
            className="f2-select"
            value={selectedDevice}
            onChange={(e) => setSelectedDevice(e.target.value)}
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
        <div className="f2-messagebar" data-intent="success">
          <span>{notice}</span>
        </div>
      )}
      {error && (
        <div className="f2-messagebar" data-intent="error">
          <span>{error}</span>
        </div>
      )}

      {/* Stream Controls & Dual-Control Toggle Bar */}
      <div
        className="f2-panel"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <div style={{ display: "flex", gap: 4 }} role="group" aria-label="Stream mode">
            <button type="button" className={streamMode === "webrtc" ? "f2-btn f2-btn-primary f2-btn-sm" : "f2-btn f2-btn-sm"} onClick={() => setStreamMode("webrtc")}>
              🎥 WebRTC {webrtcStatus === "connected" ? "● LIVE" : ""}
            </button>
            <button type="button" className={streamMode === "frames" ? "f2-btn f2-btn-primary f2-btn-sm" : "f2-btn f2-btn-sm"} onClick={() => setStreamMode("frames")}>
              🖼 Frames
            </button>
          </div>
          <button
            onClick={() => setIsStreaming(!isStreaming)}
            className={isStreaming ? "f2-btn" : "f2-btn f2-btn-primary"}
          >
            {isStreaming ? "⏸ Pause Stream" : "▶ Resume Stream"}
          </button>

          <button
            onClick={() => setDualControlActive(!dualControlActive)}
            className={dualControlActive ? "f2-btn f2-btn-primary" : "f2-btn"}
          >
            <span>🎮</span> Dual-Control Takeover: {dualControlActive ? "ENABLED" : "OFF"}
          </button>
        </div>

        {/* Stream Metrics & Settings */}
        <div style={{ display: "flex", gap: 14, alignItems: "center", fontSize: 12, color: "var(--colorNeutralForeground3)" }}>
          <div>
            FPS: <span style={{ color: "var(--colorActionGreen)", fontWeight: 700 }}>{fps}</span>
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
              className="f2-select" style={{ fontSize: 11 }}
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
            border: "1px solid var(--colorActionBlue)",
            borderRadius: 8,
            color: "var(--colorActionBlue)",
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
            className={emergencyArmed ? "f2-btn-armed" : ""}
            aria-pressed={emergencyArmed}
            title={emergencyArmed ? "Click again to confirm the emergency stop" : "Arm the emergency stop (click again to confirm)"}
            style={{ padding: "4px 10px", background: "var(--colorActionRed)", color: "#fff", border: "none", borderRadius: 4, fontWeight: 700, cursor: "pointer", fontSize: 11 }}
          >
            {emergencyArmed ? "🛑 Confirm Emergency Stop?" : "🛑 Emergency Stop"}
          </button>
        </div>
      )}

      {/* Interactive Desktop Canvas Viewport */}
      <div
        style={{
          background: "#0c0d0e",
          border: "2px solid var(--colorNeutralStroke1)",
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
        {streamMode === "webrtc" ? (
          <div style={{ position: "relative", width: "100%", display: "flex", justifyContent: "center" }}>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              onClick={handleCanvasClick}
              onContextMenu={handleCanvasClick}
              style={{
                maxWidth: "100%",
                maxHeight: "75vh",
                objectFit: "contain",
                cursor: dualControlActive ? "crosshair" : "default",
                userSelect: "none",
                background: "#000",
              }}
            />
            {webrtcStatus !== "connected" && (
              <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, color: "var(--colorNeutralForeground3)", background: "rgba(0,0,0,0.35)" }}>
                <div style={{ fontSize: 42 }}>📡</div>
                <div style={{ fontWeight: 600, fontSize: 16 }}>
                  {webrtcStatus === "connecting" ? "Starting WebRTC stream…" : `WebRTC: ${webrtcStatus}`}
                </div>
                <div style={{ fontSize: 12 }}>Target machine: {selectedDevice} · falling back to frames if this stalls</div>
              </div>
            )}
          </div>
        ) : currentFrame?.base64_data ? (
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
          <div style={{ textAlign: "center", color: "var(--colorNeutralForeground3)", padding: 40 }}>
            <div style={{ fontSize: 42, marginBottom: 10 }}>📡</div>
            <div style={{ fontWeight: 600, fontSize: 16 }}>Connecting to remote desktop feed...</div>
            <div style={{ fontSize: 12, marginTop: 4 }}>Target machine: {selectedDevice}</div>
          </div>
        )}
      </div>

      {/* Virtual Operator Action Ribbon */}
      <div
        style={{
          background: "var(--colorNeutralBackground2)",
          border: "1px solid var(--colorNeutralStroke2)",
          borderRadius: 10,
          padding: 14,
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <div style={{ fontWeight: 700, fontSize: 13, textTransform: "uppercase", color: "var(--colorNeutralForeground3)" }}>
          Virtual Operator Controls & Shortcuts
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <button
            onClick={() => handleSendHotkey("win+r")}
            style={{ padding: "6px 12px", background: "var(--colorNeutralBackground2)", border: "1px solid var(--colorNeutralStroke1)", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer" }}
          >
            ⌨️ Win + R (Run)
          </button>
          <button
            onClick={() => handleSendHotkey("ctrl+s")}
            style={{ padding: "6px 12px", background: "var(--colorNeutralBackground2)", border: "1px solid var(--colorNeutralStroke1)", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer" }}
          >
            💾 Ctrl + S (Save)
          </button>
          <button
            onClick={() => handleSendHotkey("alt+tab")}
            style={{ padding: "6px 12px", background: "var(--colorNeutralBackground2)", border: "1px solid var(--colorNeutralStroke1)", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer" }}
          >
            🔄 Alt + Tab
          </button>
          <button
            onClick={() => handleSendHotkey("ctrl+shift+esc")}
            style={{ padding: "6px 12px", background: "var(--colorNeutralBackground2)", border: "1px solid var(--colorNeutralStroke1)", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer" }}
          >
            📊 Task Manager
          </button>
          <button
            onClick={() => handleSendHotkey("enter")}
            style={{ padding: "6px 12px", background: "var(--colorNeutralBackground2)", border: "1px solid var(--colorNeutralStroke1)", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer" }}
          >
            ⏎ Enter
          </button>
          <button
            onClick={() => handleSendHotkey("esc")}
            style={{ padding: "6px 12px", background: "var(--colorNeutralBackground2)", border: "1px solid var(--colorNeutralStroke1)", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer" }}
          >
            ⎋ Escape
          </button>

          {/* Direct typing field */}
          <div style={{ display: "flex", gap: 6, flex: 1, minWidth: 240 }}>
            <input
              id="remote-typing-input"
              type="text"
              placeholder="Type string to send to focused control..."
              style={{ flex: 1, padding: "6px 10px", borderRadius: 6, border: "1px solid var(--colorNeutralStroke1)", background: "transparent", color: "inherit", fontSize: 12 }}
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
              style={{ padding: "6px 12px", background: "var(--colorActionBlue)", color: "#fff", border: "none", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer" }}
            >
              Send Text
            </button>
          </div>
        </div>
      </div>

      {/* Fleet Software Lifecycle & 1-Click Updater Section */}
      <div
        style={{
          background: "var(--colorNeutralBackground2)",
          border: "1px solid var(--colorNeutralStroke2)",
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
            <div style={{ fontSize: 12, color: "var(--colorNeutralForeground3)", marginTop: 2 }}>
              Deploy updates to all Linux and Windows nodes simultaneously directly from origin/main.
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            {fleetVersionInfo && (
              <span style={{ fontSize: 12, color: "var(--colorNeutralForeground3)" }}>
                Commit: <code>{fleetVersionInfo.git_commit}</code> ({fleetVersionInfo.git_branch})
              </span>
            )}
            <button
              onClick={handleUpdateFleet}
              disabled={updating}
              style={{
                padding: "8px 16px",
                background: "var(--colorActionGreen)",
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
                background: "var(--colorNeutralBackground2)",
                borderRadius: 8,
                padding: "10px 14px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{d.name}</div>
                <div style={{ fontSize: 11, color: "var(--colorNeutralForeground3)" }}>{d.os || "Device"}</div>
              </div>
              <button
                onClick={() => handleUpdateSingleDevice(d.id)}
                style={{
                  padding: "4px 10px",
                  background: "rgba(0,120,212,0.12)",
                  color: "var(--colorActionBlue)",
                  border: "1px solid var(--colorActionBlue)",
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
