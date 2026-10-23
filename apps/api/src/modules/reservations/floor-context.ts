import { reservations, reservationTables, tableBlocks } from "@restourant/db";
import {
  buildDaySchedule,
  isBlockingStatus,
  localToInstant,
  resolveDuration,
  wallMinutesFrom,
  type BusyInterval,
  type Channel,
  type ServiceLoad,
  type ServiceSchedule,
} from "@restourant/shared";
import { and, eq, gt, lt } from "drizzle-orm";
import type { TenantContext } from "../../lib/context.js";
import {
  listCalendarExceptions,
  toCalendarException,
} from "../calendar-exceptions/calendar-exceptions.service.js";
import { listCombinations } from "../combinations/combinations.service.js";
import { listDurationRules } from "../duration-rules/duration-rules.service.js";
import { getBookingPolicy, getRestaurant } from "../restaurants/restaurants.service.js";
import { listRooms } from "../rooms/rooms.service.js";
import { listServices, type Service } from "../services/services.service.js";
import { listAdjacencies, listTables } from "../tables/tables.service.js";

/**
 * Everything needed to decide where and when a party can sit on a given date: the floor plan,
 * the rules, and what is already occupied. Loaded once per request and handed to the pure
 * functions in @restourant/shared.
 */
export type FloorContext = Awaited<ReturnType<typeof loadFloorContext>>;

/** Reservations from the previous evening can run past midnight; look this far around the date. */
const WINDOW_BEFORE_MINUTES = -12 * 60;
const WINDOW_AFTER_MINUTES = 36 * 60;

export async function loadFloorContext(
  ctx: TenantContext,
  date: string,
  options: { excludeReservationId?: string } = {},
) {
  const [restaurant, policy, rooms, tables, adjacencies, combinations, services, durationRules, exceptions] =
    await Promise.all([
      getRestaurant(ctx),
      getBookingPolicy(ctx),
      listRooms(ctx),
      listTables(ctx),
      listAdjacencies(ctx),
      listCombinations(ctx),
      listServices(ctx),
      listDurationRules(ctx),
      listCalendarExceptions(ctx, { from: date, to: date }),
    ]);
  const timezone = restaurant.timezone;
  const windowStart = localToInstant(date, WINDOW_BEFORE_MINUTES, timezone);
  const windowEnd = localToInstant(date, WINDOW_AFTER_MINUTES, timezone);
  const toMinutes = (instant: Date) => wallMinutesFrom(date, instant, timezone);

  const [held, blocks, dayReservations] = await Promise.all([
    ctx.db
      .select({
        reservationId: reservationTables.reservationId,
        tableId: reservationTables.tableId,
        startsAt: reservationTables.startsAt,
        endsAt: reservationTables.endsAt,
      })
      .from(reservationTables)
      .where(
        and(
          eq(reservationTables.restaurantId, ctx.restaurantId),
          eq(reservationTables.blocking, true),
          lt(reservationTables.startsAt, windowEnd),
          gt(reservationTables.endsAt, windowStart),
        ),
      ),
    ctx.db
      .select()
      .from(tableBlocks)
      .where(
        and(
          eq(tableBlocks.restaurantId, ctx.restaurantId),
          lt(tableBlocks.startsAt, windowEnd),
          gt(tableBlocks.endsAt, windowStart),
        ),
      ),
    ctx.db
      .select({
        id: reservations.id,
        serviceId: reservations.serviceId,
        startsAt: reservations.startsAt,
        partySize: reservations.partySize,
        status: reservations.status,
      })
      .from(reservations)
      .where(and(eq(reservations.restaurantId, ctx.restaurantId), eq(reservations.date, date))),
  ]);

  const tablesByRoom = Map.groupBy(tables, (t) => t.roomId);
  const busy: (BusyInterval & { reservationId: string | null; blockId: string | null })[] = [
    ...held
      .filter((h) => h.reservationId !== options.excludeReservationId)
      .map((h) => ({
        tableId: h.tableId,
        start: toMinutes(h.startsAt),
        end: toMinutes(h.endsAt),
        reservationId: h.reservationId,
        blockId: null,
      })),
    ...blocks.flatMap((b) => {
      const tableIds = b.tableId ? [b.tableId] : (tablesByRoom.get(b.roomId!) ?? []).map((t) => t.id);
      return tableIds.map((tableId) => ({
        tableId,
        start: toMinutes(b.startsAt),
        end: toMinutes(b.endsAt),
        onlineOnly: b.onlineOnly,
        reservationId: null,
        blockId: b.id,
      }));
    }),
  ];

  const loadByService = new Map<string, ServiceLoad[]>();
  for (const r of dayReservations) {
    if (!r.serviceId || r.id === options.excludeReservationId || !isBlockingStatus(r.status)) continue;
    const list = loadByService.get(r.serviceId) ?? [];
    list.push({ start: toMinutes(r.startsAt), partySize: r.partySize });
    loadByService.set(r.serviceId, list);
  }

  return {
    date,
    timezone,
    policy,
    rooms,
    tables,
    adjacencies,
    combinations,
    services,
    durationRules,
    busy,
    loadByService,
    exceptions: exceptions.map(toCalendarException),
    /** Absolute instant of a wall-clock minute on this date. */
    instantAt: (minutes: number) => localToInstant(date, minutes, timezone),
    toMinutes,
    schedule: (channel: Channel): ServiceSchedule[] =>
      buildDaySchedule({
        date,
        channel,
        defaultSlotIntervalMinutes: policy.slotIntervalMinutes,
        services,
        exceptions: exceptions.map(toCalendarException),
      }),
    durationFor: (partySize: number, serviceId: string | null) => (roomId: string | null) =>
      resolveDuration(durationRules, { partySize, serviceId, roomId }, policy.defaultDurationMinutes),
    serviceById: (id: string): Service | undefined => services.find((s) => s.id === id),
  };
}
