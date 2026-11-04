import React from "react";

/** One identity across authentication, live operations and the preview shell. */
export function Brand({ compact = false }: { compact?: boolean }) {
  return <div className="product-brand">
    <img src={`${import.meta.env.BASE_URL}brand-mark.svg`} width={34} height={34} alt="" />
    <span className={compact ? "sr-only" : ""}>AI Bridge</span>
  </div>;
}

/** Abstract product artwork, not a simulated dashboard or a security claim. */
export function BrandArt() {
  return <svg viewBox="0 0 480 480" fill="none" aria-hidden="true" focusable="false">
    <circle cx="240" cy="240" r="202" stroke="#22334b" />
    <circle cx="240" cy="240" r="142" stroke="#22334b" strokeDasharray="3 9" />
    <path d="M102 140H172L204 206M378 140H308L276 206M102 340H172L204 274M378 340H308L276 274" stroke="#4b75b4" strokeWidth="1.5" />
    {[[70, 108], [346, 108], [70, 308], [346, 308]].map(([x, y]) => <g key={`${x}:${y}`}>
      <rect x={x} y={y} width="64" height="64" rx="16" fill="#111b29" stroke="#3c506c" />
      <rect x={x + 18} y={y + 19} width="28" height="20" rx="4" stroke="#a7b7cd" strokeWidth="1.5" />
      <path d={`M${x + 26} ${y + 45}h12M${x + 32} ${y + 39}v6`} stroke="#a7b7cd" strokeWidth="1.5" strokeLinecap="round" />
    </g>)}
    <rect x="190" y="190" width="100" height="100" rx="28" fill="#2563eb" stroke="#6095f9" />
    <path d="M213 260V220M267 260V220M213 230C228 230 228 247 240 247C252 247 252 230 267 230M213 260H267" stroke="white" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="172" cy="140" r="4" fill="#a9c6ff" /><circle cx="308" cy="340" r="4" fill="#a9c6ff" />
  </svg>;
}
