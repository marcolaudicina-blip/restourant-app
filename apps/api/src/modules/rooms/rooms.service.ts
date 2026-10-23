import { rooms } from "@restourant/db";
import { room as roomSchema, roomDefaults, type RoomCreateInput, type RoomUpdate } from "@restourant/shared";
import { and, asc, eq } from "drizzle-orm";
import { recordAudit } from "../../lib/audit.js";
import { inTransaction, type TenantContext } from "../../lib/context.js";
import { deleteOrExplain, notFound, validateEntity } from "../../lib/errors.js";
import { definedOnly, withoutTenant } from "../../lib/http.js";

type RoomRow = typeof rooms.$inferSelect;

export const toRoom = (row: RoomRow) => withoutTenant(row);

export function listRooms(ctx: TenantContext): Promise<RoomRow[]> {
  return ctx.db
    .select()
    .from(rooms)
    .where(eq(rooms.restaurantId, ctx.restaurantId))
    .orderBy(asc(rooms.sortOrder), asc(rooms.name));
}

export async function getRoom(ctx: TenantContext, id: string): Promise<RoomRow> {
  const [row] = await ctx.db
    .select()
    .from(rooms)
    .where(and(eq(rooms.id, id), eq(rooms.restaurantId, ctx.restaurantId)))
    .limit(1);
  if (!row) throw notFound("Sala");
  return row;
}

export async function createRoom(ctx: TenantContext, input: RoomCreateInput): Promise<RoomRow> {
  const values = validateEntity(roomSchema, { ...roomDefaults, ...definedOnly(input) });
  return inTransaction(ctx, async (tx) => {
    const [row] = await tx.db
      .insert(rooms)
      .values({ ...values, restaurantId: ctx.restaurantId })
      .returning();
    await recordAudit(tx, { entity: "room", entityId: row!.id, action: "create", changes: values });
    return row!;
  });
}

export async function updateRoom(ctx: TenantContext, id: string, patch: RoomUpdate): Promise<RoomRow> {
  const current = await getRoom(ctx, id);
  const changes = definedOnly(patch);
  const values = validateEntity(roomSchema, { ...current, ...changes });
  return inTransaction(ctx, async (tx) => {
    const [row] = await tx.db
      .update(rooms)
      .set(values)
      .where(and(eq(rooms.id, id), eq(rooms.restaurantId, ctx.restaurantId)))
      .returning();
    await recordAudit(tx, { entity: "room", entityId: id, action: "update", changes });
    return row!;
  });
}

/** Deleting a room also deletes its tables (and their combinations) through cascades. */
export async function deleteRoom(ctx: TenantContext, id: string): Promise<void> {
  await getRoom(ctx, id);
  await inTransaction(ctx, async (tx) => {
    await deleteOrExplain("La sala", () =>
      tx.db.delete(rooms).where(and(eq(rooms.id, id), eq(rooms.restaurantId, ctx.restaurantId))),
    );
    await recordAudit(tx, { entity: "room", entityId: id, action: "delete" });
  });
}
