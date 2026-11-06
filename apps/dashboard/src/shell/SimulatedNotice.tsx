import React from "react";
import { token, sessionToken } from "../api";

/**
 * Shown on views whose content is a local simulation (not backed by the control plane yet),
 * so an authenticated operator is never misled into thinking it reflects the real fleet.
 */
export function SimulatedNotice({ feature }: { feature: string }) {
  if (typeof window === "undefined" || !(token() || sessionToken())) return null;
  return (
    <div role="alert" className="rounded-xl border border-amber-700/50 bg-amber-950/30 px-4 py-2 text-xs text-amber-300">
      <strong className="font-semibold">Simulated:</strong> {feature} is a local preview and is not connected to your live fleet.
      Nothing on this page is executed on, or read from, a real device.
    </div>
  );
}

