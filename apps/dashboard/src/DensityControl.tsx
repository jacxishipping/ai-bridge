import React, { useState } from "react";
import { useLanguage } from "./i18n";

const key = "ai_bridge_density";
export function applySavedDensity() {
  try { document.documentElement.dataset.density = localStorage.getItem(key) === "comfortable" ? "comfortable" : "compact"; }
  catch { document.documentElement.dataset.density = "compact"; }
}

export function DensityControl() {
  const { locale, t } = useLanguage();
  const [density, setDensity] = useState(document.documentElement.dataset.density || "compact");
  const [error, setError] = useState("");
  return <div lang={locale} dir="auto" className="min-w-0">
    <label className="sr-only" htmlFor="workspace-density">{t("Display density")}</label>
    <select id="workspace-density" className="product-input max-w-full border text-xs" value={density} onChange={(event) => {
      const value = event.target.value;
      setDensity(value); document.documentElement.dataset.density = value;
      try { localStorage.setItem(key, value); setError(""); }
      catch { setError("Density changed for this visit only."); }
    }}><option value="compact">{t("Compact")}</option><option value="comfortable">{t("Comfortable")}</option></select>
    {error && <p role="status" lang="en" dir="ltr" className="text-xs text-amber-300">{error}</p>}
  </div>;
}
