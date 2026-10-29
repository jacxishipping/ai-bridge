import React, { useEffect } from "react";

/**
 * Shared table pagination, used by Devices, Tasks, Audit and Fleet nodes.
 * Renders nothing when everything fits on one page.
 */
export const Pager: React.FC<{
  total: number;
  page: number;
  pageSize: number;
  onPage: (page: number) => void;
}> = ({ total, page, pageSize, onPage }) => {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  // Clamp the page when a filter shrinks the list below the current page
  // (e.g. searching while on page 3), instead of showing an empty table.
  useEffect(() => {
    if (page >= pageCount) onPage(pageCount - 1);
    else if (page < 0) onPage(0);
  }, [total, page, pageSize, pageCount, onPage]);
  if (total <= pageSize) return null;
  const start = page * pageSize + 1;
  const end = Math.min(total, (page + 1) * pageSize);
  // Compact page window: first, last, and neighbours of the current page.
  const pages: number[] = [];
  for (let i = 0; i < pageCount; i++) {
    if (i === 0 || i === pageCount - 1 || Math.abs(i - page) <= 1) pages.push(i);
  }
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginTop: 12 }}>
      <span style={{ fontSize: 12, color: "var(--colorNeutralForeground3)" }}>
        Showing {start}–{end} of {total}
      </span>
      <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
        <button type="button" className="f2-btn f2-btn-sm" disabled={page === 0} onClick={() => onPage(page - 1)}>
          ← Prev
        </button>
        {pages.map((p, idx) => (
          <React.Fragment key={p}>
            {idx > 0 && pages[idx - 1] !== p - 1 && (
              <span style={{ fontSize: 12, color: "var(--colorNeutralForeground3)", padding: "0 4px" }}>…</span>
            )}
            <button
              type="button"
              className={`f2-btn f2-btn-sm${p === page ? " f2-btn-primary" : ""}`}
              aria-current={p === page ? "page" : undefined}
              onClick={() => onPage(p)}
            >
              {p + 1}
            </button>
          </React.Fragment>
        ))}
        <button type="button" className="f2-btn f2-btn-sm" disabled={page >= pageCount - 1} onClick={() => onPage(page + 1)}>
          Next →
        </button>
      </div>
    </div>
  );
};
