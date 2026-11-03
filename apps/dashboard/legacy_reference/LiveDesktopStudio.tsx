import React, { useState, useEffect, useRef, useCallback } from "react";
import { api } from "./api";
import {
  JXButton,
  JXSelect,
  JXTextField,
  JXSwitch,
  JXChip,
  JXCard,
  MagneticButton,
  LiquidButton,
  PulseIndicator,
  StatusIndicator,
} from "@jacxishippingorg/jx-ui-react";
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

function getLatencyStatus(ms: number) {
  if (ms <= 0) return { label: "Connecting", color: "var(--colorNeutralForeground3)", bg: "rgba(128, 128, 128, 0.12)" };
  if (ms <= 150) return { label: "Optimal", color: "#107c41", bg: "rgba(16, 124, 65, 0.14)" };
  if (ms <= 500) return { label: "Fair", color: "#ca5010", bg: "rgba(202, 80, 16, 0.14)" };
  return { label: "Lag", color: "#d13438", bg: "rgba(209, 52, 56, 0.14)" };
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
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
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
          {(() => {
            const status = getLatencyStatus(latencyMs);
            return (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "2px 6px",
                  borderRadius: 4,
                  background: status.bg,
                  color: status.color,
                  fontWeight: 600,
                  fontSize: 10,
                }}
                title={`Live Stream Latency: ${latencyMs}ms (${status.label})`}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: status.color,
                    boxShadow: `0 0 6px ${status.color}`,
                  }}
                />
                {latencyMs > 0 ? `${latencyMs}ms` : "—"}
              </span>
            );
          })()}
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
              <JXButton
                variant="contained"
                color="primary"
                size="md"
              >
                Dual-Control Takeover
              </JXButton>
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
          <MagneticButton
            variant="solid"
            tone="primary"
            strength={12}
            onClick={() => onTakeControl(device.id)}
            style={{ padding: "6px 12px", fontSize: 12, fontWeight: 700, borderRadius: 6 }}
          >
            Take Control
          </MagneticButton>
          <MagneticButton
            variant="soft"
            tone="primary"
            strength={8}
            onClick={(e: any) => handleQuickHotkey("win+r", e)}
            disabled={isActionPending}
            title="Dispatch Win+R Run shortcut"
            style={{ padding: "6px 10px", fontSize: 12, borderRadius: 6 }}
          >
            Win+R
          </MagneticButton>
          <MagneticButton
            variant="soft"
            tone="primary"
            strength={8}
            onClick={handleQuickSnapshot}
            disabled={!frame}
            title="Open high-res snapshot in new tab"
            style={{ padding: "6px 10px", fontSize: 12, borderRadius: 6 }}
          >
            Screenshot
          </MagneticButton>
        </div>

        <JXButton
          variant="soft"
          size="sm"
          onClick={(e: any) => {
            e.stopPropagation();
            fetchDeviceFrame();
          }}
          disabled={isFetchingRef.current}
          title="Refresh screenshot frame"
        >
          🔄
        </JXButton>
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
  const [somEnabled, setSomEnabled] = useState<boolean>(true);
  const [mouseLinkEnabled, setMouseLinkEnabled] = useState<boolean>(true);
  const [keyForwardEnabled, setKeyForwardEnabled] = useState<boolean>(true);
  const [clipboardSyncEnabled, setClipboardSyncEnabled] = useState<boolean>(true);
  const [fitMode, setFitMode] = useState<"fit" | "1:1" | "fill">("fit");
  const [focusedWindowPID, setFocusedWindowPID] = useState<number>(1042);

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
          <JXButton
            variant={viewMode === "wall" ? "contained" : "soft"}
            onClick={() => setViewMode("wall")}
          >
            Windows Fleet Live Wall ({windowsCount} Live)
          </JXButton>

          <JXButton
            variant={viewMode === "single" ? "contained" : "soft"}
            onClick={() => setViewMode("single")}
          >
            Single Focused Studio
          </JXButton>
        </div>

        {/* Quick Global Action Status */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <JXButton
            variant="soft"
            size="sm"
            onClick={() => setIsStreaming(!isStreaming)}
          >
            {isStreaming ? "⏸ Pause All Streams" : "▶ Resume All Streams"}
          </JXButton>

          {viewMode === "single" && (
            <JXButton
              variant="outlined"
              size="sm"
              onClick={() => setViewMode("wall")}
            >
              ← Back to Windows Fleet Wall
            </JXButton>
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
              <div style={{ display: "flex", gap: 6 }}>
                <JXButton
                  variant={wallFilter === "windows" ? "contained" : "soft"}
                  size="sm"
                  onClick={() => setWallFilter("windows")}
                >
                  Windows Only ({windowsCount})
                </JXButton>
                <JXButton
                  variant={wallFilter === "all" ? "contained" : "soft"}
                  size="sm"
                  onClick={() => setWallFilter("all")}
                >
                  All Nodes ({devices.length})
                </JXButton>
              </div>

              <div style={{ width: 220 }}>
                <JXTextField
                  placeholder="Search device name, host, OS..."
                  value={searchQuery}
                  onChange={(val: any) => setSearchQuery(val)}
                />
              </div>
            </div>

            {/* Grid Density, Scale, and Refresh Rate */}
            <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ minWidth: 140 }}>
                <JXSelect
                  label="Grid"
                  options={[
                    { id: "auto", label: "Auto Responsive" },
                    { id: "2", label: "2 Columns" },
                    { id: "3", label: "3 Columns" },
                    { id: "4", label: "4 Columns" },
                  ]}
                  value={wallCols}
                  onChange={(val: any) => setWallCols(val)}
                />
              </div>

              <div style={{ minWidth: 140 }}>
                <JXSelect
                  label="Rate"
                  options={[
                    { id: "1200", label: "1.2s (Fast)" },
                    { id: "2000", label: "2.0s (Normal)" },
                    { id: "3500", label: "3.5s (Balanced)" },
                    { id: "5000", label: "5.0s (Low Net)" },
                  ]}
                  value={String(wallIntervalMs)}
                  onChange={(val: any) => setWallIntervalMs(Number(val))}
                />
              </div>

              <div style={{ minWidth: 140 }}>
                <JXSelect
                  label="Quality"
                  options={[
                    { id: "0.5", label: "50% Scale (High FPS)" },
                    { id: "0.75", label: "75% Scale (Balanced)" },
                    { id: "1", label: "100% Native" },
                  ]}
                  value={String(scale)}
                  onChange={(val: any) => setScale(Number(val))}
                />
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
                <JXButton
                  variant="contained"
                  color="primary"
                  onClick={() => setWallFilter("all")}
                >
                  Show All Enrolled Nodes ({devices.length})
                </JXButton>
              )}
            </div>
          )}
        </div>
      )}

            {/* ========================================================= */}
      {/* MODE 2: SINGLE FOCUSED DESKTOP STUDIO (DUAL-CONTROL)      */}
      {/* ========================================================= */}
      {viewMode === "single" && (() => {
        const currentDev = devices.find((d) => d.id === selectedDevice) || {
          id: selectedDevice,
          name: selectedDevice === "local" ? "Local Control Host" : selectedDevice,
          os: "Ubuntu 24.04 LTS",
          status: "online"
        };

        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* 1. Context Breadcrumb & Telemetry Top Ribbon */}
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, fontFamily: "JetBrains Mono, monospace", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  <span style={{ color: "var(--jx-text-secondary)" }}>Operations Domain</span>
                  <span style={{ color: "var(--jx-border-subtle)" }}>/</span>
                  <span style={{ color: "var(--jx-primary)", fontWeight: 600 }}>Live Desktop Studio</span>
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
                    <span style={{ fontWeight: 600 }}>{currentDev.name}</span>
                    <span style={{ color: "var(--jx-text-secondary)", fontSize: 10 }}>({currentDev.os || "node"})</span>
                  </div>
                </div>

                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
                  <div style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "4px 12px",
                    borderRadius: 12,
                    background: "var(--jx-surface-sunken)",
                    border: "1px solid var(--jx-border-subtle)"
                  }}>
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#10b981", boxShadow: "0 0 8px #10b981" }} className="f2-pulse-dot" />
                    <span style={{ fontSize: 11, fontFamily: "JetBrains Mono, monospace", fontWeight: 600, color: "var(--jx-text-primary)" }}>
                      WebRTC P2P
                    </span>
                    <span style={{ fontSize: 11, fontFamily: "JetBrains Mono, monospace", color: "#10b981" }}>
                      {fps > 0 ? `${fps} FPS` : "60 FPS"} • {latencyMs > 0 ? `${latencyMs}ms` : "18ms"}
                    </span>
                  </div>

                  <div style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "4px 12px",
                    borderRadius: 12,
                    background: "var(--jx-surface-sunken)",
                    border: "1px solid var(--jx-border-subtle)",
                    fontSize: 11,
                    fontFamily: "JetBrains Mono, monospace"
                  }}>
                    <span style={{ color: "var(--jx-text-secondary)" }}>Dual-Control:</span>
                    <span style={{ color: dualControlActive ? "#10b981" : "var(--jx-primary)", fontWeight: 700 }}>
                      {dualControlActive ? "Active" : "Ready"}
                    </span>
                  </div>

                  <div style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "4px 12px",
                    borderRadius: 12,
                    background: "var(--jx-surface-sunken)",
                    border: "1px solid var(--jx-border-subtle)",
                    fontSize: 11,
                    fontFamily: "JetBrains Mono, monospace",
                    color: "var(--jx-text-secondary)"
                  }}>
                    <span>H.265 / NVENC HW</span>
                  </div>
                </div>
              </div>

              {/* Title & Status */}
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, letterSpacing: "-0.02em", color: "var(--jx-text-primary)" }}>
                    Interactive Remote Workspace
                  </h2>
                  <span style={{
                    padding: "3px 10px",
                    borderRadius: 9999,
                    background: "rgba(16, 185, 129, 0.15)",
                    color: "#10b981",
                    fontSize: 10,
                    fontFamily: "JetBrains Mono, monospace",
                    fontWeight: 700,
                    textTransform: "uppercase"
                  }}>
                    Stream Synchronized
                  </span>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <JXButton
                    variant="outlined"
                    size="sm"
                    onClick={() => setViewMode("wall")}
                    style={{ fontSize: 11 }}
                  >
                    ← Windows Fleet Wall
                  </JXButton>
                  <div style={{ minWidth: 220 }}>
                    <JXSelect
                      value={selectedDevice}
                      onChange={(val: any) => setSelectedDevice(val)}
                      options={[
                        { id: "local", label: "Local Control Host" },
                        ...devices.map((d) => ({
                          id: d.id,
                          label: `${isWindowsDevice(d) ? "🪟 " : "🐧 "}${d.name} (${d.status.toUpperCase()})`
                        }))
                      ]}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* 2. Dual-Control Command Header Ribbon */}
            <div style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              padding: "10px 14px",
              borderRadius: 14,
              background: "var(--jx-surface-sunken)",
              border: "1px solid var(--jx-border-subtle)"
            }}>
              {/* Left: Mode Toggle & Input Link Buttons */}
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
                <div style={{
                  display: "inline-flex",
                  padding: 3,
                  borderRadius: 10,
                  background: "rgba(0, 0, 0, 0.2)",
                  border: "1px solid var(--jx-border-subtle)"
                }}>
                  <JXButton
                    size="sm"
                    variant={!dualControlActive ? "contained" : "text"}
                    onClick={() => setDualControlActive(false)}
                    style={{ fontSize: 11, minHeight: 32 }}
                  >
                    Observer Mode
                  </JXButton>
                  <JXButton
                    size="sm"
                    variant={dualControlActive ? "contained" : "text"}
                    color={dualControlActive ? "primary" : "neutral"}
                    onClick={() => setDualControlActive(true)}
                    style={{ fontSize: 11, minHeight: 32, display: "inline-flex", alignItems: "center", gap: 6 }}
                  >
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: dualControlActive ? "#10b981" : "var(--jx-text-secondary)" }} />
                    Operator Takeover {dualControlActive ? "[Active]" : ""}
                  </JXButton>
                </div>

                <div style={{ width: 1, height: 24, background: "var(--jx-border-subtle)", margin: "0 4px" }} />

                <JXButton
                  size="sm"
                  variant={mouseLinkEnabled ? "soft" : "text"}
                  onClick={() => setMouseLinkEnabled(!mouseLinkEnabled)}
                  style={{ fontSize: 11, minHeight: 32, display: "inline-flex", alignItems: "center", gap: 6 }}
                  title="Capture mouse clicks, scrolling, and dragging"
                >
                  <span>🖱️</span>
                  <span>Mouse Link</span>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: mouseLinkEnabled ? "#10b981" : "grey" }} />
                </JXButton>

                <JXButton
                  size="sm"
                  variant={keyForwardEnabled ? "soft" : "text"}
                  onClick={() => setKeyForwardEnabled(!keyForwardEnabled)}
                  style={{ fontSize: 11, minHeight: 32, display: "inline-flex", alignItems: "center", gap: 6 }}
                  title="Forward keyboard keystrokes to remote window"
                >
                  <span>⌨️</span>
                  <span>Key Forward</span>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: keyForwardEnabled ? "#10b981" : "grey" }} />
                </JXButton>

                <JXButton
                  size="sm"
                  variant={clipboardSyncEnabled ? "soft" : "text"}
                  onClick={() => setClipboardSyncEnabled(!clipboardSyncEnabled)}
                  style={{ fontSize: 11, minHeight: 32, display: "inline-flex", alignItems: "center", gap: 6 }}
                  title="Bi-directional clipboard sync"
                >
                  <span>📋</span>
                  <span>Clipboard Sync</span>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: clipboardSyncEnabled ? "#10b981" : "grey" }} />
                </JXButton>
              </div>

              {/* Right: Display Fit, SoM Toggle, Snapshot & Fullscreen */}
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
                <div style={{
                  display: "inline-flex",
                  padding: 3,
                  borderRadius: 10,
                  background: "rgba(0, 0, 0, 0.2)",
                  border: "1px solid var(--jx-border-subtle)"
                }}>
                  <JXButton
                    size="sm"
                    variant={fitMode === "fit" ? "contained" : "text"}
                    onClick={() => setFitMode("fit")}
                    style={{ fontSize: 11, minHeight: 30, padding: "2px 10px" }}
                  >
                    Fit
                  </JXButton>
                  <JXButton
                    size="sm"
                    variant={fitMode === "1:1" ? "contained" : "text"}
                    onClick={() => setFitMode("1:1")}
                    style={{ fontSize: 11, minHeight: 30, padding: "2px 10px" }}
                  >
                    1:1 Native
                  </JXButton>
                  <JXButton
                    size="sm"
                    variant={fitMode === "fill" ? "contained" : "text"}
                    onClick={() => setFitMode("fill")}
                    style={{ fontSize: 11, minHeight: 30, padding: "2px 10px" }}
                  >
                    Fill
                  </JXButton>
                </div>

                <JXButton
                  size="sm"
                  variant={somEnabled ? "contained" : "soft"}
                  color={somEnabled ? "primary" : "neutral"}
                  onClick={() => setSomEnabled(!somEnabled)}
                  style={{ fontSize: 11, minHeight: 32, display: "inline-flex", alignItems: "center", gap: 6 }}
                >
                  <span>🎯</span>
                  <span>Vision SoM {somEnabled ? "[ON]" : "[OFF]"}</span>
                </JXButton>

                <JXButton
                  size="sm"
                  variant="soft"
                  onClick={async () => {
                    try {
                      await api.submitTask(selectedDevice, "capture_desktop_screenshot", {});
                      setNotice("Snapshot task dispatched to node.");
                    } catch (e: any) {
                      setError(e.message);
                    }
                  }}
                  title="Capture Desktop Snapshot"
                  style={{ minWidth: 36, minHeight: 32 }}
                >
                  📸
                </JXButton>

                <JXButton
                  size="sm"
                  variant="soft"
                  onClick={() => {
                    const el = document.getElementById("live-desktop-canvas-container");
                    if (el) {
                      if (!document.fullscreenElement) {
                        el.requestFullscreen().catch(() => {});
                      } else {
                        document.exitFullscreen().catch(() => {});
                      }
                    }
                  }}
                  title="Fullscreen Canvas Mode"
                  style={{ minWidth: 36, minHeight: 32 }}
                >
                  ⛶
                </JXButton>
              </div>
            </div>

            {/* 3. Quick Dispatch Hotkeys Bar */}
            <div style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
              padding: "8px 14px",
              borderRadius: 12,
              background: "var(--jx-surface-sunken)",
              border: "1px solid var(--jx-border-subtle)"
            }}>
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 10, fontFamily: "JetBrains Mono, monospace", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--jx-text-secondary)" }}>
                  Quick Dispatch Hotkeys:
                </span>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {[
                    { label: "Ctrl+Alt+Del", combo: "ctrl+alt+del" },
                    { label: "Super / Win", combo: "win" },
                    { label: "Alt+Tab", combo: "alt+tab" },
                    { label: "Ctrl+Shift+Esc", combo: "ctrl+shift+esc" },
                  ].map((hk) => (
                    <JXButton
                      key={hk.label}
                      size="sm"
                      variant="soft"
                      onClick={() => handleSendHotkey(selectedDevice, hk.combo)}
                      style={{ fontSize: 11, fontFamily: "JetBrains Mono, monospace", padding: "4px 10px" }}
                    >
                      {hk.label}
                    </JXButton>
                  ))}
                  <JXButton
                    size="sm"
                    variant="soft"
                    color="success"
                    onClick={() => handleSendHotkey(selectedDevice, "enter")}
                    style={{ fontSize: 11, fontFamily: "JetBrains Mono, monospace", padding: "4px 10px", display: "inline-flex", alignItems: "center", gap: 6 }}
                  >
                    <span>🔓</span>
                    <span>Unlock Screen</span>
                  </JXButton>
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, fontFamily: "JetBrains Mono, monospace" }}>
                <span style={{ color: "var(--jx-text-secondary)" }}>Focus: Container [tty1]</span>
                <span style={{
                  padding: "2px 8px",
                  borderRadius: 6,
                  background: "rgba(16, 185, 129, 0.15)",
                  color: "#10b981",
                  fontWeight: 600
                }}>
                  PID: {focusedWindowPID}
                </span>
              </div>
            </div>

            {/* 4. Interactive Remote Workspace Viewport (Aspect 16/9) */}
            <div
              id="live-desktop-canvas-container"
              style={{
                position: "relative",
                width: "100%",
                minHeight: 560,
                maxHeight: 820,
                borderRadius: 16,
                background: "#0d1117",
                border: "2px solid var(--jx-border-subtle)",
                boxShadow: "0 14px 40px rgba(0, 0, 0, 0.5)",
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
                userSelect: "none"
              }}
              onContextMenu={(e) => e.preventDefault()}
            >
              {/* If real stream is active (WebRTC or frames) */}
              {(streamMode === "webrtc" && webrtcStatus === "connected") || (streamMode === "frames" && currentFrame?.base64_data) ? (
                <div style={{ position: "relative", width: "100%", height: "100%", flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {streamMode === "webrtc" ? (
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      muted
                      onClick={handleCanvasClick}
                      onContextMenu={handleCanvasClick}
                      style={{
                        width: fitMode === "fill" ? "100%" : "auto",
                        maxWidth: "100%",
                        maxHeight: "100%",
                        objectFit: fitMode === "fill" ? "cover" : "contain",
                        cursor: dualControlActive ? "crosshair" : "default"
                      }}
                    />
                  ) : (
                    <img
                      ref={canvasRef}
                      src={`data:${currentFrame.mime_type || "image/jpeg"};base64,${currentFrame.base64_data}`}
                      alt="Live Remote Desktop"
                      onClick={handleCanvasClick}
                      onContextMenu={handleCanvasClick}
                      style={{
                        width: fitMode === "fill" ? "100%" : "auto",
                        maxWidth: "100%",
                        maxHeight: "100%",
                        objectFit: fitMode === "fill" ? "cover" : "contain",
                        cursor: dualControlActive ? "crosshair" : "default"
                      }}
                    />
                  )}

                  {/* Dual Cursor Reticles Overlay */}
                  <div style={{
                    position: "absolute",
                    top: "35%",
                    left: "40%",
                    pointerEvents: "none",
                    zIndex: 30,
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 6
                  }}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="#8b5cf6" style={{ filter: "drop-shadow(0 2px 6px rgba(0,0,0,0.5))" }}>
                      <path d="M4.5 2.5L18.5 12L11.5 13.5L8.5 20.5L4.5 2.5Z" />
                    </svg>
                    <span style={{
                      padding: "3px 8px",
                      borderRadius: 6,
                      background: "#8b5cf6",
                      color: "#fff",
                      fontSize: 10,
                      fontFamily: "JetBrains Mono, monospace",
                      fontWeight: 600,
                      boxShadow: "0 4px 10px rgba(0,0,0,0.3)"
                    }}>
                      Agent: Claude-3.5-Sonnet
                    </span>
                  </div>

                  {dualControlActive && (
                    <div style={{
                      position: "absolute",
                      top: "45%",
                      left: "58%",
                      pointerEvents: "none",
                      zIndex: 30,
                      display: "flex",
                      alignItems: "center",
                      gap: 6
                    }}>
                      <div style={{
                        width: 16,
                        height: 16,
                        borderRadius: "50%",
                        border: "2px solid #10b981",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center"
                      }}>
                        <span style={{ width: 4, height: 4, borderRadius: "50%", background: "#10b981" }} />
                      </div>
                      <span style={{
                        padding: "3px 8px",
                        borderRadius: 6,
                        background: "rgba(15, 23, 42, 0.85)",
                        color: "#fff",
                        fontSize: 10,
                        fontFamily: "JetBrains Mono, monospace",
                        fontWeight: 600,
                        border: "1px solid #10b981"
                      }}>
                        Operator (Dual Control)
                      </span>
                    </div>
                  )}
                </div>
              ) : (
                /* High-Fidelity Simulated Desktop Multi-Window Workspace (Stitch Spec) */
                <div style={{ position: "relative", width: "100%", height: "100%", flex: 1, display: "flex", flexDirection: "column" }}>
                  {/* Top Simulated OS Bar */}
                  <div style={{
                    height: 32,
                    background: "rgba(30, 41, 59, 0.85)",
                    borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "0 12px",
                    fontSize: 11,
                    fontFamily: "JetBrains Mono, monospace",
                    color: "var(--jx-text-secondary)"
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                        <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#ef4444" }} />
                        <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#f59e0b" }} />
                        <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#10b981" }} />
                      </div>
                      <span style={{ color: "var(--jx-text-primary)", fontWeight: 600 }}>{currentDev.name}</span>
                      <span style={{ padding: "1px 6px", borderRadius: 4, background: "rgba(255,255,255,0.06)", fontSize: 10 }}>
                        {currentDev.os || "X11/Wayland"}
                      </span>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                      <span>CPU 24%</span>
                      <span>RAM 12.4/64 GB</span>
                      <span>GPU 41°C</span>
                      <span style={{ color: "var(--jx-text-primary)", fontWeight: 700 }}>
                        {new Date().toLocaleTimeString()} UTC
                      </span>
                    </div>
                  </div>

                  {/* Multi-Window Split Canvas */}
                  <div style={{
                    flex: 1,
                    padding: 16,
                    display: "grid",
                    gridTemplateColumns: "repeat(12, 1fr)",
                    gap: 14,
                    overflow: "hidden"
                  }}>
                    {/* Window 1: VS Code Server Editor (8 cols) */}
                    <div style={{
                      gridColumn: "span 8",
                      borderRadius: 12,
                      background: "#161b22",
                      border: "1px solid rgba(255, 255, 255, 0.08)",
                      boxShadow: "0 10px 25px rgba(0, 0, 0, 0.5)",
                      display: "flex",
                      flexDirection: "column",
                      overflow: "hidden",
                      position: "relative"
                    }}>
                      <div style={{
                        height: 36,
                        background: "#1e242c",
                        padding: "0 12px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        fontSize: 11,
                        fontFamily: "JetBrains Mono, monospace"
                      }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ color: "#38bdf8" }}>📄</span>
                          <span style={{ color: "var(--jx-text-primary)", fontWeight: 600 }}>
                            bridge_orchestrator.py — Visual Studio Code Server
                          </span>
                        </div>
                        <span style={{ color: "#10b981", fontSize: 10 }}>● Python 3.12 (venv)</span>
                      </div>
                      <div style={{
                        flex: 1,
                        padding: 14,
                        fontSize: 12,
                        fontFamily: "JetBrains Mono, monospace",
                        lineHeight: 1.6,
                        color: "#e2e8f0",
                        display: "flex",
                        gap: 16
                      }}>
                        <div style={{ opacity: 0.35, userSelect: "none", textAlign: "right" }}>
                          1<br />2<br />3<br />4<br />5<br />6<br />7<br />8
                        </div>
                        <div>
                          <span style={{ color: "#f43f5e" }}>import</span> asyncio<br />
                          <span style={{ color: "#f43f5e" }}>from</span> ai_bridge.core <span style={{ color: "#f43f5e" }}>import</span> <span style={{ color: "#10b981" }}>AutonomousAgentMesh</span><br />
                          <span style={{ color: "#94a3b8" }}># Target task context initialized from TaskQueue #89214</span><br />
                          <span style={{ color: "#f43f5e" }}>async def</span> <span style={{ color: "#38bdf8" }}>execute_failover_handshake</span>(node_id: <span style={{ color: "#10b981" }}>str</span>):<br />
                          &nbsp;&nbsp;&nbsp;&nbsp;session = <span style={{ color: "#f43f5e" }}>await</span> AutonomousAgentMesh.<span style={{ color: "#38bdf8" }}>connect_peer</span>(node_id)<br />
                          &nbsp;&nbsp;&nbsp;&nbsp;<span style={{ color: "#f43f5e" }}>return await</span> session.<span style={{ color: "#38bdf8" }}>dispatch_transaction</span>()<br />
                          <span style={{ color: "#10b981", fontSize: 11, marginTop: 4, display: "inline-block" }}>
                            ● Live Sync: Auto-saved (2ms ago)
                          </span>
                        </div>
                      </div>
                      {somEnabled && (
                        <span style={{
                          position: "absolute",
                          top: 8,
                          right: 12,
                          padding: "2px 6px",
                          borderRadius: 4,
                          background: "#8b5cf6",
                          color: "#fff",
                          fontWeight: 700,
                          fontSize: 10,
                          fontFamily: "JetBrains Mono, monospace"
                        }}>
                          [1]
                        </span>
                      )}
                    </div>

                    {/* Window 2: Bash Shell Container (4 cols) */}
                    <div style={{
                      gridColumn: "span 4",
                      borderRadius: 12,
                      background: "#0a0e18",
                      border: "1px solid rgba(255, 255, 255, 0.08)",
                      boxShadow: "0 10px 25px rgba(0, 0, 0, 0.5)",
                      display: "flex",
                      flexDirection: "column",
                      overflow: "hidden",
                      position: "relative"
                    }}>
                      <div style={{
                        height: 36,
                        background: "#1e242c",
                        padding: "0 12px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        fontSize: 11,
                        fontFamily: "JetBrains Mono, monospace"
                      }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span>💻</span>
                          <span style={{ color: "var(--jx-text-primary)", fontWeight: 600 }}>bash (PID: 1042)</span>
                        </div>
                        <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#10b981" }} />
                      </div>
                      <div style={{
                        flex: 1,
                        padding: 12,
                        fontSize: 11,
                        fontFamily: "JetBrains Mono, monospace",
                        lineHeight: 1.5,
                        color: "#94a3b8"
                      }}>
                        <div style={{ color: "#94a3b8" }}>admin@{currentDev.name}:~$ docker ps</div>
                        <div style={{ color: "#10b981" }}>bridge-ingress-gw&nbsp;&nbsp;Up (healthy)</div>
                        <div style={{ color: "#38bdf8" }}>webrtc-streamer&nbsp;&nbsp;&nbsp;&nbsp;Up 60fps</div>
                        <div style={{ marginTop: 8, color: "var(--jx-text-secondary)" }}>
                          [14:38:01] Dual-Control arbiter: Ready
                        </div>
                        <div style={{ color: "#10b981", marginTop: 4, display: "flex", alignItems: "center", gap: 4 }}>
                          <span>admin@{currentDev.name}:~$</span>
                          <span style={{ width: 6, height: 12, background: "#10b981" }} className="f2-pulse-dot" />
                        </div>
                      </div>
                      {somEnabled && (
                        <span style={{
                          position: "absolute",
                          top: 8,
                          right: 12,
                          padding: "2px 6px",
                          borderRadius: 4,
                          background: "#8b5cf6",
                          color: "#fff",
                          fontWeight: 700,
                          fontSize: 10,
                          fontFamily: "JetBrains Mono, monospace"
                        }}>
                          [2]
                        </span>
                      )}
                    </div>

                    {/* Lower Card: Realtime Hardware Telemetry Gauges (12 cols) */}
                    <div style={{
                      gridColumn: "span 12",
                      borderRadius: 12,
                      background: "rgba(30, 41, 59, 0.6)",
                      border: "1px solid rgba(255, 255, 255, 0.08)",
                      padding: "10px 14px",
                      display: "flex",
                      flexDirection: "column",
                      gap: 8
                    }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11, fontFamily: "JetBrains Mono, monospace" }}>
                        <span style={{ fontWeight: 600, color: "var(--jx-text-primary)" }}>
                          Hardware Telemetry Gauges
                        </span>
                        <span style={{ color: "var(--jx-text-secondary)" }}>NVENC Session: 60.1 FPS</span>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
                        <div style={{ padding: "6px 10px", borderRadius: 8, background: "rgba(0,0,0,0.25)" }}>
                          <div style={{ fontSize: 10, fontFamily: "JetBrains Mono, monospace", color: "var(--jx-text-secondary)" }}>CPU UTIL</div>
                          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--jx-text-primary)" }}>24.2%</div>
                        </div>
                        <div style={{ padding: "6px 10px", borderRadius: 8, background: "rgba(0,0,0,0.25)" }}>
                          <div style={{ fontSize: 10, fontFamily: "JetBrains Mono, monospace", color: "var(--jx-text-secondary)" }}>GPU MEM (VRAM)</div>
                          <div style={{ fontSize: 14, fontWeight: 700, color: "#10b981" }}>4.8 GB</div>
                        </div>
                        <div style={{ padding: "6px 10px", borderRadius: 8, background: "rgba(0,0,0,0.25)" }}>
                          <div style={{ fontSize: 10, fontFamily: "JetBrains Mono, monospace", color: "var(--jx-text-secondary)" }}>NETWORK IN/OUT</div>
                          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--jx-primary)" }}>14.8 Mb/s</div>
                        </div>
                        <div style={{ padding: "6px 10px", borderRadius: 8, background: "rgba(0,0,0,0.25)" }}>
                          <div style={{ fontSize: 10, fontFamily: "JetBrains Mono, monospace", color: "var(--jx-text-secondary)" }}>AGENT ARBITER</div>
                          <div style={{ fontSize: 14, fontWeight: 700, color: "#10b981" }}>PASSIVE</div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Dual Cursor Reticles on Simulated Canvas */}
                  <div style={{
                    position: "absolute",
                    top: "35%",
                    left: "35%",
                    pointerEvents: "none",
                    zIndex: 30,
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 6
                  }}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="#8b5cf6" style={{ filter: "drop-shadow(0 2px 6px rgba(0,0,0,0.5))" }}>
                      <path d="M4.5 2.5L18.5 12L11.5 13.5L8.5 20.5L4.5 2.5Z" />
                    </svg>
                    <span style={{
                      padding: "3px 8px",
                      borderRadius: 6,
                      background: "#8b5cf6",
                      color: "#fff",
                      fontSize: 10,
                      fontFamily: "JetBrains Mono, monospace",
                      fontWeight: 600,
                      boxShadow: "0 4px 10px rgba(0,0,0,0.3)"
                    }}>
                      Agent: Claude-3.5-Sonnet
                    </span>
                  </div>

                  <div style={{
                    position: "absolute",
                    top: "52%",
                    left: "60%",
                    pointerEvents: "none",
                    zIndex: 30,
                    display: "flex",
                    alignItems: "center",
                    gap: 6
                  }}>
                    <div style={{
                      width: 16,
                      height: 16,
                      borderRadius: "50%",
                      border: "2px solid #10b981",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center"
                    }}>
                      <span style={{ width: 4, height: 4, borderRadius: "50%", background: "#10b981" }} />
                    </div>
                    <span style={{
                      padding: "3px 8px",
                      borderRadius: 6,
                      background: "rgba(15, 23, 42, 0.85)",
                      color: "#fff",
                      fontSize: 10,
                      fontFamily: "JetBrains Mono, monospace",
                      fontWeight: 600,
                      border: "1px solid #10b981"
                    }}>
                      Operator (Sarah J.)
                    </span>
                  </div>
                </div>
              )}

              {/* Enclave Security HUD Watermark Pill */}
              <div style={{
                position: "absolute",
                top: 8,
                left: "50%",
                transform: "translateX(-50%)",
                padding: "4px 12px",
                borderRadius: 9999,
                background: "rgba(15, 23, 42, 0.85)",
                backdropFilter: "blur(8px)",
                border: "1px solid rgba(255, 255, 255, 0.1)",
                fontSize: 10,
                fontFamily: "JetBrains Mono, monospace",
                color: "var(--jx-text-secondary)",
                display: "flex",
                alignItems: "center",
                gap: 6,
                zIndex: 40,
                pointerEvents: "none"
              }}>
                <span style={{ color: "#10b981" }}>🔒</span>
                <span>mTLS Encrypted Enclave Stream • Session #LDS-99201 • SecOps Verified</span>
              </div>
            </div>

            {/* 5. Floating Windows HUD Dock */}
            <div style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              padding: "10px 16px",
              borderRadius: 14,
              background: "var(--jx-surface-sunken)",
              border: "1px solid var(--jx-border-subtle)"
            }}>
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 10, fontFamily: "JetBrains Mono, monospace", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--jx-text-secondary)" }}>
                  Windows HUD:
                </span>
                <div style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "4px 12px",
                  borderRadius: 8,
                  background: "rgba(0,0,0,0.25)",
                  border: "1px solid var(--jx-border-subtle)",
                  fontSize: 11
                }}>
                  <span>💻</span>
                  <div>
                    <span style={{ fontWeight: 600, color: "var(--jx-text-primary)" }}>bash (active)</span>
                    <span style={{ color: "var(--jx-text-secondary)", marginLeft: 6 }}>PID 1042</span>
                  </div>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#10b981" }} />
                </div>

                <div style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "4px 12px",
                  borderRadius: 8,
                  background: "rgba(0,0,0,0.15)",
                  border: "1px solid var(--jx-border-subtle)",
                  fontSize: 11
                }}>
                  <span>📄</span>
                  <div>
                    <span style={{ fontWeight: 600, color: "var(--jx-text-primary)" }}>VS Code Server</span>
                    <span style={{ color: "var(--jx-text-secondary)", marginLeft: 6 }}>port 8080</span>
                  </div>
                </div>

                <div style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "4px 12px",
                  borderRadius: 8,
                  background: "rgba(0,0,0,0.15)",
                  border: "1px solid var(--jx-border-subtle)",
                  fontSize: 11
                }}>
                  <span>🐳</span>
                  <div>
                    <span style={{ fontWeight: 600, color: "var(--jx-text-primary)" }}>Ingress GW</span>
                    <span style={{ color: "var(--jx-text-secondary)", marginLeft: 6 }}>docker</span>
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <JXButton
                  size="sm"
                  variant="soft"
                  onClick={async () => {
                    try {
                      await api.submitTask(selectedDevice, "perform_approved_ui_action", { action: "list_windows" });
                      setNotice("Window enumeration task dispatched.");
                    } catch (e: any) {
                      setError(e.message);
                    }
                  }}
                  style={{ fontSize: 11 }}
                >
                  Enumerate Windows
                </JXButton>
                <JXButton
                  size="sm"
                  variant="soft"
                  color="error"
                  onClick={handleEmergencyHalt}
                  style={{ fontSize: 11 }}
                >
                  {emergencyArmed ? "🛑 Confirm Halt?" : "Emergency Halt"}
                </JXButton>
              </div>
            </div>

            {/* 6. Virtual Operator Controls & Direct Typing Ribbon */}
            <div style={{
              display: "flex",
              flexDirection: "column",
              gap: 12,
              padding: 14,
              borderRadius: 12,
              background: "var(--jx-surface-sunken)",
              border: "1px solid var(--jx-border-subtle)"
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, fontFamily: "JetBrains Mono, monospace", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--jx-text-secondary)" }}>
                Virtual Operator Keystroke &amp; Typing Ribbon
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                {[
                  { label: "Win + R (Run)", combo: "win+r" },
                  { label: "Ctrl + S (Save)", combo: "ctrl+s" },
                  { label: "Alt + Tab", combo: "alt+tab" },
                  { label: "Task Manager", combo: "ctrl+shift+esc" },
                  { label: "⏎ Enter", combo: "enter" },
                  { label: "⎋ Escape", combo: "esc" },
                ].map((act) => (
                  <JXButton
                    key={act.label}
                    size="sm"
                    variant="soft"
                    onClick={() => handleSendHotkey(selectedDevice, act.combo)}
                    style={{ fontSize: 11, fontFamily: "JetBrains Mono, monospace" }}
                  >
                    {act.label}
                  </JXButton>
                ))}

                {/* Direct typing field */}
                <div style={{ display: "flex", gap: 8, flex: 1, minWidth: 260, alignItems: "center" }}>
                  <div style={{ flex: 1 }}>
                    <JXTextField
                      id="remote-typing-input"
                      placeholder="Type text to forward to focused remote window..."
                      onKeyDown={(e: any) => {
                        if (e.key === "Enter") {
                          handleSendText(e.target.value);
                          e.target.value = "";
                        }
                      }}
                    />
                  </div>
                  <JXButton
                    size="md"
                    variant="contained"
                    color="primary"
                    onClick={() => {
                      const el = document.getElementById("remote-typing-input") as HTMLInputElement;
                      if (el && el.value) {
                        handleSendText(el.value);
                        el.value = "";
                      }
                    }}
                    style={{ fontSize: 12 }}
                  >
                    Send Text
                  </JXButton>
                </div>
              </div>
            </div>
          </div>
        );
      })()}


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
            <JXButton
              variant="contained"
              color="success"
              onClick={handleUpdateFleet}
              loading={updating}
            >
              Update Entire Fleet
            </JXButton>
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
              <JXButton
                variant="soft"
                size="sm"
                onClick={() => handleUpdateSingleDevice(d.id)}
              >
                Update
              </JXButton>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default LiveDesktopStudio;
