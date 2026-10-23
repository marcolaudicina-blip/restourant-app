import { memberships } from "@restourant/db";
import { can, type Permission } from "@restourant/shared";
import { and, eq } from "drizzle-orm";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { forbidden, notFound, unauthorized } from "../lib/errors.js";

/** Reads and verifies the bearer token, setting `request.auth`. */
export async function authenticate(request: FastifyRequest): Promise<{ userId: string }> {
  if (request.auth) return request.auth;
  const header = request.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : null;
  if (!token) throw unauthorized();
  const claims = await request.server.deps.tokens.verify(token);
  if (!claims) throw unauthorized("Sessione scaduta o non valida");
  request.auth = claims;
  return claims;
}

const restaurantIdParam = z.uuid();

/**
 * Guards every route registered inside a `/restaurants/:restaurantId` scope: the caller must be
 * signed in, be a member of that restaurant and hold the permission the route requires.
 * Non-members get 404 rather than 403, so restaurant ids can't be probed.
 */
export function restaurantScope(app: FastifyInstance) {
  app.addHook("onRequest", async (request) => {
    const { userId } = await authenticate(request);
    const parsed = restaurantIdParam.safeParse((request.params as { restaurantId?: string }).restaurantId);
    if (!parsed.success) throw notFound("Ristorante");

    const [membership] = await request.server.deps.db
      .select({ role: memberships.role })
      .from(memberships)
      .where(and(eq(memberships.userId, userId), eq(memberships.restaurantId, parsed.data)))
      .limit(1);
    if (!membership) throw notFound("Ristorante");

    const permission: Permission =
      request.routeOptions.config.permission ?? (request.method === "GET" ? "config.read" : "config.write");
    if (!can(membership.role, permission)) throw forbidden();

    request.membership = { restaurantId: parsed.data, role: membership.role };
  });
}
