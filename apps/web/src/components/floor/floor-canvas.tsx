"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import type { Table } from "@/lib/types";

/** Pixels per grid unit when the plan is fitted to the available width (before zoom). */
const MAX_FIT_SCALE = 64;
const MIN_SCALE = 10;
const SNAP = 0.5;
/** Empty margin around the plan, in grid units, so tables at 0,0 don't touch the border. */
const PAD = 0.5;
/** While editing the room extends this far past the furthest table, so tables can be moved outward. */
const EDIT_MARGIN = 6;
/** Minimum room size while editing, in grid units: roughly a 12 × 8 m dining room. */
const EDIT_MIN = { x: 24, y: 16 };

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
 * Floor plan of one room. Table geometry is in grid units; the plan is scaled to fit the available
 * width and then multiplied by `zoom`. In `editable` mode tables can be dragged (the new position is
 * reported on release) and the room grows as tables are moved outward.
 */
export function FloorCanvas({
  tables,
  adjacencies = [],
  appearance,
  onTableClick,
  editable = false,
  onMove,
  zoom = 1,
}: {
  tables: Table[];
  adjacencies?: { tableAId: string; tableBId: string }[];
  appearance: (table: Table) => TableAppearance;
  onTableClick?: (table: Table) => void;
  editable?: boolean;
  onMove?: (table: Table, position: { posX: number; posY: number }) => void;
  zoom?: number;
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

  const contentX = Math.max(0, ...tables.map((t) => t.posX + t.width));
  const contentY = Math.max(0, ...tables.map((t) => t.posY + t.height));
  const extentX = (editable ? Math.max(EDIT_MIN.x, contentX + EDIT_MARGIN) : Math.max(8, contentX + 1)) + PAD;
  const extentY = (editable ? Math.max(EDIT_MIN.y, contentY + EDIT_MARGIN) : Math.max(5, contentY + 1)) + PAD;
  const fitScale = Math.min(MAX_FIT_SCALE, (width - 2) / extentX);
  const scale = Math.max(MIN_SCALE, fitScale * zoom);
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

  // Text shrinks with the tables so small zoom levels stay readable without overflowing.
  const nameSize = Math.max(10, Math.min(16, scale * 0.32));
  const captionSize = Math.max(9, Math.min(12, scale * 0.24));

  return (
    <div ref={containerRef} className="max-h-[75dvh] w-full overflow-auto">
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
                stroke="#3f7f6c"
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
              aria-pressed={look.highlighted ?? false}
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
              <span className="font-semibold leading-tight" style={{ fontSize: nameSize }}>
                {table.name}
              </span>
              {look.caption ? (
                <span
                  className="max-w-full truncate px-1 leading-tight text-ink/80"
                  style={{ fontSize: captionSize }}
                >
                  {look.caption}
                </span>
              ) : (
                <span className="leading-tight text-muted" style={{ fontSize: captionSize }}>
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

const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3];

/** − / percentage / + / "Adatta" buttons for the floor plan. */
export function ZoomControls({ zoom, onChange }: { zoom: number; onChange: (zoom: number) => void }) {
  const index = ZOOM_STEPS.findIndex((z) => z >= zoom);
  const step = (delta: number) =>
    onChange(ZOOM_STEPS[Math.min(ZOOM_STEPS.length - 1, Math.max(0, (index < 0 ? 2 : index) + delta))]!);
  return (
    <div className="flex items-center rounded-lg border border-line bg-surface text-sm">
      <button
        onClick={() => step(-1)}
        className="px-3 py-1.5 font-semibold hover:bg-canvas"
        aria-label="Rimpicciolisci"
      >
        −
      </button>
      <button
        onClick={() => onChange(1)}
        className="min-w-16 border-x border-line px-2 py-1.5 tabular-nums hover:bg-canvas"
        title="Adatta alla larghezza"
      >
        {zoom === 1 ? "Adatta" : `${Math.round(zoom * 100)}%`}
      </button>
      <button
        onClick={() => step(1)}
        className="px-3 py-1.5 font-semibold hover:bg-canvas"
        aria-label="Ingrandisci"
      >
        +
      </button>
    </div>
  );
}
