import { tableBlockCreateInput, tableBlockUpdate } from "@restourant/shared";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { tenant } from "../../lib/context.js";
import { idParams } from "../../lib/http.js";
import {
  createTableBlock,
  deleteTableBlock,
  getTableBlock,
  listTableBlocks,
  toTableBlock,
  updateTableBlock,
} from "./table-blocks.service.js";

const rangeQuery = z.object({
  from: z.iso.datetime({ offset: true }).optional(),
  to: z.iso.datetime({ offset: true }).optional(),
});

export const tableBlockRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get("/table-blocks", { schema: { querystring: rangeQuery } }, async (request) => ({
    data: (await listTableBlocks(tenant(request), request.query)).map(toTableBlock),
  }));

  app.post("/table-blocks", { schema: { body: tableBlockCreateInput } }, async (request, reply) => {
    reply.code(201);
    return { data: toTableBlock(await createTableBlock(tenant(request), request.body)) };
  });

  app.get("/table-blocks/:id", { schema: { params: idParams } }, async (request) => ({
    data: toTableBlock(await getTableBlock(tenant(request), request.params.id)),
  }));

  app.patch(
    "/table-blocks/:id",
    { schema: { params: idParams, body: tableBlockUpdate } },
    async (request) => ({
      data: toTableBlock(await updateTableBlock(tenant(request), request.params.id, request.body)),
    }),
  );

  app.delete("/table-blocks/:id", { schema: { params: idParams } }, async (request, reply) => {
    await deleteTableBlock(tenant(request), request.params.id);
    return reply.code(204).send();
  });
};
