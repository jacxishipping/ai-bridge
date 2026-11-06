/**
 * AI Bridge Enterprise Dashboard — Application Shell
 * Assembles SidebarNav, TopHeader, CommandPaletteModal, and primary content container.
 * Strict JXUI Primitives. ZERO inline styles.
 */

import React, { useEffect, useRef, useState } from "react";
import { GlassModal, JXButton } from "../ui";
import { motion } from "motion/react";
import { Keyboard, X } from "lucide-react";
import { SidebarNav } from "./SidebarNav";
import { TopHeader } from "./TopHeader";
import { CommandPaletteModal } from "./CommandPaletteModal";
import { token, sessionToken, clearCredentials } from "../api";
import type { ViewId } from "../types/dashboard";

export interface ViewMetadata {
  title: string;
  domain: string;
  breadcrumbs: string[];
}

export interface AppShellProps {
  children?: React.ReactNode;
  currentView?: ViewId;
  viewMeta?: ViewMetadata;
}

export const AppShell: React.FC<AppShellProps> = ({ children }) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const mainRef = useRef<HTMLElement>(null);
  const view = window.location.hash;
  useEffect(() => {
    mainRef.current?.scrollTo(0, 0);
    mainRef.current?.focus({ preventScroll: true });
  }, [view]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "?" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const target = e.target as HTMLElement;
        if (target && ("value" in target || target.isContentEditable)) return;
        setHelpOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <div lang="en" dir="ltr" className="product-shell h-dvh w-full flex text-slate-100 overflow-hidden">
      <a href="#main-content" onClick={(event) => { event.preventDefault(); mainRef.current?.focus(); }}
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-indigo-600 focus:p-3 focus:text-white">
        Skip to content
      </a>
      <aside className="hidden lg:block shrink-0"><SidebarNav /></aside>
      <GlassModal open={menuOpen} onClose={() => setMenuOpen(false)} title="Navigation">
        <div className="h-[65dvh]"><SidebarNav onNavigate={() => setMenuOpen(false)} /></div>
      </GlassModal>
      <GlassModal open={helpOpen} onClose={() => setHelpOpen(false)} title="Keyboard shortcuts">
        <div className="space-y-3 text-sm text-slate-300">
          <div className="flex items-center justify-between gap-4"><span>Search / Command palette</span><kbd className="rounded border border-slate-700 px-1.5 py-0.5 text-xs">Ctrl K</kbd></div>
          <div className="flex items-center justify-between gap-4"><span>Skip to main content</span><kbd className="rounded border border-slate-700 px-1.5 py-0.5 text-xs">Tab</kbd></div>
          <div className="flex items-center justify-between gap-4"><span>Toggle this help</span><kbd className="rounded border border-slate-700 px-1.5 py-0.5 text-xs">?</kbd></div>
          <div className="flex items-center justify-between gap-4"><span>Close modal / menu</span><kbd className="rounded border border-slate-700 px-1.5 py-0.5 text-xs">Esc</kbd></div>
        </div>
      </GlassModal>

      {/* Primary Viewport Column */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        {/* Sticky Control Plane Top Header */}
        <TopHeader onMenu={() => setMenuOpen(true)} />
        {Boolean(token() || sessionToken()) ? (
          <div role="note" className="shrink-0 border-b border-emerald-800/40 bg-emerald-950/20 px-4 py-2 text-xs text-emerald-400 sm:px-6 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="inline-block h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              <strong className="font-medium text-emerald-300">Live Control Plane</strong> · Connected to {typeof window !== "undefined" ? window.location.host : ""}
            </div>
            <button type="button" onClick={() => { clearCredentials(); window.location.hash = "#/login"; window.location.reload(); }} className="text-xs text-slate-400 hover:text-slate-200 underline">Sign out</button>
          </div>
        ) : (
          <div role="note" className="shrink-0 border-b border-slate-800 bg-slate-900/40 px-4 py-2 text-xs text-slate-400 sm:px-6 flex items-center justify-between">
            <div>
              <strong className="font-medium text-slate-300">Demo workspace</strong> · Sample data. Actions stay in this browser.
            </div>
            <button type="button" onClick={() => { window.location.hash = "#/login"; }} className="text-xs text-indigo-400 hover:text-indigo-200 underline">Connect server</button>
          </div>
        )}

        {/* Scrollable Viewport Canvas with subtle entrance motion */}
        <motion.main
          id="main-content"
          ref={mainRef}
          tabIndex={-1}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.15 }}
          className="product-content flex-1 min-w-0 overflow-y-auto overflow-x-hidden p-3 sm:p-5 focus:outline-none"
        >
          <div className="mx-auto w-full max-w-[1440px]">{children}</div>
        </motion.main>
      </div>

      {/* Global Command Palette Modal (⌘K) */}
      <CommandPaletteModal />
    </div>
  );
};

export default AppShell;
