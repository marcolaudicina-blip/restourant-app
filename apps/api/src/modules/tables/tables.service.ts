import { diningTables, rooms, tableAdjacencies } from "@restourant/db";
import {
  table as tableSchema,
  tableDefaults,
  type TableAdjacency,
  type TableCreateInput,
  type TableUpdate,
} from "@restourant/shared";
import { and, asc, eq } from "drizzle-orm";
import { recordAudit } from "../../lib/audit.js";
import { inTransaction, type TenantContext } from "../../lib/context.js";
import { notFound, validateEntity } from "../../lib/errors.js";
import { definedOnly, withoutTenant } from "../../lib/http.js";
import { assertRoomsOwned, assertTablesOwned } from "../../lib/ownership.js";

type TableRow = typeof diningTables.$inferSelect;

export const toTable = (row: TableRow) => withoutTenant(row);

export function listTables(ctx: TenantContext, filter: { roomId?: string } = {}): Promise<TableRow[]> {
  return ctx.db
    .select({ table: diningTables })
    .from(diningTables)
    .innerJoin(rooms, eq(rooms.id, diningTables.roomId))
    .where(
      and(
        eq(diningTables.restaurantId, ctx.restaurantId),
        filter.roomId ? eq(diningTables.roomId, filter.roomId) : undefined,
      ),
    )
    .orderBy(asc(rooms.sortOrder), asc(rooms.name), asc(diningTables.name))
    .then((rows) => rows.map((r) => r.table));
}

export async function getTable(ctx: TenantContext, id: string): Promise<TableRow> {
  const [row] = await ctx.db
    .select()
    .from(diningTables)
    .where(and(eq(diningTables.id, id), eq(diningTables.restaurantId, ctx.restaurantId)))
    .limit(1);
  if (!row) throw notFound("Tavolo");
  return row;
}

export async function createTable(ctx: TenantContext, input: TableCreateInput): Promise<TableRow> {
  const values = validateEntity(tableSchema, { ...tableDefaults, ...definedOnly(input) });
  await assertRoomsOwned(ctx, [values.roomId]);
  return inTransaction(ctx, async (tx) => {
    const [row] = await tx.db
      .insert(diningTables)
      .values({ ...values, restaurantId: ctx.restaurantId })
      .returning();
    await recordAudit(tx, { entity: "table", entityId: row!.id, action: "create", changes: values });
    return row!;
  });
}

export async function updateTable(ctx: TenantContext, id: string, patch: TableUpdate): Promise<TableRow> {
  const current = await getTable(ctx, id);
  const changes = definedOnly(patch);
  const values = validateEntity(tableSchema, { ...current, ...changes });
  if (changes.roomId) await assertRoomsOwned(ctx, [changes.roomId]);
  return inTransaction(ctx, async (tx) => {
    const [row] = await tx.db
      .update(diningTables)
      .set(values)
      .where(and(eq(diningTables.id, id), eq(diningTables.restaurantId, ctx.restaurantId)))
      .returning();
    await recordAudit(tx, { entity: "table", entityId: id, action: "update", changes });
    return row!;
  });
}

export async function deleteTable(ctx: TenantContext, id: string): Promise<void> {
  await getTable(ctx, id);
  await inTransaction(ctx, async (tx) => {
    await tx.db
      .delete(diningTables)
      .where(and(eq(diningTables.id, id), eq(diningTables.restaurantId, ctx.restaurantId)));
    await recordAudit(tx, { entity: "table", entityId: id, action: "delete" });
  });
}

/** Undirected edges are stored once, smallest id first. */
export function canonicalPairs(pairs: readonly TableAdjacency[]): TableAdjacency[] {
  const seen = new Map<string, TableAdjacency>();
  for (const { tableAId, tableBId } of pairs) {
    const [a, b] = tableAId < tableBId ? [tableAId, tableBId] : [tableBId, tableAId];
    seen.set(`${a}:${b}`, { tableAId: a, tableBId: b });
  }
  return [...seen.values()];
}

export async function listAdjacencies(ctx: TenantContext): Promise<TableAdjacency[]> {
  return ctx.db
    .select({ tableAId: tableAdjacencies.tableAId, tableBId: tableAdjacencies.tableBId })
    .from(tableAdjacencies)
    .where(eq(tableAdjacencies.restaurantId, ctx.restaurantId));
}

/** Replaces the whole adjacency graph; the floor plan editor saves it in one go. */
export async function replaceAdjacencies(ctx: TenantContext, pairs: readonly TableAdjacency[]) {
  const edges = canonicalPairs(pairs);
  await assertTablesOwned(
    ctx,
    edges.flatMap((e) => [e.tableAId, e.tableBId]),
    "pairs",
  );
  return inTransaction(ctx, async (tx) => {
    await tx.db.delete(tableAdjacencies).where(eq(tableAdjacencies.restaurantId, ctx.restaurantId));
    if (edges.length > 0) {
      await tx.db
        .insert(tableAdjacencies)
        .values(edges.map((e) => ({ ...e, restaurantId: ctx.restaurantId })));
    }
    await recordAudit(tx, { entity: "table_adjacency", action: "replace", changes: { pairs: edges.length } });
    return edges;
  });
}
