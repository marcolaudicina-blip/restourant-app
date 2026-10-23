import { guests, reservations } from "@restourant/db";
import {
  guest as guestSchema,
  guestDefaults,
  normalizePhone,
  type GuestCreateInput,
  type GuestUpdate,
} from "@restourant/shared";
import { and, asc, desc, eq, ilike, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import { recordAudit } from "../../lib/audit.js";
import { inTransaction, type TenantContext } from "../../lib/context.js";
import {
  conflict,
  invalid,
  notFound,
  pgConstraint,
  pgErrorCode,
  PG_UNIQUE_VIOLATION,
  validateEntity,
} from "../../lib/errors.js";
import { definedOnly } from "../../lib/http.js";

type GuestRow = typeof guests.$inferSelect;

export type GuestStats = {
  /** Past stays: seated/completed, or confirmed bookings whose time has passed. */
  visits: number;
  covers: number;
  noShows: number;
  cancellations: number;
  upcoming: number;
  lastVisit: string | null;
  nextBooking: string | null;
};

export type Guest = Omit<GuestRow, "restaurantId" | "phoneNormalized"> & { stats: GuestStats };

const EMPTY_STATS: GuestStats = {
  visits: 0,
  covers: 0,
  noShows: 0,
  cancellations: 0,
  upcoming: 0,
  lastVisit: null,
  nextBooking: null,
};

const visited = sql`(${reservations.status} in ('arrived', 'seated', 'completed') or (${reservations.status} = 'confirmed' and ${reservations.endsAt} < now()))`;
const upcoming = sql`(${reservations.status} in ('requested', 'confirmed') and ${reservations.startsAt} >= now())`;

function statsQuery(ctx: TenantContext) {
  return ctx.db
    .select({
      guestId: reservations.guestId,
      visits: sql<number>`count(*) filter (where ${visited})`.mapWith(Number).as("visits"),
      covers: sql<number>`coalesce(sum(${reservations.partySize}) filter (where ${visited}), 0)`
        .mapWith(Number)
        .as("covers"),
      noShows: sql<number>`count(*) filter (where ${reservations.status} = 'no_show')`
        .mapWith(Number)
        .as("no_shows"),
      cancellations: sql<number>`count(*) filter (where ${reservations.status} = 'cancelled')`
        .mapWith(Number)
        .as("cancellations"),
      upcoming: sql<number>`count(*) filter (where ${upcoming})`.mapWith(Number).as("upcoming"),
      lastVisit: sql<string | null>`max(${reservations.date}) filter (where ${visited})`.as("last_visit"),
      nextBooking: sql<string | null>`min(${reservations.date}) filter (where ${upcoming})`.as(
        "next_booking",
      ),
      lastActivity: sql<string | null>`max(${reservations.startsAt})`.as("last_activity"),
    })
    .from(reservations)
    .where(eq(reservations.restaurantId, ctx.restaurantId))
    .groupBy(reservations.guestId);
}

/** Booking statistics for the given guests, from their whole history. */
export async function guestStats(ctx: TenantContext, guestIds: string[]): Promise<Map<string, GuestStats>> {
  if (guestIds.length === 0) return new Map();
  const rows = await statsQuery(ctx).having(inArray(reservations.guestId, guestIds));
  return new Map(
    rows.map(({ guestId, lastActivity: _lastActivity, ...stats }) => [guestId!, stats satisfies GuestStats]),
  );
}

const toGuest = (row: GuestRow, stats: GuestStats | undefined): Guest => {
  const { restaurantId: _restaurantId, phoneNormalized: _phoneNormalized, ...guest } = row;
  return { ...guest, stats: stats ?? EMPTY_STATS };
};

/** Guests matching a name, phone or email fragment; most recently active first. */
export async function listGuests(ctx: TenantContext, query: { q?: string; limit: number }): Promise<Guest[]> {
  const stats = statsQuery(ctx).as("stats");
  const q = query.q?.trim();
  const digits = q?.replace(/\D/g, "") ?? "";
  const filters: SQL[] = [];
  if (q) {
    filters.push(ilike(guests.fullName, `%${q}%`), ilike(guests.email, `%${q}%`));
    if (digits.length >= 3) filters.push(sql`${guests.phoneNormalized} like ${`%${digits}%`}`);
  }

  const rows = await ctx.db
    .select({
      guest: guests,
      hasStats: stats.guestId,
      visits: stats.visits,
      covers: stats.covers,
      noShows: stats.noShows,
      cancellations: stats.cancellations,
      upcoming: stats.upcoming,
      lastVisit: stats.lastVisit,
      nextBooking: stats.nextBooking,
    })
    .from(guests)
    .leftJoin(stats, eq(stats.guestId, guests.id))
    .where(and(eq(guests.restaurantId, ctx.restaurantId), filters.length ? or(...filters) : undefined))
    .orderBy(sql`${stats.lastActivity} desc nulls last`, asc(sql`lower(${guests.fullName})`))
    .limit(query.limit);

  return rows.map(({ guest, hasStats, ...values }) =>
    toGuest(guest, hasStats ? (values as GuestStats) : undefined),
  );
}

async function getRow(ctx: TenantContext, id: string): Promise<GuestRow> {
  const [row] = await ctx.db
    .select()
    .from(guests)
    .where(and(eq(guests.id, id), eq(guests.restaurantId, ctx.restaurantId)))
    .limit(1);
  if (!row) throw notFound("Cliente");
  return row;
}

export async function getGuest(ctx: TenantContext, id: string): Promise<Guest> {
  const row = await getRow(ctx, id);
  return toGuest(row, (await guestStats(ctx, [id])).get(id));
}

function contactValues(fields: { phone?: string | null; email?: string | null }) {
  const phone = fields.phone?.trim() || null;
  const phoneNormalized = normalizePhone(phone);
  if (phone && !phoneNormalized) {
    throw invalid("Numero di telefono non valido", [{ path: "phone", message: phone }]);
  }
  return { phone, phoneNormalized, email: fields.email?.trim().toLowerCase() || null };
}

function rethrowDuplicatePhone(error: unknown): never {
  if (pgErrorCode(error) === PG_UNIQUE_VIOLATION && pgConstraint(error) === "guests_restaurant_phone_idx") {
    throw conflict("guest_phone_taken", "Esiste già un cliente con questo numero di telefono");
  }
  throw error;
}

export async function createGuest(ctx: TenantContext, input: GuestCreateInput): Promise<Guest> {
  const values = validateEntity(guestSchema, { ...guestDefaults, ...definedOnly(input) });
  const contact = contactValues(values);
  try {
    const row = await inTransaction(ctx, async (tx) => {
      const [created] = await tx.db
        .insert(guests)
        .values({ ...values, ...contact, restaurantId: ctx.restaurantId })
        .returning();
      await recordAudit(tx, { entity: "guest", entityId: created!.id, action: "create", changes: values });
      return created!;
    });
    return toGuest(row, undefined);
  } catch (error) {
    rethrowDuplicatePhone(error);
  }
}

export async function updateGuest(ctx: TenantContext, id: string, patch: GuestUpdate): Promise<Guest> {
  const current = await getRow(ctx, id);
  const changes = definedOnly(patch);
  const values = validateEntity(guestSchema, { ...current, ...changes });
  const contact = contactValues(values);
  try {
    await inTransaction(ctx, async (tx) => {
      await tx.db
        .update(guests)
        .set({ ...values, ...contact })
        .where(and(eq(guests.id, id), eq(guests.restaurantId, ctx.restaurantId)));
      await recordAudit(tx, { entity: "guest", entityId: id, action: "update", changes });
    });
  } catch (error) {
    rethrowDuplicatePhone(error);
  }
  return getGuest(ctx, id);
}

/**
 * Right to be forgotten: the profile is deleted and the guest's past reservations are anonymized,
 * keeping only what the restaurant needs for its numbers (dates, covers, tables).
 */
export async function deleteGuest(ctx: TenantContext, id: string): Promise<void> {
  await getRow(ctx, id);
  await inTransaction(ctx, async (tx) => {
    await tx.db
      .update(reservations)
      .set({
        guestId: null,
        guestName: "Cliente rimosso",
        guestPhone: null,
        guestEmail: null,
        guestNote: null,
      })
      .where(and(eq(reservations.guestId, id), eq(reservations.restaurantId, ctx.restaurantId)));
    await tx.db.delete(guests).where(and(eq(guests.id, id), eq(guests.restaurantId, ctx.restaurantId)));
    await recordAudit(tx, { entity: "guest", entityId: id, action: "delete" });
  });
}

/**
 * Finds the guest a booking belongs to, creating the profile on first contact.
 * Order: explicit guest id → same phone → same email (among guests without a phone yet). Missing
 * contact details are filled in on the existing profile; the name the guest already has is kept.
 * Returns null when there is nothing to recognize the guest by (e.g. an anonymous walk-in).
 */
export async function matchGuest(
  ctx: TenantContext,
  input: { guestId?: string | null; name: string; phone?: string | null; email?: string | null },
): Promise<string | null> {
  const phone = input.phone?.trim() || null;
  const phoneNormalized = normalizePhone(phone);
  const email = input.email?.trim().toLowerCase() || null;

  let existing: GuestRow | undefined;
  if (input.guestId) existing = await getRow(ctx, input.guestId);
  if (!existing && phoneNormalized) {
    [existing] = await ctx.db
      .select()
      .from(guests)
      .where(and(eq(guests.restaurantId, ctx.restaurantId), eq(guests.phoneNormalized, phoneNormalized)))
      .limit(1);
  }
  if (!existing && email) {
    [existing] = await ctx.db
      .select()
      .from(guests)
      .where(
        and(
          eq(guests.restaurantId, ctx.restaurantId),
          sql`lower(${guests.email}) = ${email}`,
          isNull(guests.phoneNormalized),
        ),
      )
      .orderBy(desc(guests.updatedAt))
      .limit(1);
  }

  if (existing) {
    const fill: Partial<GuestRow> = {};
    if (!existing.phoneNormalized && phoneNormalized) Object.assign(fill, { phone, phoneNormalized });
    if (!existing.email && email) fill.email = email;
    if (Object.keys(fill).length > 0) {
      await ctx.db.update(guests).set(fill).where(eq(guests.id, existing.id));
    }
    return existing.id;
  }

  if (!phoneNormalized && !email) return null;
  const [created] = await ctx.db
    .insert(guests)
    .values({ restaurantId: ctx.restaurantId, fullName: input.name, phone, phoneNormalized, email })
    .onConflictDoNothing()
    .returning({ id: guests.id });
  if (created) return created.id;
  // Created concurrently by another booking with the same phone.
  const [raced] = await ctx.db
    .select({ id: guests.id })
    .from(guests)
    .where(and(eq(guests.restaurantId, ctx.restaurantId), eq(guests.phoneNormalized, phoneNormalized!)))
    .limit(1);
  return raced?.id ?? null;
}
