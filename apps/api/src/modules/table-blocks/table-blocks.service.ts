import { tableBlocks } from "@restourant/db";
import {
  tableBlock as tableBlockSchema,
  tableBlockDefaults,
  type TableBlockCreateInput,
  type TableBlockUpdate,
} from "@restourant/shared";
import { and, asc, eq, gt, lt } from "drizzle-orm";
import { recordAudit } from "../../lib/audit.js";
import { inTransaction, type TenantContext } from "../../lib/context.js";
import { notFound, validateEntity } from "../../lib/errors.js";
import { definedOnly, withoutTenant } from "../../lib/http.js";
import { assertRoomsOwned, assertTablesOwned } from "../../lib/ownership.js";

type TableBlockRow = typeof tableBlocks.$inferSelect;

export const toTableBlock = (row: TableBlockRow) => withoutTenant(row);

const toEntity = (row: TableBlockRow) => ({
  ...row,
  startsAt: row.startsAt.toISOString(),
  endsAt: row.endsAt.toISOString(),
});

function toColumns(
  values: { startsAt: string; endsAt: string } & Omit<TableBlockCreateInput, "startsAt" | "endsAt">,
) {
  return { ...values, startsAt: new Date(values.startsAt), endsAt: new Date(values.endsAt) };
}

/** Blocks overlapping the [from, to) window. */
export function listTableBlocks(ctx: TenantContext, range: { from?: string; to?: string } = {}) {
  return ctx.db
    .select()
    .from(tableBlocks)
    .where(
      and(
        eq(tableBlocks.restaurantId, ctx.restaurantId),
        range.from ? gt(tableBlocks.endsAt, new Date(range.from)) : undefined,
        range.to ? lt(tableBlocks.startsAt, new Date(range.to)) : undefined,
      ),
    )
    .orderBy(asc(tableBlocks.startsAt));
}

export async function getTableBlock(ctx: TenantContext, id: string): Promise<TableBlockRow> {
  const [row] = await ctx.db
    .select()
    .from(tableBlocks)
    .where(and(eq(tableBlocks.id, id), eq(tableBlocks.restaurantId, ctx.restaurantId)))
    .limit(1);
  if (!row) throw notFound("Blocco");
  return row;
}

async function assertReferences(
  ctx: TenantContext,
  value: { tableId?: string | null; roomId?: string | null },
) {
  await assertTablesOwned(ctx, [value.tableId]);
  await assertRoomsOwned(ctx, [value.roomId]);
}

export async function createTableBlock(
  ctx: TenantContext,
  input: TableBlockCreateInput,
): Promise<TableBlockRow> {
  const values = validateEntity(tableBlockSchema, { ...tableBlockDefaults, ...definedOnly(input) });
  await assertReferences(ctx, values);
  return inTransaction(ctx, async (tx) => {
    const [row] = await tx.db
      .insert(tableBlocks)
      .values({ ...toColumns(values), restaurantId: ctx.restaurantId })
      .returning();
    await recordAudit(tx, { entity: "table_block", entityId: row!.id, action: "create", changes: values });
    return row!;
  });
}

export async function updateTableBlock(
  ctx: TenantContext,
  id: string,
  patch: TableBlockUpdate,
): Promise<TableBlockRow> {
  const current = toEntity(await getTableBlock(ctx, id));
  const changes = definedOnly(patch);
  const values = validateEntity(tableBlockSchema, { ...current, ...changes });
  await assertReferences(ctx, changes);
  return inTransaction(ctx, async (tx) => {
    const [row] = await tx.db
      .update(tableBlocks)
      .set(toColumns(values))
      .where(and(eq(tableBlocks.id, id), eq(tableBlocks.restaurantId, ctx.restaurantId)))
      .returning();
    await recordAudit(tx, { entity: "table_block", entityId: id, action: "update", changes });
    return row!;
  });
}

export async function deleteTableBlock(ctx: TenantContext, id: string): Promise<void> {
  await getTableBlock(ctx, id);
  await inTransaction(ctx, async (tx) => {
    await tx.db
      .delete(tableBlocks)
      .where(and(eq(tableBlocks.id, id), eq(tableBlocks.restaurantId, ctx.restaurantId)));
    await recordAudit(tx, { entity: "table_block", entityId: id, action: "delete" });
  });
}
