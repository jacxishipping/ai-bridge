import React, { useState, useEffect, useRef, useCallback } from "react";
import { api } from "./api";
import { ConfirmDialog, type ConfirmRequest } from "./ConfirmDialog";

interface LiveDesktopStudioProps {
  devices: any[];
  onNotice?: (notice: { intent: "success" | "error" | "info"; text: string }) => void;
}

// Helper to determine if a node is running Windows
const isWindowsDevice = (d: any): boolean => {
  const osStr = (d.os || "").toLowerCase();
  const nameStr = (d.name || "").toLowerCase();
  return osStr.includes("win") || nameStr.includes("win");
};

// -------------------------------------------------------------
// Component: WindowsLiveCard (Card for each device on the Wall)
// -------------------------------------------------------------
interface WindowsLiveCardProps {
  device: any;
  isStreaming: boolean;
  scale: number;
  quality: number;
  refreshIntervalMs: number;
  onTakeControl: (deviceId: string) => void;
  onSendHotkey: (deviceId: string, combo: string) => void;
  onNotice: (msg: string) => void;
  onError: (msg: string) => void;
}

const WindowsLiveCard: React.FC<WindowsLiveCardProps> = ({
  device,
  isStreaming,
  scale,
  quality,
  refreshIntervalMs,
  onTakeControl,
  onSendHotkey,
  onNotice,
  onError,
}) => {
  const [frame, setFrame] = useState<any | null>(null);
  const [fps, setFps] = useState<number>(0);
  const [latencyMs, setLatencyMs] = useState<number>(0);
  const [cardError, setCardError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number>(0);
  const [isHovered, setIsHovered] = useState<boolean>(false);
  const [isActionPending, setIsActionPending] = useState<boolean>(false);

  const isFetchingRef = useRef<boolean>(false);
  const frameCountRef = useRef<number>(0);

  const fetchDeviceFrame = useCallback(async () => {
    if (isFetchingRef.current || !isStreaming) return;
    isFetchingRef.current = true;
    const t0 = performance.now();
    try {
      const res = await api.desktopFrame(device.id, scale, quality);
      if (res && res.base64_data) {
        setFrame(res);
        setCardError(null);
        setLatencyMs(Math.round(performance.now() - t0));
        setLastUpdated(Date.now());
        frameCountRef.current += 1;
      } else if (res && res.error) {
        setCardError(res.error);
      }
    } catch (err: any) {
      setCardError(err.message || "Failed to grab frame");
    } finally {
      isFetchingRef.current = false;
    }
  }, [device.id, isStreaming, scale, quality]);

  // Main frame fetch interval
  useEffect(() => {
    if (!isStreaming) return;

    // Initial staggered fetch
    const initialTimer = setTimeout(fetchDeviceFrame, Math.floor(Math.random() * 400));
    const intervalTimer = setInterval(fetchDeviceFrame, refreshIntervalMs);

    // FPS counter
    const fpsTimer = setInterval(() => {
      setFps(frameCountRef.current);
      frameCountRef.current = 0;
    }, 1000);

    return () => {
      clearTimeout(initialTimer);
      clearInterval(intervalTimer);
      clearInterval(fpsTimer);
    };
  }, [fetchDeviceFrame, isStreaming, refreshIntervalMs]);

  const handleQuickHotkey = async (combo: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setIsActionPending(true);
    try {
      await onSendHotkey(device.id, combo);
      onNotice(`Sent shortcut ${combo.toUpperCase()} to ${device.name}`);
      // Refresh frame right after hotkey
      setTimeout(fetchDeviceFrame, 300);
    } catch (err: any) {
      onError(err.message);
    } finally {
      setIsActionPending(false);
    }
  };

  const handleQuickSnapshot = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!frame?.base64_data) return;
    const win = window.open("");
    if (win) {
      win.document.write(
        `<html><head><title>${device.name} - Snapshot</title></head><body style="margin:0;background:#0e0e0e;display:flex;justify-content:center;align-items:center;height:100vh;"><img src="data:${frame.mime_type || "image/jpeg"};base64,${frame.base64_data}" style="max-width:100%;max-height:100%;object-fit:contain;box-shadow:0 10px 40px rgba(0,0,0,0.8);"/></body></html>`
      );
    }
  };

  const timeAgoSec = lastUpdated ? Math.max(0, Math.round((Date.now() - lastUpdated) / 1000)) : null;
  const isOnline = device.status === "online";

  return (
    <div
      className="f2-card"
      style={{
        display: "flex",
        flexDirection: "column",
        borderRadius: 12,
        overflow: "hidden",
        border: isHovered ? "2px solid var(--colorActionBlue)" : "1px solid var(--colorNeutralStroke1)",
        background: "var(--colorNeutralBackground1)",
        boxShadow: isHovered ? "0 10px 24px rgba(0,0,0,0.2)" : "0 4px 12px rgba(0,0,0,0.06)",
        transition: "all 0.18s ease-in-out",
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Card Header */}
      <div
        style={{
          padding: "10px 14px",
          background: "var(--colorNeutralBackground2)",
          borderBottom: "1px solid var(--colorNeutralStroke2)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span
            style={{
              width: 10,
              height: 10,
              borderRadius: "50%",
              background: isOnline ? "var(--colorActionGreen)" : "var(--colorNeutralForeground3)",
              boxShadow: isOnline ? "0 0 8px var(--colorActionGreen)" : "none",
              display: "inline-block",
            }}
            title={isOnline ? "Online & Active" : "Offline / Unreachable"}
          />
          <div>
            <div style={{ fontWeight: 700, fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
              <span>🪟</span>
              <span>{device.name}</span>
            </div>
            <div style={{ fontSize: 11, color: "var(--colorNeutralForeground3)", marginTop: 1 }}>
              {device.hostname || device.id} · <span style={{ opacity: 0.85 }}>{device.os || "Windows"}</span>
            </div>
          </div>
        </div>

        {/* Status / Telemetry Badges */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11 }}>
          <span
            style={{
              padding: "2px 6px",
              borderRadius: 4,
              background: "rgba(16, 124, 65, 0.12)",
              color: "var(--colorActionGreen)",
              fontWeight: 700,
            }}
          >
            {fps} FPS
          </span>
          <span style={{ color: "var(--colorNeutralForeground3)" }}>{latencyMs}ms</span>
        </div>
      </div>

      {/* Screen Canvas Viewport */}
      <div
        onClick={() => onTakeControl(device.id)}
        style={{
          position: "relative",
          width: "100%",
          paddingTop: "56.25%", // 16:9 aspect ratio
          background: "#08090a",
          cursor: "pointer",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          {frame?.base64_data ? (
            <img
              src={`data:${frame.mime_type || "image/jpeg"};base64,${frame.base64_data}`}
              alt={`${device.name} Desktop`}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "contain",
                userSelect: "none",
              }}
            />
          ) : (
            <div style={{ textAlign: "center", color: "var(--colorNeutralForeground3)", padding: 20 }}>
              <div style={{ fontSize: 32, marginBottom: 6 }}>📡</div>
              <div style={{ fontSize: 12, fontWeight: 600 }}>
                {cardError ? `Stream Error: ${cardError}` : "Polling Windows Desktop..."}
              </div>
              <div style={{ fontSize: 10, opacity: 0.75, marginTop: 4 }}>ID: {device.id}</div>
            </div>
          )}

          {/* Resolution Badge Overlay */}
          {frame && (
            <div
              style={{
                position: "absolute",
                bottom: 8,
                left: 8,
                background: "rgba(0,0,0,0.65)",
                color: "#fff",
                padding: "2px 6px",
                borderRadius: 4,
                fontSize: 10,
                backdropFilter: "blur(4px)",
              }}
            >
              {frame.width}×{frame.height}
              {timeAgoSec !== null && ` · ${timeAgoSec === 0 ? "live" : `${timeAgoSec}s ago`}`}
            </div>
          )}

          {/* Hover Takeover Pill Button */}
          {isHovered && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                background: "rgba(0,0,0,0.38)",
                backdropFilter: "blur(2px)",
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                transition: "opacity 0.15s ease",
              }}
            >
              <button
                type="button"
                className="f2-btn f2-btn-primary"
                style={{
                  padding: "8px 16px",
                  fontSize: 13,
                  fontWeight: 700,
                  boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <span>🎮</span> Take Dual-Control Takeover
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Card Action Ribbon */}
      <div
        style={{
          padding: "8px 12px",
          background: "var(--colorNeutralBackground2)",
          borderTop: "1px solid var(--colorNeutralStroke2)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 6,
        }}
      >
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <button
            type="button"
            className="f2-btn f2-btn-primary f2-btn-sm"
            onClick={() => onTakeControl(device.id)}
            style={{ fontSize: 11, padding: "4px 10px" }}
          >
            🎮 Take Control
          </button>
          <button
            type="button"
            className="f2-btn f2-btn-sm"
            onClick={(e) => handleQuickHotkey("win+r", e)}
            disabled={isActionPending}
            style={{ fontSize: 11, padding: "4px 8px" }}
            title="Dispatch Win+R Run shortcut"
          >
            ⌨️ Win+R
          </button>
          <button
            type="button"
            className="f2-btn f2-btn-sm"
            onClick={handleQuickSnapshot}
            disabled={!frame}
            style={{ fontSize: 11, padding: "4px 8px" }}
            title="Open high-res snapshot in new tab"
          >
            📸 Shot
          </button>
        </div>

        <button
          type="button"
          className="f2-btn f2-btn-sm"
          onClick={(e) => {
            e.stopPropagation();
            fetchDeviceFrame();
          }}
          disabled={isFetchingRef.current}
          style={{ fontSize: 11, padding: "4px 8px" }}
          title="Refresh screenshot frame"
        >
          🔄
        </button>
      </div>
    </div>
  );
};

// -------------------------------------------------------------
// Main Component: LiveDesktopStudio
// -------------------------------------------------------------
export const LiveDesktopStudio: React.FC<LiveDesktopStudioProps> = ({ devices, onNotice }) => {
  // View mode: "wall" (Multi-device Windows Grid) or "single" (Focused Interactive Dual-Control)
  const [viewMode, setViewMode] = useState<"wall" | "single">("wall");
  const [selectedDevice, setSelectedDevice] = useState<string>("local");
  const [wallFilter, setWallFilter] = useState<"windows" | "all">("windows");
  const [wallCols, setWallCols] = useState<"auto" | "2" | "3" | "4">("auto");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [wallIntervalMs, setWallIntervalMs] = useState<number>(2000);

  // Single-device streaming state
  const [isStreaming, setIsStreaming] = useState<boolean>(true);
  const [dualControlActive, setDualControlActive] = useState<boolean>(false);
  const [scale, setScale] = useState<number>(0.75);
  const [quality, setQuality] = useState<number>(70);
  const [currentFrame, setCurrentFrame] = useState<any | null>(null);
  const [fps, setFps] = useState<number>(0);
  const [latencyMs, setLatencyMs] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

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
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const [isDataChannelReady, setIsDataChannelReady] = useState<boolean>(false);
  const [monitors, setMonitors] = useState<any[]>([]);
  const [selectedMonitor, setSelectedMonitor] = useState<number | undefined>(undefined);
  const webrtcSessionRef = useRef<string | null>(null);
  const isFetchingRef = useRef<boolean>(false);
  const frameCountRef = useRef<number>(0);

  // Auto-select primary Windows device if available
  useEffect(() => {
    const winDev = devices.find((d) => isWindowsDevice(d));
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

  // Filtered devices for the Wall view
  const filteredDevices = devices.filter((d) => {
    if (wallFilter === "windows" && !isWindowsDevice(d)) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const name = (d.name || "").toLowerCase();
      const host = (d.hostname || "").toLowerCase();
      const os = (d.os || "").toLowerCase();
      const id = (d.id || "").toLowerCase();
      return name.includes(q) || host.includes(q) || os.includes(q) || id.includes(q);
    }
    return true;
  });

  const windowsCount = devices.filter(isWindowsDevice).length;

  // Frame fetch loop for Single Device (fallback frames mode)
  useEffect(() => {
    if (viewMode !== "single" || !isStreaming || streamMode !== "frames") return;

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

    const fpsInterval = setInterval(() => {
      setFps(frameCountRef.current);
      frameCountRef.current = 0;
    }, 1000);

    return () => {
      active = false;
      clearInterval(streamInterval);
      clearInterval(fpsInterval);
    };
  }, [viewMode, isStreaming, selectedDevice, scale, quality, streamMode]);

  // WebRTC streaming for Single Device
  useEffect(() => {
    if (viewMode !== "single" || !isStreaming || streamMode !== "webrtc") return;
    let cancelled = false;
    let pc: RTCPeerConnection | null = null;
    let sessionId = "";
    let seenAgentCandidates = 0;
    let statsTimer: any = null;
    let lastFrames = 0;

    const stop = async () => {
      if (statsTimer) clearInterval(statsTimer);
      if (pc) {
        try { pc.close(); } catch {}
        pc = null;
        pcRef.current = null;
      }
      if (videoRef.current) videoRef.current.srcObject = null;
      const id = webrtcSessionRef.current;
      if (id) {
        webrtcSessionRef.current = null;
        try { await api.endWebrtcSession(selectedDevice, id); } catch {}
      }
    };

    const fallback = (reason: string) => {
      if (cancelled) return;
      setError(`${reason} Falling back to screenshot frames.`);
      setStreamMode("frames");
    };

    (async () => {
      try {
        setWebrtcStatus("connecting");
        const sess = await api.createWebrtcSession(selectedDevice, scale, 10);
        if (cancelled) return;
        sessionId = sess.session_id;
        webrtcSessionRef.current = sessionId;

        let offer: any = null;
        for (let i = 0; i < 40; i++) {
          if (cancelled) return;
          const s = await api.getWebrtcSession(selectedDevice, sessionId);
          if (s.status === "error") {
            fallback(s.error || "Agent reported a WebRTC error.");
            return;
          }
          if (s.offer) {
            offer = s.offer;
            break;
          }
          await new Promise((r) => setTimeout(r, 250));
        }
        if (!offer) {
          fallback("Timed out waiting for the agent's WebRTC offer.");
          return;
        }

        pc = new RTCPeerConnection({
          iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
        });
        pcRef.current = pc;

        // WebRTC DataChannel for ultra-low latency direct input (<15ms)
        try {
          const dc = pc.createDataChannel("input", { ordered: true });
          dataChannelRef.current = dc;
          dc.onopen = () => setIsDataChannelReady(true);
          dc.onclose = () => setIsDataChannelReady(false);
          pc.ondatachannel = (e) => {
            dataChannelRef.current = e.channel;
            setIsDataChannelReady(true);
          };
        } catch {}

        pc.ontrack = (evt) => {
          if (videoRef.current) {
            if (evt.streams && evt.streams[0]) {
              videoRef.current.srcObject = evt.streams[0];
            } else if (evt.track) {
              const stream = new MediaStream([evt.track]);
              videoRef.current.srcObject = stream;
            }
            videoRef.current.play().catch(() => {});
          }
        };
        pc.onicecandidate = (evt) => {
          if (evt.candidate && sessionId) {
            api.postWebrtcCandidate(selectedDevice, sessionId, {
              candidate: evt.candidate.candidate,
              sdpMid: evt.candidate.sdpMid,
              sdpMLineIndex: evt.candidate.sdpMLineIndex,
            }).catch(() => {});
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

        for (let i = 0; i < 50 && pc.iceGatheringState !== "complete"; i++) {
          await new Promise((r) => setTimeout(r, 100));
        }
        await api.postWebrtcAnswer(selectedDevice, sessionId, {
          sdp: pc.localDescription?.sdp || answer.sdp,
          type: answer.type,
        });

        const candTimer = setInterval(async () => {
          if (!pc || !sessionId || cancelled) return;
          try {
            const s = await api.getWebrtcSession(selectedDevice, sessionId);
            for (const cand of (s.agent_candidates || []).slice(seenAgentCandidates)) {
              try {
                await pc.addIceCandidate(
                  new RTCIceCandidate({
                    candidate: cand.candidate,
                    sdpMid: cand.sdpMid,
                    sdpMLineIndex: cand.sdpMLineIndex,
                  })
                );
              } catch {}
              seenAgentCandidates += 1;
            }
          } catch {}
        }, 1000);

        const origClose = pc.close.bind(pc);
        pc.close = () => {
          clearInterval(candTimer);
          origClose();
        };

        statsTimer = setInterval(async () => {
          if (!pc) return;
          try {
            const stats = await pc.getStats();
            let frames = 0;
            stats.forEach((r: any) => {
              if (r.type === "inbound-rtp" && r.kind === "video") frames = r.framesReceived || 0;
            });
            if (lastFrames) setFps(frames - lastFrames);
            lastFrames = frames;
          } catch {}
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
  }, [viewMode, isStreaming, streamMode, selectedDevice, scale]);

  // Handle canvas clicks (Dual Control Takeover)
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

  const handleSendHotkey = async (targetId: string, combo: string) => {
    try {
      await api.sendDesktopInput(targetId, {
        action: "hotkey",
        key: combo,
      });
      const msg = `Dispatched shortcut "${combo}" to node ${targetId}`;
      setNotice(msg);
      if (onNotice) onNotice({ intent: "info", text: msg });
    } catch (err: any) {
      setError(err.message);
      throw err;
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

  const handleFocusDevice = (deviceId: string) => {
    setSelectedDevice(deviceId);
    setViewMode("single");
    setNotice(`Switched to Focused Dual-Control on node ${deviceId}`);
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

  const gridTemplate =
    wallCols === "2"
      ? "repeat(2, minmax(360px, 1fr))"
      : wallCols === "3"
      ? "repeat(3, minmax(300px, 1fr))"
      : wallCols === "4"
      ? "repeat(4, minmax(260px, 1fr))"
      : "repeat(auto-fill, minmax(360px, 1fr))";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <ConfirmDialog request={confirmReq} onClose={() => setConfirmReq(null)} />

      {/* Top Header Mode Switcher Bar */}
      <div
        className="f2-panel"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 12,
          padding: "10px 16px",
        }}
      >
        {/* Mode Switch Tabs */}
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button
            type="button"
            className={viewMode === "wall" ? "f2-btn f2-btn-primary" : "f2-btn"}
            onClick={() => setViewMode("wall")}
            style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700 }}
          >
            <span>🪟</span>
            <span>Windows Fleet Live Wall</span>
            <span
              style={{
                fontSize: 11,
                padding: "2px 7px",
                borderRadius: 10,
                background: viewMode === "wall" ? "rgba(255,255,255,0.25)" : "var(--colorNeutralStroke1)",
                color: viewMode === "wall" ? "#fff" : "inherit",
              }}
            >
              {windowsCount} Live
            </span>
          </button>

          <button
            type="button"
            className={viewMode === "single" ? "f2-btn f2-btn-primary" : "f2-btn"}
            onClick={() => setViewMode("single")}
            style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700 }}
          >
            <span>🖥️</span>
            <span>Single Focused Studio</span>
          </button>
        </div>

        {/* Quick Global Action Status */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button
            type="button"
            className="f2-btn f2-btn-sm"
            onClick={() => setIsStreaming(!isStreaming)}
            style={{ fontWeight: 600 }}
          >
            {isStreaming ? "⏸ Pause All Streams" : "▶ Resume All Streams"}
          </button>

          {viewMode === "single" && (
            <button
              type="button"
              className="f2-btn f2-btn-sm"
              onClick={() => setViewMode("wall")}
              style={{ fontWeight: 600 }}
            >
              ← Back to Windows Fleet Wall
            </button>
          )}
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

      {/* ========================================================= */}
      {/* MODE 1: WINDOWS FLEET LIVE WALL (MULTI-DEVICE GRID)        */}
      {/* ========================================================= */}
      {viewMode === "wall" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Wall Controls Toolbar */}
          <div
            className="f2-panel"
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 12,
              padding: "10px 14px",
            }}
          >
            {/* Filter Toggle and Search */}
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ display: "flex", gap: 4 }} role="group" aria-label="Filter devices">
                <button
                  type="button"
                  className={wallFilter === "windows" ? "f2-btn f2-btn-primary f2-btn-sm" : "f2-btn f2-btn-sm"}
                  onClick={() => setWallFilter("windows")}
                >
                  🪟 Windows Only ({windowsCount})
                </button>
                <button
                  type="button"
                  className={wallFilter === "all" ? "f2-btn f2-btn-primary f2-btn-sm" : "f2-btn f2-btn-sm"}
                  onClick={() => setWallFilter("all")}
                >
                  🌐 All Nodes ({devices.length})
                </button>
              </div>

              <input
                type="text"
                className="f2-input"
                placeholder="Search device name, host, OS..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ width: 220, fontSize: 12, padding: "5px 10px" }}
              />
            </div>

            {/* Grid Density, Scale, and Refresh Rate */}
            <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", fontSize: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <label className="f2-label" style={{ marginBottom: 0, fontSize: 11 }}>Grid:</label>
                <select
                  className="f2-select"
                  value={wallCols}
                  onChange={(e) => setWallCols(e.target.value as any)}
                  style={{ fontSize: 11, padding: "4px 8px" }}
                >
                  <option value="auto">Auto Responsive</option>
                  <option value="2">2 Columns</option>
                  <option value="3">3 Columns</option>
                  <option value="4">4 Columns</option>
                </select>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <label className="f2-label" style={{ marginBottom: 0, fontSize: 11 }}>Rate:</label>
                <select
                  className="f2-select"
                  value={wallIntervalMs}
                  onChange={(e) => setWallIntervalMs(Number(e.target.value))}
                  style={{ fontSize: 11, padding: "4px 8px" }}
                >
                  <option value={1200}>1.2s (Fast)</option>
                  <option value={2000}>2.0s (Normal)</option>
                  <option value={3500}>3.5s (Balanced)</option>
                  <option value={5000}>5.0s (Low Network)</option>
                </select>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <label className="f2-label" style={{ marginBottom: 0, fontSize: 11 }}>Quality:</label>
                <select
                  className="f2-select"
                  value={scale}
                  onChange={(e) => setScale(Number(e.target.value))}
                  style={{ fontSize: 11, padding: "4px 8px" }}
                >
                  <option value={0.5}>50% Scale (High FPS)</option>
                  <option value={0.75}>75% Scale (Balanced)</option>
                  <option value={1.0}>100% Native</option>
                </select>
              </div>
            </div>
          </div>

          {/* Wall Grid Cards */}
          {filteredDevices.length > 0 ? (
            <div style={{ display: "grid", gridTemplateColumns: gridTemplate, gap: 16 }}>
              {filteredDevices.map((dev) => (
                <WindowsLiveCard
                  key={dev.id}
                  device={dev}
                  isStreaming={isStreaming}
                  scale={scale}
                  quality={quality}
                  refreshIntervalMs={wallIntervalMs}
                  onTakeControl={handleFocusDevice}
                  onSendHotkey={(id, combo) => handleSendHotkey(id, combo)}
                  onNotice={(msg) => {
                    setNotice(msg);
                    if (onNotice) onNotice({ intent: "info", text: msg });
                  }}
                  onError={(err) => setError(err)}
                />
              ))}
            </div>
          ) : (
            <div
              className="f2-card"
              style={{
                textAlign: "center",
                padding: "48px 24px",
                color: "var(--colorNeutralForeground3)",
              }}
            >
              <div style={{ fontSize: 44, marginBottom: 12 }}>🪟</div>
              <h3 style={{ fontSize: 18, margin: "0 0 8px 0", color: "inherit" }}>
                No matching Windows devices found
              </h3>
              <p style={{ fontSize: 13, maxWidth: 440, margin: "0 auto 16px auto" }}>
                {wallFilter === "windows"
                  ? "None of the enrolled nodes report a Windows operating system."
                  : "No devices matched your search query."}
              </p>
              {wallFilter === "windows" && devices.length > 0 && (
                <button
                  type="button"
                  className="f2-btn f2-btn-primary"
                  onClick={() => setWallFilter("all")}
                >
                  Show All Enrolled Nodes ({devices.length})
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* ========================================================= */}
      {/* MODE 2: SINGLE FOCUSED DESKTOP STUDIO (DUAL-CONTROL)      */}
      {/* ========================================================= */}
      {viewMode === "single" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Target Node Selector Bar */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <button
                type="button"
                className="f2-btn f2-btn-sm"
                onClick={() => setViewMode("wall")}
                style={{ fontWeight: 600 }}
              >
                ← Windows Fleet Wall
              </button>
              <label className="f2-label" style={{ marginBottom: 0 }}>Target Node:</label>
              <select
                className="f2-select"
                value={selectedDevice}
                onChange={(e) => setSelectedDevice(e.target.value)}
              >
                <option value="local">Local Control Host</option>
                {devices.map((d) => (
                  <option key={d.id} value={d.id}>
                    {isWindowsDevice(d) ? "🪟 " : "🐧 "}
                    {d.name} ({d.os || "node"}) — {d.status}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ fontSize: 12, color: "var(--colorNeutralForeground3)" }}>
              Active Node: <b>{selectedDevice}</b>
            </div>
          </div>

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
                <button
                  type="button"
                  className={streamMode === "webrtc" ? "f2-btn f2-btn-primary f2-btn-sm" : "f2-btn f2-btn-sm"}
                  onClick={() => setStreamMode("webrtc")}
                >
                  🎥 WebRTC {webrtcStatus === "connected" ? "● LIVE" : ""}
                </button>
                <button
                  type="button"
                  className={streamMode === "frames" ? "f2-btn f2-btn-primary f2-btn-sm" : "f2-btn f2-btn-sm"}
                  onClick={() => setStreamMode("frames")}
                >
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
                  className="f2-select"
                  style={{ fontSize: 11 }}
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
                style={{
                  padding: "4px 10px",
                  background: "var(--colorActionRed)",
                  color: "#fff",
                  border: "none",
                  borderRadius: 4,
                  fontWeight: 700,
                  cursor: "pointer",
                  fontSize: 11,
                }}
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
                  onLoadedMetadata={() => {
                    if (videoRef.current) {
                      videoRef.current.play().catch(() => {});
                    }
                  }}
                  style={{
                    maxWidth: "100%",
                    maxHeight: "75vh",
                    objectFit: "contain",
                    cursor: dualControlActive ? "crosshair" : "default",
                    userSelect: "none",
                  }}
                />
                {webrtcStatus !== "connected" && (
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 6,
                      color: "var(--colorNeutralForeground3)",
                      background: "rgba(0,0,0,0.35)",
                    }}
                  >
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
                type="button"
                onClick={() => handleSendHotkey(selectedDevice, "win+r")}
                style={{
                  padding: "6px 12px",
                  background: "var(--colorNeutralBackground2)",
                  border: "1px solid var(--colorNeutralStroke1)",
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                ⌨️ Win + R (Run)
              </button>
              <button
                type="button"
                onClick={() => handleSendHotkey(selectedDevice, "ctrl+s")}
                style={{
                  padding: "6px 12px",
                  background: "var(--colorNeutralBackground2)",
                  border: "1px solid var(--colorNeutralStroke1)",
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                💾 Ctrl + S (Save)
              </button>
              <button
                type="button"
                onClick={() => handleSendHotkey(selectedDevice, "alt+tab")}
                style={{
                  padding: "6px 12px",
                  background: "var(--colorNeutralBackground2)",
                  border: "1px solid var(--colorNeutralStroke1)",
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                🔄 Alt + Tab
              </button>
              <button
                type="button"
                onClick={() => handleSendHotkey(selectedDevice, "ctrl+shift+esc")}
                style={{
                  padding: "6px 12px",
                  background: "var(--colorNeutralBackground2)",
                  border: "1px solid var(--colorNeutralStroke1)",
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                📊 Task Manager
              </button>
              <button
                type="button"
                onClick={() => handleSendHotkey(selectedDevice, "enter")}
                style={{
                  padding: "6px 12px",
                  background: "var(--colorNeutralBackground2)",
                  border: "1px solid var(--colorNeutralStroke1)",
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                ⏎ Enter
              </button>
              <button
                type="button"
                onClick={() => handleSendHotkey(selectedDevice, "esc")}
                style={{
                  padding: "6px 12px",
                  background: "var(--colorNeutralBackground2)",
                  border: "1px solid var(--colorNeutralStroke1)",
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                ⎋ Escape
              </button>

              {/* Direct typing field */}
              <div style={{ display: "flex", gap: 6, flex: 1, minWidth: 240 }}>
                <input
                  id="remote-typing-input"
                  type="text"
                  placeholder="Type string to send to focused control..."
                  style={{
                    flex: 1,
                    padding: "6px 10px",
                    borderRadius: 6,
                    border: "1px solid var(--colorNeutralStroke1)",
                    background: "transparent",
                    color: "inherit",
                    fontSize: 12,
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      handleSendText((e.target as HTMLInputElement).value);
                      (e.target as HTMLInputElement).value = "";
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={() => {
                    const el = document.getElementById("remote-typing-input") as HTMLInputElement;
                    if (el) {
                      handleSendText(el.value);
                      el.value = "";
                    }
                  }}
                  style={{
                    padding: "6px 12px",
                    background: "var(--colorActionBlue)",
                    color: "#fff",
                    border: "none",
                    borderRadius: 6,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Send Text
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* FLEET SOFTWARE LIFECYCLE & 1-CLICK UPDATER SECTION        */}
      {/* ========================================================= */}
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

        {/* Device Status Cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 10 }}>
          {devices.map((d) => (
            <div
              key={d.id}
              style={{
                background: "var(--colorNeutralBackground1)",
                borderRadius: 8,
                padding: "10px 14px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                border: "1px solid var(--colorNeutralStroke1)",
              }}
            >
              <div>
                <div style={{ fontWeight: 600, fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
                  <span>{isWindowsDevice(d) ? "🪟" : "🐧"}</span>
                  <span>{d.name}</span>
                </div>
                <div style={{ fontSize: 11, color: "var(--colorNeutralForeground3)" }}>{d.os || "Device"}</div>
              </div>
              <button
                type="button"
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
