import { bookingPolicies, reservations, restaurants } from "@restourant/db";
import { addDays, instantToLocal } from "@restourant/shared";
import { and, eq, isNotNull, isNull, ne } from "drizzle-orm";
import type { FastifyBaseLogger } from "fastify";
import type { AppDeps } from "../../types.js";
import { sendBookingEmail } from "../notifications/booking-email.service.js";

/*
 * The day-before reminder. A scheduled job (Vercel Cron, once a day) calls this for every restaurant
 * that wants reminders: each confirmed booking for tomorrow, local time, with an email gets one.
 * `reminderSentAt` makes it safe to run more than once.
 */

export async function sendDueReminders(
  deps: Pick<AppDeps, "db" | "mailer" | "publicUrl" | "tokens" | "now">,
  log: FastifyBaseLogger,
) {
  const result = { restaurants: 0, sent: 0, failed: 0 };
  if (!deps.mailer.enabled) return { ...result, skipped: "email_not_configured" as const };

  const now = deps.now();
  const enabled = await deps.db
    .select({ id: restaurants.id, timezone: restaurants.timezone })
    .from(restaurants)
    .innerJoin(bookingPolicies, eq(bookingPolicies.restaurantId, restaurants.id))
    .where(eq(bookingPolicies.sendReminders, true));

  for (const restaurant of enabled) {
    const ctx = { db: deps.db, restaurantId: restaurant.id, actorUserId: null };
    const tomorrow = addDays(instantToLocal(now, restaurant.timezone).date, 1);
    const due = await deps.db
      .select({ id: reservations.id })
      .from(reservations)
      .where(
        and(
          eq(reservations.restaurantId, restaurant.id),
          eq(reservations.date, tomorrow),
          eq(reservations.status, "confirmed"),
          ne(reservations.channel, "walk_in"),
          isNotNull(reservations.guestEmail),
          isNull(reservations.reminderSentAt),
        ),
      );
    if (due.length > 0) result.restaurants += 1;
    for (const { id } of due) {
      const status = await sendBookingEmail(ctx, deps, id, "reminder", log);
      if (status === "sent") {
        await deps.db.update(reservations).set({ reminderSentAt: now }).where(eq(reservations.id, id));
        result.sent += 1;
      } else {
        result.failed += 1;
      }
    }
  }
  return { ...result, skipped: null };
}
