import type { Executor } from "@restourant/db";
import type { FastifyRequest } from "fastify";
import { unauthorized } from "./errors.js";

/** Everything a restaurant-scoped operation needs: where to read/write, which tenant, who is acting. */
export type TenantContext = {
  db: Executor;
  restaurantId: string;
  actorUserId: string | null;
};

export function tenant(request: FastifyRequest): TenantContext {
  if (!request.membership || !request.auth) throw unauthorized();
  return {
    db: request.server.deps.db,
    restaurantId: request.membership.restaurantId,
    actorUserId: request.auth.userId,
  };
}

/** Runs `fn` in a transaction, handing it a context bound to that transaction. */
export function inTransaction<T>(ctx: TenantContext, fn: (tx: TenantContext) => Promise<T>): Promise<T> {
  return ctx.db.transaction((db) => fn({ ...ctx, db }));
}
