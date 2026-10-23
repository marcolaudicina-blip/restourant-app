import { bookingPolicies, restaurants } from "@restourant/db";
import {
  bookingPolicy as bookingPolicySchema,
  restaurantFields,
  type BookingPolicyUpdate,
  type RestaurantUpdate,
} from "@restourant/shared";
import { eq } from "drizzle-orm";
import { recordAudit } from "../../lib/audit.js";
import { inTransaction, type TenantContext } from "../../lib/context.js";
import { notFound, validateEntity } from "../../lib/errors.js";
import { definedOnly } from "../../lib/http.js";

type RestaurantRow = typeof restaurants.$inferSelect;
type PolicyRow = typeof bookingPolicies.$inferSelect;

export const toRestaurant = (row: RestaurantRow) => row;

export const toBookingPolicy = (row: PolicyRow) => {
  const { restaurantId: _restaurantId, createdAt: _createdAt, ...policy } = row;
  return policy;
};

export async function getRestaurant(ctx: TenantContext): Promise<RestaurantRow> {
  const [row] = await ctx.db.select().from(restaurants).where(eq(restaurants.id, ctx.restaurantId)).limit(1);
  if (!row) throw notFound("Ristorante");
  return row;
}

export async function updateRestaurant(ctx: TenantContext, patch: RestaurantUpdate): Promise<RestaurantRow> {
  const current = await getRestaurant(ctx);
  const changes = definedOnly(patch);
  const next = validateEntity(restaurantFields, { ...current, ...changes });
  return inTransaction(ctx, async (tx) => {
    const [row] = await tx.db
      .update(restaurants)
      .set(next)
      .where(eq(restaurants.id, ctx.restaurantId))
      .returning();
    await recordAudit(tx, { entity: "restaurant", entityId: ctx.restaurantId, action: "update", changes });
    return row!;
  });
}

export async function getBookingPolicy(ctx: TenantContext): Promise<PolicyRow> {
  const [row] = await ctx.db
    .select()
    .from(bookingPolicies)
    .where(eq(bookingPolicies.restaurantId, ctx.restaurantId))
    .limit(1);
  if (!row) throw notFound("Regole di prenotazione");
  return row;
}

export async function updateBookingPolicy(
  ctx: TenantContext,
  patch: BookingPolicyUpdate,
): Promise<PolicyRow> {
  const current = toBookingPolicy(await getBookingPolicy(ctx));
  const changes = definedOnly(patch);
  const next = validateEntity(bookingPolicySchema, { ...current, ...changes });
  return inTransaction(ctx, async (tx) => {
    const [row] = await tx.db
      .update(bookingPolicies)
      .set(next)
      .where(eq(bookingPolicies.restaurantId, ctx.restaurantId))
      .returning();
    await recordAudit(tx, {
      entity: "booking_policy",
      entityId: ctx.restaurantId,
      action: "update",
      changes,
    });
    return row!;
  });
}
