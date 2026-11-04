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
  JXBox, JXButton as Button, JXCard as Card, JXChip, JXTabs as Tabs, JXTextField as TextField,
} from "@jacxishippingorg/jx-ui-react";
import { X } from "lucide-react";

export * from "@jacxishippingorg/jx-ui-react";

// v3.0's lockWidth forces every control to at least 180px, including icons and
// controls in narrow grids. Use content sizing; loading labels remain explicit.
export function JXButton(props: React.ComponentProps<typeof Button>) {
  return <Button {...props} lockWidth={false} halo={false}
    className={`max-w-full whitespace-normal! h-auto! py-2 shadow-none! rounded-lg! ${props.className || ""}`} />;
}

export function JXStack({ direction = "row", spacing = "sm", className = "", children, ...props }:
  React.HTMLAttributes<HTMLDivElement> & { direction?: "row" | "col"; spacing?: "xs" | "sm" | "md" | "lg" }) {
  const gap = { xs: "gap-1.5", sm: "gap-2.5", md: "gap-4", lg: "gap-6" }[spacing];
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
  return <Card {...props} spotlight={false} hoverLift={false} className={`rounded-xl! shadow-none! ${props.className || ""}`} />;
}

/** Use normal title/body hierarchy instead of the library's accent kicker. */
export function JXCardHeader({ title, subheader, icon }: { title: string; subheader?: string; icon?: React.ReactNode }) {
  return <div className="mb-3 flex items-start justify-between gap-3">
    <div className="min-w-0">
      <h2 className="text-sm font-semibold text-slate-100">{title}</h2>
      {subheader && <p className="mt-1 text-xs leading-relaxed text-slate-400">{subheader}</p>}
    </div>
    {icon && <span aria-hidden="true" className="shrink-0 text-slate-400">{icon}</span>}
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
    <div role="group" aria-label="View sections" className="flex flex-wrap gap-2 rounded-xl bg-slate-800 p-1"
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
    className={`block w-full h-2 overflow-hidden rounded-full [&::-webkit-progress-bar]:bg-slate-800 [&::-webkit-progress-value]:bg-indigo-500 [&::-moz-progress-bar]:bg-indigo-500 ${className}`}>{value}%</progress>;
}

export function GlassModal({ open = true, onClose, title, children }:
  React.PropsWithChildren<{ open?: boolean; onClose?: () => void; title?: string }>) {
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
    className="m-auto w-[calc(100%-2rem)] max-w-2xl max-h-[90dvh] overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-0 text-slate-100 shadow-2xl backdrop:bg-slate-950/80 backdrop:backdrop-blur-sm">
    <JXBox padding="lg" border={false} className="min-w-0">
      <div className="mb-5 flex items-center justify-between gap-4">
        <h2 id={titleId} className="text-base font-semibold">{title}</h2>
        <button type="button" onClick={onClose} aria-label="Close dialog"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-slate-300 hover:bg-slate-800">
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
      {open && children}
    </JXBox>
  </dialog>;
}
