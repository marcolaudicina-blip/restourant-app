import { durationRuleCreateInput, durationRuleUpdate } from "@restourant/shared";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { tenant } from "../../lib/context.js";
import { idParams } from "../../lib/http.js";
import {
  createDurationRule,
  deleteDurationRule,
  getDurationRule,
  listDurationRules,
  toDurationRule,
  updateDurationRule,
} from "./duration-rules.service.js";

export const durationRuleRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get("/duration-rules", async (request) => ({
    data: (await listDurationRules(tenant(request))).map(toDurationRule),
  }));

  app.post("/duration-rules", { schema: { body: durationRuleCreateInput } }, async (request, reply) => {
    reply.code(201);
    return { data: toDurationRule(await createDurationRule(tenant(request), request.body)) };
  });

  app.get("/duration-rules/:id", { schema: { params: idParams } }, async (request) => ({
    data: toDurationRule(await getDurationRule(tenant(request), request.params.id)),
  }));

  app.patch(
    "/duration-rules/:id",
    { schema: { params: idParams, body: durationRuleUpdate } },
    async (request) => ({
      data: toDurationRule(await updateDurationRule(tenant(request), request.params.id, request.body)),
    }),
  );

  app.delete("/duration-rules/:id", { schema: { params: idParams } }, async (request, reply) => {
    await deleteDurationRule(tenant(request), request.params.id);
    return reply.code(204).send();
  });
};
