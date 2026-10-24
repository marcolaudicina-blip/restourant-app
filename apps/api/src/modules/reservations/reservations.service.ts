import { diningTables, guests, reservations, reservationTables } from "@restourant/db";
import {
  canTransition,
  isBlockingStatus,
  normalizeTime,
  timeToMinutes,
  type ReservationChannel,
  type ReservationCreateInput,
  type ReservationStatus,
  type ReservationTablesInput,
  type ReservationUpdate,
} from "@restourant/shared";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { recordAudit } from "../../lib/audit.js";
import { inTransaction, type TenantContext } from "../../lib/context.js";
import { conflict, notFound, pgErrorCode, PG_EXCLUSION_VIOLATION } from "../../lib/errors.js";
import { definedOnly } from "../../lib/http.js";
import { guestStats, matchGuest } from "../guests/guests.service.js";
import type { Service } from "../services/services.service.js";
import { markWaitlistBooked } from "../waitlist/waitlist-match.js";
import { loadFloorContext, type FloorContext } from "./floor-context.js";
import {
  assertPacing,
  checkChosenTables,
  reseat,
  resolveService,
  seat,
  type Seating,
} from "./seating-rules.js";

type ReservationRow = typeof reservations.$inferSelect;

/** What staff should know about the guest when looking at a booking. */
export type GuestSummary = {
  id: string;
  fullName: string;
  tags: string[];
  profileNote: string | null;
  visits: number;
  noShows: number;
};

export type Reservation = Omit<ReservationRow, "restaurantId" | "startTime"> & {
  time: string;
  tables: { id: string; name: string }[];
  tableIds: string[];
  guest: GuestSummary | null;
};

// ---------------------------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------------------------

async function hydrate(ctx: TenantContext, rows: ReservationRow[]): Promise<Reservation[]> {
  if (rows.length === 0) return [];
  const held = await ctx.db
    .select({ reservationId: reservationTables.reservationId, id: diningTables.id, name: diningTables.name })
    .from(reservationTables)
    .innerJoin(diningTables, eq(diningTables.id, reservationTables.tableId))
    .where(
      inArray(
        reservationTables.reservationId,
        rows.map((r) => r.id),
      ),
    );
  const byReservation = Map.groupBy(held, (h) => h.reservationId);

  const guestIds = [...new Set(rows.map((r) => r.guestId).filter((id): id is string => id !== null))];
  const [guestRows, stats] = await Promise.all([
    guestIds.length
      ? ctx.db
          .select({
            id: guests.id,
            fullName: guests.fullName,
            tags: guests.tags,
            profileNote: guests.profileNote,
          })
          .from(guests)
          .where(inArray(guests.id, guestIds))
      : Promise.resolve([]),
    guestStats(ctx, guestIds),
  ]);
  const guestById = new Map(
    guestRows.map((g): [string, GuestSummary] => [
      g.id,
      { ...g, visits: stats.get(g.id)?.visits ?? 0, noShows: stats.get(g.id)?.noShows ?? 0 },
    ]),
  );

  const collator = new Intl.Collator("it", { numeric: true });
  return rows.map(({ restaurantId: _restaurantId, startTime, ...row }) => {
    const tables = (byReservation.get(row.id) ?? [])
      .map(({ id, name }) => ({ id, name }))
      .sort((a, b) => collator.compare(a.name, b.name));
    return {
      ...row,
      time: normalizeTime(startTime),
      tables,
      tableIds: tables.map((t) => t.id),
      guest: row.guestId ? (guestById.get(row.guestId) ?? null) : null,
    };
  });
}

export async function listReservations(
  ctx: TenantContext,
  query: { date: string; statuses?: ReservationStatus[] },
): Promise<Reservation[]> {
  const rows = await ctx.db
    .select()
    .from(reservations)
    .where(
      and(
        eq(reservations.restaurantId, ctx.restaurantId),
        eq(reservations.date, query.date),
        query.statuses?.length ? inArray(reservations.status, query.statuses) : undefined,
      ),
    )
    .orderBy(asc(reservations.startsAt), asc(reservations.createdAt));
  return hydrate(ctx, rows);
}

/** A guest's bookings, newest first. */
export async function listGuestReservations(ctx: TenantContext, guestId: string): Promise<Reservation[]> {
  const rows = await ctx.db
    .select()
    .from(reservations)
    .where(and(eq(reservations.restaurantId, ctx.restaurantId), eq(reservations.guestId, guestId)))
    .orderBy(desc(reservations.startsAt))
    .limit(500);
  return hydrate(ctx, rows);
}

async function getRow(ctx: TenantContext, id: string): Promise<ReservationRow> {
  const [row] = await ctx.db
    .select()
    .from(reservations)
    .where(and(eq(reservations.id, id), eq(reservations.restaurantId, ctx.restaurantId)))
    .limit(1);
  if (!row) throw notFound("Prenotazione");
  return row;
}

export async function getReservation(ctx: TenantContext, id: string): Promise<Reservation> {
  const [reservation] = await hydrate(ctx, [await getRow(ctx, id)]);
  return reservation!;
}

async function writeTables(ctx: TenantContext, reservation: ReservationRow, tableIds: string[]) {
  await ctx.db.delete(reservationTables).where(eq(reservationTables.reservationId, reservation.id));
  // Group requests from the booking page can wait for staff to pick the tables.
  if (tableIds.length === 0) return;
  await ctx.db.insert(reservationTables).values(
    tableIds.map((tableId) => ({
      restaurantId: ctx.restaurantId,
      reservationId: reservation.id,
      tableId,
      startsAt: reservation.startsAt,
      endsAt: reservation.endsAt,
      blocking: isBlockingStatus(reservation.status),
    })),
  );
}

// ---------------------------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------------------------

/** Writes a new booking, its tables and the matched guest in one transaction. Returns its id. */
export async function insertReservation(
  ctx: TenantContext,
  floor: FloorContext,
  args: {
    service: Service | null;
    start: number;
    seating: Pick<Seating, "tableIds" | "durationMinutes">;
    status: ReservationStatus;
    channel: ReservationChannel;
    /** The guest's language (online bookings); staff bookings default to Italian. */
    locale?: "it" | "en";
    input: Pick<
      ReservationCreateInput,
      | "date"
      | "time"
      | "partySize"
      | "guestId"
      | "guestName"
      | "guestPhone"
      | "guestEmail"
      | "guestNote"
      | "internalNote"
      | "roomId"
    >;
    audit: unknown;
  },
): Promise<string> {
  const { input, seating, status } = args;
  return inTransaction(ctx, async (tx) => {
    const guestId = await matchGuest(tx, {
      guestId: input.guestId,
      name: input.guestName,
      phone: input.guestPhone,
      email: input.guestEmail,
    });
    const [row] = await tx.db
      .insert(reservations)
      .values({
        restaurantId: ctx.restaurantId,
        guestId,
        serviceId: args.service?.id ?? null,
        date: input.date,
        startTime: input.time,
        startsAt: floor.instantAt(args.start),
        endsAt: floor.instantAt(args.start + seating.durationMinutes),
        durationMinutes: seating.durationMinutes,
        partySize: input.partySize,
        status,
        channel: args.channel,
        locale: args.locale ?? "it",
        guestName: input.guestName,
        guestPhone: input.guestPhone ?? null,
        guestEmail: input.guestEmail ?? null,
        guestNote: input.guestNote ?? null,
        internalNote: input.internalNote ?? null,
        requestedRoomId: input.roomId ?? null,
        createdByUserId: ctx.actorUserId,
        seatedAt: status === "seated" ? new Date() : null,
      })
      .returning();
    await writeTables(tx, row!, seating.tableIds);
    await markWaitlistBooked(tx, row!);
    await recordAudit(tx, {
      entity: "reservation",
      entityId: row!.id,
      action: "create",
      changes: args.audit,
    });
    return row!.id;
  });
}

export async function createReservation(
  ctx: TenantContext,
  input: ReservationCreateInput,
): Promise<Reservation> {
  const floor = await loadFloorContext(ctx, input.date);
  const start = timeToMinutes(input.time);
  const channel = input.channel ?? "staff";
  const status = input.status ?? (channel === "walk_in" ? "seated" : "confirmed");
  const service = resolveService(floor, start, input.serviceId, channel !== "walk_in");

  if (service && !input.ignorePacing) assertPacing(floor, service, start, input.partySize);
  const seating = seat(floor, {
    service,
    start,
    partySize: input.partySize,
    tableIds: input.tableIds,
    durationMinutes: input.durationMinutes,
    roomId: input.roomId,
    ignoreCapacity: input.ignoreCapacity ?? false,
  });

  const id = await insertReservation(ctx, floor, {
    service,
    start,
    seating,
    status,
    channel,
    locale: input.locale,
    input,
    audit: { ...input, tableIds: seating.tableIds, assignedBy: seating.option ? "system" : "staff" },
  });
  return getReservation(ctx, id);
}

export async function updateReservation(
  ctx: TenantContext,
  id: string,
  patch: ReservationUpdate,
): Promise<Reservation> {
  const current = await getRow(ctx, id);
  const { reassignTables, ignorePacing, ignoreCapacity, ...fields } = definedOnly(patch);
  const date = fields.date ?? current.date;
  const time = fields.time ?? normalizeTime(current.startTime);
  const partySize = fields.partySize ?? current.partySize;
  const moved = date !== current.date || time !== normalizeTime(current.startTime);
  const resized = partySize !== current.partySize;
  const rescheduled = moved || resized || fields.durationMinutes !== undefined || reassignTables === true;

  let schedule: Partial<ReservationRow> = {};
  let tableIds: string[] | null = null;
  let previousTableIds: string[] = [];

  if (rescheduled) {
    const floor = await loadFloorContext(ctx, date, { excludeReservationId: id });
    const start = timeToMinutes(time);
    const service = moved
      ? resolveService(floor, start, null, current.channel !== "walk_in")
      : current.serviceId
        ? (floor.serviceById(current.serviceId) ?? null)
        : null;
    if (service && isBlockingStatus(current.status) && !ignorePacing && (moved || resized)) {
      assertPacing(floor, service, start, partySize);
    }

    const currentTableIds = (
      await ctx.db
        .select({ tableId: reservationTables.tableId })
        .from(reservationTables)
        .where(eq(reservationTables.reservationId, id))
    ).map((r) => r.tableId);
    const keepDuration = !resized && fields.durationMinutes === undefined;
    const seatArgs = {
      service,
      start,
      partySize,
      durationMinutes: fields.durationMinutes ?? (keepDuration ? current.durationMinutes : undefined),
      roomId: current.requestedRoomId,
      ignoreCapacity: ignoreCapacity ?? false,
    };
    const seating =
      reassignTables !== undefined ||
      currentTableIds.length === 0 ||
      !isBlockingStatus(current.status) ||
      ignoreCapacity
        ? seat(floor, { ...seatArgs, tableIds: reassignTables ? undefined : currentTableIds })
        : reseat(floor, seatArgs, currentTableIds, partySize < current.partySize);

    tableIds = seating.tableIds;
    previousTableIds = currentTableIds;
    schedule = {
      serviceId: service?.id ?? null,
      date,
      startTime: time,
      startsAt: floor.instantAt(start),
      endsAt: floor.instantAt(start + seating.durationMinutes),
      durationMinutes: seating.durationMinutes,
      partySize,
      // A booking moved to another day gets its own reminder.
      ...(date !== current.date ? { reminderSentAt: null } : {}),
    };
  }

  await inTransaction(ctx, async (tx) => {
    const { date: _date, time: _time, partySize: _partySize, durationMinutes: _duration, ...guest } = fields;
    // A new phone or email can mean a different guest: match the profile again.
    const contactChanged = fields.guestPhone !== undefined || fields.guestEmail !== undefined;
    const guestId = contactChanged
      ? await matchGuest(tx, {
          name: fields.guestName ?? current.guestName,
          phone: fields.guestPhone !== undefined ? fields.guestPhone : current.guestPhone,
          email: fields.guestEmail !== undefined ? fields.guestEmail : current.guestEmail,
        })
      : undefined;
    const [row] = await tx.db
      .update(reservations)
      .set({ ...guest, ...schedule, ...(guestId !== undefined ? { guestId } : {}) })
      .where(and(eq(reservations.id, id), eq(reservations.restaurantId, ctx.restaurantId)))
      .returning();
    if (tableIds) await writeTables(tx, row!, tableIds);
    await recordAudit(tx, {
      entity: "reservation",
      entityId: id,
      action: "update",
      changes: {
        ...fields,
        ...(tableIds ? { tableIds } : {}),
        // What it was before, for the booking's history.
        from: previousValues(current, fields, tableIds ? previousTableIds : null),
      },
    });
  });
  return getReservation(ctx, id);
}

/** The stored values of the fields a patch changes (and the tables, when they move). */
function previousValues(
  current: ReservationRow,
  fields: Partial<ReservationUpdate>,
  tableIds: string[] | null,
): Record<string, unknown> {
  const stored: Record<string, unknown> = {
    date: current.date,
    time: normalizeTime(current.startTime),
    partySize: current.partySize,
    durationMinutes: current.durationMinutes,
    guestName: current.guestName,
    guestPhone: current.guestPhone,
    guestEmail: current.guestEmail,
    guestNote: current.guestNote,
    internalNote: current.internalNote,
    locale: current.locale,
  };
  const from: Record<string, unknown> = {};
  for (const key of Object.keys(fields)) if (key in stored) from[key] = stored[key];
  if (tableIds) from.tableIds = tableIds;
  return from;
}

/** Moves a reservation to other tables, or joins extra tables to it. */
export async function setReservationTables(
  ctx: TenantContext,
  id: string,
  input: ReservationTablesInput,
): Promise<Reservation> {
  const current = await getRow(ctx, id);
  const floor = await loadFloorContext(ctx, current.date, { excludeReservationId: id });
  if (isBlockingStatus(current.status)) {
    checkChosenTables(
      floor,
      input.tableIds,
      floor.toMinutes(current.startsAt),
      current.durationMinutes,
      current.partySize,
      input.ignoreCapacity ?? false,
    );
  }
  const before = (
    await ctx.db
      .select({ tableId: reservationTables.tableId })
      .from(reservationTables)
      .where(eq(reservationTables.reservationId, id))
  ).map((r) => r.tableId);
  await inTransaction(ctx, async (tx) => {
    await writeTables(tx, current, input.tableIds);
    // Moving tables is a change other devices must pick up (see getActivity).
    await tx.db.update(reservations).set({ updatedAt: new Date() }).where(eq(reservations.id, id));
    await recordAudit(tx, {
      entity: "reservation",
      entityId: id,
      action: "update",
      changes: { tableIds: input.tableIds, from: { tableIds: before } },
    });
  });
  return getReservation(ctx, id);
}

/**
 * Moves a booking to a time the caller already found free (the guest's own change, checked by the
 * online engine): new schedule, tables and status in one go. Returns false when someone else took
 * the tables in the meantime.
 */
export async function rescheduleReservation(
  ctx: TenantContext,
  floor: FloorContext,
  id: string,
  args: {
    service: Service;
    start: number;
    time: string;
    partySize: number;
    seating: Pick<Seating, "tableIds" | "durationMinutes">;
    status: ReservationStatus;
    locale?: "it" | "en";
    audit: Record<string, unknown>;
  },
): Promise<boolean> {
  try {
    await inTransaction(ctx, async (tx) => {
      const [row] = await tx.db
        .update(reservations)
        .set({
          serviceId: args.service.id,
          date: floor.date,
          startTime: args.time,
          startsAt: floor.instantAt(args.start),
          endsAt: floor.instantAt(args.start + args.seating.durationMinutes),
          durationMinutes: args.seating.durationMinutes,
          partySize: args.partySize,
          status: args.status,
          ...(args.locale ? { locale: args.locale } : {}),
          reminderSentAt: null,
        })
        .where(and(eq(reservations.id, id), eq(reservations.restaurantId, ctx.restaurantId)))
        .returning();
      await writeTables(tx, row!, args.seating.tableIds);
      await recordAudit(tx, {
        entity: "reservation",
        entityId: id,
        action: "update",
        changes: { ...args.audit, tableIds: args.seating.tableIds },
      });
    });
    return true;
  } catch (error) {
    if (pgErrorCode(error) === PG_EXCLUSION_VIOLATION) return false;
    throw error;
  }
}

export async function setReservationStatus(
  ctx: TenantContext,
  id: string,
  status: ReservationStatus,
  /** Extra details for the audit log, e.g. `{ by: "guest" }`. */
  auditNote: Record<string, unknown> = {},
): Promise<Reservation> {
  const current = await getRow(ctx, id);
  if (current.status === status) return getReservation(ctx, id);
  if (!canTransition(current.status, status)) {
    throw conflict("invalid_transition", `Non si può passare da "${current.status}" a "${status}"`);
  }

  const now = new Date();
  const timestamps: Partial<ReservationRow> = {
    seatedAt: status === "seated" ? (current.seatedAt ?? now) : current.seatedAt,
    completedAt: status === "completed" ? now : null,
    cancelledAt: status === "cancelled" ? now : null,
  };

  await inTransaction(ctx, async (tx) => {
    await tx.db
      .update(reservations)
      .set({ status, ...timestamps })
      .where(and(eq(reservations.id, id), eq(reservations.restaurantId, ctx.restaurantId)));
    // Reinstating a cancelled booking re-takes its tables; the exclusion constraint rejects it if
    // someone else got them in the meantime.
    await tx.db
      .update(reservationTables)
      .set({ blocking: isBlockingStatus(status) })
      .where(eq(reservationTables.reservationId, id));
    await recordAudit(tx, {
      entity: "reservation",
      entityId: id,
      action: "update",
      changes: { status: { from: current.status, to: status }, ...auditNote },
    });
  });
  return getReservation(ctx, id);
}
