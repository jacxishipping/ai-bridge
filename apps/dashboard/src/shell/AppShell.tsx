/**
 * AI Bridge Enterprise Dashboard — Application Shell
 * Assembles SidebarNav, TopHeader, CommandPaletteModal, and primary content container.
 * Strict JXUI Primitives. ZERO inline styles.
 */

import React, { useEffect, useRef, useState } from "react";
import { GlassModal } from "../ui";
import { motion } from "motion/react";
import { SidebarNav } from "./SidebarNav";
import { TopHeader } from "./TopHeader";
import { CommandPaletteModal } from "./CommandPaletteModal";
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
  const mainRef = useRef<HTMLElement>(null);
  const view = window.location.hash;
  useEffect(() => {
    mainRef.current?.scrollTo(0, 0);
    mainRef.current?.focus({ preventScroll: true });
  }, [view]);
  return (
    <div className="product-shell h-dvh w-full flex text-slate-100 overflow-hidden">
      <a href="#main-content" onClick={(event) => { event.preventDefault(); mainRef.current?.focus(); }}
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-indigo-600 focus:p-3 focus:text-white">
        Skip to content
      </a>
      <aside className="hidden lg:block shrink-0"><SidebarNav /></aside>
      <GlassModal open={menuOpen} onClose={() => setMenuOpen(false)} title="Navigation">
        <div className="h-[65dvh]"><SidebarNav onNavigate={() => setMenuOpen(false)} /></div>
      </GlassModal>

      {/* Primary Viewport Column */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        {/* Sticky Control Plane Top Header */}
        <TopHeader onMenu={() => setMenuOpen(true)} />
        <div role="note" className="shrink-0 border-b border-slate-800 bg-slate-900/40 px-4 py-2 text-xs text-slate-400 sm:px-6">
          <strong className="font-medium text-slate-300">Demo workspace</strong> · Sample data. Actions stay in this browser.
        </div>

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
