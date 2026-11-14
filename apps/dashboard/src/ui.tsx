/**
 * Product-safe compositions for JXUI 3.0.
 *
 * Some 3.0 exports are interactive showcases rather than layout primitives:
 * Stack wraps every child in a bordered tile; Badge adds a notification bell;
 * LinearProgress includes build-demo controls. Keep those defaults out of the
 * control plane while retaining JXUI surfaces, buttons, inputs and tokens.
 * Native dialog supplies the focus trap, inert background and Escape behavior
 * missing from GlassModal. Remove these adapters when upstream supports them.
 */
import React, { useEffect, useId, useRef, useState } from "react";
import {
  AdaptiveGlass,
  BentoGrid,
  BreadcrumbTrail,
  FloatingActionButton,
  FrostedGlass,
  GlassToolbar,
  HoldToConfirmButton,
  InteractiveCard,
  MagneticButton,
  NumberCounter,
  ShimmerButton,
  SlideToAction,
  TiltCard,
  JXAlert as Alert, JXBox, JXButton as Button, JXCard as Card, JXChip, JXTabs as Tabs, JXTextField as TextField,
} from "@jacxishippingorg/jx-ui-react";
import { TrendingUp, TrendingDown, Minus, X, Wifi, WifiOff } from "lucide-react";

export * from "@jacxishippingorg/jx-ui-react";
export {
  AdaptiveGlass,
  BentoGrid,
  BreadcrumbTrail,
  FloatingActionButton,
  FrostedGlass,
  GlassToolbar,
  HoldToConfirmButton,
  InteractiveCard,
  MagneticButton,
  NumberCounter,
  ShimmerButton,
  SlideToAction,
  TiltCard,
};

export function JXAlert(props: React.ComponentProps<typeof Alert>) {
  return <Alert {...props} technicalDetails={props.technicalDetails ?? ""} actionLabel={props.actionLabel ?? ""} />;
}

// v3.0's lockWidth forces every control to at least 180px, including icons and
// controls in narrow grids. Use content sizing; loading labels remain explicit.
export function JXButton(props: React.ComponentProps<typeof Button> & { tactile?: boolean }) {
  const { tactile, ...rest } = props;
  return <Button {...rest} lockWidth={false} halo={Boolean(tactile)} spring={Boolean(tactile)}
    data-tone={props.color || "primary"} data-variant={props.variant || "contained"}
    className={`product-button max-w-full whitespace-normal! h-auto! ${tactile ? "" : "shadow-none!"} rounded-md! ${props.className || ""}`} />;
}

/** Compact operational metric tile built on InteractiveCard (JXUI advanced). */
export function ProductMetricCard({
  label, value, hint, trend, onClick, className = "",
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  trend?: "up" | "down" | "flat";
  onClick?: () => void;
  className?: string;
}) {
  const TrendIcon = trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : Minus;
  const trendTone = trend === "up" ? "text-emerald-400" : trend === "down" ? "text-rose-400" : "text-[var(--product-text-tertiary)]";
  const numeric = typeof value === "number" ? value : null;
  return (
    <InteractiveCard
      hoverLift
      className={`product-surface rounded-2xl! border border-[var(--product-line)]! bg-[var(--product-surface)]/70! p-0! shadow-none! ${className}`}
    >
      <button type="button" onClick={onClick} className="flex w-full flex-col gap-1 p-4 text-left">
        <span className="text-xs font-medium text-[var(--product-text-tertiary)]">{label}</span>
        <span className="flex items-baseline gap-2">
          {numeric !== null ? (
            <span className="[&>div]:text-[var(--product-text)]! [&>div]:text-2xl! [&>div]:font-semibold!">
              <NumberCounter value={numeric} />
            </span>
          ) : (
            <span className="font-mono text-2xl font-semibold tabular-nums text-[var(--product-text)]">{value}</span>
          )}
          {trend && <TrendIcon className={`h-3.5 w-3.5 ${trendTone}`} aria-hidden="true" />}
        </span>
        {hint && <span className="text-[11px] text-[var(--product-text-dim)]">{hint}</span>}
      </button>
    </InteractiveCard>
  );
}

/** Glass surface for hero / wizard panels without breaking operational density elsewhere. */
export function ProductGlass({ children, className = "" }: React.PropsWithChildren<{ className?: string }>) {
  return (
    <AdaptiveGlass className={`rounded-2xl border border-[var(--product-line)] bg-[var(--product-surface)]/50 ${className}`}>
      {children}
    </AdaptiveGlass>
  );
}

/** Status radar — product wrapper because library PulseIndicator/StatusIndicator are fixed demos. */
export function ProductStatusDot({
  status = "online",
  label,
  pulse = true,
  className = "",
}: {
  status?: "online" | "offline" | "warn" | "idle";
  label?: string;
  pulse?: boolean;
  className?: string;
}) {
  const tone =
    status === "online" ? "bg-emerald-400" :
    status === "warn" ? "bg-amber-400" :
    status === "idle" ? "bg-slate-400" :
    "bg-rose-500";
  const text =
    status === "online" ? "text-emerald-400" :
    status === "warn" ? "text-amber-400" :
    status === "idle" ? "text-[var(--product-text-tertiary)]" :
    "text-rose-400";
  return (
    <span className={`inline-flex items-center gap-2 ${className}`} role="status">
      <span className="relative flex h-2.5 w-2.5 shrink-0 items-center justify-center">
        {pulse && status === "online" && (
          <span className={`absolute inline-flex h-full w-full rounded-full opacity-60 animate-ping ${tone}`} />
        )}
        <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${tone}`} />
      </span>
      {label && <span className={`text-[11px] font-semibold ${text}`}>{label}</span>}
    </span>
  );
}

/** Sliding pill selector — SegmentedControl in the package is a Daily/Weekly stub. */
export function ProductSegmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel = "Options",
  className = "",
}: {
  options: Array<{ id: T; label: string }>;
  value: T;
  onChange: (id: T) => void;
  ariaLabel?: string;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={`inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-xl border border-[var(--product-line)] bg-[var(--product-raised)]/80 p-1 ${className}`}
    >
      {options.map((opt) => {
        const active = opt.id === value;
        return (
          <button
            key={opt.id}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(opt.id)}
            className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-mono transition-all ${
              active
                ? "bg-indigo-600 font-semibold text-white shadow-sm"
                : "text-[var(--product-text-tertiary)] hover:text-[var(--product-text-secondary)]"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

/** Live / demo island pill (ConnectionStatus / LiveActivity in the package are hardcoded). */
export function ProductModePill({
  live,
  detail,
  className = "",
}: {
  live: boolean;
  detail?: string;
  className?: string;
}) {
  return (
    <span
      role="status"
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs shadow-sm ${
        live
          ? "border-emerald-500/40 bg-emerald-950/50 text-emerald-200"
          : "border-amber-500/40 bg-amber-950/40 text-amber-100"
      } ${className}`}
    >
      {live ? <Wifi className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> : <WifiOff className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
      <ProductStatusDot status={live ? "online" : "warn"} pulse={live} />
      <span className="font-medium">{live ? "Live" : "Demo"}</span>
      {detail && <span className="max-w-[14rem] truncate opacity-80">{detail}</span>}
    </span>
  );
}

/** Compact glass notice for post-action feedback. */
export function ProductNotice({
  children,
  tone = "info",
  className = "",
}: React.PropsWithChildren<{ tone?: "info" | "success" | "warning" | "error"; className?: string }>) {
  const tones = {
    info: "border-indigo-500/30 bg-indigo-500/10 text-indigo-200",
    success: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
    warning: "border-amber-500/30 bg-amber-500/10 text-amber-100",
    error: "border-rose-500/30 bg-rose-500/10 text-rose-200",
  };
  return (
    <div role="status">
      <ProductGlass className={`px-3 py-2 text-xs font-mono ${tones[tone]} ${className}`}>
        {children}
      </ProductGlass>
    </div>
  );
}

/** Wizard / enrollment step rail — MultiStepProgress in the package is a fixed demo. */
export function ProductStepProgress({
  steps,
  current,
  className = "",
}: {
  steps: string[];
  current: number;
  className?: string;
}) {
  return (
    <ol className={`flex flex-wrap items-center gap-2 text-xs ${className}`} aria-label="Progress">
      {steps.map((step, index) => {
        const done = index < current;
        const active = index === current;
        return (
          <li key={step} className="flex items-center gap-2">
            {index > 0 && (
              <span className={`h-0.5 w-5 ${done || active ? "bg-indigo-500" : "bg-[var(--product-line)]"}`} aria-hidden="true" />
            )}
            <span
              className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${
                done || active
                  ? "bg-indigo-600 text-white"
                  : "bg-[var(--product-raised)] text-[var(--product-text-tertiary)]"
              }`}
              aria-current={active ? "step" : undefined}
            >
              {index + 1}
            </span>
            <span className={active ? "font-semibold text-[var(--product-text)]" : "text-[var(--product-text-tertiary)]"}>
              {step}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** Dense filter/action strip on AdaptiveGlass. */
export function ProductToolbar({ children, className = "" }: React.PropsWithChildren<{ className?: string }>) {
  return (
    <GlassToolbar>
      <div className={`flex flex-wrap items-center gap-2 ${className}`}>{children}</div>
    </GlassToolbar>
  );
}

export function JXStack({ direction = "row", spacing = "sm", className = "", children, ...props }:
  React.HTMLAttributes<HTMLDivElement> & { direction?: "row" | "col"; spacing?: "xs" | "sm" | "md" | "lg" }) {
  const gap = { xs: "gap-1", sm: "gap-2", md: "gap-3", lg: "gap-4" }[spacing];
  return <div {...props} className={`flex min-w-0 ${direction === "col" ? "flex-col" : "flex-row"} ${gap} ${className}`}>{children}</div>;
}

export function JXGridItem({ colSpan = 12, rowSpan, className = "", ...props }:
  React.HTMLAttributes<HTMLDivElement> & { colSpan?: number; rowSpan?: number }) {
  const span: Record<number, string> = {
    3: "col-span-12 sm:col-span-6 xl:col-span-3",
    4: "col-span-12 lg:col-span-4", 5: "col-span-12 xl:col-span-5",
    6: "col-span-12 lg:col-span-6", 7: "col-span-12 xl:col-span-7",
    8: "col-span-12 lg:col-span-8", 12: "col-span-12",
  };
  return <div {...props} className={`min-w-0 ${span[colSpan] || "col-span-12"} ${rowSpan === 2 ? "row-span-2" : ""} ${className}`} />;
}

export function JXCard(props: React.ComponentProps<typeof Card>) {
  return <Card {...props} spotlight={false} hoverLift={false} className={`product-surface rounded-xl! shadow-none! ${props.className || ""}`} />;
}

/** Use normal title/body hierarchy instead of the library's accent kicker. */
export function JXCardHeader({ title, subheader, icon }: { title: string; subheader?: string; icon?: React.ReactNode }) {
  return <div className="mb-3 flex items-start justify-between gap-3">
    <div className="min-w-0">
      <h2 className="text-sm font-semibold text-[color:var(--product-text)]">{title}</h2>
      {subheader && <p className="mt-1 text-xs leading-relaxed text-[color:var(--product-text-tertiary)]">{subheader}</p>}
    </div>
    {icon && <span aria-hidden="true" className="shrink-0 text-[color:var(--product-text-tertiary)]">{icon}</span>}
  </div>;
}

export function JXBadge({ color = "primary", statusText, count, children, className = "" }:
  React.PropsWithChildren<{ color?: string; statusText?: string; count?: number; className?: string }>) {
  const tones = { primary: "indigo", success: "emerald", warning: "amber", error: "rose", neutral: "neutral" } as const;
  return <JXChip tone={tones[color as keyof typeof tones] || "neutral"} label={String(statusText ?? children ?? count ?? 0)} className={`text-[11px] ${className}`} />;
}

export function JXTextField(props: React.ComponentProps<typeof TextField>) {
  return <TextField {...props} showCharacterCounter={false} maxLength={props.maxLength ?? 4096}
    aria-label={props["aria-label"] || (typeof props.label === "string" ? props.label : props.placeholder) || "Text input"} />;
}

export function JXTabs({ tabs = [], value, defaultValue, onChange, className = "" }: React.ComponentProps<typeof Tabs>) {
  const [local, setLocal] = useState(defaultValue || tabs[0]?.id);
  const current = value ?? local;
  return <div className={`space-y-3 ${className}`}>
    <div role="group" aria-label="View sections" className="flex flex-wrap gap-2 rounded-xl bg-[var(--product-raised)] p-1"
      onKeyDown={(event) => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        const buttons = Array.from(event.currentTarget.querySelectorAll("button"));
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
        const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 :
          (index + (event.key === "ArrowRight" ? 1 : -1) + buttons.length) % buttons.length;
        event.preventDefault();
        buttons[next]?.focus();
        buttons[next]?.click();
      }}>
      {tabs.map((tab) => <JXButton key={tab.id} variant={current === tab.id ? "contained" : "text"}
        color={current === tab.id ? "primary" : "neutral"} aria-pressed={current === tab.id}
        startIcon={tab.icon} onClick={() => { setLocal(tab.id); onChange?.(tab.id); }}>{tab.label}</JXButton>)}
    </div>
    {tabs.find((tab) => tab.id === current)?.content}
  </div>;
}

export function JXLinearProgress({ value = 0, label = "Progress", className = "" }:
  { value?: number; label?: string; className?: string }) {
  return <progress aria-label={label} max={100} value={Math.min(100, Math.max(0, value))}
    className={`block w-full h-2 overflow-hidden rounded-full ${className}`}>{value}%</progress>;
}

export function GlassModal({ open = true, onClose, title, children, closeLabel = "Close dialog" }:
  React.PropsWithChildren<{ open?: boolean; onClose?: () => void; title?: string; closeLabel?: string }>) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const launcher = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const route = window.location.hash;
    if (open && !dialog.open) {
      dialog.showModal();
      dialog.querySelector<HTMLElement>("input:not([disabled]), textarea, select")?.focus();
    }
    if (!open && dialog.open) dialog.close();
    return () => {
      if (dialog.open) dialog.close();
      queueMicrotask(() => {
        if (launcher?.isConnected && route === window.location.hash) launcher.focus();
      });
    };
  }, [open]);
  return <dialog ref={ref} aria-labelledby={titleId}
    onCancel={(event) => { event.preventDefault(); close.current?.(); }}
    onClick={(event) => { if (event.target === event.currentTarget) close.current?.(); }}
    className="product-dialog m-auto w-[calc(100%-2rem)] max-w-2xl max-h-[90dvh] overflow-y-auto rounded-2xl border border-[color:var(--product-line)]! p-0 text-[color:var(--product-text)]! shadow-2xl backdrop:backdrop-blur-sm"
    data-dialog-backdrop>
    <JXBox padding="lg" border={false} className="min-w-0">
      <div className="mb-5 flex items-center justify-between gap-4">
        <h2 id={titleId} className="text-base font-semibold">{title}</h2>
        <button type="button" onClick={onClose} aria-label={closeLabel}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-[color:var(--product-text-tertiary)] hover:bg-[var(--product-raised)]">
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
      {open && children}
    </JXBox>
  </dialog>;
}
