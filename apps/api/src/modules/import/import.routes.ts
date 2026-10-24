import { guestImportInput, reservationImportInput } from "@restourant/shared";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { tenant } from "../../lib/context.js";
import { importGuests, importReservations } from "./import.service.js";

/** Importing data from another system: configuration rights (owner and managers). */
export const importRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post(
    "/import/guests",
    { schema: { body: guestImportInput }, bodyLimit: 4 * 1024 * 1024 },
    async (request) => ({
      data: await importGuests(tenant(request), request.body.rows, request.body.firstRow),
    }),
  );

  app.post("/import/reservations", { schema: { body: reservationImportInput } }, async (request) => ({
    data: await importReservations(tenant(request), request.body.rows, request.body.firstRow, app.deps.now()),
  }));
};
