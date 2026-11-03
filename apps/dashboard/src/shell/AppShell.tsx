/**
 * AI Bridge Enterprise Dashboard — Application Shell
 * Assembles SidebarNav, TopHeader, CommandPaletteModal, and primary content container.
 * Strict JXUI Primitives. ZERO inline styles.
 */

import React from "react";
import { JXBox } from "@jacxishippingorg/jx-ui-react";
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
  return (
    <JXBox
      surface="default"
      className="min-h-screen w-full flex bg-[#0B0F19] text-slate-100 overflow-hidden font-sans"
    >
      {/* Fixed-width Navigation Rail */}
      <SidebarNav />

      {/* Primary Viewport Column */}
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        {/* Sticky Control Plane Top Header */}
        <TopHeader />

        {/* Scrollable Viewport Canvas with subtle entrance motion */}
        <motion.main
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.15 }}
          className="flex-1 overflow-y-auto bg-[#0a0e18]/60 p-6"
        >
          {children}
        </motion.main>
      </div>

      {/* Global Command Palette Modal (⌘K) */}
      <CommandPaletteModal />
    </JXBox>
  );
};

export default AppShell;
