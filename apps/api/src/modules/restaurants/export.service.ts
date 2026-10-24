import {
  bookingPages,
  bookingPolicies,
  calendarExceptions,
  diningTables,
  durationRules,
  guests,
  memberships,
  reservations,
  reservationTables,
  restaurants,
  rooms,
  services,
  tableBlocks,
  tableCombinations,
  users,
  waitlistEntries,
} from "@restourant/db";
import { asc, eq } from "drizzle-orm";
import { recordAudit } from "../../lib/audit.js";
import type { TenantContext } from "../../lib/context.js";

/*
 * Everything the restaurant has in TwentyReserve, as one JSON file (GDPR data portability, and a
 * copy the owner keeps). Pictures and the audit log stay out; passwords never leave the database.
 */

export async function exportRestaurant(ctx: TenantContext, now: Date) {
  const id = ctx.restaurantId;
  const of = <T extends { restaurantId: unknown }>(table: T) => eq(table.restaurantId as never, id);
  const [
    [restaurant],
    [policy],
    [page],
    roomRows,
    tableRows,
    combinationRows,
    serviceRows,
    durationRows,
    exceptionRows,
    blockRows,
    guestRows,
    reservationRows,
    heldTables,
    waitlistRows,
    team,
  ] = await Promise.all([
    ctx.db.select().from(restaurants).where(eq(restaurants.id, id)),
    ctx.db.select().from(bookingPolicies).where(of(bookingPolicies)),
    ctx.db.select().from(bookingPages).where(of(bookingPages)),
    ctx.db.select().from(rooms).where(of(rooms)),
    ctx.db.select().from(diningTables).where(of(diningTables)),
    ctx.db.select().from(tableCombinations).where(of(tableCombinations)),
    ctx.db.select().from(services).where(of(services)),
    ctx.db.select().from(durationRules).where(of(durationRules)),
    ctx.db.select().from(calendarExceptions).where(of(calendarExceptions)),
    ctx.db.select().from(tableBlocks).where(of(tableBlocks)),
    ctx.db.select().from(guests).where(of(guests)).orderBy(asc(guests.createdAt)),
    ctx.db.select().from(reservations).where(of(reservations)).orderBy(asc(reservations.startsAt)),
    ctx.db
      .select({ reservationId: reservationTables.reservationId, tableId: reservationTables.tableId })
      .from(reservationTables)
      .where(of(reservationTables)),
    ctx.db.select().from(waitlistEntries).where(of(waitlistEntries)),
    ctx.db
      .select({
        fullName: users.fullName,
        email: users.email,
        role: memberships.role,
        since: memberships.createdAt,
      })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(eq(memberships.restaurantId, id)),
  ]);
  const tablesOf = Map.groupBy(heldTables, (h) => h.reservationId);
  await recordAudit(ctx, { entity: "export", action: "create", changes: { guests: guestRows.length } });
  return {
    format: "twentyreserve-export",
    version: 1,
    exportedAt: now.toISOString(),
    restaurant,
    bookingPolicy: policy ?? null,
    bookingPage: page ?? null,
    team,
    rooms: roomRows,
    tables: tableRows,
    combinations: combinationRows,
    services: serviceRows,
    durationRules: durationRows,
    calendarExceptions: exceptionRows,
    tableBlocks: blockRows,
    guests: guestRows,
    reservations: reservationRows.map((r) => ({
      ...r,
      tableIds: (tablesOf.get(r.id) ?? []).map((t) => t.tableId),
    })),
    waitlist: waitlistRows,
  };
}
