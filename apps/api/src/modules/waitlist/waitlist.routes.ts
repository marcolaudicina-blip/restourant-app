import { dateString, waitlistCreateInput, waitlistUpdate } from "@restourant/shared";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { tenant } from "../../lib/context.js";
import { idParams } from "../../lib/http.js";
import {
  addToWaitlist,
  emailWaitlistJoined,
  listWaitlist,
  notifyWaitlistEntry,
  updateWaitlistEntry,
} from "./waitlist.service.js";

const READ = { permission: "reservations.read" } as const;
const WRITE = { permission: "reservations.write" } as const;

const listQuery = z.object({ date: dateString });

export const waitlistRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get("/waitlist", { schema: { querystring: listQuery }, config: READ }, async (request) => ({
    data: await listWaitlist(tenant(request), request.query.date),
  }));

  app.post("/waitlist", { schema: { body: waitlistCreateInput }, config: WRITE }, async (request, reply) => {
    const ctx = tenant(request);
    const entry = await addToWaitlist(ctx, { ...request.body, channel: "staff" });
    await emailWaitlistJoined(ctx, request.server.deps, entry.id, request.log);
    reply.code(201);
    return { data: entry };
  });

  app.patch(
    "/waitlist/:id",
    { schema: { params: idParams, body: waitlistUpdate }, config: WRITE },
    async (request) => ({
      data: await updateWaitlistEntry(tenant(request), request.params.id, request.body),
    }),
  );

  /** "A table is free": emails the guest now. */
  app.post("/waitlist/:id/notify", { schema: { params: idParams }, config: WRITE }, async (request) => ({
    data: await notifyWaitlistEntry(tenant(request), request.server.deps, request.params.id, request.log),
  }));
};
