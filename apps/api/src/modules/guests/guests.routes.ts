import { guestCreateInput, guestUpdate } from "@restourant/shared";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { tenant } from "../../lib/context.js";
import { idParams } from "../../lib/http.js";
import { listGuestReservations } from "../reservations/reservations.service.js";
import { createGuest, deleteGuest, getGuest, listGuests, updateGuest } from "./guests.service.js";

const READ = { permission: "guests.read" } as const;
const WRITE = { permission: "guests.write" } as const;

const listQuery = z.object({
  q: z.string().trim().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export const guestRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get("/guests", { schema: { querystring: listQuery }, config: READ }, async (request) => ({
    data: await listGuests(tenant(request), request.query),
  }));

  app.post("/guests", { schema: { body: guestCreateInput }, config: WRITE }, async (request, reply) => {
    reply.code(201);
    return { data: await createGuest(tenant(request), request.body) };
  });

  /** Profile, statistics and full booking history. */
  app.get("/guests/:id", { schema: { params: idParams }, config: READ }, async (request) => {
    const ctx = tenant(request);
    const [guest, history] = await Promise.all([
      getGuest(ctx, request.params.id),
      listGuestReservations(ctx, request.params.id),
    ]);
    return { data: { ...guest, reservations: history } };
  });

  app.patch(
    "/guests/:id",
    { schema: { params: idParams, body: guestUpdate }, config: WRITE },
    async (request) => ({
      data: await updateGuest(tenant(request), request.params.id, request.body),
    }),
  );

  app.delete(
    "/guests/:id",
    { schema: { params: idParams }, config: { permission: "guests.delete" } },
    async (request, reply) => {
      await deleteGuest(tenant(request), request.params.id);
      return reply.code(204).send();
    },
  );
};
