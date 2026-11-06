import React from "react";
import { createRoot } from "react-dom/client";
import { JXThemeProvider } from "@jacxishippingorg/jx-ui-react";
import "./tailwind.css";
import App from "./App";
import { consumeIdentityRedirect } from "./api";
import { dashboardStore } from "./state/dashboardStore";
import { applySavedDensity } from "./DensityControl";
import { initializeLanguage } from "./i18n";
import { initializeTheme } from "./ThemeControl";

if (consumeIdentityRedirect()) dashboardStore.syncRoute();
applySavedDensity();
initializeLanguage();
initializeTheme();

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <JXThemeProvider defaultMode="dark" storageKey="ai_bridge_theme">
      <App />
    </JXThemeProvider>
  </React.StrictMode>
);
