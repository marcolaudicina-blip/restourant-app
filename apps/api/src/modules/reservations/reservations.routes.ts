import {
  dateString,
  partySize,
  RESERVATION_STATUSES,
  reservationCreateInput,
  reservationStatusInput,
  reservationTablesInput,
  reservationUpdate,
} from "@restourant/shared";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { tenant } from "../../lib/context.js";
import { idParams } from "../../lib/http.js";
import { sendBookingEmail } from "../notifications/booking-email.service.js";
import { getActivity } from "./activity.service.js";
import { getAvailability } from "./availability.service.js";
import {
  createReservation,
  getReservation,
  listReservations,
  setReservationStatus,
  setReservationTables,
  updateReservation,
} from "./reservations.service.js";

const READ = { permission: "reservations.read" } as const;
const WRITE = { permission: "reservations.write" } as const;

const availabilityQuery = z.object({
  date: dateString,
  partySize: z.coerce.number().pipe(partySize),
  channel: z.enum(["staff", "online"]).default("staff"),
  roomId: z.uuid().optional(),
});

const listQuery = z.object({
  date: dateString,
  /** Comma separated, e.g. "confirmed,seated". */
  status: z
    .string()
    .optional()
    .transform((v) => (v ? v.split(",").map((s) => s.trim()) : undefined))
    .pipe(z.array(z.enum(RESERVATION_STATUSES)).optional()),
});

const activityQuery = z.object({ since: z.iso.datetime({ offset: true }).optional() });

export const reservationRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    "/reservations/activity",
    { schema: { querystring: activityQuery }, config: READ },
    async (request) => ({
      data: await getActivity(
        tenant(request),
        request.query.since ? new Date(request.query.since) : null,
        request.server.deps.now(),
      ),
    }),
  );

  app.get("/availability", { schema: { querystring: availabilityQuery }, config: READ }, async (request) => ({
    data: await getAvailability(tenant(request), request.query, request.server.deps.now()),
  }));

  app.get("/reservations", { schema: { querystring: listQuery }, config: READ }, async (request) => ({
    data: await listReservations(tenant(request), {
      date: request.query.date,
      statuses: request.query.status,
    }),
  }));

  app.post(
    "/reservations",
    { schema: { body: reservationCreateInput }, config: WRITE },
    async (request, reply) => {
      reply.code(201);
      return { data: await createReservation(tenant(request), request.body) };
    },
  );

  app.get("/reservations/:id", { schema: { params: idParams }, config: READ }, async (request) => ({
    data: await getReservation(tenant(request), request.params.id),
  }));

  app.patch(
    "/reservations/:id",
    { schema: { params: idParams, body: reservationUpdate }, config: WRITE },
    async (request) => ({ data: await updateReservation(tenant(request), request.params.id, request.body) }),
  );

  app.put(
    "/reservations/:id/tables",
    { schema: { params: idParams, body: reservationTablesInput }, config: WRITE },
    async (request) => ({
      data: await setReservationTables(tenant(request), request.params.id, request.body),
    }),
  );

  app.post(
    "/reservations/:id/status",
    { schema: { params: idParams, body: reservationStatusInput }, config: WRITE },
    async (request) => {
      const ctx = tenant(request);
      const before = await getReservation(ctx, request.params.id);
      const updated = await setReservationStatus(ctx, request.params.id, request.body.status);
      // Guests who sent a request from the booking page hear back when the restaurant accepts it.
      if (before.status === "requested" && updated.status === "confirmed" && updated.channel === "online") {
        await sendBookingEmail(ctx, request.server.deps, updated.id, "confirmed", request.log);
      }
      return { data: updated };
    },
  );
};
