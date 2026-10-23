import { calendarExceptionCreateInput, calendarExceptionUpdate, dateString } from "@restourant/shared";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { tenant } from "../../lib/context.js";
import { idParams } from "../../lib/http.js";
import {
  createCalendarException,
  deleteCalendarException,
  getCalendarException,
  listCalendarExceptions,
  toCalendarException,
  updateCalendarException,
} from "./calendar-exceptions.service.js";

const rangeQuery = z.object({ from: dateString.optional(), to: dateString.optional() });

export const calendarExceptionRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get("/calendar-exceptions", { schema: { querystring: rangeQuery } }, async (request) => ({
    data: (await listCalendarExceptions(tenant(request), request.query)).map(toCalendarException),
  }));

  app.post(
    "/calendar-exceptions",
    { schema: { body: calendarExceptionCreateInput } },
    async (request, reply) => {
      reply.code(201);
      return { data: toCalendarException(await createCalendarException(tenant(request), request.body)) };
    },
  );

  app.get("/calendar-exceptions/:id", { schema: { params: idParams } }, async (request) => ({
    data: toCalendarException(await getCalendarException(tenant(request), request.params.id)),
  }));

  app.patch(
    "/calendar-exceptions/:id",
    { schema: { params: idParams, body: calendarExceptionUpdate } },
    async (request) => ({
      data: toCalendarException(
        await updateCalendarException(tenant(request), request.params.id, request.body),
      ),
    }),
  );

  app.delete("/calendar-exceptions/:id", { schema: { params: idParams } }, async (request, reply) => {
    await deleteCalendarException(tenant(request), request.params.id);
    return reply.code(204).send();
  });
};
