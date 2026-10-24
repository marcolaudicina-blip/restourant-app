import { waitlistEntries } from "@restourant/db";
import { normalizePhone } from "@restourant/shared";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { TenantContext } from "../../lib/context.js";

/** Entries still on the list. */
export const OPEN = ["waiting", "notified"] as const;

/**
 * Takes the guest of a new booking off the list of that day (same phone or email). Runs inside the
 * booking's transaction.
 */
export async function markWaitlistBooked(
  tx: TenantContext,
  booking: { id: string; date: string; guestPhone: string | null; guestEmail: string | null },
) {
  const phone = booking.guestPhone ? normalizePhone(booking.guestPhone) : null;
  const email = booking.guestEmail?.trim().toLowerCase() || null;
  if (!phone && !email) return;
  const matches = [
    phone ? sql`${waitlistEntries.phoneNormalized} = ${phone}` : null,
    email ? sql`lower(${waitlistEntries.guestEmail}) = ${email}` : null,
  ].filter((m) => m !== null);
  await tx.db
    .update(waitlistEntries)
    .set({ status: "booked", reservationId: booking.id })
    .where(
      and(
        eq(waitlistEntries.restaurantId, tx.restaurantId),
        eq(waitlistEntries.date, booking.date),
        inArray(waitlistEntries.status, [...OPEN]),
        sql`(${sql.join(matches, sql` or `)})`,
      ),
    );
}
