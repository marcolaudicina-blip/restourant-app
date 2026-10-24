import { auditLog, reservations, waitlistEntries } from "@restourant/db";
import { instantToLocal, normalizeTime } from "@restourant/shared";
import { and, asc, eq, gt, gte, isNull, max, sql } from "drizzle-orm";
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

  const [[last], [lastWaitlist], created, pending, byGuests, joined] = await Promise.all([
    ctx.db
      .select({ at: max(reservations.updatedAt) })
      .from(reservations)
      .where(scope),
    ctx.db
      .select({ at: max(waitlistEntries.updatedAt) })
      .from(waitlistEntries)
      .where(eq(waitlistEntries.restaurantId, ctx.restaurantId)),
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
    // Changes guests made themselves from the link in their emails (see guest-booking.service).
    since
      ? ctx.db
          .select({ ...brief, cancelled: sql<boolean>`${auditLog.changes}->'status'->>'to' = 'cancelled'` })
          .from(auditLog)
          .innerJoin(reservations, eq(reservations.id, auditLog.entityId))
          .where(
            and(
              eq(auditLog.restaurantId, ctx.restaurantId),
              eq(auditLog.entity, "reservation"),
              isNull(auditLog.actorUserId),
              gt(auditLog.createdAt, since),
              sql`${auditLog.changes}->>'by' = 'guest'`,
            ),
          )
          .orderBy(asc(auditLog.createdAt))
          .limit(MAX_NEW)
      : Promise.resolve([]),
    // Guests who joined a waiting list from the booking page.
    since
      ? ctx.db
          .select({
            id: waitlistEntries.id,
            guestName: waitlistEntries.guestName,
            partySize: waitlistEntries.partySize,
            date: waitlistEntries.date,
          })
          .from(waitlistEntries)
          .where(
            and(
              eq(waitlistEntries.restaurantId, ctx.restaurantId),
              eq(waitlistEntries.channel, "online"),
              gt(waitlistEntries.createdAt, since),
            ),
          )
          .orderBy(asc(waitlistEntries.createdAt))
          .limit(MAX_NEW)
      : Promise.resolve([]),
  ]);
  const lastChange = [last?.at, lastWaitlist?.at].reduce<Date | null>(
    (latest, at) => (at && (!latest || at > latest) ? at : latest),
    null,
  );

  return {
    /** Pass it back as `since` next time. */
    serverTime: new Date().toISOString(),
    /** Latest change to bookings or waiting lists. */
    lastChangeAt: lastChange?.toISOString() ?? null,
    newOnline: created.map(toBrief),
    pendingRequests: pending.map(toBrief),
    guestChanges: byGuests.map(({ cancelled, ...row }) => ({
      ...toBrief(row),
      kind: cancelled ? ("cancelled" as const) : ("updated" as const),
    })),
    newWaitlist: joined,
  };
}
