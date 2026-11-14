import React from "react";
import { ProductStatusDot } from "../ui";

/** Compact data freshness line for tables and telemetry headers. */
export const Freshness: React.FC<{
  checkedAt?: Date | number | null;
  loading?: boolean;
  staleAfterMs?: number;
  label?: string;
}> = ({ checkedAt, loading, staleAfterMs = 60_000, label = "Updated" }) => {
  if (loading) {
    return (
      <span role="status" className="inline-flex items-center gap-2 text-xs text-[var(--product-text-tertiary)]">
        <ProductStatusDot status="idle" pulse={false} />
        Refreshing…
      </span>
    );
  }
  if (!checkedAt) {
    return (
      <span role="status" className="inline-flex items-center gap-2 text-xs text-[var(--product-text-tertiary)]">
        <ProductStatusDot status="offline" pulse={false} />
        Not loaded
      </span>
    );
  }
  const ts = typeof checkedAt === "number" ? checkedAt * (checkedAt < 1e12 ? 1000 : 1) : checkedAt.getTime();
  const age = Date.now() - ts;
  const stale = age > staleAfterMs;
  const absolute = new Date(ts).toLocaleString();
  const relative =
    age < 5_000 ? "just now" :
    age < 60_000 ? `${Math.floor(age / 1000)}s ago` :
    age < 3_600_000 ? `${Math.floor(age / 60_000)}m ago` :
    `${Math.floor(age / 3_600_000)}h ago`;
  return (
    <span
      role="status"
      title={absolute}
      className={`inline-flex items-center gap-2 text-xs tabular-nums ${stale ? "text-amber-300" : "text-[var(--product-text-tertiary)]"}`}
    >
      <ProductStatusDot status={stale ? "warn" : "online"} pulse={!stale} />
      {stale ? "Stale · " : ""}{label} {relative}
    </span>
  );
};
