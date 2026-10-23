import { calendarExceptions } from "@restourant/db";
import {
  calendarException as calendarExceptionSchema,
  calendarExceptionDefaults,
  normalizeTime,
  type CalendarExceptionCreateInput,
  type CalendarExceptionUpdate,
} from "@restourant/shared";
import { and, asc, eq, gte, lte } from "drizzle-orm";
import { recordAudit } from "../../lib/audit.js";
import { inTransaction, type TenantContext } from "../../lib/context.js";
import { notFound, validateEntity } from "../../lib/errors.js";
import { definedOnly, withoutTenant } from "../../lib/http.js";
import { assertServicesOwned } from "../../lib/ownership.js";

type CalendarExceptionRow = typeof calendarExceptions.$inferSelect;

export const toCalendarException = (row: CalendarExceptionRow) => ({
  ...withoutTenant(row),
  firstArrival: row.firstArrival === null ? null : normalizeTime(row.firstArrival),
  lastArrival: row.lastArrival === null ? null : normalizeTime(row.lastArrival),
});

/** Exceptions overlapping the [from, to] date range (both optional, inclusive). */
export function listCalendarExceptions(
  ctx: TenantContext,
  range: { from?: string; to?: string } = {},
): Promise<CalendarExceptionRow[]> {
  return ctx.db
    .select()
    .from(calendarExceptions)
    .where(
      and(
        eq(calendarExceptions.restaurantId, ctx.restaurantId),
        range.from ? gte(calendarExceptions.dateTo, range.from) : undefined,
        range.to ? lte(calendarExceptions.dateFrom, range.to) : undefined,
      ),
    )
    .orderBy(asc(calendarExceptions.dateFrom));
}

export async function getCalendarException(ctx: TenantContext, id: string): Promise<CalendarExceptionRow> {
  const [row] = await ctx.db
    .select()
    .from(calendarExceptions)
    .where(and(eq(calendarExceptions.id, id), eq(calendarExceptions.restaurantId, ctx.restaurantId)))
    .limit(1);
  if (!row) throw notFound("Eccezione di calendario");
  return row;
}

export async function createCalendarException(
  ctx: TenantContext,
  input: CalendarExceptionCreateInput,
): Promise<CalendarExceptionRow> {
  const values = validateEntity(calendarExceptionSchema, {
    ...calendarExceptionDefaults,
    ...definedOnly(input),
  });
  await assertServicesOwned(ctx, [values.serviceId]);
  return inTransaction(ctx, async (tx) => {
    const [row] = await tx.db
      .insert(calendarExceptions)
      .values({ ...values, restaurantId: ctx.restaurantId })
      .returning();
    await recordAudit(tx, {
      entity: "calendar_exception",
      entityId: row!.id,
      action: "create",
      changes: values,
    });
    return row!;
  });
}

export async function updateCalendarException(
  ctx: TenantContext,
  id: string,
  patch: CalendarExceptionUpdate,
): Promise<CalendarExceptionRow> {
  const current = toCalendarException(await getCalendarException(ctx, id));
  const changes = definedOnly(patch);
  const values = validateEntity(calendarExceptionSchema, { ...current, ...changes });
  await assertServicesOwned(ctx, [changes.serviceId]);
  return inTransaction(ctx, async (tx) => {
    const [row] = await tx.db
      .update(calendarExceptions)
      .set(values)
      .where(and(eq(calendarExceptions.id, id), eq(calendarExceptions.restaurantId, ctx.restaurantId)))
      .returning();
    await recordAudit(tx, { entity: "calendar_exception", entityId: id, action: "update", changes });
    return row!;
  });
}

export async function deleteCalendarException(ctx: TenantContext, id: string): Promise<void> {
  await getCalendarException(ctx, id);
  await inTransaction(ctx, async (tx) => {
    await tx.db
      .delete(calendarExceptions)
      .where(and(eq(calendarExceptions.id, id), eq(calendarExceptions.restaurantId, ctx.restaurantId)));
    await recordAudit(tx, { entity: "calendar_exception", entityId: id, action: "delete" });
  });
}
