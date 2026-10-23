"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import type { Table } from "@/lib/types";

const MAX_SCALE = 44;
const MIN_SCALE = 18;
const SNAP = 0.5;
/** Empty margin around the plan, in grid units, so tables at 0,0 don't touch the border. */
const PAD = 0.5;

export type TableAppearance = {
  /** Fill color; null for a free table. */
  color: string | null;
  /** Second line under the table name (guest, time…). */
  caption?: ReactNode;
  highlighted?: boolean;
  dimmed?: boolean;
  outlined?: string | null;
};

/**
 * Floor plan of one room. Table geometry is in grid units, scaled to fit the available width.
 * In `editable` mode tables can be dragged; the new position is reported on release.
 */
export function FloorCanvas({
  tables,
  adjacencies = [],
  appearance,
  onTableClick,
  editable = false,
  onMove,
}: {
  tables: Table[];
  adjacencies?: { tableAId: string; tableBId: string }[];
  appearance: (table: Table) => TableAppearance;
  onTableClick?: (table: Table) => void;
  editable?: boolean;
  onMove?: (table: Table, position: { posX: number; posY: number }) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  const [drag, setDrag] = useState<{
    id: string;
    dx: number;
    dy: number;
    startX: number;
    startY: number;
    moved: boolean;
  } | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => entry && setWidth(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const extentX = Math.max(12, ...tables.map((t) => t.posX + t.width)) + 1 + PAD;
  const extentY = Math.max(8, ...tables.map((t) => t.posY + t.height)) + 1 + PAD;
  const scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, (width - 2) / extentX));
  const snap = (v: number) => Math.max(0, Math.round(v / SNAP) * SNAP);

  const position = (t: Table) =>
    drag?.id === t.id
      ? { x: snap(t.posX + drag.dx / scale), y: snap(t.posY + drag.dy / scale) }
      : { x: t.posX, y: t.posY };
  const byId = new Map(tables.map((t) => [t.id, t]));

  function onPointerDown(e: ReactPointerEvent, table: Table) {
    if (!editable) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ id: table.id, dx: 0, dy: 0, startX: e.clientX, startY: e.clientY, moved: false });
  }

  function onPointerMove(e: ReactPointerEvent) {
    if (!drag) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    setDrag({ ...drag, dx, dy, moved: drag.moved || Math.hypot(dx, dy) > 4 });
  }

  function onPointerUp(table: Table) {
    if (!drag) return;
    const { x, y } = position(table);
    const moved = drag.moved;
    setDrag(null);
    if (moved && (x !== table.posX || y !== table.posY)) onMove?.(table, { posX: x, posY: y });
    else onTableClick?.(table);
  }

  return (
    <div ref={containerRef} className="w-full overflow-x-auto">
      <div
        className={cn(
          "relative rounded-xl border border-line",
          editable ? "bg-[radial-gradient(circle,#d9d5cd_1px,transparent_1px)]" : "bg-surface",
        )}
        style={{ width: extentX * scale, height: extentY * scale, backgroundSize: `${scale}px ${scale}px` }}
      >
        <svg
          className="pointer-events-none absolute inset-0"
          width={extentX * scale}
          height={extentY * scale}
        >
          {adjacencies.map(({ tableAId, tableBId }) => {
            const a = byId.get(tableAId);
            const b = byId.get(tableBId);
            if (!a || !b) return null;
            const pa = position(a);
            const pb = position(b);
            return (
              <line
                key={`${tableAId}-${tableBId}`}
                x1={(PAD + pa.x + a.width / 2) * scale}
                y1={(PAD + pa.y + a.height / 2) * scale}
                x2={(PAD + pb.x + b.width / 2) * scale}
                y2={(PAD + pb.y + b.height / 2) * scale}
                stroke="#2f8f7f"
                strokeWidth={3}
                strokeDasharray="6 5"
                strokeLinecap="round"
              />
            );
          })}
        </svg>
        {tables.map((table) => {
          const look = appearance(table);
          const { x, y } = position(table);
          const dragging = drag?.id === table.id;
          return (
            <button
              key={table.id}
              type="button"
              onPointerDown={(e) => onPointerDown(e, table)}
              onPointerMove={onPointerMove}
              onPointerUp={() => onPointerUp(table)}
              onClick={editable ? undefined : () => onTableClick?.(table)}
              aria-label={`Tavolo ${table.name}`}
              className={cn(
                "absolute flex flex-col items-center justify-center overflow-hidden border-2 text-center transition-shadow select-none",
                table.shape === "round" ? "rounded-full" : "rounded-xl",
                editable ? "cursor-grab touch-none" : "cursor-pointer",
                dragging && "z-10 cursor-grabbing shadow-xl",
                look.highlighted && "ring-4 ring-brand-500/50",
                look.dimmed && "opacity-40",
                !table.isActive && "border-dashed opacity-50",
              )}
              style={{
                left: (PAD + x) * scale,
                top: (PAD + y) * scale,
                width: table.width * scale,
                height: table.height * scale,
                transform: table.rotation ? `rotate(${table.rotation}deg)` : undefined,
                backgroundColor: look.color ? `${look.color}26` : "#f3f8f6",
                borderColor: look.outlined ?? look.color ?? "#acd8cf",
              }}
            >
              <span className="text-sm font-semibold leading-tight">{table.name}</span>
              {look.caption ? (
                <span className="max-w-full truncate px-1 text-[11px] leading-tight text-ink/80">
                  {look.caption}
                </span>
              ) : (
                <span className="text-[11px] leading-tight text-muted">
                  {table.minCovers}-{table.maxCovers}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
