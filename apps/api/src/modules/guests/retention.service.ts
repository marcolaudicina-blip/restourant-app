import {
  auditLog,
  bookingPolicies,
  guests,
  reservations,
  restaurants,
  waitlistEntries,
} from "@restourant/db";
import { addDays, instantToLocal } from "@restourant/shared";
import { and, eq, inArray, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import type { FastifyBaseLogger } from "fastify";
import type { AppDeps } from "../../types.js";

/*
 * GDPR storage limits, run by the daily job:
 * - restaurants with `guestRetentionMonths` anonymize guests whose last booking is older than that
 *   (profile deleted, their bookings kept without name and contacts, as "delete guest" does), and
 *   the details of old bookings never linked to a profile;
 * - everyone: waiting list entries are deleted a month after their day.
 */

export const ANONYMOUS_GUEST = "Cliente rimosso";
const WAITLIST_KEEP_DAYS = 30;
/** Per restaurant and run, so one run never holds the database for long. */
const BATCH = 500;

/** `YYYY-MM-DD` minus whole months (day clamped by Date, fine for a storage limit). */
function monthsBefore(date: string, months: number): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1 - months, d)).toISOString().slice(0, 10);
}

export async function applyRetention(deps: Pick<AppDeps, "db" | "now">, log: FastifyBaseLogger) {
  const result = { guests: 0, reservations: 0, waitlist: 0 };
  const now = deps.now();
  const all = await deps.db
    .select({
      id: restaurants.id,
      timezone: restaurants.timezone,
      months: bookingPolicies.guestRetentionMonths,
    })
    .from(restaurants)
    .innerJoin(bookingPolicies, eq(bookingPolicies.restaurantId, restaurants.id));

  for (const restaurant of all) {
    try {
      const today = instantToLocal(now, restaurant.timezone).date;
      const removed = await deps.db
        .delete(waitlistEntries)
        .where(
          and(
            eq(waitlistEntries.restaurantId, restaurant.id),
            lt(waitlistEntries.date, addDays(today, -WAITLIST_KEEP_DAYS)),
          ),
        )
        .returning({ id: waitlistEntries.id });
      result.waitlist += removed.length;
      if (restaurant.months === null) continue;

      const cutoff = monthsBefore(today, restaurant.months);
      const counts = await deps.db.transaction(async (tx) => {
        const stale = await tx
          .select({ id: guests.id })
          .from(guests)
          .where(
            and(
              eq(guests.restaurantId, restaurant.id),
              sql`not exists (select 1 from ${reservations} r where r.guest_id = ${guests.id} and r.date >= ${cutoff})`,
              // Profiles staff created by hand, without bookings, count from their creation.
              or(
                sql`exists (select 1 from ${reservations} r where r.guest_id = ${guests.id})`,
                lt(guests.createdAt, new Date(`${cutoff}T00:00:00Z`)),
              ),
            ),
          )
          .limit(BATCH);
        const ids = stale.map((g) => g.id);
        const anonymous = {
          guestId: null,
          guestName: ANONYMOUS_GUEST,
          guestPhone: null,
          guestEmail: null,
          guestNote: null,
          feedback: null,
        };
        const linked = ids.length
          ? await tx
              .update(reservations)
              .set(anonymous)
              .where(and(eq(reservations.restaurantId, restaurant.id), inArray(reservations.guestId, ids)))
              .returning({ id: reservations.id })
          : [];
        if (ids.length) await tx.delete(guests).where(inArray(guests.id, ids));
        // Old bookings never linked to a profile (walk-ins, names without contacts).
        const loose = await tx
          .update(reservations)
          .set(anonymous)
          .where(
            and(
              eq(reservations.restaurantId, restaurant.id),
              isNull(reservations.guestId),
              lt(reservations.date, cutoff),
              or(
                sql`${reservations.guestName} <> ${ANONYMOUS_GUEST}`,
                isNotNull(reservations.guestPhone),
                isNotNull(reservations.guestEmail),
              ),
            ),
          )
          .returning({ id: reservations.id });
        const count = { guests: ids.length, reservations: linked.length + loose.length };
        if (count.guests || count.reservations) {
          await tx.insert(auditLog).values({
            restaurantId: restaurant.id,
            actorUserId: null,
            entity: "retention",
            action: "delete",
            changes: { before: cutoff, ...count },
          });
        }
        return count;
      });
      result.guests += counts.guests;
      result.reservations += counts.reservations;
    } catch (e) {
      log.error({ err: e, restaurantId: restaurant.id }, "Retention failed");
    }
  }
  return result;
}
