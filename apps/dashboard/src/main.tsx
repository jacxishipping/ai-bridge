import React from "react";
import { createRoot } from "react-dom/client";
import { JXThemeProvider } from "@jacxishippingorg/jx-ui-react";
import "./tailwind.css";
import "./fluent2.css";
import "./jxui.css";
import App from "./App";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <JXThemeProvider defaultMode="dark" storageKey="ai_bridge_theme">
      <App />
    </JXThemeProvider>
  </React.StrictMode>
);
