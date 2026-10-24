import { bookingPolicyUpdate, restaurantUpdate } from "@restourant/shared";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { tenant } from "../../lib/context.js";
import { exportRestaurant } from "./export.service.js";
import {
  getBookingPolicy,
  getRestaurant,
  toBookingPolicy,
  toRestaurant,
  updateBookingPolicy,
  updateRestaurant,
} from "./restaurants.service.js";

export const restaurantRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get("/", async (request) => ({ data: toRestaurant(await getRestaurant(tenant(request))) }));

  app.patch(
    "/",
    { schema: { body: restaurantUpdate }, config: { permission: "restaurant.write" } },
    async (request) => ({ data: toRestaurant(await updateRestaurant(tenant(request), request.body)) }),
  );

  app.get("/booking-policy", async (request) => ({
    data: toBookingPolicy(await getBookingPolicy(tenant(request))),
  }));

  app.patch("/booking-policy", { schema: { body: bookingPolicyUpdate } }, async (request) => ({
    data: toBookingPolicy(await updateBookingPolicy(tenant(request), request.body)),
  }));

  /** All the restaurant's data as a JSON download (owner only). */
  app.get("/export", { config: { permission: "restaurant.write" } }, async (request, reply) => {
    const ctx = tenant(request);
    const data = await exportRestaurant(ctx, app.deps.now());
    const day = data.exportedAt.slice(0, 10);
    return reply
      .header(
        "content-disposition",
        `attachment; filename="twentyreserve-${data.restaurant!.slug}-${day}.json"`,
      )
      .send(data);
  });
};
