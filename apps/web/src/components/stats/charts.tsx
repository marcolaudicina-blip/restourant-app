"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";

/*
 * Plain HTML charts in one hue (magnitude, a single series): thin bars with rounded data ends on a
 * recessive baseline, a tooltip on hover or focus, and a few axis labels. Pages pair them with a
 * table view for exact figures.
 */

type Bar = { key: string; value: number; axis: string; tooltip: string };

export function BarChart({ bars, label, height = 160 }: { bars: Bar[]; label: string; height?: number }) {
  const [active, setActive] = useState<string | null>(null);
  const max = Math.max(1, ...bars.map((b) => b.value));
  // Label every n-th bar so axis text never collides.
  const step = Math.max(1, Math.ceil(bars.length / 10));
  const hovered = bars.find((b) => b.key === active);
  return (
    <figure aria-label={label} className="relative">
      <div
        className="relative flex items-end justify-center gap-[2px] border-b border-line"
        style={{ height }}
      >
        {bars.map((b) => (
          <button
            key={b.key}
            type="button"
            aria-label={b.tooltip}
            onMouseEnter={() => setActive(b.key)}
            onMouseLeave={() => setActive(null)}
            onFocus={() => setActive(b.key)}
            onBlur={() => setActive(null)}
            className="group flex h-full min-w-0 max-w-12 flex-1 items-end focus:outline-none"
          >
            <span
              className={cn(
                "block w-full rounded-t-[4px] bg-brand-500 transition-colors",
                active === b.key ? "bg-brand-700" : "group-hover:bg-brand-600",
              )}
              style={{ height: b.value ? `${Math.max(2, (b.value / max) * 100)}%` : 0 }}
            />
          </button>
        ))}
        {hovered && (
          <div
            role="tooltip"
            className="pointer-events-none absolute -top-2 left-1/2 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md bg-ink px-2 py-1 text-xs text-white shadow"
          >
            {hovered.tooltip}
          </div>
        )}
      </div>
      <div className="mt-1 flex justify-center gap-[2px] text-[11px] text-muted">
        {bars.map((b, i) => (
          <span key={b.key} className="min-w-0 max-w-12 flex-1 overflow-visible whitespace-nowrap">
            {i % step === 0 ? b.axis : ""}
          </span>
        ))}
      </div>
      <figcaption className="sr-only">{label}</figcaption>
    </figure>
  );
}

type Row = { key: string; label: string; value: number; display: string };

export function HorizontalBars({ rows, labelWidth = "w-12" }: { rows: Row[]; labelWidth?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="flex flex-col gap-2">
      {rows.map((r) => (
        <li key={r.key} className="flex items-center gap-3 text-sm">
          <span className={cn("shrink-0 text-muted", labelWidth)}>{r.label}</span>
          <span className="h-3 flex-1">
            <span
              className="block h-full rounded-r-[4px] bg-brand-500"
              style={{ width: r.value ? `${Math.max(1, (r.value / max) * 100)}%` : 0 }}
            />
          </span>
          <span className="shrink-0 text-right tabular-nums">{r.display}</span>
        </li>
      ))}
    </ul>
  );
}
