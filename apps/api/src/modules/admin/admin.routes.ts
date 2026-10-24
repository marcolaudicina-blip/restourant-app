import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { idParams } from "../../lib/http.js";
import {
  endSupport,
  getOverview,
  getRestaurantDetail,
  listRestaurants,
  requirePlatformAdmin,
  startSupport,
} from "./admin.service.js";

/** TwentyReserve's own admin (/v1/admin): every route requires a platform admin. */
export const adminRoutes: FastifyPluginAsyncZod = async (app) => {
  const { db } = app.deps;

  app.get("/overview", async (request) => {
    await requirePlatformAdmin(request);
    return { data: await getOverview(db, app.deps.now()) };
  });

  app.get("/restaurants", async (request) => {
    await requirePlatformAdmin(request);
    return { data: await listRestaurants(db, app.deps.now()) };
  });

  app.get("/restaurants/:id", { schema: { params: idParams } }, async (request) => {
    const adminId = await requirePlatformAdmin(request);
    return { data: await getRestaurantDetail(db, request.params.id, adminId, app.deps.now()) };
  });

  app.post("/restaurants/:id/support", { schema: { params: idParams } }, async (request) => {
    const adminId = await requirePlatformAdmin(request);
    await startSupport(db, request.params.id, adminId);
    return { data: { restaurantId: request.params.id } };
  });

  app.delete("/restaurants/:id/support", { schema: { params: idParams } }, async (request, reply) => {
    const adminId = await requirePlatformAdmin(request);
    await endSupport(db, request.params.id, adminId);
    return reply.code(204).send();
  });
};
