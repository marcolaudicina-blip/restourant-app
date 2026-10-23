import { serviceCreateInput, serviceUpdate } from "@restourant/shared";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { tenant } from "../../lib/context.js";
import { idParams } from "../../lib/http.js";
import { createService, deleteService, getService, listServices, updateService } from "./services.service.js";

export const serviceRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get("/services", async (request) => ({ data: await listServices(tenant(request)) }));

  app.post("/services", { schema: { body: serviceCreateInput } }, async (request, reply) => {
    reply.code(201);
    return { data: await createService(tenant(request), request.body) };
  });

  app.get("/services/:id", { schema: { params: idParams } }, async (request) => ({
    data: await getService(tenant(request), request.params.id),
  }));

  app.patch("/services/:id", { schema: { params: idParams, body: serviceUpdate } }, async (request) => ({
    data: await updateService(tenant(request), request.params.id, request.body),
  }));

  app.delete("/services/:id", { schema: { params: idParams } }, async (request, reply) => {
    await deleteService(tenant(request), request.params.id);
    return reply.code(204).send();
  });
};
