import { CONFIG_TEMPLATE_KEYS, dateString } from "@restourant/shared";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { tenant } from "../../lib/context.js";
import { applyTemplate, getConfigSnapshot, getDaySchedule, listAuditLog } from "./setup.service.js";

const scheduleQuery = z.object({
  date: dateString,
  channel: z.enum(["staff", "online"]).default("staff"),
});

const auditQuery = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  before: z.iso.datetime({ offset: true }).optional(),
});

export const setupRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get("/config", async (request) => ({ data: await getConfigSnapshot(tenant(request)) }));

  app.get("/schedule", { schema: { querystring: scheduleQuery } }, async (request) => ({
    data: await getDaySchedule(tenant(request), request.query.date, request.query.channel),
  }));

  app.post(
    "/setup/apply-template",
    { schema: { body: z.object({ template: z.enum(CONFIG_TEMPLATE_KEYS) }) } },
    async (request) => ({ data: await applyTemplate(tenant(request), request.body.template) }),
  );

  app.get(
    "/audit-log",
    { schema: { querystring: auditQuery }, config: { permission: "audit.read" } },
    async (request) => ({ data: await listAuditLog(tenant(request), request.query) }),
  );
};
