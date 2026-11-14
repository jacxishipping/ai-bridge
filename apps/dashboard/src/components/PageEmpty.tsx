import React from "react";
import { MagneticButton, ProductGlass, JXButton } from "../ui";

/** Centered empty state with one primary action — used across fleet pages. */
export const PageEmpty: React.FC<{
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
  demo?: boolean;
}> = ({ title, description, actionLabel, onAction, secondaryLabel, onSecondary, demo }) => (
  <ProductGlass className="px-6 py-12">
    <div role="status" className="flex flex-col items-center justify-center gap-3 text-center">
      {demo && (
        <span className="rounded-full border border-amber-500/40 bg-amber-950/40 px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-wide text-amber-200">
          Sample data mode
        </span>
      )}
      <h3 className="text-base font-semibold text-[var(--product-text)]">{title}</h3>
      {description && (
        <p className="max-w-md text-sm text-[var(--product-text-tertiary)]">{description}</p>
      )}
      {(actionLabel || secondaryLabel) && (
        <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
          {actionLabel && onAction && (
            <MagneticButton
              variant="solid"
              tone="primary"
              className="inline-flex items-center rounded-xl px-4 py-2 text-sm"
              onClick={onAction}
            >
              {actionLabel}
            </MagneticButton>
          )}
          {secondaryLabel && onSecondary && (
            <JXButton variant="outlined" color="neutral" onClick={onSecondary}>{secondaryLabel}</JXButton>
          )}
        </div>
      )}
    </div>
  </ProductGlass>
);
