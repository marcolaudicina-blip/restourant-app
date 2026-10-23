import { tableAdjacencySet, tableCreateInput, tableUpdate } from "@restourant/shared";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { tenant } from "../../lib/context.js";
import { idParams } from "../../lib/http.js";
import {
  createTable,
  deleteTable,
  getTable,
  listAdjacencies,
  listTables,
  replaceAdjacencies,
  toTable,
  updateTable,
} from "./tables.service.js";

export const tableRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    "/tables",
    { schema: { querystring: z.object({ roomId: z.uuid().optional() }) } },
    async (request) => ({
      data: (await listTables(tenant(request), request.query)).map(toTable),
    }),
  );

  app.post("/tables", { schema: { body: tableCreateInput } }, async (request, reply) => {
    reply.code(201);
    return { data: toTable(await createTable(tenant(request), request.body)) };
  });

  app.get("/tables/:id", { schema: { params: idParams } }, async (request) => ({
    data: toTable(await getTable(tenant(request), request.params.id)),
  }));

  app.patch("/tables/:id", { schema: { params: idParams, body: tableUpdate } }, async (request) => ({
    data: toTable(await updateTable(tenant(request), request.params.id, request.body)),
  }));

  app.delete("/tables/:id", { schema: { params: idParams } }, async (request, reply) => {
    await deleteTable(tenant(request), request.params.id);
    return reply.code(204).send();
  });

  app.get("/table-adjacencies", async (request) => ({ data: await listAdjacencies(tenant(request)) }));

  app.put("/table-adjacencies", { schema: { body: tableAdjacencySet } }, async (request) => ({
    data: await replaceAdjacencies(tenant(request), request.body.pairs),
  }));
};
