import { dateString } from "@restourant/shared";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { tenant } from "../../lib/context.js";
import { getStats } from "./stats.service.js";

const statsQuery = z.object({ from: dateString.optional(), to: dateString.optional() });

/** Figures of a period (default: the last 30 days), for owners and managers. */
export const statsRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    "/stats",
    { schema: { querystring: statsQuery }, config: { permission: "stats.read" } },
    async (request) => ({
      data: await getStats(tenant(request), request.query, app.deps.now()),
    }),
  );
};
