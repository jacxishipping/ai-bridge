/**
 * AI Bridge Enterprise Dashboard — Live Desktop Studio & Dual-Control (Screen 5)
 * Low-latency WebRTC desktop stream canvas with dual cursor HUD, operator takeover bar,
 * hotkey macros, telemetry HUD, and open windows manager.
 * Strict JXUI Primitives & Lucide Icons. ZERO inline styles.
 */

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  JXBox,
  JXStack,
  JXGrid,
  JXGridItem,
  JXCard,
  JXCardHeader,
  JXCardContent,
  JXBadge,
  JXButton,
} from "../ui";
import {
  Monitor,
  Mouse,
  Keyboard,
  ClipboardCopy,
  Maximize2,
  Minimize2,
  Camera,
  Crosshair,
  Shield,
  Activity,
  AlertTriangle,
  Radio,
  CheckCircle2,
  Terminal,
  Code,
  Layers,
  Cpu,
  Lock,
  Unlock,
  RefreshCw,
  Power,
  Zap,
} from "lucide-react";
import { useDashboardStore } from "../state/dashboardStore";
import { api, token, sessionToken } from "../api";

function isLiveMode(): boolean {
  return typeof window !== "undefined" && Boolean(token() || sessionToken());
}

interface MonitorInfo {
  index: number;
  name: string;
  width: number;
  height: number;
  is_primary?: boolean;
}

interface WindowItem {
  id: string;
  name: string;
  desc: string;
  icon: "terminal" | "code" | "docker" | "monitor";
  active: boolean;
  pid: number;
}

const INITIAL_WINDOWS: WindowItem[] = [
  { id: "win-1", name: "bash (active)", desc: "PID 1042", icon: "terminal", active: true, pid: 1042 },
  { id: "win-2", name: "VS Code Server", desc: "port 8080", icon: "code", active: false, pid: 2184 },
  { id: "win-3", name: "Docker Engine", desc: "3 containers", icon: "docker", active: false, pid: 1892 },
  { id: "win-4", name: "System Monitor", desc: "24% CPU", icon: "monitor", active: false, pid: 3410 },
];

export const LiveDesktopView: React.FC = () => {
  const devices = useDashboardStore((s) => s.devices);
  const selectedDeviceId = useDashboardStore((s) => s.selectedDeviceId);
  const selectedDevice = devices.find((d) => d.id === selectedDeviceId) || devices[0];

  // Control modes (maps to canonical session modes: view_only, human_control, ai_assisted)
  const [controlMode, setControlMode] = useState<"observer" | "takeover">("takeover");
  const [sessionMode, setSessionMode] = useState<"view_only" | "human_control" | "ai_assisted">("human_control");
  const [mouseLinked, setMouseLinked] = useState<boolean>(true);
  const [keyForwarded, setKeyForwarded] = useState<boolean>(true);
  const [clipboardSync, setClipboardSync] = useState<boolean>(true);
  const [scalingMode, setScalingMode] = useState<"fit" | "native" | "fill">("fit");
  const [somOverlay, setSomOverlay] = useState<boolean>(true);

  // Operator cursor coordinates
  const [operatorCoords, setOperatorCoords] = useState<{ x: number; y: number }>({ x: 610, y: 220 });
  const [recentMacroNotice, setRecentMacroNotice] = useState<string | null>(null);
  const [windowsList, setWindowsList] = useState<WindowItem[]>(INITIAL_WINDOWS);
  const [activeWindowId, setActiveWindowId] = useState<string>("win-1");
  const [snapshotTaken, setSnapshotTaken] = useState<boolean>(false);

  // Live desktop stream, WebRTC & monitor state
  const [liveFrameUrl, setLiveFrameUrl] = useState<string | null>(null);
  const [liveFrameMeta, setLiveFrameMeta] = useState<{
    width?: number;
    height?: number;
    timestamp?: number;
    error?: string;
    note?: string;
  } | null>(null);
  const [liveMonitors, setLiveMonitors] = useState<MonitorInfo[]>([]);
  const [selectedMonitorIndex, setSelectedMonitorIndex] = useState<number>(0);
  const [isStreamActive, setIsStreamActive] = useState<boolean>(true);
  const [webrtcSessionId, setWebrtcSessionId] = useState<string | null>(null);
  const [webrtcConnected, setWebrtcConnected] = useState<boolean>(false);
  const [webrtcStats, setWebrtcStats] = useState<{
    fps: number;
    bitrateMbps: number;
    rttMs: number;
    droppedFrames: number;
    state: string;
  }>({
    fps: 30,
    bitrateMbps: 4.5,
    rttMs: 12,
    droppedFrames: 0,
    state: "idle",
  });

  const BITRATE_LADDER_KBPS = [5000, 3500, 2200, 1200, 600];
  const [abrMode, setAbrMode] = useState<"auto" | "5000" | "3500" | "2200" | "1200" | "600">("auto");
  const [targetBitrateKbps, setTargetBitrateKbps] = useState<number>(4500);
  const [pointerLockActive, setPointerLockActive] = useState<boolean>(false);
  const [isReconnecting, setIsReconnecting] = useState<boolean>(false);

  const canvasContainerRef = useRef<HTMLDivElement | null>(null);
  const isMouseDownRef = useRef<boolean>(false);
  const virtualCursorRef = useRef<{ normX: number; normY: number }>({ normX: 0.5, normY: 0.5 });
  const consecutiveBadRef = useRef<number>(0);
  const consecutiveGoodRef = useRef<number>(0);
  const currentBitrateRef = useRef<number>(4500);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const inputDcRef = useRef<RTCDataChannel | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const prevBytesRef = useRef<{ bytes: number; ts: number }>({ bytes: 0, ts: 0 });
  const inputSeqRef = useRef<number>(1);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const webrtcConnectedRef = useRef<boolean>(false);
  const lastCoordUpdateRef = useRef<number>(0);
  const cleanupWebrtcRef = useRef<() => void>(() => {});

  webrtcConnectedRef.current = webrtcConnected;

  // Synchronize active WebRTC media stream onto video element across all state updates and renders
  useEffect(() => {
    const video = videoRef.current;
    if (video && mediaStreamRef.current) {
      if (video.srcObject !== mediaStreamRef.current) {
        video.srcObject = mediaStreamRef.current;
      }
      if (video.paused && webrtcConnected) {
        video.play().catch(() => {});
      }
    }
  });

  const sendDataChannelEvent = useCallback((payload: Record<string, unknown>) => {
    const dc = inputDcRef.current;
    if (dc && dc.readyState === "open") {
      try {
        dc.send(
          JSON.stringify({
            ...payload,
            sequence: inputSeqRef.current++,
            timestamp_ms: Date.now(),
          })
        );
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }, []);

  const releaseAllRemoteKeys = useCallback(() => {
    sendDataChannelEvent({ type: "release_all_keys" });
  }, [sendDataChannelEvent]);

  // Adaptive Bitrate dispatcher
  const applyBitrate = useCallback(
    (kbps: number, isAutoAdjust = false) => {
      currentBitrateRef.current = kbps;
      setTargetBitrateKbps(kbps);
      sendDataChannelEvent({
        action: "network_quality",
        bitrate_kbps: kbps,
      });
      if (webrtcSessionId && isLiveMode()) {
        void api.updateSessionQualityV1(webrtcSessionId, { bitrate_kbps: kbps }).catch(() => {});
      }
      if (isAutoAdjust) {
        setRecentMacroNotice(`Adaptive Bitrate adjusted target: ${(kbps / 1000).toFixed(1)} Mbps`);
        setTimeout(() => setRecentMacroNotice(null), 2500);
      }
    },
    [sendDataChannelEvent, webrtcSessionId]
  );

  // Monitor browser pointer lock state
  useEffect(() => {
    const handleLockChange = () => {
      const isLocked = document.pointerLockElement === canvasContainerRef.current;
      setPointerLockActive(isLocked);
    };
    document.addEventListener("pointerlockchange", handleLockChange);
    return () => document.removeEventListener("pointerlockchange", handleLockChange);
  }, []);

  // Global mouse handlers for continuous drag and pointer lock motion
  useEffect(() => {
    const handleGlobalMouseUp = (e: MouseEvent) => {
      if (isMouseDownRef.current) {
        isMouseDownRef.current = false;
        if (controlMode === "takeover" && mouseLinked) {
          sendDataChannelEvent({
            type: "mouse_button",
            action: "up",
            button: e.button === 2 ? "right" : e.button === 1 ? "middle" : "left",
            normalized: true,
            x: virtualCursorRef.current.normX,
            y: virtualCursorRef.current.normY,
          });
        }
      }
    };

    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (document.pointerLockElement && document.pointerLockElement === canvasContainerRef.current) {
        const sens = 0.0006;
        let nx = virtualCursorRef.current.normX + e.movementX * sens;
        let ny = virtualCursorRef.current.normY + e.movementY * sens;
        nx = Math.max(0, Math.min(1, nx));
        ny = Math.max(0, Math.min(1, ny));
        virtualCursorRef.current = { normX: nx, normY: ny };

        const x = Math.round(nx * 2560);
        const y = Math.round(ny * 1440);
        const now = performance.now();
        if (now - lastCoordUpdateRef.current > 66) {
          lastCoordUpdateRef.current = now;
          setOperatorCoords({ x, y });
        }

        if (controlMode === "takeover" && mouseLinked) {
          sendDataChannelEvent({
            type: "mouse_move",
            x: nx,
            y: ny,
            normalized: true,
            monitor_index: selectedMonitorIndex,
          });
        }
      }
    };

    window.addEventListener("mouseup", handleGlobalMouseUp);
    window.addEventListener("mousemove", handleGlobalMouseMove);
    return () => {
      window.removeEventListener("mouseup", handleGlobalMouseUp);
      window.removeEventListener("mousemove", handleGlobalMouseMove);
    };
  }, [controlMode, mouseLinked, sendDataChannelEvent, selectedMonitorIndex]);

  // Automatically release held keys on window blur or visibility loss
  useEffect(() => {
    const onBlur = () => releaseAllRemoteKeys();
    window.addEventListener("blur", onBlur);
    return () => window.removeEventListener("blur", onBlur);
  }, [releaseAllRemoteKeys]);

  // Switch session mode (View Only, Human Control, AI-Assisted Control)
  const applySessionMode = useCallback(
    async (mode: "view_only" | "human_control" | "ai_assisted") => {
      setSessionMode(mode);
      setControlMode(mode === "view_only" ? "observer" : "takeover");
      if (mode === "view_only") {
        releaseAllRemoteKeys();
      }
      if (isLiveMode() && webrtcSessionId) {
        try {
          await api.setSessionModeV1(
            webrtcSessionId,
            mode,
            mode === "human_control"
          );
        } catch {
          // Ignore mode update network errors when session is local
        }
      }
    },
    [webrtcSessionId, releaseAllRemoteKeys]
  );

  const fetchLiveFrame = useCallback(
    async (scale = 0.75, quality = 70) => {
      if (!isLiveMode() || !selectedDevice?.id || webrtcConnectedRef.current) return;
      try {
        const res = await api.desktopFrame(selectedDevice.id, scale, quality);
        if (webrtcConnectedRef.current) return;
        if (res && typeof res === "object" && res.base64_data) {
          const fmt = String(res.format || "jpeg").toLowerCase();
          setLiveFrameUrl(`data:image/${fmt};base64,${res.base64_data}`);
          setLiveFrameMeta({
            width: Number(res.width || 1920),
            height: Number(res.height || 1080),
            timestamp: Number(res.timestamp || Date.now() / 1000),
          });
        } else {
          setLiveFrameMeta({
            error: String(res?.error || ""),
            note: String(res?.note || "Desktop session not currently active or headless node."),
          });
        }
      } catch (err: any) {
        if (webrtcConnectedRef.current) return;
        setLiveFrameMeta({
          error: err?.message || "Unable to fetch desktop frame",
          note: "Check that the target device is online and desktop capture is enabled.",
        });
      }
    },
    [selectedDevice?.id]
  );

  // Load device monitors & poll desktop frames in live mode
  useEffect(() => {
    if (!isLiveMode() || !selectedDevice?.id) return;

    let cancelled = false;
    api
      .deviceMonitors(selectedDevice.id)
      .then((res) => {
        if (!cancelled && Array.isArray(res?.monitors)) {
          setLiveMonitors(res.monitors);
        }
      })
      .catch(() => {});

    if (selectedDevice.status === "online" || selectedDevice.id === "local") {
      if (!webrtcConnected) {
        void fetchLiveFrame(0.75, 70);
      }
    } else {
      setLiveFrameUrl(null);
      setLiveFrameMeta({
        note: `Device ${selectedDevice.hostname || selectedDevice.id} is currently ${selectedDevice.status}.`,
      });
    }

    if (!isStreamActive || (selectedDevice.status !== "online" && selectedDevice.id !== "local")) {
      return () => {
        cancelled = true;
      };
    }

    const timer = setInterval(() => {
      if (!cancelled && isLiveMode() && !webrtcConnectedRef.current) {
        void fetchLiveFrame(0.75, 70);
      }
    }, 3000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [selectedDevice?.id, selectedDevice?.status, selectedDevice?.hostname, isStreamActive, webrtcConnected, fetchLiveFrame]);

  // Mouse move handler over canvas (when not pointer-locked)
  const handleCanvasMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (document.pointerLockElement === canvasContainerRef.current) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const normX = Math.max(0, Math.min(1, (e.clientX - rect.left) / Math.max(1, rect.width)));
      const normY = Math.max(0, Math.min(1, (e.clientY - rect.top) / Math.max(1, rect.height)));
      virtualCursorRef.current = { normX, normY };
      const x = Math.round(normX * 2560);
      const y = Math.round(normY * 1440);

      // Throttle HUD coordinate text re-renders to ~15 FPS to avoid 60-120 full React re-renders per second
      const now = performance.now();
      if (now - lastCoordUpdateRef.current > 66) {
        lastCoordUpdateRef.current = now;
        setOperatorCoords({ x, y });
      }

      if (controlMode === "takeover" && mouseLinked) {
        sendDataChannelEvent({
          type: "mouse_move",
          x: normX,
          y: normY,
          normalized: true,
          monitor_index: selectedMonitorIndex,
        });
      }
    },
    [controlMode, mouseLinked, sendDataChannelEvent, selectedMonitorIndex]
  );

  const handleCanvasMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!isLiveMode() || controlMode !== "takeover" || !mouseLinked) return;
      isMouseDownRef.current = true;
      const rect = e.currentTarget.getBoundingClientRect();
      const normX = Math.max(0, Math.min(1, (e.clientX - rect.left) / Math.max(1, rect.width)));
      const normY = Math.max(0, Math.min(1, (e.clientY - rect.top) / Math.max(1, rect.height)));
      virtualCursorRef.current = { normX, normY };

      sendDataChannelEvent({
        type: "mouse_button",
        action: "down",
        button: e.button === 2 ? "right" : e.button === 1 ? "middle" : "left",
        x: normX,
        y: normY,
        normalized: true,
      });
    },
    [controlMode, mouseLinked, sendDataChannelEvent]
  );

  const handleCanvasMouseUp = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!isLiveMode() || controlMode !== "takeover" || !mouseLinked) return;
      isMouseDownRef.current = false;
      const rect = e.currentTarget.getBoundingClientRect();
      const normX = Math.max(0, Math.min(1, (e.clientX - rect.left) / Math.max(1, rect.width)));
      const normY = Math.max(0, Math.min(1, (e.clientY - rect.top) / Math.max(1, rect.height)));
      virtualCursorRef.current = { normX, normY };

      sendDataChannelEvent({
        type: "mouse_button",
        action: "up",
        button: e.button === 2 ? "right" : e.button === 1 ? "middle" : "left",
        x: normX,
        y: normY,
        normalized: true,
      });
    },
    [controlMode, mouseLinked, sendDataChannelEvent]
  );

  const togglePointerLock = useCallback(() => {
    if (document.pointerLockElement) {
      document.exitPointerLock();
    } else if (canvasContainerRef.current) {
      canvasContainerRef.current.requestPointerLock();
    }
  }, []);

  // Forward canvas click in takeover mode when logged in
  const handleCanvasClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!isLiveMode() || controlMode !== "takeover" || !mouseLinked || !selectedDevice?.id) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const normX = Math.max(0, Math.min(1, (e.clientX - rect.left) / Math.max(1, rect.width)));
      const normY = Math.max(0, Math.min(1, (e.clientY - rect.top) / Math.max(1, rect.height)));
      if (
        sendDataChannelEvent({
          type: "mouse_button",
          action: "click",
          button: "left",
          x: normX,
          y: normY,
          normalized: true,
        })
      ) {
        return;
      }
      // Only fallback to HTTP input if WebRTC data channel is completely disconnected
      if (!webrtcConnectedRef.current) {
        void api
          .sendDesktopInput(selectedDevice.id, {
            action: "click",
            x: normX,
            y: normY,
            normalized: true,
            button: "left",
            clicks: 1,
            screen_width: liveFrameMeta?.width || 1920,
            screen_height: liveFrameMeta?.height || 1080,
          })
          .catch(() => {});
      }
    },
    [controlMode, mouseLinked, selectedDevice?.id, liveFrameMeta?.width, liveFrameMeta?.height, sendDataChannelEvent]
  );

  // Forward keyboard events in takeover mode when logged in
  const handleCanvasKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (!isLiveMode() || controlMode !== "takeover" || !keyForwarded || !selectedDevice?.id) return;
      if (
        sendDataChannelEvent({
          type: "key_event",
          action: "down",
          key: e.key,
          code: e.code,
          modifiers: {
            ctrl: e.ctrlKey,
            shift: e.shiftKey,
            alt: e.altKey,
            meta: e.metaKey,
          },
        })
      ) {
        return;
      }
      if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
        void api
          .sendDesktopInput(selectedDevice.id, {
            action: "type",
            text: e.key,
          })
          .catch(() => {});
      } else {
        void api
          .sendDesktopInput(selectedDevice.id, {
            action: "press",
            key: e.key.toLowerCase(),
          })
          .catch(() => {});
      }
    },
    [controlMode, keyForwarded, selectedDevice?.id, sendDataChannelEvent]
  );

  const handleCanvasKeyUp = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (!isLiveMode() || controlMode !== "takeover" || !keyForwarded) return;
      sendDataChannelEvent({
        type: "key_event",
        action: "up",
        key: e.key,
        code: e.code,
      });
    },
    [controlMode, keyForwarded, sendDataChannelEvent]
  );

  const dispatchMacro = (macroName: string) => {
    setRecentMacroNotice(`Dispatched macro [${macroName}] to target node ${selectedDevice?.hostname || "srv-us-east-412"}`);
    setTimeout(() => setRecentMacroNotice(null), 3000);

    if (isLiveMode() && selectedDevice?.id) {
      const macroKeyMap: Record<string, string> = {
        "Ctrl+Alt+Del": "ctrl+alt+delete",
        "Win / Super": "win",
        "Alt+Tab": "alt+tab",
        "Ctrl+Shift+Esc": "ctrl+shift+esc",
        "Unlock Screen": "enter",
      };
      const combo = macroKeyMap[macroName] || macroName.toLowerCase();
      void api
        .sendDesktopInput(selectedDevice.id, {
          action: "hotkey",
          key: combo,
        })
        .catch(() => {});
    }
  };

  const handleCaptureSnapshot = () => {
    setSnapshotTaken(true);
    setRecentMacroNotice("High-res desktop frame buffer captured (3840×2160 PNG)");
    if (isLiveMode() && selectedDevice?.id) {
      void fetchLiveFrame(1.0, 85);
    }
    setTimeout(() => {
      setSnapshotTaken(false);
      setRecentMacroNotice(null);
    }, 2500);
  };

  const cleanupWebrtc = useCallback(() => {
    releaseAllRemoteKeys();
    mediaStreamRef.current = null;
    if (videoRef.current) {
      try {
        videoRef.current.srcObject = null;
      } catch {}
    }
    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch {
        // Ignore close errors
      }
      wsRef.current = null;
    }
    if (inputDcRef.current) {
      try {
        inputDcRef.current.close();
      } catch {
        // Ignore close errors
      }
      inputDcRef.current = null;
    }
    if (pcRef.current) {
      try {
        pcRef.current.close();
      } catch {
        // Ignore close errors
      }
      pcRef.current = null;
    }
    setWebrtcConnected(false);
  }, [releaseAllRemoteKeys]);

  cleanupWebrtcRef.current = cleanupWebrtc;

  // Poll RTCPeerConnection.getStats() for live FPS, bitrate, RTT, and dropped frames
  useEffect(() => {
    if (!webrtcSessionId) return;
    const interval = setInterval(async () => {
      const pc = pcRef.current;
      if (!pc) return;
      try {
        const report = await pc.getStats();
        let fps = 30;
        let droppedFrames = 0;
        let bytesReceived = 0;
        let rttMs = 12;
        report.forEach((stat: any) => {
          if (stat.type === "inbound-rtp" && stat.kind === "video") {
            if (typeof stat.framesPerSecond === "number") fps = Math.round(stat.framesPerSecond);
            if (typeof stat.framesDropped === "number") droppedFrames = stat.framesDropped;
            if (typeof stat.bytesReceived === "number") bytesReceived = stat.bytesReceived;
          }
          if (stat.type === "candidate-pair" && stat.state === "succeeded") {
            if (typeof stat.currentRoundTripTime === "number") {
              rttMs = Math.round(stat.currentRoundTripTime * 1000);
            }
          }
        });
        const now = performance.now();
        let bitrateMbps = 4.5;
        if (prevBytesRef.current.ts > 0 && bytesReceived > prevBytesRef.current.bytes) {
          const deltaSec = (now - prevBytesRef.current.ts) / 1000;
          if (deltaSec > 0) {
            bitrateMbps = Number(
              (((bytesReceived - prevBytesRef.current.bytes) * 8) / (deltaSec * 1_000_000)).toFixed(2)
            );
          }
        }
        prevBytesRef.current = { bytes: bytesReceived, ts: now };

        // Closed-loop Adaptive Bitrate (ABR) algorithm
        if (abrMode === "auto") {
          const curr = currentBitrateRef.current;
          const isCongested = rttMs > 160 || droppedFrames > 5;
          const isClear = rttMs < 90 && droppedFrames === 0;

          if (isCongested) {
            consecutiveGoodRef.current = 0;
            consecutiveBadRef.current += 1;
            if (consecutiveBadRef.current >= 2) {
              consecutiveBadRef.current = 0;
              const nextLower = BITRATE_LADDER_KBPS.find((r) => r < curr);
              if (nextLower) {
                applyBitrate(nextLower, true);
              }
            }
          } else if (isClear) {
            consecutiveBadRef.current = 0;
            consecutiveGoodRef.current += 1;
            if (consecutiveGoodRef.current >= 8) {
              consecutiveGoodRef.current = 0;
              const reversed = [...BITRATE_LADDER_KBPS].reverse();
              const nextHigher = reversed.find((r) => r > curr);
              if (nextHigher) {
                applyBitrate(nextHigher, true);
              }
            }
          } else {
            consecutiveBadRef.current = 0;
            consecutiveGoodRef.current = 0;
          }
        }

        if (inputDcRef.current?.readyState === "open" && (rttMs > 160 || droppedFrames > 5)) {
          sendDataChannelEvent({
            action: "network_quality",
            rtt_ms: rttMs,
            packet_loss_pct: Math.min(100, Math.round((droppedFrames / Math.max(1, droppedFrames + fps)) * 100)),
          });
        }
        setWebrtcStats({
          fps,
          bitrateMbps,
          rttMs,
          droppedFrames,
          state: pc.connectionState || "connected",
        });
      } catch {
        // Ignore getStats errors
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [webrtcSessionId, abrMode, applyBitrate]);

  // Only teardown WebRTC when LiveDesktopView component actually unmounts
  useEffect(() => {
    return () => {
      cleanupWebrtcRef.current();
    };
  }, []);

  const handleStartWebrtc = async () => {
    if (!isLiveMode() || !selectedDevice?.id) {
      setRecentMacroNotice("WebRTC signaling active in live control plane mode");
      setTimeout(() => setRecentMacroNotice(null), 2500);
      return;
    }
    cleanupWebrtc();
    try {
      const sess = await api.createSessionV1({
        device_id: selectedDevice.id,
        mode: sessionMode,
        fps: 30,
        scale: 1.0,
        monitor_index: selectedMonitorIndex,
      });
      if (sess?.session_id) {
        const sid = String(sess.session_id);
        setWebrtcSessionId(sid);
        setRecentMacroNotice(`WebRTC session [${sid}] initialized (${sess.status || "waiting"})`);
        setTimeout(() => setRecentMacroNotice(null), 3000);

        let currentSess = sess;
        let offerSdp: string | undefined =
          currentSess.offer_sdp || currentSess.offer?.sdp;
        let offerType: string =
          currentSess.offer_type || currentSess.offer?.type || "offer";

        // If the remote Windows Agent is generating the SDP offer asynchronously, poll until it arrives
        for (let attempt = 0; attempt < 30 && !offerSdp; ++attempt) {
          await new Promise((r) => setTimeout(r, 500));
          try {
            const polled = await api.getSessionV1(sid);
            if (polled) {
              currentSess = polled;
              offerSdp = polled.offer_sdp || polled.offer?.sdp;
              offerType = polled.offer_type || polled.offer?.type || "offer";
              if (polled.status === "error" || polled.status === "ended") {
                break;
              }
            }
          } catch {
            // Continue polling
          }
        }

        if (typeof RTCPeerConnection !== "undefined" && offerSdp) {
          const pc = new RTCPeerConnection({
            iceServers: Array.isArray(currentSess.ice_servers)
              ? currentSess.ice_servers
              : [{ urls: "stun:stun.l.google.com:19302" }],
          });
          pcRef.current = pc;

          const setupDc = (channel: RTCDataChannel) => {
            inputDcRef.current = channel;
            channel.onmessage = (event) => {
              try {
                const data = JSON.parse(event.data);
                if (data.type === "clipboard_data" && data.text) {
                  void navigator.clipboard?.writeText(data.text).catch(() => {});
                  setRecentMacroNotice(`Synced clipboard from remote (${data.text.length} chars)`);
                  setTimeout(() => setRecentMacroNotice(null), 3000);
                }
              } catch {}
            };
          };

          const dc = pc.createDataChannel("input", { ordered: true });
          setupDc(dc);
          pc.ondatachannel = (e) => setupDc(e.channel);

          pc.ontrack = (event) => {
            if (event.streams && event.streams[0]) {
              mediaStreamRef.current = event.streams[0];
              if (videoRef.current) {
                videoRef.current.srcObject = event.streams[0];
                videoRef.current.play().catch(() => {});
              }
              setWebrtcConnected(true);
            }
          };

          pc.onicecandidate = (event) => {
            if (event.candidate) {
              void api.postIceV1(sid, event.candidate.toJSON()).catch(() => {});
            }
          };

          pc.onconnectionstatechange = () => {
            const st = pc.connectionState;
            setWebrtcStats((prev) => ({ ...prev, state: st }));
            if (st === "connected") {
              setIsReconnecting(false);
              setWebrtcConnected(true);
              setRecentMacroNotice(`WebRTC live H.264 stream connected [${sid.slice(0, 8)}]`);
              setTimeout(() => setRecentMacroNotice(null), 3000);
            } else if (st === "disconnected") {
              // Graceful network jitter handling: give ICE 2.5s to self-heal
              setIsReconnecting(true);
              setTimeout(() => {
                if (pcRef.current?.connectionState === "disconnected" || pcRef.current?.connectionState === "failed") {
                  setIsReconnecting(false);
                  setWebrtcConnected(false);
                  releaseAllRemoteKeys();
                  if (isLiveMode()) {
                    void handleStartWebrtc();
                  }
                } else if (pcRef.current?.connectionState === "connected") {
                  setIsReconnecting(false);
                }
              }, 2500);
            } else if (st === "failed") {
              setIsReconnecting(false);
              setWebrtcConnected(false);
              releaseAllRemoteKeys();
              setTimeout(() => {
                if (isLiveMode()) {
                  void handleStartWebrtc();
                }
              }, 1500);
            }
          };

          await pc.setRemoteDescription({
            type: offerType as RTCSdpType,
            sdp: offerSdp,
          });
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          if (answer.sdp) {
            await api.postAnswerV1(sid, answer.sdp, answer.type || "answer");
          }

          try {
            const ws = new WebSocket(api.sessionWebSocketUrl(sid));
            wsRef.current = ws;
          } catch {
            // Optional WebSocket signaling channel fallback
          }
        }
      }
    } catch (err: any) {
      setRecentMacroNotice(err?.message || "Could not start WebRTC session");
      setTimeout(() => setRecentMacroNotice(null), 3000);
    }
  };

  const handleSwitchMonitor = (idx: number) => {
    setSelectedMonitorIndex(idx);
    sendDataChannelEvent({ action: "switch_monitor", monitor_index: idx });
    if (webrtcSessionId && isLiveMode()) {
      void api.updateSessionQualityV1(webrtcSessionId, { monitor_index: idx }).catch(() => {});
    }
  };

  const handleSyncClipboard = async () => {
    setClipboardSync((prev) => !prev);
    try {
      const text = await navigator.clipboard?.readText();
      if (text) {
        sendDataChannelEvent({ action: "clipboard_sync", direction: "set", text });
        if (webrtcSessionId && isLiveMode()) {
          void api.syncSessionClipboardV1(webrtcSessionId, "set", text).catch(() => {});
        }
        setRecentMacroNotice(`Pushed clipboard (${text.length} chars) to remote`);
        setTimeout(() => setRecentMacroNotice(null), 3000);
        return;
      }
    } catch {}
    sendDataChannelEvent({ action: "clipboard_sync", direction: "get" });
    if (webrtcSessionId && isLiveMode()) {
      void api.syncSessionClipboardV1(webrtcSessionId, "get").catch(() => {});
    }
    setRecentMacroNotice("Requested clipboard from remote");
    setTimeout(() => setRecentMacroNotice(null), 3000);
  };

  const focusWindow = (id: string) => {
    setActiveWindowId(id);
    setWindowsList((prev) =>
      prev.map((w) => ({
        ...w,
        active: w.id === id,
      }))
    );
    const win = windowsList.find((w) => w.id === id);
    if (win) {
      setRecentMacroNotice(`Brought window [${win.name}] to foreground (PID ${win.pid})`);
      setTimeout(() => setRecentMacroNotice(null), 2500);
    }
  };

  const activeWindow = windowsList.find((w) => w.id === activeWindowId) || windowsList[0];

  return (
    <div className="space-y-5">
      {/* Top Header & Breadcrumb Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-800/60">
        <div className="flex items-center gap-3">
          <p className="text-sm text-slate-400">{selectedDevice?.hostname || "No device selected"}</p>
          {liveMonitors.length > 0 && (
            <div className="flex items-center gap-1.5 font-mono text-xs">
              {liveMonitors.map((mon) => (
                <button
                  key={mon.index}
                  type="button"
                  onClick={() => handleSwitchMonitor(mon.index)}
                  className={`px-2 py-0.5 rounded-lg border transition-colors ${
                    selectedMonitorIndex === mon.index
                      ? "bg-indigo-950/60 border-indigo-500/60 text-indigo-300"
                      : "bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {mon.name || `Display ${mon.index}`} ({mon.width}×{mon.height})
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 font-mono text-xs">
          <div className="hidden lg:flex items-center gap-2 px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 text-slate-300">
            <Activity className="w-3 h-3 text-emerald-400" />
            <span>H.264 {webrtcStats.fps} FPS</span>
            <span className="text-slate-600">|</span>
            <button
              type="button"
              onClick={() => {
                const modes: Array<"auto" | "5000" | "3500" | "2200" | "1200" | "600"> = [
                  "auto",
                  "5000",
                  "3500",
                  "2200",
                  "1200",
                  "600",
                ];
                const nextIdx = (modes.indexOf(abrMode) + 1) % modes.length;
                const nextMode = modes[nextIdx];
                setAbrMode(nextMode);
                if (nextMode !== "auto") {
                  applyBitrate(parseInt(nextMode, 10));
                }
              }}
              className="hover:text-indigo-300 transition-colors flex items-center gap-1 underline underline-offset-2"
              title="Toggle Adaptive Bitrate Ladder mode"
            >
              <span>
                {abrMode === "auto"
                  ? `ABR ${(targetBitrateKbps / 1000).toFixed(1)}M [AUTO]`
                  : `ABR ${(parseInt(abrMode, 10) / 1000).toFixed(1)}M [FIXED]`}
              </span>
            </button>
            <span className="text-slate-600">|</span>
            <span>RTT {webrtcStats.rttMs}ms</span>
            <span className="text-slate-600">|</span>
            <span>Drop {webrtcStats.droppedFrames}</span>
          </div>
          <button
            type="button"
            onClick={() => setIsStreamActive((prev) => !prev)}
            className="px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 text-slate-300 hover:border-slate-700 flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3 h-3 ${isStreamActive ? "text-emerald-400" : "text-slate-500"}`} />
            <span>{isStreamActive ? "Stream Polling [ON]" : "Stream Polling [PAUSED]"}</span>
          </button>
          <button
            type="button"
            onClick={() => void handleStartWebrtc()}
            className="px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 text-indigo-300 hover:border-indigo-500/50 flex items-center gap-1.5"
          >
            <Radio className="w-3 h-3 text-indigo-400" />
            <span>{webrtcSessionId ? `WebRTC #${webrtcSessionId.slice(0, 6)}` : "WebRTC Session"}</span>
          </button>
        </div>
      </div>

      {/* Floating Dual-Control Takeover Bar */}
      <div className="p-3 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {/* Mode Segmented Switch */}
          <div className="flex p-1 rounded-xl bg-slate-950 border border-slate-800">
            <button
              type="button"
              onClick={() => void applySessionMode("view_only")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                controlMode === "observer"
                  ? "bg-slate-800 text-slate-100 shadow"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Monitor className="w-3.5 h-3.5" />
              <span>Observer Mode</span>
            </button>
            <button
              type="button"
              onClick={() => void applySessionMode("human_control")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                controlMode === "takeover" && sessionMode === "human_control"
                  ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span>Operator Takeover [Active]</span>
            </button>
            <button
              type="button"
              onClick={() => void applySessionMode("ai_assisted")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                sessionMode === "ai_assisted"
                  ? "bg-cyan-700 text-white shadow-md shadow-cyan-700/30"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Cpu className="w-3.5 h-3.5" />
              <span>AI-Assisted</span>
            </button>
          </div>

          <div className="h-6 w-px bg-slate-800 hidden sm:block mx-1"></div>

          {/* Kinematic Input Toggles */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setMouseLinked(!mouseLinked)}
              className={`px-3 py-1.5 rounded-xl text-xs font-mono flex items-center gap-1.5 border transition-all ${
                mouseLinked
                  ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/30"
                  : "bg-slate-950 text-slate-500 border-slate-800"
              }`}
            >
              <Mouse className="w-3.5 h-3.5" />
              <span>Mouse Link</span>
              <span className={`w-1.5 h-1.5 rounded-full ${mouseLinked ? "bg-emerald-400" : "bg-slate-600"}`}></span>
            </button>

            <button
              type="button"
              onClick={() => setKeyForwarded(!keyForwarded)}
              className={`px-3 py-1.5 rounded-xl text-xs font-mono flex items-center gap-1.5 border transition-all ${
                keyForwarded
                  ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/30"
                  : "bg-slate-950 text-slate-500 border-slate-800"
              }`}
            >
              <Keyboard className="w-3.5 h-3.5" />
              <span>Key Forward</span>
              <span className={`w-1.5 h-1.5 rounded-full ${keyForwarded ? "bg-emerald-400" : "bg-slate-600"}`}></span>
            </button>

            <button
              type="button"
              onClick={() => void handleSyncClipboard()}
              className={`px-3 py-1.5 rounded-xl text-xs font-mono flex items-center gap-1.5 border transition-all ${
                clipboardSync
                  ? "bg-indigo-500/10 text-indigo-300 border-indigo-500/30"
                  : "bg-slate-950 text-slate-500 border-slate-800"
              }`}
            >
              <ClipboardCopy className="w-3.5 h-3.5" />
              <span>Clipboard Sync</span>
              <span className={`w-1.5 h-1.5 rounded-full ${clipboardSync ? "bg-indigo-400" : "bg-slate-600"}`}></span>
            </button>

            <button
              type="button"
              onClick={togglePointerLock}
              className={`px-3 py-1.5 rounded-xl text-xs font-mono flex items-center gap-1.5 border transition-all ${
                pointerLockActive
                  ? "bg-indigo-600/20 text-indigo-300 border-indigo-500/40"
                  : "bg-slate-950 text-slate-500 border-slate-800"
              }`}
              title="Lock mouse cursor inside stream canvas for direct precision control (Press Esc to unlock)"
            >
              <Crosshair className="w-3.5 h-3.5" />
              <span>Pointer Lock</span>
              <span className={`w-1.5 h-1.5 rounded-full ${pointerLockActive ? "bg-indigo-400 animate-pulse" : "bg-slate-600"}`}></span>
            </button>
          </div>
        </div>

        {/* Scaling, SoM Toggle, Snapshot */}
        <div className="flex items-center gap-2">
          {/* Scale Switcher */}
          <div className="flex p-1 rounded-xl bg-slate-950 border border-slate-800 font-mono text-xs">
            <button
              type="button"
              onClick={() => setScalingMode("fit")}
              className={`px-2.5 py-1 rounded-lg ${
                scalingMode === "fit" ? "bg-slate-800 text-slate-100" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Fit
            </button>
            <button
              type="button"
              onClick={() => setScalingMode("native")}
              className={`px-2.5 py-1 rounded-lg ${
                scalingMode === "native" ? "bg-slate-800 text-slate-100" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              1:1 Native
            </button>
            <button
              type="button"
              onClick={() => setScalingMode("fill")}
              className={`px-2.5 py-1 rounded-lg ${
                scalingMode === "fill" ? "bg-slate-800 text-slate-100" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Fill
            </button>
          </div>

          {/* SoM Toggle */}
          <button
            type="button"
            onClick={() => setSomOverlay(!somOverlay)}
            className={`px-3 py-1.5 rounded-xl text-xs font-mono font-semibold flex items-center gap-1.5 border transition-all ${
              somOverlay
                ? "bg-indigo-600/20 text-indigo-300 border-indigo-500/40"
                : "bg-slate-950 text-slate-400 border-slate-800"
            }`}
          >
            <Crosshair className="w-3.5 h-3.5 text-indigo-400" />
            <span>Vision SoM [{somOverlay ? "ON" : "OFF"}]</span>
          </button>

          {/* Screenshot Button */}
          <button
            type="button"
            onClick={handleCaptureSnapshot}
            title="Capture Desktop Snapshot"
            className="p-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-300 hover:text-slate-100 hover:border-slate-700 transition-colors"
          >
            <Camera className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Emergency Hotkey Macros Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-2 rounded-xl bg-slate-950/80 border border-slate-800">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-[11px] text-slate-400 uppercase tracking-wider">
            Quick Hotkey Macros:
          </span>
          <div className="flex flex-wrap items-center gap-1.5">
            {[
              "Ctrl+Alt+Del",
              "Win / Super",
              "Alt+Tab",
              "Ctrl+Shift+Esc",
            ].map((macro) => (
              <button
                key={macro}
                type="button"
                onClick={() => dispatchMacro(macro)}
                className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-700 hover:bg-slate-800 text-slate-200 font-mono text-xs transition-all active:scale-95"
              >
                {macro}
              </button>
            ))}
            <button
              type="button"
              onClick={() => dispatchMacro("Unlock Screen")}
              className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-700 text-emerald-400 font-mono text-xs transition-all active:scale-95 flex items-center gap-1"
            >
              <Unlock className="w-3 h-3 text-emerald-400" />
              <span>Unlock Screen</span>
            </button>
          </div>
        </div>

        {recentMacroNotice && (
          <div className="font-mono text-xs text-indigo-300 bg-indigo-950/60 px-3 py-1 rounded-lg border border-indigo-500/30">
            {recentMacroNotice}
          </div>
        )}

        <div className="flex items-center gap-2 font-mono text-xs text-slate-400">
          <span>Focus: Container [tty1]</span>
          <span className="px-2 py-0.5 rounded bg-slate-800 text-indigo-300 font-bold">PID: 1042</span>
        </div>
      </div>

      {/* Desktop Stream Viewport Canvas */}
      <div
        ref={canvasContainerRef}
        tabIndex={0}
        onMouseMove={handleCanvasMouseMove}
        onMouseDown={handleCanvasMouseDown}
        onMouseUp={handleCanvasMouseUp}
        onClick={handleCanvasClick}
        onKeyDown={handleCanvasKeyDown}
        onKeyUp={handleCanvasKeyUp}
        onBlur={releaseAllRemoteKeys}
        className="relative w-full aspect-video min-h-[560px] max-h-[760px] rounded-2xl bg-slate-950 border border-slate-800/80 overflow-hidden shadow-2xl select-none group focus:outline-none focus:border-indigo-500/60"
      >
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={`absolute inset-0 w-full h-full z-20 transition-opacity duration-150 ${
            webrtcConnected ? "opacity-100" : "opacity-0 pointer-events-none"
          } ${
            scalingMode === "fill"
              ? "object-cover"
              : scalingMode === "native"
              ? "object-none"
              : "object-contain"
          }`}
        />

        {liveFrameUrl && (
          <img
            src={liveFrameUrl}
            alt="Remote desktop stream frame"
            className={`absolute inset-0 w-full h-full z-10 transition-opacity duration-150 ${
              webrtcConnected ? "opacity-0 pointer-events-none" : "opacity-100"
            } ${
              scalingMode === "fill"
                ? "object-cover"
                : scalingMode === "native"
                ? "object-none"
                : "object-contain"
            }`}
          />
        )}

        {!liveFrameUrl && liveFrameMeta?.note && (
          <div className="absolute bottom-3 left-3 z-20 px-3 py-1.5 rounded-lg bg-slate-950/90 border border-slate-800 text-xs font-mono text-slate-300">
            {liveFrameMeta.note}
          </div>
        )}

        {/* Remote Operating System Canvas Simulation */}
        <div className="absolute inset-0 flex flex-col bg-[#0b0f19]">
          {/* OS Window Chrome Header */}
          <div className="h-8 bg-slate-900/90 border-b border-slate-800 px-3 flex items-center justify-between text-xs font-mono text-slate-400">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full bg-rose-500/80"></span>
                <span className="w-3 h-3 rounded-full bg-amber-500/80"></span>
                <span className="w-3 h-3 rounded-full bg-emerald-500/80"></span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-slate-200 font-semibold">ubuntu@srv-us-east-412:~</span>
                <span className="text-[10px] px-1.5 rounded bg-slate-800 text-slate-400">X11/GNOME 46</span>
              </div>
            </div>

            <div className="flex items-center gap-4 text-[11px]">
              <span>CPU 24%</span>
              <span>RAM 12.4/64 GB</span>
              <span>GPU 41°C</span>
              <span className="text-slate-200 font-semibold">14:38:09 UTC</span>
            </div>
          </div>

          {/* Desktop Canvas Window Area */}
          <div className="flex-1 p-4 grid grid-cols-12 grid-rows-6 gap-3 overflow-hidden relative">
            {/* Window 1: VS Code Server (cols 1..8, rows 1..4) */}
            <div className="col-span-8 row-span-4 rounded-xl bg-slate-950/95 border border-slate-800 shadow-2xl flex flex-col overflow-hidden relative">
              <div className="h-8 bg-slate-900 px-3 flex items-center justify-between border-b border-slate-800 text-xs font-mono">
                <div className="flex items-center gap-2">
                  <Code className="w-3.5 h-3.5 text-indigo-400" />
                  <span className="text-slate-200 font-semibold">bridge_orchestrator.py — VS Code Server</span>
                </div>
                <div className="flex items-center gap-2 text-[11px] text-emerald-400">
                  <span>● Python 3.12 (venv)</span>
                </div>
              </div>

              <div className="flex-1 p-3 font-mono text-xs leading-relaxed text-slate-300 flex gap-3 overflow-hidden">
                <div className="text-slate-600 select-none text-right flex flex-col">
                  <span>1</span><span>2</span><span>3</span><span>4</span><span>5</span><span>6</span><span>7</span><span>8</span><span>9</span><span>10</span>
                </div>
                <div className="flex-1 flex flex-col space-y-0.5 text-slate-300">
                  <div><span className="text-rose-400">import</span> asyncio</div>
                  <div><span className="text-rose-400">from</span> ai_bridge.core <span className="text-rose-400">import</span> <span className="text-emerald-400">AutonomousAgentMesh</span></div>
                  <div className="text-slate-500"># Initialized from TaskQueue #TSK-89213</div>
                  <div><span className="text-rose-400">async def</span> <span className="text-cyan-400 font-semibold">execute_failover_handshake</span>(node_id: <span className="text-indigo-300">str</span>):</div>
                  <div className="pl-4"><span className="text-slate-500">&quot;&quot;&quot;Validates cryptographic peer quorum and routes TLS pipe.&quot;&quot;&quot;</span></div>
                  <div className="pl-4">session = <span className="text-rose-400">await</span> AutonomousAgentMesh.<span className="text-cyan-400">connect_peer</span>(node_id)</div>
                  <div className="pl-4"><span className="text-rose-400">if not</span> session.<span className="text-emerald-400">is_verified</span>():</div>
                  <div className="pl-8"><span className="text-rose-400">raise</span> <span className="text-rose-400">SecurityAssertionViolation</span>(<span className="text-amber-300">&quot;Quorum failed&quot;</span>)</div>
                  <div className="pl-4"><span className="text-rose-400">return await</span> session.<span className="text-cyan-400">dispatch_transaction</span>()</div>
                  <div className="mt-2 text-emerald-400 text-[11px]">● Live Sync: Auto-saved (2ms ago)</div>
                </div>
              </div>
            </div>

            {/* Window 2: Command Shell (cols 9..12, rows 1..6) */}
            <div className="col-span-4 row-span-6 rounded-xl bg-slate-950/95 border border-slate-800 shadow-2xl flex flex-col overflow-hidden relative">
              <div className="h-8 bg-slate-900 px-3 flex items-center justify-between border-b border-slate-800 text-xs font-mono">
                <div className="flex items-center gap-2">
                  <Terminal className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-slate-200 font-semibold">bash (PID 1042)</span>
                </div>
                <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
              </div>

              <div className="flex-1 p-2.5 font-mono text-[11px] leading-relaxed text-slate-300 space-y-1 overflow-hidden">
                <div className="text-slate-500">sarah@srv-us-east-412:~$ docker ps</div>
                <div className="text-emerald-400 text-[10px]">CONTAINER ID   NAMES               STATUS</div>
                <div className="text-slate-300 text-[10px]">8f9a21e4cc     bridge-ingress-gw   Up 14h (healthy)</div>
                <div className="text-slate-300 text-[10px]">02c91fa09b     vector-indexer      Up 3h</div>
                <div className="text-slate-300 text-[10px]">e45a90d81c     webrtc-streamer     Up 14h</div>
                <div className="mt-2 text-slate-500">sarah@srv-us-east-412:~$ tail -f audit.log</div>
                <div className="text-slate-400 text-[10px]">[14:37:58] Agent Sonnet requested keyboard event</div>
                <div className="text-cyan-400 text-[10px]">[14:38:01] Dual-Control arbiter: Granting operator priority</div>
                <div className="text-emerald-400 flex items-center gap-1 mt-2">
                  <span>sarah@srv-us-east-412:~$</span>
                  <span className="w-2 h-3.5 bg-emerald-400 inline-block animate-pulse"></span>
                </div>
              </div>
            </div>

            {/* Window 3: Performance Telemetry (cols 1..8, rows 5..6) */}
            <div className="col-span-8 row-span-2 rounded-xl bg-slate-950/95 border border-slate-800 shadow-xl p-3 flex flex-col justify-between relative overflow-hidden">
              <div className="flex items-center justify-between text-xs font-mono">
                <div className="flex items-center gap-2 text-slate-200 font-semibold">
                  <Activity className="w-3.5 h-3.5 text-indigo-400" />
                  <span>System Performance Realtime Telemetry</span>
                </div>
                <span className="text-[11px] text-slate-400">NVENC Session active: 60.1 fps</span>
              </div>

              <div className="grid grid-cols-4 gap-2 pt-1 font-mono">
                <div className="p-2 rounded-lg bg-slate-900 border border-slate-800">
                  <span className="text-[10px] text-slate-500 uppercase block">CPU UTIL</span>
                  <span className="text-sm font-bold text-slate-200">24.2%</span>
                </div>
                <div className="p-2 rounded-lg bg-slate-900 border border-slate-800">
                  <span className="text-[10px] text-slate-500 uppercase block">GPU VRAM</span>
                  <span className="text-sm font-bold text-emerald-400">4.8 GB</span>
                </div>
                <div className="p-2 rounded-lg bg-slate-900 border border-slate-800">
                  <span className="text-[10px] text-slate-500 uppercase block">NETWORK I/O</span>
                  <span className="text-sm font-bold text-indigo-300">14.8 Mb/s</span>
                </div>
                <div className="p-2 rounded-lg bg-slate-900 border border-slate-800">
                  <span className="text-[10px] text-slate-500 uppercase block">AGENT-TO-GROUND</span>
                  <span className="text-sm font-bold text-cyan-400">PASSIVE</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Set-of-Marks (SoM) Bounding Visual Segmentation Map */}
        {somOverlay && (
          <div className="absolute inset-0 pointer-events-none">
            {/* SoM Mark #101: Code Editor Workspace */}
            <div className="absolute left-[4%] top-[12%] w-[62%] h-[56%] border-2 border-indigo-400/70 bg-indigo-500/5 rounded-xl flex items-start justify-between p-2">
              <span className="px-2 py-0.5 rounded bg-indigo-600 text-white font-mono text-[10px] font-bold shadow-md">
                SoM #101 • Editor Workspace
              </span>
              <span className="font-mono text-[10px] text-indigo-300 bg-slate-950/80 px-1.5 py-0.5 rounded border border-indigo-500/30">
                Target: active_buffer
              </span>
            </div>

            {/* SoM Mark #102: Command Shell */}
            <div className="absolute left-[68%] top-[12%] w-[29%] h-[82%] border-2 border-emerald-400/70 bg-emerald-500/5 rounded-xl flex items-start justify-between p-2">
              <span className="px-2 py-0.5 rounded bg-emerald-800 text-white font-mono text-[10px] font-bold shadow-md">
                SoM #102 • Command Shell
              </span>
              <span className="font-mono text-[10px] text-emerald-300 bg-slate-950/80 px-1.5 py-0.5 rounded border border-emerald-500/30">
                Target: bash_pty
              </span>
            </div>

            {/* SoM Mark #103: Performance Bar */}
            <div className="absolute left-[4%] top-[72%] w-[62%] h-[22%] border-2 border-cyan-400/70 bg-cyan-500/5 rounded-xl flex items-start justify-between p-2">
              <span className="px-2 py-0.5 rounded bg-cyan-800 text-white font-mono text-[10px] font-bold shadow-md">
                SoM #103 • Telemetry Metrics
              </span>
              <span className="font-mono text-[10px] text-cyan-300 bg-slate-950/80 px-1.5 py-0.5 rounded border border-cyan-500/30">
                Target: gpu_vitals
              </span>
            </div>
          </div>
        )}

        {/* Dual Cursor HUD Overlay */}
        {/* Cursor 1: AI Agent Target Crosshair */}
        <div className="absolute left-[36%] top-[34%] pointer-events-none z-30 flex items-start gap-1">
          <div className="w-5 h-5 rounded-full border-2 border-indigo-400 bg-indigo-500/20 flex items-center justify-center animate-pulse">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-400"></span>
          </div>
          <div className="px-2 py-0.5 rounded bg-indigo-600 text-white font-mono text-[10px] font-semibold shadow-lg">
            Agent: Claude-3.5-Sonnet (X: 1420, Y: 840)
          </div>
        </div>

        {/* Cursor 2: Human Operator Pointer */}
        <div className="absolute left-[54%] top-[24%] pointer-events-none z-30 flex items-start gap-1">
          <div className="w-4 h-4 rounded-full border-2 border-emerald-400 bg-emerald-500/30 flex items-center justify-center">
            <span className="w-1 h-1 rounded-full bg-emerald-300"></span>
          </div>
          <div className="px-2 py-0.5 rounded bg-slate-900/90 backdrop-blur-md border border-emerald-500/40 text-emerald-300 font-mono text-[10px] font-semibold shadow-lg">
            Operator: Sarah J. (X: {operatorCoords.x}, Y: {operatorCoords.y})
          </div>
        </div>

        {/* Takeover Active Warning Banner if Takeover Mode */}
        {controlMode === "takeover" && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 pointer-events-none z-20">
            <div className="px-4 py-1.5 rounded-full bg-slate-950/90 backdrop-blur-md border border-indigo-500/60 shadow-xl flex items-center gap-2 font-mono text-xs text-indigo-300">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span className="font-semibold">Operator Takeover Active — Agent Input Suppressed</span>
            </div>
          </div>
        )}

        {/* Pointer Lock Status Badge */}
        {pointerLockActive && (
          <div className="absolute top-3 right-3 pointer-events-none z-30">
            <div className="px-3 py-1.5 rounded-xl bg-slate-950/95 border border-indigo-500/60 text-xs font-mono text-indigo-300 shadow-xl flex items-center gap-2">
              <Crosshair className="w-3.5 h-3.5 text-indigo-400" />
              <span>Pointer Locked · Press [ESC] to unlock</span>
            </div>
          </div>
        )}

        {/* WebRTC Auto-Healing Reconnect Banner */}
        {isReconnecting && (
          <div className="absolute top-12 left-1/2 -translate-x-1/2 pointer-events-none z-30">
            <div className="px-4 py-1.5 rounded-full bg-amber-950/90 border border-amber-500/60 text-xs font-mono text-amber-300 shadow-xl flex items-center gap-2">
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-400" />
              <span>WebRTC Reconnecting (Auto-healing stream)...</span>
            </div>
          </div>
        )}

      </div>

      {/* Active Windows HUD Tray (Collapsible & Focusable) */}
      <div className="p-3 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          <span className="font-mono text-xs uppercase tracking-wider text-slate-400 pl-1 hidden sm:inline">
            Windows
          </span>
          {windowsList.map((win) => {
            const isFocused = win.id === activeWindowId;
            return (
              <div
                key={win.id}
                onClick={() => focusWindow(win.id)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-mono cursor-pointer transition-all ${
                  isFocused
                    ? "bg-indigo-950/60 border-indigo-500 text-slate-100 shadow-md shadow-indigo-600/10"
                    : "bg-slate-950/70 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700"
                }`}
              >
                {win.icon === "terminal" && <Terminal className="w-3.5 h-3.5 text-emerald-400" />}
                {win.icon === "code" && <Code className="w-3.5 h-3.5 text-indigo-400" />}
                {win.icon === "docker" && <Layers className="w-3.5 h-3.5 text-cyan-400" />}
                {win.icon === "monitor" && <Activity className="w-3.5 h-3.5 text-amber-400" />}
                <div className="flex flex-col text-left">
                  <span className="font-semibold text-slate-200">{win.name}</span>
                  <span className="text-[10px] text-slate-500">{win.desc}</span>
                </div>
                {isFocused && <span className="w-2 h-2 rounded-full bg-emerald-400 ml-1"></span>}
              </div>
            );
          })}
        </div>

        {/* Window Manager Actions */}
        <div className="flex items-center gap-2 w-full md:w-auto justify-end">
          <button
            type="button"
            onClick={() => focusWindow(activeWindowId)}
            className="px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 hover:bg-slate-800 text-slate-200 font-mono text-xs flex items-center gap-1.5 transition-colors"
          >
            <Crosshair className="w-3.5 h-3.5 text-indigo-400" />
            <span>Focus Active</span>
          </button>
          <button
            type="button"
            onClick={() => dispatchMacro(`Minimize ${activeWindow.name}`)}
            className="px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 hover:bg-slate-800 text-slate-200 font-mono text-xs flex items-center gap-1.5 transition-colors"
          >
            <Minimize2 className="w-3.5 h-3.5" />
            <span>Minimize</span>
          </button>
          <button
            type="button"
            onClick={() => dispatchMacro(`Graceful Stop PID ${activeWindow.pid}`)}
            className="px-3 py-1.5 rounded-xl bg-rose-500/10 border border-rose-500/30 hover:bg-rose-500/20 text-rose-300 font-mono text-xs flex items-center gap-1.5 transition-colors"
          >
            <Power className="w-3.5 h-3.5 text-rose-400" />
            <span>Graceful Stop</span>
          </button>
        </div>
      </div>

    </div>
  );
};

export default LiveDesktopView;
