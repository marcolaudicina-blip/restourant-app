import { tableCombinationMembers, tableCombinations } from "@restourant/db";
import {
  combination as combinationSchema,
  combinationDefaults,
  type CombinationCreateInput,
  type CombinationUpdate,
} from "@restourant/shared";
import { and, asc, eq, inArray } from "drizzle-orm";
import { recordAudit } from "../../lib/audit.js";
import { inTransaction, type TenantContext } from "../../lib/context.js";
import { notFound, validateEntity } from "../../lib/errors.js";
import { definedOnly, withoutTenant } from "../../lib/http.js";
import { assertTablesOwned } from "../../lib/ownership.js";

type CombinationRow = typeof tableCombinations.$inferSelect;
export type Combination = Omit<CombinationRow, "restaurantId"> & { tableIds: string[] };

async function attachMembers(ctx: TenantContext, rows: CombinationRow[]): Promise<Combination[]> {
  if (rows.length === 0) return [];
  const members = await ctx.db
    .select({
      combinationId: tableCombinationMembers.combinationId,
      tableId: tableCombinationMembers.tableId,
    })
    .from(tableCombinationMembers)
    .where(
      inArray(
        tableCombinationMembers.combinationId,
        rows.map((r) => r.id),
      ),
    );
  const byCombination = Map.groupBy(members, (m) => m.combinationId);
  return rows.map((row) => ({
    ...withoutTenant(row),
    tableIds: (byCombination.get(row.id) ?? []).map((m) => m.tableId).sort(),
  }));
}

export async function listCombinations(ctx: TenantContext): Promise<Combination[]> {
  const rows = await ctx.db
    .select()
    .from(tableCombinations)
    .where(eq(tableCombinations.restaurantId, ctx.restaurantId))
    .orderBy(asc(tableCombinations.name));
  return attachMembers(ctx, rows);
}

export async function getCombination(ctx: TenantContext, id: string): Promise<Combination> {
  const [row] = await ctx.db
    .select()
    .from(tableCombinations)
    .where(and(eq(tableCombinations.id, id), eq(tableCombinations.restaurantId, ctx.restaurantId)))
    .limit(1);
  if (!row) throw notFound("Combinazione");
  const [combination] = await attachMembers(ctx, [row]);
  return combination!;
}

async function writeMembers(ctx: TenantContext, combinationId: string, tableIds: string[]) {
  await ctx.db
    .delete(tableCombinationMembers)
    .where(eq(tableCombinationMembers.combinationId, combinationId));
  await ctx.db
    .insert(tableCombinationMembers)
    .values(tableIds.map((tableId) => ({ combinationId, tableId, restaurantId: ctx.restaurantId })));
}

export async function createCombination(
  ctx: TenantContext,
  input: CombinationCreateInput,
): Promise<Combination> {
  const { tableIds, ...values } = validateEntity(combinationSchema, {
    ...combinationDefaults,
    ...definedOnly(input),
  });
  await assertTablesOwned(ctx, tableIds, "tableIds");
  const id = await inTransaction(ctx, async (tx) => {
    const [row] = await tx.db
      .insert(tableCombinations)
      .values({ ...values, restaurantId: ctx.restaurantId })
      .returning({ id: tableCombinations.id });
    await writeMembers(tx, row!.id, tableIds);
    await recordAudit(tx, {
      entity: "table_combination",
      entityId: row!.id,
      action: "create",
      changes: { ...values, tableIds },
    });
    return row!.id;
  });
  return getCombination(ctx, id);
}

export async function updateCombination(
  ctx: TenantContext,
  id: string,
  patch: CombinationUpdate,
): Promise<Combination> {
  const current = await getCombination(ctx, id);
  const changes = definedOnly(patch);
  const { tableIds, ...values } = validateEntity(combinationSchema, { ...current, ...changes });
  if (changes.tableIds) await assertTablesOwned(ctx, changes.tableIds, "tableIds");
  await inTransaction(ctx, async (tx) => {
    await tx.db
      .update(tableCombinations)
      .set(values)
      .where(and(eq(tableCombinations.id, id), eq(tableCombinations.restaurantId, ctx.restaurantId)));
    if (changes.tableIds) await writeMembers(tx, id, tableIds);
    await recordAudit(tx, { entity: "table_combination", entityId: id, action: "update", changes });
  });
  return getCombination(ctx, id);
}

export async function deleteCombination(ctx: TenantContext, id: string): Promise<void> {
  await getCombination(ctx, id);
  await inTransaction(ctx, async (tx) => {
    await tx.db
      .delete(tableCombinations)
      .where(and(eq(tableCombinations.id, id), eq(tableCombinations.restaurantId, ctx.restaurantId)));
    await recordAudit(tx, { entity: "table_combination", entityId: id, action: "delete" });
  });
}
