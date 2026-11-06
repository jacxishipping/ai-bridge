import React, { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";
import { JXButton } from "./ui";
import { useLanguage } from "./i18n";

const STORAGE_KEY = "ai_bridge_theme";

export type ThemeMode = "dark" | "light" | "system";

function getSystemTheme(): "dark" | "light" {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function getResolvedTheme(): "dark" | "light" {
  const saved = localStorage.getItem(STORAGE_KEY) as ThemeMode | null;
  if (saved === "light" || saved === "dark") return saved;
  return getSystemTheme();
}

export function applyTheme(mode: ThemeMode) {
  const resolved = mode === "system" ? getSystemTheme() : mode;
  document.documentElement.dataset.theme = resolved;
  try { localStorage.setItem(STORAGE_KEY, mode); } catch { /* storage blocked */ }
}

export function initializeTheme() {
  const saved = localStorage.getItem(STORAGE_KEY) as ThemeMode | null;
  applyTheme(saved || "system");
}

export function ThemeControl() {
  const { t } = useLanguage();
  const [mode, setMode] = useState<ThemeMode>(() => {
    return (localStorage.getItem(STORAGE_KEY) as ThemeMode) || "system";
  });

  useEffect(() => {
    applyTheme(mode);
  }, [mode]);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => { if (mode === "system") applyTheme("system"); };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [mode]);

  const resolved = mode === "system" ? getSystemTheme() : mode;
  const next: ThemeMode = resolved === "dark" ? "light" : "dark";

  return (
    <JXButton
      color="neutral"
      variant="outlined"
      size="sm"
      aria-label={t(resolved === "dark" ? "Switch to light theme" : "Switch to dark theme")}
      title={t(resolved === "dark" ? "Switch to light theme" : "Switch to dark theme")}
      onClick={() => setMode(next)}
      startIcon={resolved === "dark" ? <Sun className="h-4 w-4 shrink-0" /> : <Moon className="h-4 w-4 shrink-0" />}
    >
      <span className="hidden sm:inline">{resolved === "dark" ? t("Light") : t("Dark")}</span>
    </JXButton>
  );
}
