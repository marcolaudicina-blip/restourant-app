import { bookingPolicies, reservations, restaurants, type Database } from "@restourant/db";
import { addDays, instantToLocal, type ReviewInput } from "@restourant/shared";
import { and, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import type { FastifyBaseLogger } from "fastify";
import { recordAudit } from "../../lib/audit.js";
import type { TenantContext } from "../../lib/context.js";
import { conflict, notFound } from "../../lib/errors.js";
import type { AppDeps } from "../../types.js";
import { getBookingPage } from "../booking-page/booking-page.service.js";
import { renderReviewEmail } from "../notifications/review-email.template.js";
import { getReservation } from "../reservations/reservations.service.js";
import { getBookingPolicy, getRestaurant } from "../restaurants/restaurants.service.js";

/*
 * "How was it?" the day after. The daily job emails guests of yesterday's bookings (restaurants
 * with `reviewRequests`); one click on the stars opens /recensione/<token>, which saves the rating.
 * Happy guests (4-5) are invited to leave a public review (`reviewUrl`, e.g. Google); the others
 * can tell the restaurant privately what went wrong. Staff see everything in GET /reviews.
 */

/** Bookings that most likely happened: no-shows and cancellations are never asked. */
const HAPPENED = ["confirmed", "arrived", "seated", "completed"] as const;
/** From this rating up the guest is invited to review publicly. */
export const HAPPY_RATING = 4;

type Deps = Pick<AppDeps, "db" | "mailer" | "publicUrl" | "tokens" | "now">;

async function sendReviewEmail(ctx: TenantContext, deps: Deps, id: string, log: FastifyBaseLogger) {
  try {
    const [reservation, restaurant, page] = await Promise.all([
      getReservation(ctx, id),
      getRestaurant(ctx),
      getBookingPage(ctx),
    ]);
    const to = reservation.guestEmail;
    if (!to || !deps.publicUrl) return null;
    const email = renderReviewEmail({
      restaurant,
      page,
      reservation,
      reviewUrl: `${deps.publicUrl}/recensione/${deps.tokens.signReview(id)}`,
      publicUrl: deps.publicUrl,
    });
    let status: "sent" | "failed" = "sent";
    try {
      await deps.mailer.send({ to, ...email, fromName: restaurant.name, replyTo: restaurant.email });
    } catch (e) {
      status = "failed";
      log.warn({ err: e, reservationId: id }, "Review email not sent");
    }
    await recordAudit(ctx, {
      entity: "email",
      entityId: id,
      action: "create",
      changes: { kind: "review", to, status },
    });
    return status;
  } catch (e) {
    log.error({ err: e, reservationId: id }, "Review email failed");
    return "failed" as const;
  }
}

/** Run by the daily job: one email per booking of yesterday (local time), never twice. */
export async function sendDueReviewRequests(deps: Deps, log: FastifyBaseLogger) {
  const result = { restaurants: 0, sent: 0, failed: 0 };
  if (!deps.mailer.enabled || !deps.publicUrl) return result;
  const now = deps.now();
  const enabled = await deps.db
    .select({ id: restaurants.id, timezone: restaurants.timezone })
    .from(restaurants)
    .innerJoin(bookingPolicies, eq(bookingPolicies.restaurantId, restaurants.id))
    .where(eq(bookingPolicies.reviewRequests, true));

  for (const restaurant of enabled) {
    const ctx = { db: deps.db, restaurantId: restaurant.id, actorUserId: null };
    const yesterday = addDays(instantToLocal(now, restaurant.timezone).date, -1);
    const due = await deps.db
      .select({ id: reservations.id })
      .from(reservations)
      .where(
        and(
          eq(reservations.restaurantId, restaurant.id),
          eq(reservations.date, yesterday),
          inArray(reservations.status, [...HAPPENED]),
          isNotNull(reservations.guestEmail),
          isNull(reservations.reviewRequestedAt),
        ),
      );
    if (due.length > 0) result.restaurants += 1;
    for (const { id } of due) {
      // Marked first: a failed send is not retried, so nobody is asked twice.
      await deps.db.update(reservations).set({ reviewRequestedAt: now }).where(eq(reservations.id, id));
      const status = await sendReviewEmail(ctx, deps, id, log);
      if (status === "sent") result.sent += 1;
      else result.failed += 1;
    }
  }
  return result;
}

// ---------------------------------------------------------------------------------------------
// The guest's page
// ---------------------------------------------------------------------------------------------

export async function reviewContext(db: Database, tokens: AppDeps["tokens"], token: string) {
  const id = tokens.verifyReview(token);
  if (!id) throw notFound("Pagina");
  const [row] = await db
    .select({ restaurantId: reservations.restaurantId })
    .from(reservations)
    .where(eq(reservations.id, id))
    .limit(1);
  if (!row) throw notFound("Pagina");
  return { ctx: { db, restaurantId: row.restaurantId, actorUserId: null } as TenantContext, id };
}

export async function getReviewPage(ctx: TenantContext, id: string) {
  const [reservation, restaurant, page, policy] = await Promise.all([
    getReservation(ctx, id),
    getRestaurant(ctx),
    getBookingPage(ctx),
    getBookingPolicy(ctx),
  ]);
  const happy = (reservation.rating ?? 0) >= HAPPY_RATING;
  return {
    restaurant: {
      name: restaurant.name,
      slug: restaurant.slug,
      brandColor: page.brandColor,
      logoId: page.logoId,
    },
    booking: {
      date: reservation.date,
      partySize: reservation.partySize,
      guestName: reservation.guestName,
      locale: reservation.locale,
    },
    rating: reservation.rating,
    feedback: reservation.feedback,
    /** Only once the guest gave a good rating. */
    publicReviewUrl: happy ? policy.reviewUrl : null,
  };
}

/** Saves (or changes) the guest's rating and comment. */
export async function saveReview(ctx: TenantContext, id: string, input: ReviewInput, now: Date) {
  const reservation = await getReservation(ctx, id);
  if (!(HAPPENED as readonly string[]).includes(reservation.status)) {
    throw conflict("not_reviewable", "Questa prenotazione non si può valutare");
  }
  await ctx.db
    .update(reservations)
    .set({
      rating: input.rating,
      ...(input.feedback !== undefined ? { feedback: input.feedback } : {}),
      ratedAt: now,
    })
    .where(and(eq(reservations.id, id), eq(reservations.restaurantId, ctx.restaurantId)));
  await recordAudit(ctx, {
    entity: "review",
    entityId: id,
    action: reservation.rating === null ? "create" : "update",
    changes: { by: "guest", rating: input.rating, ...(input.feedback ? { feedback: true } : {}) },
  });
  return getReviewPage(ctx, id);
}

// ---------------------------------------------------------------------------------------------
// Staff
// ---------------------------------------------------------------------------------------------

/** The latest ratings, with the average and how many of each. */
export async function listReviews(ctx: TenantContext, limit = 200) {
  const scope = and(eq(reservations.restaurantId, ctx.restaurantId), isNotNull(reservations.rating));
  const [rows, counts, [asked]] = await Promise.all([
    ctx.db
      .select({
        reservationId: reservations.id,
        guestId: reservations.guestId,
        guestName: reservations.guestName,
        date: reservations.date,
        partySize: reservations.partySize,
        rating: reservations.rating,
        feedback: reservations.feedback,
        ratedAt: reservations.ratedAt,
      })
      .from(reservations)
      .where(scope)
      .orderBy(desc(reservations.ratedAt))
      .limit(limit),
    ctx.db
      .select({ rating: reservations.rating, n: sql<number>`count(*)`.mapWith(Number) })
      .from(reservations)
      .where(scope)
      .groupBy(reservations.rating),
    ctx.db
      .select({ n: sql<number>`count(*)`.mapWith(Number) })
      .from(reservations)
      .where(and(eq(reservations.restaurantId, ctx.restaurantId), isNotNull(reservations.reviewRequestedAt))),
  ]);
  const byRating = [1, 2, 3, 4, 5].map((rating) => counts.find((c) => c.rating === rating)?.n ?? 0);
  const total = byRating.reduce((a, b) => a + b, 0);
  return {
    count: total,
    average: total ? byRating.reduce((sum, n, i) => sum + n * (i + 1), 0) / total : null,
    byRating,
    /** Emails sent, to see how many guests answer. */
    requested: asked!.n,
    reviews: rows.map((r) => ({ ...r, ratedAt: r.ratedAt!.toISOString() })),
  };
}
