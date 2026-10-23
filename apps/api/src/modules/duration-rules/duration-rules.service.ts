import { durationRules } from "@restourant/db";
import {
  durationRule as durationRuleSchema,
  durationRuleDefaults,
  type DurationRuleCreateInput,
  type DurationRuleUpdate,
} from "@restourant/shared";
import { and, asc, eq } from "drizzle-orm";
import { recordAudit } from "../../lib/audit.js";
import { inTransaction, type TenantContext } from "../../lib/context.js";
import { notFound, validateEntity } from "../../lib/errors.js";
import { definedOnly, withoutTenant } from "../../lib/http.js";
import { assertRoomsOwned, assertServicesOwned } from "../../lib/ownership.js";

type DurationRuleRow = typeof durationRules.$inferSelect;

export const toDurationRule = (row: DurationRuleRow) => withoutTenant(row);

export function listDurationRules(ctx: TenantContext): Promise<DurationRuleRow[]> {
  return ctx.db
    .select()
    .from(durationRules)
    .where(eq(durationRules.restaurantId, ctx.restaurantId))
    .orderBy(asc(durationRules.minParty), asc(durationRules.maxParty));
}

export async function getDurationRule(ctx: TenantContext, id: string): Promise<DurationRuleRow> {
  const [row] = await ctx.db
    .select()
    .from(durationRules)
    .where(and(eq(durationRules.id, id), eq(durationRules.restaurantId, ctx.restaurantId)))
    .limit(1);
  if (!row) throw notFound("Regola di durata");
  return row;
}

async function assertReferences(
  ctx: TenantContext,
  value: { serviceId?: string | null; roomId?: string | null },
) {
  await assertServicesOwned(ctx, [value.serviceId]);
  await assertRoomsOwned(ctx, [value.roomId]);
}

export async function createDurationRule(
  ctx: TenantContext,
  input: DurationRuleCreateInput,
): Promise<DurationRuleRow> {
  const values = validateEntity(durationRuleSchema, { ...durationRuleDefaults, ...definedOnly(input) });
  await assertReferences(ctx, values);
  return inTransaction(ctx, async (tx) => {
    const [row] = await tx.db
      .insert(durationRules)
      .values({ ...values, restaurantId: ctx.restaurantId })
      .returning();
    await recordAudit(tx, { entity: "duration_rule", entityId: row!.id, action: "create", changes: values });
    return row!;
  });
}

export async function updateDurationRule(
  ctx: TenantContext,
  id: string,
  patch: DurationRuleUpdate,
): Promise<DurationRuleRow> {
  const current = await getDurationRule(ctx, id);
  const changes = definedOnly(patch);
  const values = validateEntity(durationRuleSchema, { ...current, ...changes });
  await assertReferences(ctx, changes);
  return inTransaction(ctx, async (tx) => {
    const [row] = await tx.db
      .update(durationRules)
      .set(values)
      .where(and(eq(durationRules.id, id), eq(durationRules.restaurantId, ctx.restaurantId)))
      .returning();
    await recordAudit(tx, { entity: "duration_rule", entityId: id, action: "update", changes });
    return row!;
  });
}

export async function deleteDurationRule(ctx: TenantContext, id: string): Promise<void> {
  await getDurationRule(ctx, id);
  await inTransaction(ctx, async (tx) => {
    await tx.db
      .delete(durationRules)
      .where(and(eq(durationRules.id, id), eq(durationRules.restaurantId, ctx.restaurantId)));
    await recordAudit(tx, { entity: "duration_rule", entityId: id, action: "delete" });
  });
}
