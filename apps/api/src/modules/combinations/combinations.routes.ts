import { combinationCreateInput, combinationUpdate } from "@restourant/shared";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { tenant } from "../../lib/context.js";
import { idParams } from "../../lib/http.js";
import {
  createCombination,
  deleteCombination,
  getCombination,
  listCombinations,
  updateCombination,
} from "./combinations.service.js";

export const combinationRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get("/combinations", async (request) => ({ data: await listCombinations(tenant(request)) }));

  app.post("/combinations", { schema: { body: combinationCreateInput } }, async (request, reply) => {
    reply.code(201);
    return { data: await createCombination(tenant(request), request.body) };
  });

  app.get("/combinations/:id", { schema: { params: idParams } }, async (request) => ({
    data: await getCombination(tenant(request), request.params.id),
  }));

  app.patch(
    "/combinations/:id",
    { schema: { params: idParams, body: combinationUpdate } },
    async (request) => ({
      data: await updateCombination(tenant(request), request.params.id, request.body),
    }),
  );

  app.delete("/combinations/:id", { schema: { params: idParams } }, async (request, reply) => {
    await deleteCombination(tenant(request), request.params.id);
    return reply.code(204).send();
  });
};
