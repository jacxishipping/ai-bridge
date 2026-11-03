/**
 * AI Bridge Enterprise Dashboard — Top Header Bar
 * Uses JXAppBar, JXBox, JXStack, JXButton, HoldToConfirmButton, lucide-react. ZERO inline styles.
 */

import React from "react";
import {
  JXBox,
  JXStack,
  JXButton,
  JXSwitch,
  JXAvatar,
  HoldToConfirmButton,
} from "@jacxishippingorg/jx-ui-react";
import {
  Search,
  AlertTriangle,
  PlayCircle,
  HelpCircle,
  Download,
  Wifi,
} from "lucide-react";
import { useDashboardStore } from "../state/dashboardStore";

export const TopHeader: React.FC = () => {
  const isEmergencyStopActive = useDashboardStore((s) => s.isEmergencyStopActive);
  const triggerEmergencyStop = useDashboardStore((s) => s.triggerEmergencyStop);
  const resumeFleet = useDashboardStore((s) => s.resumeFleet);
  const setCommandPaletteOpen = useDashboardStore((s) => s.setCommandPaletteOpen);
  const autoPollEnabled = useDashboardStore((s) => s.autoPollEnabled);
  const setAutoPollEnabled = useDashboardStore((s) => s.setAutoPollEnabled);
  const operatorProfile = useDashboardStore((s) => s.operatorProfile);
  const gatewayLatencyMs = useDashboardStore((s) => s.gatewayLatencyMs);
  const gatewayStatus = useDashboardStore((s) => s.gatewayStatus);

  return (
    <JXBox
      surface="elevated"
      border
      className="h-16 px-6 flex items-center justify-between border-b border-slate-800/80 bg-slate-900/90 backdrop-blur-xl z-30 select-none"
    >
      {/* Left: Gateway Health Status Pill & Emergency Banner */}
      <JXStack direction="row" spacing="md" className="items-center">
        {/* Gateway Status Pill */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-950/80 border border-slate-800/80 text-xs">
          <span className="relative flex h-2 w-2">
            <span
              className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                gatewayStatus === "online" ? "bg-emerald-400" : "bg-amber-400"
              }`}
            />
            <span
              className={`relative inline-flex rounded-full h-2 w-2 ${
                gatewayStatus === "online" ? "bg-emerald-500" : "bg-amber-500"
              }`}
            />
          </span>
          <Wifi className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-slate-200 font-medium">Gateway:</span>
          <span className="font-mono text-emerald-400 font-semibold uppercase text-[11px]">
            {gatewayStatus}
          </span>
          <span className="text-slate-500 font-mono text-[11px]">
            ({gatewayLatencyMs}ms)
          </span>
        </div>

        {/* Emergency Stop Active Warning Ribbon */}
        {isEmergencyStopActive && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-rose-500/20 border border-rose-500/50 text-rose-300 text-xs font-semibold animate-pulse">
            <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
            <span>EMERGENCY ALL-STOP ACTIVE — FLEET SUSPENDED</span>
          </div>
        )}
      </JXStack>

      {/* Center: Command Palette Trigger (⌘K) */}
      <div className="flex-1 max-w-md mx-6">
        <JXButton
          variant="outlined"
          color="neutral"
          size="sm"
          fullWidth
          onClick={() => setCommandPaletteOpen(true)}
          className="justify-between bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700 hover:bg-slate-900"
          startIcon={<Search className="w-3.5 h-3.5 text-slate-400" />}
        >
          <span className="text-xs truncate">Quick Jump to device, screen, or action…</span>
          <kbd className="ml-2 px-1.5 py-0.5 text-[10px] font-mono bg-slate-800/80 text-slate-300 rounded border border-slate-700/60 shadow-sm">
            ⌘K
          </kbd>
        </JXButton>
      </div>

      {/* Right Actions: Auto-Poll Switch, Emergency Stop, Profile */}
      <JXStack direction="row" spacing="md" className="items-center">
        {/* 15s Auto-Poll Toggle */}
        <div className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-slate-950/60 border border-slate-800/80">
          <JXSwitch
            checked={autoPollEnabled}
            onChange={(checked) => setAutoPollEnabled(checked)}
            size="sm"
            label="Auto-poll 15s"
          />
        </div>

        {/* Emergency All-Stop Hold-to-Confirm Button */}
        {isEmergencyStopActive ? (
          <JXButton
            variant="contained"
            color="success"
            size="sm"
            onClick={() => resumeFleet()}
            startIcon={<PlayCircle className="w-4 h-4" />}
            className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold"
          >
            Resume Fleet
          </JXButton>
        ) : (
          <HoldToConfirmButton
            label="Emergency All-Stop"
            tone="danger"
            variant="solid"
            holdDurationMs={1200}
            onConfirm={() => triggerEmergencyStop()}
          />
        )}

        {/* Telemetry Export & Help Quick Actions */}
        <JXStack direction="row" spacing="xs" className="items-center">
          <JXButton
            variant="text"
            color="neutral"
            size="sm"
            title="Export Telemetry Log"
            className="p-2 text-slate-400 hover:text-slate-100"
          >
            <Download className="w-4 h-4" />
          </JXButton>
          <JXButton
            variant="text"
            color="neutral"
            size="sm"
            title="Keyboard Shortcuts"
            className="p-2 text-slate-400 hover:text-slate-100"
          >
            <HelpCircle className="w-4 h-4" />
          </JXButton>
        </JXStack>

        {/* Operator Profile Session */}
        <div className="pl-2 border-l border-slate-800/80 flex items-center gap-3">
          <JXAvatar
            name={operatorProfile.name}
            status="online"
            size="sm"
            shape="squircle"
            className="border border-slate-700/80"
          />
          <div className="hidden xl:flex flex-col text-left">
            <span className="text-xs font-semibold text-slate-200 leading-tight">
              {operatorProfile.name}
            </span>
            <span className="text-[10px] font-mono text-indigo-400 tracking-tight leading-tight">
              {operatorProfile.role}
            </span>
          </div>
        </div>
      </JXStack>
    </JXBox>
  );
};

