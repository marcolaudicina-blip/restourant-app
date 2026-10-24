import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { tenant } from "../../lib/context.js";
import { listReviews } from "./reviews.service.js";

/** Ratings and comments guests left after their meal. */
export const reviewRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get("/reviews", { config: { permission: "reservations.read" } }, async (request) => ({
    data: await listReviews(tenant(request)),
  }));
};
