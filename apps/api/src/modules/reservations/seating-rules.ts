import {
  findFreeOption,
  indexBusy,
  minutesToTime,
  pacingViolation,
  slotWindows,
  timeToMinutes,
  type SeatingOption,
} from "@restourant/shared";
import { AppError, conflict, invalid } from "../../lib/errors.js";
import type { Service } from "../services/services.service.js";
import { SLOT_REASON_MESSAGES, seatingOptions } from "./availability.service.js";
import type { FloorContext } from "./floor-context.js";

/*
 * Where a booking may sit: the service of its time, pacing limits, checks on tables chosen by
 * staff, the automatic choice of tables, and how tables follow a new time or party size.
 * Pure rules over a loaded FloorContext; reservations.service.ts writes the results.
 */

/** The open service whose arrival window contains `minutes`, or the one the caller named. */
export function resolveService(
  floor: FloorContext,
  minutes: number,
  serviceId: string | null | undefined,
  required: boolean,
): Service | null {
  if (serviceId) {
    const service = floor.serviceById(serviceId);
    if (!service) throw invalid("Servizio non trovato", [{ path: "serviceId", message: serviceId }]);
    return service;
  }
  const open = floor
    .schedule("staff")
    .find(
      (s) =>
        s.status === "open" &&
        timeToMinutes(s.firstArrival) <= minutes &&
        minutes <= timeToMinutes(s.lastArrival),
    );
  if (open) return floor.serviceById(open.serviceId)!;
  if (required) {
    throw new AppError(
      400,
      "outside_service_hours",
      `Nessun servizio aperto alle ${minutesToTime(minutes)}: scegli il servizio esplicitamente per forzare`,
    );
  }
  return null;
}

export function assertPacing(floor: FloorContext, service: Service, start: number, partySize: number) {
  const day = floor.schedule("staff").find((s) => s.serviceId === service.id);
  const interval = service.slotIntervalMinutes ?? floor.policy.slotIntervalMinutes;
  const windows = day && day.slots.length > 0 ? slotWindows(day.slots, interval) : [];
  const window = windows.find((w) => w.start <= start && start < w.end) ?? { start, end: start + interval };
  const violation = pacingViolation(window, partySize, floor.loadByService.get(service.id) ?? [], service);
  if (violation)
    throw conflict(violation, `${SLOT_REASON_MESSAGES[violation]}. Puoi forzare con ignorePacing`);
}

export type Seating = { tableIds: string[]; durationMinutes: number; option: SeatingOption | null };

/** Validates tables picked by staff: they exist, fit the party (unless forced) and are free. */
export function checkChosenTables(
  floor: FloorContext,
  tableIds: string[],
  start: number,
  durationMinutes: number,
  partySize: number,
  ignoreCapacity: boolean,
) {
  const chosen = tableIds.map((id) => floor.tables.find((t) => t.id === id));
  const missing = tableIds.filter((_, i) => !chosen[i]);
  if (missing.length > 0) {
    throw invalid(
      "Tavolo non trovato in questo ristorante",
      missing.map((id) => ({ path: "tableIds", message: id })),
    );
  }
  const tables = chosen.map((t) => t!);
  const inactive = tables.filter((t) => !t.isActive);
  if (inactive.length > 0) {
    throw conflict("table_inactive", `Tavolo non attivo: ${inactive.map((t) => t.name).join(", ")}`);
  }

  const capacity = tables.reduce((sum, t) => sum + t.maxCovers, 0);
  const tooBig = tables.length === 1 && partySize < tables[0]!.minCovers;
  if (!ignoreCapacity && (capacity < partySize || tooBig)) {
    throw conflict(
      "capacity_mismatch",
      tooBig
        ? `Il tavolo ${tables[0]!.name} è da almeno ${tables[0]!.minCovers} persone. Puoi forzare con ignoreCapacity`
        : `I tavoli scelti hanno ${capacity} posti per ${partySize} persone. Puoi forzare con ignoreCapacity`,
    );
  }

  const end = start + durationMinutes;
  // Blocks that only close a table to online bookings don't stop staff.
  const clashes = floor.busy.filter(
    (b) => !b.onlineOnly && tableIds.includes(b.tableId) && b.start < end && start < b.end,
  );
  const names = (ids: string[]) =>
    [...new Set(ids)].map((id) => tables.find((t) => t.id === id)!.name).join(", ");
  const blocked = clashes.filter((c) => c.blockId);
  if (blocked.length > 0) {
    throw conflict(
      "table_blocked",
      `Tavolo bloccato in quell'orario: ${names(blocked.map((c) => c.tableId))}`,
    );
  }
  if (clashes.length > 0) {
    throw conflict(
      "table_taken",
      `Tavolo già occupato in quell'orario: ${names(clashes.map((c) => c.tableId))}`,
    );
  }
}

/**
 * Picks the tables for a stay. Staff-chosen tables are validated; otherwise the best free option is
 * taken from the ranked list: single tables, then combinations, then joined tables, by priority.
 */
export function seat(
  floor: FloorContext,
  args: {
    service: Service | null;
    start: number;
    partySize: number;
    tableIds?: string[];
    durationMinutes?: number;
    roomId?: string | null;
    ignoreCapacity: boolean;
  },
): Seating {
  const durationFor = (roomId: string | null) =>
    args.durationMinutes ?? floor.durationFor(args.partySize, args.service?.id ?? null)(roomId);

  if (args.tableIds) {
    const roomId = floor.tables.find((t) => t.id === args.tableIds![0])?.roomId ?? null;
    const durationMinutes = durationFor(roomId);
    checkChosenTables(floor, args.tableIds, args.start, durationMinutes, args.partySize, args.ignoreCapacity);
    return { tableIds: [...args.tableIds].sort(), durationMinutes, option: null };
  }

  const options = seatingOptions(floor, args.service, args.partySize, "staff", args.roomId);
  if (options.length === 0) {
    throw conflict("no_suitable_table", `Nessun tavolo o combinazione adatta a ${args.partySize} persone`);
  }
  const free = findFreeOption(options, args.start, durationFor, indexBusy(floor.busy, "staff"));
  if (!free) {
    throw conflict(
      "no_table_available",
      `Nessun tavolo libero per ${args.partySize} persone alle ${minutesToTime(args.start % 1440)}`,
    );
  }
  return { tableIds: free.option.tableIds, durationMinutes: free.durationMinutes, option: free.option };
}

/**
 * New time or party size for a booking that has tables: the same tables when they still work;
 * otherwise part of them (fewer people free the joined ones), otherwise the best free tables,
 * also in another room. Only when nothing is free does staff get the original warning (and may
 * force the current tables).
 */
export function reseat(
  floor: FloorContext,
  args: Omit<Parameters<typeof seat>[1], "tableIds">,
  current: string[],
  /** Fewer people than before: joined tables no longer needed are freed. */
  fewer: boolean,
): Seating {
  const durationFor = (roomId: string | null) =>
    args.durationMinutes ?? floor.durationFor(args.partySize, args.service?.id ?? null)(roomId);
  const own = (smaller: boolean) => {
    const options = seatingOptions(floor, args.service, args.partySize, "staff").filter(
      (o) =>
        o.tableIds.every((id) => current.includes(id)) && (!smaller || o.tableIds.length < current.length),
    );
    // Fewer people: keep as few of the current tables as possible (a combination too gives way).
    if (smaller) options.sort((a, b) => a.tableIds.length - b.tableIds.length);
    const free = findFreeOption(options, args.start, durationFor, indexBusy(floor.busy, "staff"));
    return free
      ? { tableIds: free.option.tableIds, durationMinutes: free.durationMinutes, option: free.option }
      : null;
  };
  if (fewer && current.length > 1) {
    const smaller = own(true);
    if (smaller) return smaller;
  }
  // Tables in a room the service at the new time doesn't use (another day, another service): new ones.
  const rooms = args.service?.roomIds ?? [];
  const inRooms = current.every((id) => {
    const roomId = floor.tables.find((t) => t.id === id)?.roomId;
    return rooms.length === 0 || (roomId !== undefined && rooms.includes(roomId));
  });
  if (!inRooms) return seat(floor, args);
  try {
    return seat(floor, { ...args, tableIds: current });
  } catch (error) {
    if (
      !(error instanceof AppError) ||
      !["capacity_mismatch", "table_taken", "table_blocked", "table_inactive"].includes(error.code)
    )
      throw error;
    const kept = own(false);
    if (kept) return kept;
    try {
      return seat(floor, args);
    } catch {
      throw error;
    }
  }
}
