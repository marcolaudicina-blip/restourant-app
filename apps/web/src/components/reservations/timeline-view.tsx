"use client";

import { isoWeekday, minutesToTime, timeToMinutes } from "@restourant/shared";
import { Globe } from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { api, ApiError, describeError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { byName, statusColor } from "@/lib/labels";
import { useConfig, useRestaurantMutation } from "@/lib/queries";
import { useRestaurant } from "@/lib/restaurant";
import type { Reservation, Table } from "@/lib/types";
import { useToast } from "../ui/toast";

/*
 * The day as a grid: one row per table, one column every 15 minutes, a bar per booking. Bars are
 * dragged sideways to change the time and up or down to change the table; an empty slot opens a new
 * booking on that table at that time.
 */

const SLOT = 15;
const SLOT_WIDTH = 28;
const ROW_HEIGHT = 44;
const LABEL_WIDTH = 104;
/** Pointer movement below this is a tap, not a drag. */
const DRAG_THRESHOLD = 6;
const HIDDEN = new Set(["cancelled", "no_show"]);

type Range = { start: number; end: number };
type Drag = {
  id: string;
  fromTableId: string | null;
  x: number;
  y: number;
  dx: number;
  dy: number;
  moved: boolean;
};

const floor15 = (m: number) => Math.floor(m / SLOT) * SLOT;
const ceil60 = (m: number) => Math.ceil(m / 60) * 60;
const startOf = (r: Reservation) => timeToMinutes(r.time);

export function TimelineView({
  date,
  reservations,
  onEdit,
  onCreate,
}: {
  date: string;
  reservations: Reservation[];
  onEdit: (reservation: Reservation) => void;
  onCreate: (preset: { time: string; tableIds: string[] }) => void;
}) {
  const config = useConfig();
  const { today, timezone } = useRestaurant();
  const toast = useToast();
  const [serviceId, setServiceId] = useState<string | "day">("day");
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  const visible = useMemo(() => reservations.filter((r) => !HIDDEN.has(r.status)), [reservations]);
  const services = useMemo(() => {
    const weekday = isoWeekday(date);
    return (config.data?.services ?? []).filter((s) => s.isActive && s.daysOfWeek.includes(weekday));
  }, [config.data, date]);

  const range: Range = useMemo(() => {
    const duration = config.data?.bookingPolicy.defaultDurationMinutes ?? 120;
    const chosen = serviceId === "day" ? services : services.filter((s) => s.id === serviceId);
    const starts = chosen.map((s) => timeToMinutes(s.firstArrival));
    const ends = chosen.map((s) => timeToMinutes(s.lastArrival) + duration);
    if (serviceId === "day") {
      starts.push(...visible.map(startOf));
      ends.push(...visible.map((r) => startOf(r) + r.durationMinutes));
    }
    if (starts.length === 0) return { start: 11 * 60, end: 24 * 60 };
    return { start: floor15(Math.min(...starts) - 30), end: ceil60(Math.max(...ends)) };
  }, [config.data, services, serviceId, visible]);

  const lanes = useMemo(() => {
    const rooms = [...(config.data?.rooms ?? [])]
      .filter((r) => r.isActive)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    const tables = (config.data?.tables ?? []).filter((t) => t.isActive);
    return rooms
      .map((room) => ({ room, tables: tables.filter((t) => t.roomId === room.id).sort(byName) }))
      .filter((g) => g.tables.length > 0);
  }, [config.data]);

  const unassigned = visible.filter((r) => r.tableIds.length === 0);
  const byTable = useMemo(() => {
    const map = new Map<string, Reservation[]>();
    for (const r of visible) for (const id of r.tableIds) map.set(id, [...(map.get(id) ?? []), r]);
    return map;
  }, [visible]);

  const slots = (range.end - range.start) / SLOT;
  const width = slots * SLOT_WIDTH;
  const x = (minutes: number) => ((minutes - range.start) / SLOT) * SLOT_WIDTH;
  const nowMinutes = (() => {
    if (date !== today()) return null;
    const [h, m] = new Intl.DateTimeFormat("it-IT", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: timezone,
    })
      .format(new Date())
      .split(":")
      .map(Number);
    const value = h! * 60 + m!;
    return value >= range.start && value <= range.end ? value : null;
  })();

  // Open where the action is: now (today) or the first booking, with a little context on the left.
  const focus = nowMinutes ?? (visible.length > 0 ? Math.min(...visible.map(startOf)) : null);
  useEffect(() => {
    if (scroller.current && focus !== null) {
      scroller.current.scrollLeft = Math.max(0, x(focus) - SLOT_WIDTH * 6);
    }
    // Only when the day, the service or the first booking change, not on every refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, range.start, focus === null]);

  // Moving: tables first when only tables change, time first otherwise (the server checks both).
  const moveTables = useRestaurantMutation(
    (base, vars: { id: string; tableIds: string[]; ignoreCapacity?: boolean }) =>
      api<Reservation>(`${base}/reservations/${vars.id}/tables`, {
        method: "PUT",
        body: { tableIds: vars.tableIds, ignoreCapacity: vars.ignoreCapacity },
      }),
    ["reservations", "availability", "activity"],
  );
  const moveTime = useRestaurantMutation(
    (base, vars: { id: string; time: string; ignorePacing?: boolean }) =>
      api<Reservation>(`${base}/reservations/${vars.id}`, {
        method: "PATCH",
        body: { time: vars.time, ignorePacing: vars.ignorePacing },
      }),
    ["reservations", "availability", "activity"],
  );

  /** Runs a change; when the server only warns (too small table, busy slot) staff may confirm. */
  async function withOverride<T>(run: (force: boolean) => Promise<T>, codes: string[]): Promise<T | null> {
    try {
      return await run(false);
    } catch (e) {
      if (
        e instanceof ApiError &&
        codes.includes(e.code) &&
        confirm(`${e.message.split(". Puoi")[0]}. Procedere comunque?`)
      ) {
        return run(true);
      }
      throw e;
    }
  }

  async function drop(
    reservation: Reservation,
    fromTableId: string | null,
    toTableId: string | null,
    deltaSlots: number,
  ) {
    const minutes = startOf(reservation) + deltaSlots * SLOT;
    if (minutes < 0 || minutes >= 1440) {
      toast.error("Si può spostare solo entro la giornata");
      return;
    }
    const time = minutesToTime(minutes);
    const tableIds =
      toTableId && toTableId !== fromTableId
        ? [
            ...new Set(
              fromTableId
                ? reservation.tableIds.map((id) => (id === fromTableId ? toTableId : id))
                : [toTableId],
            ),
          ]
        : null;
    try {
      if (deltaSlots !== 0) {
        await withOverride(
          (force) => moveTime.mutateAsync({ id: reservation.id, time, ignorePacing: force || undefined }),
          ["pacing_covers", "pacing_bookings", "service_full"],
        );
      }
      if (tableIds) {
        await withOverride(
          (force) =>
            moveTables.mutateAsync({ id: reservation.id, tableIds, ignoreCapacity: force || undefined }),
          ["capacity_mismatch"],
        );
      }
      toast.success(`${reservation.guestName}: ${time}${tableIds ? `, tavolo ${tableName(tableIds)}` : ""}`);
    } catch (e) {
      toast.error(describeError(e));
    }
  }

  const tableName = (ids: string[]) =>
    ids.map((id) => config.data?.tables.find((t) => t.id === id)?.name ?? "?").join("+");

  function onBarDown(event: ReactPointerEvent, reservation: Reservation, tableId: string | null) {
    if (event.button !== 0) return;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    const state = {
      id: reservation.id,
      fromTableId: tableId,
      x: event.clientX,
      y: event.clientY,
      dx: 0,
      dy: 0,
      moved: false,
    };
    dragRef.current = state;
    setDrag(state);
  }

  function onBarMove(event: ReactPointerEvent) {
    const current = dragRef.current;
    if (!current) return;
    const dx = event.clientX - current.x;
    const dy = event.clientY - current.y;
    const next = { ...current, dx, dy, moved: current.moved || Math.hypot(dx, dy) > DRAG_THRESHOLD };
    dragRef.current = next;
    setDrag(next);
  }

  function onBarUp(event: ReactPointerEvent, reservation: Reservation) {
    const current = dragRef.current;
    dragRef.current = null;
    setDrag(null);
    if (!current) return;
    if (!current.moved) return onEdit(reservation);
    // The row under the pointer tells the target table.
    const target = document
      .elementsFromPoint(event.clientX, event.clientY)
      .find((el) => el instanceof HTMLElement && el.dataset.laneTable !== undefined) as
      HTMLElement | undefined;
    const toTableId = target?.dataset.laneTable || null;
    const deltaSlots = Math.round(current.dx / SLOT_WIDTH);
    if (deltaSlots === 0 && (toTableId ?? current.fromTableId) === current.fromTableId) return;
    void drop(reservation, current.fromTableId, toTableId ?? current.fromTableId, deltaSlots);
  }

  function onLaneClick(event: ReactMouseEvent<HTMLDivElement>, table: Table) {
    if (event.target !== event.currentTarget) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const minutes = range.start + Math.floor((event.clientX - rect.left) / SLOT_WIDTH) * SLOT;
    // The grid runs past midnight to show stays ending late; new bookings belong to this day.
    if (minutes >= 1440) return;
    onCreate({ time: minutesToTime(minutes), tableIds: [table.id] });
  }

  // Plain render functions, not components: a component defined here would be remounted on every
  // render and lose the pointer in the middle of a drag.
  function bar(reservation: Reservation, tableId: string | null) {
    const color = statusColor(reservation.status);
    const left = x(startOf(reservation));
    const barWidth = Math.max(SLOT_WIDTH, (reservation.durationMinutes / SLOT) * SLOT_WIDTH) - 2;
    const dragging = drag?.id === reservation.id && drag.fromTableId === tableId && drag.moved;
    const others = reservation.tableIds.filter((id) => id !== tableId);
    return (
      <button
        key={`${reservation.id}-${tableId ?? "none"}`}
        type="button"
        onPointerDown={(e) => onBarDown(e, reservation, tableId)}
        onPointerMove={onBarMove}
        onPointerUp={(e) => onBarUp(e, reservation)}
        onPointerCancel={() => {
          dragRef.current = null;
          setDrag(null);
        }}
        aria-label={`${reservation.guestName}, ${reservation.partySize} persone, ore ${reservation.time}`}
        className={cn(
          "absolute top-1 flex h-[36px] touch-none select-none items-center gap-1 overflow-hidden rounded-md border-l-4 px-1.5 text-left text-xs",
          dragging ? "z-20 cursor-grabbing opacity-90 shadow-lg" : "z-10 cursor-grab hover:brightness-95",
        )}
        style={{
          left: left + 1,
          width: barWidth,
          backgroundColor: `${color}2e`,
          borderLeftColor: color,
          transform: dragging ? `translate(${drag.dx}px, ${drag.dy}px)` : undefined,
        }}
      >
        <span className="min-w-0 flex-1 truncate leading-tight">
          <span className="font-semibold">{reservation.guestName}</span>
          <span className="text-ink/70"> · {reservation.partySize}</span>
          {others.length > 0 && <span className="text-ink/60"> · +{tableName(others)}</span>}
        </span>
        {reservation.channel === "online" && (
          <Globe className="h-3 w-3 shrink-0 text-violet-700" aria-label="Online" />
        )}
      </button>
    );
  }

  const header = (
    <div className="sticky top-0 z-30 flex border-b border-line bg-surface">
      <div
        className="sticky left-0 z-40 shrink-0 border-r border-line bg-surface"
        style={{ width: LABEL_WIDTH }}
      />
      <div className="relative h-8 shrink-0" style={{ width }}>
        {Array.from({ length: slots + 1 }, (_, i) => range.start + i * SLOT)
          .filter((m) => m % 60 === 0)
          .map((m) => (
            <span
              key={m}
              className="absolute top-1.5 -translate-x-1/2 text-xs font-medium tabular-nums text-muted"
              style={{ left: x(m) }}
            >
              {minutesToTime(m % 1440)}
            </span>
          ))}
      </div>
    </div>
  );

  const grid = (
    <div
      className="pointer-events-none absolute inset-y-0"
      style={{
        left: LABEL_WIDTH,
        width,
        backgroundImage: `repeating-linear-gradient(to right, var(--color-line) 0 1px, transparent 1px ${SLOT_WIDTH}px), repeating-linear-gradient(to right, #d6d1c7 0 1px, transparent 1px ${SLOT_WIDTH * 4}px)`,
        backgroundPosition: `${-(((range.start % 60) / SLOT) * SLOT_WIDTH)}px 0, ${-(((range.start % 60) / SLOT) * SLOT_WIDTH)}px 0`,
      }}
    />
  );

  return (
    <div className="flex flex-col gap-3">
      {services.length > 1 && (
        <div className="flex w-fit rounded-lg border border-line bg-surface p-0.5 text-sm">
          {[{ id: "day", name: "Giornata" }, ...services].map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setServiceId(s.id)}
              className={cn(
                "rounded-md px-3 py-1.5 font-medium",
                serviceId === s.id ? "bg-brand-600 text-white" : "text-muted hover:text-ink",
              )}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}
      <div
        ref={scroller}
        className="max-h-[70dvh] overflow-auto rounded-2xl border border-line bg-surface"
        data-testid="timeline"
      >
        <div className="relative" style={{ width: LABEL_WIDTH + width }}>
          {header}
          <div className="relative">
            {grid}
            {nowMinutes !== null && (
              <div
                className="pointer-events-none absolute inset-y-0 z-20 w-0.5 bg-red-500"
                style={{ left: LABEL_WIDTH + x(nowMinutes) }}
                aria-hidden
              />
            )}
            {unassigned.length > 0 &&
              lane(
                {
                  key: "unassigned",
                  label: "Senza tavolo",
                  hint: "da assegnare",
                  tableId: "",
                  highlight: true,
                },
                unassigned.map((r) => bar(r, null)),
              )}
            {lanes.map(({ room, tables }) => (
              <div key={room.id}>
                <div className="flex h-7 border-b border-line/70 bg-canvas">
                  <div
                    className="sticky left-0 z-20 flex shrink-0 items-center border-r border-line bg-canvas px-3 text-xs font-semibold uppercase tracking-wide text-muted"
                    style={{ width: LABEL_WIDTH }}
                  >
                    {room.name}
                  </div>
                  <div className="shrink-0" style={{ width }} />
                </div>
                {tables.map((table) =>
                  lane(
                    {
                      key: table.id,
                      label: table.name,
                      hint: `${table.minCovers}-${table.maxCovers}`,
                      tableId: table.id,
                      onClick: (e) => onLaneClick(e, table),
                    },
                    (byTable.get(table.id) ?? []).map((r) => bar(r, table.id)),
                  ),
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
      <p className="text-xs text-muted">
        Trascina una prenotazione per cambiare orario o tavolo; tocca uno spazio vuoto per crearne una.
      </p>
    </div>
  );

  function lane(
    {
      key,
      label,
      hint,
      tableId,
      highlight = false,
      onClick,
    }: {
      key: string;
      label: string;
      hint: string;
      tableId: string;
      highlight?: boolean;
      onClick?: (e: ReactMouseEvent<HTMLDivElement>) => void;
    },
    children: ReactNode,
  ) {
    return (
      <div key={key} className="flex border-b border-line/70" style={{ height: ROW_HEIGHT }}>
        <div
          className={cn(
            "sticky left-0 z-20 flex shrink-0 items-baseline gap-1.5 border-r border-line px-3 pt-3",
            highlight ? "bg-violet-50" : "bg-surface",
          )}
          style={{ width: LABEL_WIDTH }}
        >
          <span className="truncate text-sm font-semibold">{label}</span>
          <span className="text-xs text-muted">{hint}</span>
        </div>
        <div
          data-lane-table={tableId}
          onClick={onClick}
          className={cn("relative shrink-0", onClick && "cursor-cell")}
          style={{ width }}
          aria-label={tableId ? `Tavolo ${label}` : label}
        >
          {children}
        </div>
      </div>
    );
  }
}
