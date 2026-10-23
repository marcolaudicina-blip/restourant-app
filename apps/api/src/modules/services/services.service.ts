import { serviceRooms, services } from "@restourant/db";
import {
  normalizeTime,
  service as serviceSchema,
  serviceDefaults,
  type ServiceCreateInput,
  type ServiceFields,
  type ServiceUpdate,
} from "@restourant/shared";
import { and, asc, eq, inArray } from "drizzle-orm";
import { recordAudit } from "../../lib/audit.js";
import { inTransaction, type TenantContext } from "../../lib/context.js";
import { notFound, validateEntity } from "../../lib/errors.js";
import { definedOnly } from "../../lib/http.js";
import { assertRoomsOwned } from "../../lib/ownership.js";

type ServiceRow = typeof services.$inferSelect;

export type Service = ServiceFields & { id: string; createdAt: Date; updatedAt: Date };

function toService(row: ServiceRow, roomIds: string[]): Service {
  return {
    id: row.id,
    name: row.name,
    daysOfWeek: [...row.daysOfWeek].sort((a, b) => a - b),
    firstArrival: normalizeTime(row.firstArrival),
    lastArrival: normalizeTime(row.lastArrival),
    seatingMode: row.seatingMode,
    slotIntervalMinutes: row.slotIntervalMinutes as ServiceFields["slotIntervalMinutes"],
    fixedSeatings: row.fixedSeatings.map(normalizeTime).sort(),
    validFrom: row.validFrom,
    validTo: row.validTo,
    maxCovers: row.maxCovers,
    maxCoversPerSlot: row.maxCoversPerSlot,
    maxBookingsPerSlot: row.maxBookingsPerSlot,
    onlineBookable: row.onlineBookable,
    isActive: row.isActive,
    sortOrder: row.sortOrder,
    roomIds: [...roomIds].sort(),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function hydrate(ctx: TenantContext, rows: ServiceRow[]): Promise<Service[]> {
  if (rows.length === 0) return [];
  const links = await ctx.db
    .select({ serviceId: serviceRooms.serviceId, roomId: serviceRooms.roomId })
    .from(serviceRooms)
    .where(
      inArray(
        serviceRooms.serviceId,
        rows.map((r) => r.id),
      ),
    );
  const byService = Map.groupBy(links, (l) => l.serviceId);
  return rows.map((row) =>
    toService(
      row,
      (byService.get(row.id) ?? []).map((l) => l.roomId),
    ),
  );
}

export async function listServices(ctx: TenantContext): Promise<Service[]> {
  const rows = await ctx.db
    .select()
    .from(services)
    .where(eq(services.restaurantId, ctx.restaurantId))
    .orderBy(asc(services.sortOrder), asc(services.firstArrival));
  return hydrate(ctx, rows);
}

export async function getService(ctx: TenantContext, id: string): Promise<Service> {
  const [row] = await ctx.db
    .select()
    .from(services)
    .where(and(eq(services.id, id), eq(services.restaurantId, ctx.restaurantId)))
    .limit(1);
  if (!row) throw notFound("Servizio");
  const [service] = await hydrate(ctx, [row]);
  return service!;
}

async function writeRooms(ctx: TenantContext, serviceId: string, roomIds: string[]) {
  await ctx.db.delete(serviceRooms).where(eq(serviceRooms.serviceId, serviceId));
  if (roomIds.length > 0) {
    await ctx.db
      .insert(serviceRooms)
      .values(roomIds.map((roomId) => ({ serviceId, roomId, restaurantId: ctx.restaurantId })));
  }
}

export async function createService(ctx: TenantContext, input: ServiceCreateInput): Promise<Service> {
  const { roomIds, ...values } = validateEntity(serviceSchema, { ...serviceDefaults, ...definedOnly(input) });
  await assertRoomsOwned(ctx, roomIds, "roomIds");
  const id = await inTransaction(ctx, async (tx) => {
    const [row] = await tx.db
      .insert(services)
      .values({ ...values, restaurantId: ctx.restaurantId })
      .returning({ id: services.id });
    await writeRooms(tx, row!.id, roomIds);
    await recordAudit(tx, {
      entity: "service",
      entityId: row!.id,
      action: "create",
      changes: { ...values, roomIds },
    });
    return row!.id;
  });
  return getService(ctx, id);
}

export async function updateService(ctx: TenantContext, id: string, patch: ServiceUpdate): Promise<Service> {
  const current = await getService(ctx, id);
  const changes = definedOnly(patch);
  const { roomIds, ...values } = validateEntity(serviceSchema, { ...current, ...changes });
  if (changes.roomIds) await assertRoomsOwned(ctx, changes.roomIds, "roomIds");
  await inTransaction(ctx, async (tx) => {
    await tx.db
      .update(services)
      .set(values)
      .where(and(eq(services.id, id), eq(services.restaurantId, ctx.restaurantId)));
    if (changes.roomIds) await writeRooms(tx, id, roomIds);
    await recordAudit(tx, { entity: "service", entityId: id, action: "update", changes });
  });
  return getService(ctx, id);
}

export async function deleteService(ctx: TenantContext, id: string): Promise<void> {
  await getService(ctx, id);
  await inTransaction(ctx, async (tx) => {
    await tx.db.delete(services).where(and(eq(services.id, id), eq(services.restaurantId, ctx.restaurantId)));
    await recordAudit(tx, { entity: "service", entityId: id, action: "delete" });
  });
}
