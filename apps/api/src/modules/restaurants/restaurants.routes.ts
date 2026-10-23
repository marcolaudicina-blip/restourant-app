import { bookingPolicyUpdate, restaurantUpdate } from "@restourant/shared";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { tenant } from "../../lib/context.js";
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
};
