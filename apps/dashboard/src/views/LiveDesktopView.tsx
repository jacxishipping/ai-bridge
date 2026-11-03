/**
 * AI Bridge Enterprise Dashboard — Live Desktop Studio & Dual-Control (Screen 5)
 * Low-latency WebRTC desktop stream canvas with dual cursor HUD, operator takeover bar,
 * hotkey macros, telemetry HUD, and open windows manager.
 * Strict JXUI Primitives & Lucide Icons. ZERO inline styles.
 */

import React, { useState, useRef, useCallback } from "react";
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
} from "@jacxishippingorg/jx-ui-react";
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

  // Control modes
  const [controlMode, setControlMode] = useState<"observer" | "takeover">("takeover");
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

  // Mouse move handler over canvas
  const handleCanvasMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(2560, Math.round(((e.clientX - rect.left) / rect.width) * 2560)));
    const y = Math.max(0, Math.min(1440, Math.round(((e.clientY - rect.top) / rect.height) * 1440)));
    setOperatorCoords({ x, y });
  }, []);

  const dispatchMacro = (macroName: string) => {
    setRecentMacroNotice(`Dispatched macro [${macroName}] to target node ${selectedDevice?.hostname || "srv-us-east-412"}`);
    setTimeout(() => setRecentMacroNotice(null), 3000);
  };

  const handleCaptureSnapshot = () => {
    setSnapshotTaken(true);
    setRecentMacroNotice("High-res desktop frame buffer captured (3840×2160 PNG)");
    setTimeout(() => {
      setSnapshotTaken(false);
      setRecentMacroNotice(null);
    }, 2500);
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
        <div>
          <div className="flex items-center gap-2 font-mono text-xs text-slate-400">
            <span className="uppercase tracking-wider">Operations</span>
            <span className="text-slate-600">/</span>
            <span className="uppercase tracking-wider text-indigo-400">Live Desktop Studio</span>
            <span className="text-slate-600">/</span>
            <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-200">
              {selectedDevice?.hostname || "srv-us-east-412"}
            </span>
          </div>
          <h2 className="text-lg font-bold text-slate-100 tracking-tight mt-1 flex items-center gap-3">
            Interactive Remote Workspace
            <span className="font-mono text-[11px] px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
              Stream Synchronized
            </span>
          </h2>
        </div>

        {/* Telemetry Pills */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900/80 border border-slate-800 font-mono text-xs">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400"></span>
            </span>
            <span className="text-slate-200">WebRTC P2P</span>
            <span className="text-emerald-400 font-semibold">60 FPS • 18ms</span>
          </div>

          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900/80 border border-slate-800 font-mono text-xs">
            <Radio className="w-3.5 h-3.5 text-indigo-400" />
            <span className="text-slate-200">Dual-Control:</span>
            <span className="text-emerald-400 font-semibold">
              {controlMode === "takeover" ? "Operator Takeover" : "Observer Mode"}
            </span>
          </div>

          <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900/80 border border-slate-800 font-mono text-xs text-slate-400">
            <Cpu className="w-3.5 h-3.5" />
            <span>H.265 / NVENC HW</span>
          </div>
        </div>
      </div>

      {/* Floating Dual-Control Takeover Bar */}
      <div className="p-3 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {/* Mode Segmented Switch */}
          <div className="flex p-1 rounded-xl bg-slate-950 border border-slate-800">
            <button
              type="button"
              onClick={() => setControlMode("observer")}
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
              onClick={() => setControlMode("takeover")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                controlMode === "takeover"
                  ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span>Operator Takeover [Active]</span>
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
              onClick={() => setClipboardSync(!clipboardSync)}
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
          <div className="font-mono text-xs text-indigo-300 bg-indigo-950/60 px-3 py-1 rounded-lg border border-indigo-500/30 animate-pulse">
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
        onMouseMove={handleCanvasMouseMove}
        className="relative w-full aspect-video min-h-[560px] max-h-[760px] rounded-2xl bg-slate-950 border border-slate-800/80 overflow-hidden shadow-2xl select-none group"
      >
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
              <span className="px-2 py-0.5 rounded bg-emerald-600 text-white font-mono text-[10px] font-bold shadow-md">
                SoM #102 • Command Shell
              </span>
              <span className="font-mono text-[10px] text-emerald-300 bg-slate-950/80 px-1.5 py-0.5 rounded border border-emerald-500/30">
                Target: bash_pty
              </span>
            </div>

            {/* SoM Mark #103: Performance Bar */}
            <div className="absolute left-[4%] top-[72%] w-[62%] h-[22%] border-2 border-cyan-400/70 bg-cyan-500/5 rounded-xl flex items-start justify-between p-2">
              <span className="px-2 py-0.5 rounded bg-cyan-600 text-white font-mono text-[10px] font-bold shadow-md">
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

        {/* Bottom Enclave Telemetry HUD Overlay */}
        <div className="absolute bottom-2 left-2 right-2 px-3 py-1.5 rounded-lg bg-slate-950/85 backdrop-blur-md border border-slate-800 flex items-center justify-between font-mono text-[11px] text-slate-400 pointer-events-none">
          <span className="flex items-center gap-1.5 text-emerald-400">
            <Lock className="w-3.5 h-3.5" />
            mTLS Encrypted Enclave Stream • Session #LDS-99201 • Sarah J. (Lead SecOps)
          </span>
          <span className="tabular-nums">3840×2160 native (DPI: 2.0)</span>
        </div>
      </div>

      {/* Active Windows HUD Tray (Collapsible & Focusable) */}
      <div className="p-3 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          <span className="font-mono text-xs uppercase tracking-wider text-slate-400 pl-1 hidden sm:inline">
            Active Windows HUD:
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

      {/* Bottom Telemetry Metrics Strip (8 Bento Cards) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
        <div className="p-3 rounded-xl bg-slate-900/70 border border-slate-800 flex flex-col font-mono">
          <span className="text-[10px] text-slate-400 uppercase">Stream Bitrate</span>
          <span className="text-base font-bold text-slate-100 mt-1">14.82 Mbps</span>
          <span className="text-[10px] text-emerald-400 mt-0.5">Optimal Bandwidth</span>
        </div>

        <div className="p-3 rounded-xl bg-slate-900/70 border border-slate-800 flex flex-col font-mono">
          <span className="text-[10px] text-slate-400 uppercase">Packet Loss</span>
          <span className="text-base font-bold text-emerald-400 mt-1">0.00 %</span>
          <span className="text-[10px] text-slate-500 mt-0.5">0 / 28,490 lost</span>
        </div>

        <div className="p-3 rounded-xl bg-slate-900/70 border border-slate-800 flex flex-col font-mono">
          <span className="text-[10px] text-slate-400 uppercase">Framerate</span>
          <span className="text-base font-bold text-slate-100 mt-1">59.8 FPS</span>
          <span className="text-[10px] text-emerald-400 mt-0.5">Target: 60 FPS</span>
        </div>

        <div className="p-3 rounded-xl bg-slate-900/70 border border-slate-800 flex flex-col font-mono">
          <span className="text-[10px] text-slate-400 uppercase">Render Latency</span>
          <span className="text-base font-bold text-emerald-400 mt-1">2.1 ms</span>
          <span className="text-[10px] text-slate-500 mt-0.5">NVENC sync</span>
        </div>

        <div className="p-3 rounded-xl bg-slate-900/70 border border-slate-800 flex flex-col font-mono">
          <span className="text-[10px] text-slate-400 uppercase">Total Dropped</span>
          <span className="text-base font-bold text-slate-100 mt-1">0 frames</span>
          <span className="text-[10px] text-emerald-400 mt-0.5">Zero-drop buffer</span>
        </div>

        <div className="p-3 rounded-xl bg-slate-900/70 border border-slate-800 flex flex-col font-mono">
          <span className="text-[10px] text-slate-400 uppercase">Audio Stream</span>
          <span className="text-base font-bold text-slate-100 mt-1">Opus 48kHz</span>
          <span className="text-[10px] text-emerald-400 mt-0.5">128 kbps stereo</span>
        </div>

        <div className="p-3 rounded-xl bg-slate-900/70 border border-slate-800 flex flex-col font-mono">
          <span className="text-[10px] text-slate-400 uppercase">Hardware GPU</span>
          <span className="text-base font-bold text-cyan-400 mt-1">RTX 4090</span>
          <span className="text-[10px] text-slate-500 mt-0.5">Driver 550.54</span>
        </div>

        <div className="p-3 rounded-xl bg-slate-900/70 border border-slate-800 flex flex-col font-mono">
          <span className="text-[10px] text-slate-400 uppercase">Session Idle</span>
          <span className="text-base font-bold text-slate-100 mt-1">0s</span>
          <span className="text-[10px] text-indigo-400 mt-0.5">Operator Active</span>
        </div>
      </div>
    </div>
  );
};

export default LiveDesktopView;
