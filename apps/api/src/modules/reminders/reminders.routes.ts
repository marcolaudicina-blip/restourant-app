import { timingSafeEqual } from "node:crypto";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { AppError } from "../../lib/errors.js";
import { sendDueReminders } from "./reminders.service.js";

const sameSecret = (a: string, b: string) =>
  a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/** Jobs run by the scheduler, authorized by `CRON_SECRET` instead of a user session. */
export const internalRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post("/reminders", async (request) => {
    const secret = app.deps.cronSecret;
    if (!secret) throw new AppError(503, "not_configured", "CRON_SECRET non impostato");
    const given = request.headers.authorization?.replace(/^Bearer\s+/i, "") ?? "";
    if (!sameSecret(given, secret)) throw new AppError(401, "unauthorized", "Non autorizzato");
    return { data: await sendDueReminders(app.deps, request.log) };
  });
};
