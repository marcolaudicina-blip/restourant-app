import { reservations } from "@restourant/db";
import { instantToLocal, normalizeTime } from "@restourant/shared";
import { and, asc, eq, gt, gte, max } from "drizzle-orm";
import type { TenantContext } from "../../lib/context.js";
import { getRestaurant } from "../restaurants/restaurants.service.js";

/*
 * What every device in the restaurant polls every few seconds: has anything changed (then it
 * refreshes its lists), which bookings just arrived from the booking page (alert the staff), and how
 * many requests are waiting for an answer. Cheap on purpose: one index-backed query each.
 */

const MAX_NEW = 20;
const MAX_PENDING = 50;

type Brief = { id: string; guestName: string; partySize: number; date: string; time: string; status: string };

const brief = {
  id: reservations.id,
  guestName: reservations.guestName,
  partySize: reservations.partySize,
  date: reservations.date,
  time: reservations.startTime,
  status: reservations.status,
};

const toBrief = (row: Omit<Brief, "time"> & { time: string }): Brief => ({
  ...row,
  time: normalizeTime(row.time),
});

export async function getActivity(ctx: TenantContext, since: Date | null, now: Date) {
  const scope = eq(reservations.restaurantId, ctx.restaurantId);
  const restaurant = await getRestaurant(ctx);
  const today = instantToLocal(now, restaurant.timezone).date;

  const [[last], created, pending] = await Promise.all([
    ctx.db
      .select({ at: max(reservations.updatedAt) })
      .from(reservations)
      .where(scope),
    since
      ? ctx.db
          .select(brief)
          .from(reservations)
          .where(and(scope, eq(reservations.channel, "online"), gt(reservations.createdAt, since)))
          .orderBy(asc(reservations.createdAt))
          .limit(MAX_NEW)
      : Promise.resolve([]),
    ctx.db
      .select(brief)
      .from(reservations)
      .where(and(scope, eq(reservations.status, "requested"), gte(reservations.date, today)))
      .orderBy(asc(reservations.startsAt))
      .limit(MAX_PENDING),
  ]);

  return {
    /** Pass it back as `since` next time. */
    serverTime: new Date().toISOString(),
    lastChangeAt: last?.at?.toISOString() ?? null,
    newOnline: created.map(toBrief),
    pendingRequests: pending.map(toBrief),
  };
}
