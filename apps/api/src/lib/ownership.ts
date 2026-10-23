import { diningTables, rooms, services } from "@restourant/db";
import { and, eq, inArray } from "drizzle-orm";
import type { TenantContext } from "./context.js";
import { invalid } from "./errors.js";

/*
 * Friendly pre-checks for references sent by clients. The composite foreign keys in the database
 * enforce the same rule; these exist to return a precise message instead of a generic error.
 */

function assertOwned(
  found: { id: string }[],
  ids: readonly (string | null | undefined)[],
  path: string,
  label: string,
) {
  const wanted = new Set(ids.filter((v): v is string => typeof v === "string"));
  const present = new Set(found.map((r) => r.id));
  const missing = [...wanted].filter((id) => !present.has(id));
  if (missing.length > 0) {
    throw invalid(
      `${label} non trovato in questo ristorante`,
      missing.map((id) => ({ path, message: id })),
    );
  }
}

const unique = (ids: readonly (string | null | undefined)[]) => [
  ...new Set(ids.filter((v): v is string => typeof v === "string")),
];

export async function assertRoomsOwned(
  ctx: TenantContext,
  ids: readonly (string | null | undefined)[],
  path = "roomId",
) {
  const list = unique(ids);
  if (list.length === 0) return;
  const found = await ctx.db
    .select({ id: rooms.id })
    .from(rooms)
    .where(and(eq(rooms.restaurantId, ctx.restaurantId), inArray(rooms.id, list)));
  assertOwned(found, list, path, "Sala");
}

export async function assertTablesOwned(
  ctx: TenantContext,
  ids: readonly (string | null | undefined)[],
  path = "tableId",
) {
  const list = unique(ids);
  if (list.length === 0) return;
  const found = await ctx.db
    .select({ id: diningTables.id })
    .from(diningTables)
    .where(and(eq(diningTables.restaurantId, ctx.restaurantId), inArray(diningTables.id, list)));
  assertOwned(found, list, path, "Tavolo");
}

export async function assertServicesOwned(
  ctx: TenantContext,
  ids: readonly (string | null | undefined)[],
  path = "serviceId",
) {
  const list = unique(ids);
  if (list.length === 0) return;
  const found = await ctx.db
    .select({ id: services.id })
    .from(services)
    .where(and(eq(services.restaurantId, ctx.restaurantId), inArray(services.id, list)));
  assertOwned(found, list, path, "Servizio");
}
