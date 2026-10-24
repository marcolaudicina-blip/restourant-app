import {
  dateString,
  guestBookingChangeInput,
  onlineReservationInput,
  onlineWaitlistInput,
  partySize,
  reviewInput,
} from "@restourant/shared";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { idParams } from "../../lib/http.js";
import { getMedia } from "../booking-page/booking-page.service.js";
import { getReviewPage, reviewContext, saveReview } from "../reviews/reviews.service.js";
import { joinWaitlistOnline } from "../waitlist/waitlist.service.js";
import {
  cancelGuestBooking,
  changeGuestBooking,
  getGuestAvailability,
  getGuestBooking,
  guestBookingContext,
} from "./guest-booking.service.js";
import {
  createOnlineReservation,
  getOpenDays,
  getPublicAvailability,
  getPublicProfile,
  publicContext,
} from "./public.service.js";

const slugParams = z.object({ slug: z.string().min(1).max(80) });
const tokenParams = z.object({ token: z.string().min(10).max(120) });
const availabilityQuery = z.object({ date: dateString, partySize: z.coerce.number().pipe(partySize) });

/** Generous for people browsing times, strict for bookings. */
const READ_LIMIT = { rateLimit: { max: 120, timeWindow: "1 minute" } };
const BOOK_LIMIT = { rateLimit: { max: 10, timeWindow: "1 minute" } };

/** Routes of the public booking page: no authentication, restaurants found by slug. */
export const publicRoutes: FastifyPluginAsyncZod = async (app) => {
  const ctx = (slug: string) => publicContext(app.deps.db, slug);

  app.get("/restaurants/:slug", { schema: { params: slugParams }, config: READ_LIMIT }, async (request) => ({
    data: await getPublicProfile(await ctx(request.params.slug), app.deps.now()),
  }));

  app.get(
    "/restaurants/:slug/days",
    { schema: { params: slugParams }, config: READ_LIMIT },
    async (request) => ({ data: await getOpenDays(await ctx(request.params.slug), app.deps.now()) }),
  );

  app.get(
    "/restaurants/:slug/availability",
    { schema: { params: slugParams, querystring: availabilityQuery }, config: READ_LIMIT },
    async (request) => ({
      data: await getPublicAvailability(await ctx(request.params.slug), request.query, app.deps.now()),
    }),
  );

  app.post(
    "/restaurants/:slug/reservations",
    { schema: { params: slugParams, body: onlineReservationInput }, config: BOOK_LIMIT },
    async (request, reply) => {
      reply.code(201);
      return {
        data: await createOnlineReservation(
          await ctx(request.params.slug),
          request.body,
          app.deps,
          request.log,
        ),
      };
    },
  );

  app.post(
    "/restaurants/:slug/waitlist",
    { schema: { params: slugParams, body: onlineWaitlistInput }, config: BOOK_LIMIT },
    async (request, reply) => {
      reply.code(201);
      return {
        data: await joinWaitlistOnline(await ctx(request.params.slug), request.body, app.deps, request.log),
      };
    },
  );

  // The guest's own booking, from the link in their emails.
  const booking = (token: string) => guestBookingContext(app.deps.db, app.deps.tokens, token);

  app.get("/bookings/:token", { schema: { params: tokenParams }, config: READ_LIMIT }, async (request) => {
    const { ctx, id } = await booking(request.params.token);
    return { data: await getGuestBooking(ctx, id, app.deps.now()) };
  });

  app.get(
    "/bookings/:token/availability",
    { schema: { params: tokenParams, querystring: availabilityQuery }, config: READ_LIMIT },
    async (request) => {
      const { ctx, id } = await booking(request.params.token);
      return { data: await getGuestAvailability(ctx, id, request.query, app.deps.now()) };
    },
  );

  app.post(
    "/bookings/:token/cancel",
    { schema: { params: tokenParams }, config: BOOK_LIMIT },
    async (request) => {
      const { ctx, id } = await booking(request.params.token);
      return { data: await cancelGuestBooking(ctx, id, app.deps, request.log) };
    },
  );

  app.post(
    "/bookings/:token/change",
    { schema: { params: tokenParams, body: guestBookingChangeInput }, config: BOOK_LIMIT },
    async (request) => {
      const { ctx, id } = await booking(request.params.token);
      return { data: await changeGuestBooking(ctx, id, request.body, app.deps, request.log) };
    },
  );

  // "How was it?", from the link in the email the day after.
  const review = (token: string) => reviewContext(app.deps.db, app.deps.tokens, token);

  app.get("/reviews/:token", { schema: { params: tokenParams }, config: READ_LIMIT }, async (request) => {
    const { ctx, id } = await review(request.params.token);
    return { data: await getReviewPage(ctx, id) };
  });

  app.post(
    "/reviews/:token",
    { schema: { params: tokenParams, body: reviewInput }, config: BOOK_LIMIT },
    async (request) => {
      const { ctx, id } = await review(request.params.token);
      return { data: await saveReview(ctx, id, request.body, app.deps.now()) };
    },
  );

  app.get("/media/:id", { schema: { params: idParams }, config: READ_LIMIT }, async (request, reply) => {
    const image = await getMedia(app.deps.db, request.params.id);
    // A new upload always gets a new id, so a picture never changes.
    return reply
      .header("content-type", image.contentType)
      .header("cache-control", "public, max-age=31536000, immutable")
      .send(image.data);
  });
};
