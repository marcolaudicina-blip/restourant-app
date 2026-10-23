import {
  auditLog,
  bookingPolicies,
  diningTables,
  durationRules,
  rooms,
  serviceRooms,
  services,
  tableAdjacencies,
  users,
} from "@restourant/db";
import {
  bookingPolicy as bookingPolicySchema,
  buildDaySchedule,
  CONFIG_TEMPLATES,
  getConfigTemplate,
  gridPosition,
  roomDefaults,
  service as serviceSchema,
  serviceDefaults,
  table as tableSchema,
  tableDefaults,
  type Channel,
  type ConfigTemplate,
} from "@restourant/shared";
import { and, count, desc, eq, lt } from "drizzle-orm";
import { recordAudit } from "../../lib/audit.js";
import { inTransaction, type TenantContext } from "../../lib/context.js";
import { conflict, notFound, validateEntity } from "../../lib/errors.js";
import {
  listCalendarExceptions,
  toCalendarException,
} from "../calendar-exceptions/calendar-exceptions.service.js";
import { listCombinations } from "../combinations/combinations.service.js";
import { listDurationRules, toDurationRule } from "../duration-rules/duration-rules.service.js";
import { getBookingPolicy, getRestaurant, toBookingPolicy } from "../restaurants/restaurants.service.js";
import { listRooms, toRoom } from "../rooms/rooms.service.js";
import { listServices } from "../services/services.service.js";
import { canonicalPairs, listAdjacencies, listTables, toTable } from "../tables/tables.service.js";
import { listTableBlocks, toTableBlock } from "../table-blocks/table-blocks.service.js";

/** The whole setup in one payload: what the admin UI loads and what an export contains. */
export async function getConfigSnapshot(ctx: TenantContext) {
  const [
    restaurant,
    policy,
    roomRows,
    tableRows,
    adjacencies,
    combinations,
    serviceList,
    rules,
    exceptions,
    blocks,
  ] = await Promise.all([
    getRestaurant(ctx),
    getBookingPolicy(ctx),
    listRooms(ctx),
    listTables(ctx),
    listAdjacencies(ctx),
    listCombinations(ctx),
    listServices(ctx),
    listDurationRules(ctx),
    listCalendarExceptions(ctx),
    listTableBlocks(ctx, { from: new Date().toISOString() }),
  ]);
  return {
    restaurant,
    bookingPolicy: toBookingPolicy(policy),
    rooms: roomRows.map(toRoom),
    tables: tableRows.map(toTable),
    tableAdjacencies: adjacencies,
    combinations,
    services: serviceList,
    durationRules: rules.map(toDurationRule),
    calendarExceptions: exceptions.map(toCalendarException),
    upcomingTableBlocks: blocks.map(toTableBlock),
  };
}

/** Which services run on a date and their arrival slots, as the staff or a guest would see them. */
export async function getDaySchedule(ctx: TenantContext, date: string, channel: Channel) {
  const [policy, serviceList, exceptions] = await Promise.all([
    getBookingPolicy(ctx),
    listServices(ctx),
    listCalendarExceptions(ctx, { from: date, to: date }),
  ]);
  return {
    date,
    channel,
    services: buildDaySchedule({
      date,
      channel,
      defaultSlotIntervalMinutes: policy.slotIntervalMinutes,
      services: serviceList,
      exceptions: exceptions.map(toCalendarException),
    }),
  };
}

export function listTemplates() {
  return CONFIG_TEMPLATES.map((t) => {
    const tables = t.rooms.flatMap((r) => r.tables);
    return {
      key: t.key,
      name: t.name,
      description: t.description,
      summary: {
        rooms: t.rooms.length,
        tables: tables.length,
        covers: tables.reduce((sum, table) => sum + table.maxCovers, 0),
        services: t.services.map((s) => s.name),
      },
    };
  });
}

/**
 * Seeds an empty restaurant from a starter template in a single transaction.
 * Refuses to touch a restaurant that already has rooms or services, so nothing is overwritten.
 */
export async function applyTemplate(ctx: TenantContext, key: string) {
  const template: ConfigTemplate | undefined = getConfigTemplate(key);
  if (!template) throw notFound("Modello");

  const [[roomCount], [serviceCount]] = await Promise.all([
    ctx.db.select({ n: count() }).from(rooms).where(eq(rooms.restaurantId, ctx.restaurantId)),
    ctx.db.select({ n: count() }).from(services).where(eq(services.restaurantId, ctx.restaurantId)),
  ]);
  if ((roomCount?.n ?? 0) > 0 || (serviceCount?.n ?? 0) > 0) {
    throw conflict(
      "config_not_empty",
      "Il modello si può applicare solo a un ristorante ancora da configurare",
    );
  }

  const policy = validateEntity(bookingPolicySchema, {
    ...toBookingPolicy(await getBookingPolicy(ctx)),
    ...template.policy,
  });

  await inTransaction(ctx, async (tx) => {
    const restaurantId = ctx.restaurantId;
    await tx.db.update(bookingPolicies).set(policy).where(eq(bookingPolicies.restaurantId, restaurantId));

    const roomIdByName = new Map<string, string>();
    const tableIdByName = new Map<string, string>();

    for (const [roomIndex, room] of template.rooms.entries()) {
      const [roomRow] = await tx.db
        .insert(rooms)
        .values({
          ...roomDefaults,
          restaurantId,
          name: room.name,
          sortOrder: roomIndex,
          guestSelectable: room.guestSelectable ?? false,
        })
        .returning({ id: rooms.id });
      roomIdByName.set(room.name, roomRow!.id);

      const tableValues = room.tables.map((t, i) => ({
        ...validateEntity(tableSchema, { ...tableDefaults, ...gridPosition(i), ...t, roomId: roomRow!.id }),
        restaurantId,
      }));
      const inserted = await tx.db
        .insert(diningTables)
        .values(tableValues)
        .returning({ id: diningTables.id, name: diningTables.name });
      for (const t of inserted) tableIdByName.set(t.name, t.id);
    }

    const edges = canonicalPairs(
      template.adjacencies.map(([a, b]) => ({
        tableAId: tableIdByName.get(a)!,
        tableBId: tableIdByName.get(b)!,
      })),
    );
    if (edges.length > 0) {
      await tx.db.insert(tableAdjacencies).values(edges.map((e) => ({ ...e, restaurantId })));
    }

    for (const { rooms: roomNames = [], ...fields } of template.services) {
      const { roomIds: _roomIds, ...values } = validateEntity(serviceSchema, {
        ...serviceDefaults,
        ...fields,
      });
      const [serviceRow] = await tx.db
        .insert(services)
        .values({ ...values, restaurantId })
        .returning({ id: services.id });
      const roomIds = roomNames.map((name) => roomIdByName.get(name)!);
      if (roomIds.length > 0) {
        await tx.db
          .insert(serviceRooms)
          .values(roomIds.map((roomId) => ({ serviceId: serviceRow!.id, roomId, restaurantId })));
      }
    }

    if (template.durationRules.length > 0) {
      await tx.db
        .insert(durationRules)
        .values(template.durationRules.map((r) => ({ ...r, serviceId: null, roomId: null, restaurantId })));
    }

    await recordAudit(tx, {
      entity: "restaurant",
      entityId: restaurantId,
      action: "apply_template",
      changes: { template: key },
    });
  });

  return getConfigSnapshot(ctx);
}

export async function listAuditLog(ctx: TenantContext, query: { limit: number; before?: string }) {
  return ctx.db
    .select({
      id: auditLog.id,
      entity: auditLog.entity,
      entityId: auditLog.entityId,
      action: auditLog.action,
      changes: auditLog.changes,
      createdAt: auditLog.createdAt,
      actor: { id: users.id, fullName: users.fullName },
    })
    .from(auditLog)
    .leftJoin(users, eq(users.id, auditLog.actorUserId))
    .where(
      and(
        eq(auditLog.restaurantId, ctx.restaurantId),
        query.before ? lt(auditLog.createdAt, new Date(query.before)) : undefined,
      ),
    )
    .orderBy(desc(auditLog.createdAt))
    .limit(query.limit);
}
