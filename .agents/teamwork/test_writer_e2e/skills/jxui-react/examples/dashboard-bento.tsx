import React, { useState } from "react";
import {
  JXThemeProvider,
  JXButton,
  TiltCard,
  BentoGrid,
  SparklineChart,
  CommandPalette,
  useJXTheme
} from "@jacxishippingorg/jx-ui-react";
import { Server, ShieldCheck, Activity, Terminal } from "lucide-react";

export function ModernEnterpriseDashboard() {
  const [cmdOpen, setCmdOpen] = useState(false);
  const { mode, setMode } = useJXTheme();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-8 font-sans">
      <header className="flex items-center justify-between pb-8 border-b border-white/10">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-white flex items-center gap-2">
            <span>AI Bridge Orchestrator</span>
            <span className="text-xs bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 px-2 py-0.5 rounded-full font-bold">
              JXUI PRO
            </span>
          </h1>
          <p className="text-sm text-slate-400">Tactile Autonomous Fleet Telemetry & Edge Operations</p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setCmdOpen(true)}
            className="flex items-center gap-3 px-4 py-2 rounded-xl bg-slate-900 border border-white/10 text-sm text-slate-300 hover:border-indigo-500/50 hover:bg-slate-800 transition-all"
          >
            <span>Command Palette</span>
            <kbd className="px-1.5 py-0.5 text-xs bg-slate-800 border border-white/10 rounded font-mono">⌘K</kbd>
          </button>

          <JXButton
            variant="contained"
            color="primary"
            onClick={() => setMode(mode === "dark" ? "light" : "dark")}
          >
            Toggle {mode === "dark" ? "Light" : "Dark"}
          </JXButton>
        </div>
      </header>

      <main className="mt-8 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <TiltCard title="Enrolled Fleet" className="bg-slate-900/60 border border-white/10 backdrop-blur-xl">
            <div className="flex items-center justify-between mt-2">
              <span className="text-3xl font-extrabold text-white">4 / 4</span>
              <Server className="w-6 h-6 text-indigo-400" />
            </div>
            <p className="text-xs text-emerald-400 mt-2 font-medium">● All agents healthy</p>
          </TiltCard>

          <TiltCard title="Tasks Throughput" className="bg-slate-900/60 border border-white/10 backdrop-blur-xl">
            <div className="flex items-center justify-between mt-2">
              <span className="text-3xl font-extrabold text-white">200</span>
              <Activity className="w-6 h-6 text-purple-400" />
            </div>
            <p className="text-xs text-slate-400 mt-2">175 completed · 15 queued</p>
          </TiltCard>

          <TiltCard title="Security Posture" className="bg-slate-900/60 border border-white/10 backdrop-blur-xl">
            <div className="flex items-center justify-between mt-2">
              <span className="text-3xl font-extrabold text-white">100%</span>
              <ShieldCheck className="w-6 h-6 text-emerald-400" />
            </div>
            <p className="text-xs text-emerald-400 mt-2">Zero policy breaches</p>
          </TiltCard>

          <TiltCard title="MCP Gateway" className="bg-slate-900/60 border border-white/10 backdrop-blur-xl">
            <div className="flex items-center justify-between mt-2">
              <span className="text-3xl font-extrabold text-white">Port 8001</span>
              <Terminal className="w-6 h-6 text-sky-400" />
            </div>
            <p className="text-xs text-sky-400 mt-2">66 OAuth clients active</p>
          </TiltCard>
        </div>
      </main>

      <CommandPalette
        isOpen={cmdOpen}
        onClose={() => setCmdOpen(false)}
        items={[
          { id: "dispatch", title: "Dispatch Shell Command", onSelect: () => console.log("dispatch") },
          { id: "enroll", title: "Enroll New Machine", onSelect: () => console.log("enroll") }
        ]}
      />
    </div>
  );
}
