import React, { useLayoutEffect } from "react";
import { createRoot } from "react-dom/client";
import { JXThemeProvider, useJXTheme } from "@jacxishippingorg/jx-ui-react";
import "./tailwind.css";
import App from "./App";
import { consumeIdentityRedirect } from "./api";
import { dashboardStore } from "./state/dashboardStore";

if (consumeIdentityRedirect()) dashboardStore.syncRoute();

function DashboardTheme({ children }: React.PropsWithChildren) {
  const { mode, setMode } = useJXTheme();
  // Views currently have one supported palette. A legacy light preference
  // must not mix light library surfaces with dark-only operational content.
  useLayoutEffect(() => { if (mode !== "dark") setMode("dark"); }, [mode, setMode]);
  return children;
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <JXThemeProvider defaultMode="dark" storageKey="ai_bridge_theme">
      <DashboardTheme><App /></DashboardTheme>
    </JXThemeProvider>
  </React.StrictMode>
);
