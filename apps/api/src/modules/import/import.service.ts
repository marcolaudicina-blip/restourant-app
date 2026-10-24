import { diningTables, guests, reservations } from "@restourant/db";
import {
  guestImportRow,
  instantToLocal,
  normalizePhone,
  reservationImportRow,
  type ImportResult,
} from "@restourant/shared";
import { and, eq, inArray, or, sql } from "drizzle-orm";
import { recordAudit } from "../../lib/audit.js";
import { inTransaction, type TenantContext } from "../../lib/context.js";
import { AppError } from "../../lib/errors.js";
import { createReservation } from "../reservations/reservations.service.js";
import { getRestaurant } from "../restaurants/restaurants.service.js";

/*
 * Bringing a restaurant's history over from another system. Rows are validated one by one: good ones
 * are imported, bad ones are reported with their line in the file. Importing the same file twice
 * changes nothing the second time (guests are matched, bookings recognized).
 */

const firstIssue = (error: { issues: { path: PropertyKey[]; message: string }[] }) => {
  const issue = error.issues[0]!;
  return issue.path.length ? `${String(issue.path[0])}: ${issue.message}` : issue.message;
};

type GuestRow = typeof guests.$inferSelect;

/** Adds guests, or completes the ones already known (same phone, or same email). */
export async function importGuests(
  ctx: TenantContext,
  rows: unknown[],
  firstRow: number,
): Promise<ImportResult> {
  const result: ImportResult = { created: 0, updated: 0, skipped: 0, errors: [] };
  const valid = rows.flatMap((raw, i) => {
    const parsed = guestImportRow.safeParse(raw);
    if (!parsed.success) {
      result.errors.push({ row: firstRow + i, message: firstIssue(parsed.error) });
      return [];
    }
    const phone = parsed.data.phone?.trim() || null;
    const phoneNormalized = normalizePhone(phone);
    const email = parsed.data.email?.trim().toLowerCase() || null;
    if (!phoneNormalized && !email) {
      result.skipped += 1;
      result.errors.push({
        row: firstRow + i,
        message: "Senza telefono né email: il cliente non sarebbe riconoscibile",
      });
      return [];
    }
    return [
      { ...parsed.data, phone: phoneNormalized ? phone : null, phoneNormalized, email, row: firstRow + i },
    ];
  });
  if (valid.length === 0) return result;

  await inTransaction(ctx, async (tx) => {
    const phones = valid.flatMap((r) => (r.phoneNormalized ? [r.phoneNormalized] : []));
    const emails = valid.flatMap((r) => (r.email ? [r.email] : []));
    const known = await tx.db
      .select()
      .from(guests)
      .where(
        and(
          eq(guests.restaurantId, ctx.restaurantId),
          or(
            phones.length ? inArray(guests.phoneNormalized, phones) : undefined,
            emails.length ? inArray(sql`lower(${guests.email})`, emails) : undefined,
          ),
        ),
      );
    const byPhone = new Map(known.filter((g) => g.phoneNormalized).map((g) => [g.phoneNormalized!, g]));
    const byEmail = new Map(known.filter((g) => g.email).map((g) => [g.email!.toLowerCase(), g]));
    const remember = (g: GuestRow) => {
      if (g.phoneNormalized) byPhone.set(g.phoneNormalized, g);
      if (g.email) byEmail.set(g.email.toLowerCase(), g);
    };

    for (const row of valid) {
      const existing =
        (row.phoneNormalized ? byPhone.get(row.phoneNormalized) : undefined) ??
        (row.email ? byEmail.get(row.email) : undefined);
      const tags = [...new Set((row.tags ?? []).map((t) => t.trim()).filter(Boolean))];
      const note = row.note?.trim() || null;

      if (existing) {
        const mergedTags = [...new Set([...existing.tags, ...tags])];
        const mergedNote =
          note && !(existing.profileNote ?? "").includes(note)
            ? [existing.profileNote, note].filter(Boolean).join("\n")
            : existing.profileNote;
        const changes: Partial<GuestRow> = {
          ...(!existing.phoneNormalized && row.phoneNormalized
            ? { phone: row.phone, phoneNormalized: row.phoneNormalized }
            : {}),
          ...(!existing.email && row.email ? { email: row.email } : {}),
          ...(mergedTags.length !== existing.tags.length ? { tags: mergedTags } : {}),
          ...(mergedNote !== existing.profileNote ? { profileNote: mergedNote } : {}),
          ...(row.marketingConsent && !existing.marketingConsent ? { marketingConsent: true } : {}),
        };
        if (Object.keys(changes).length === 0) {
          result.skipped += 1;
          continue;
        }
        const [updated] = await tx.db
          .update(guests)
          .set(changes)
          .where(eq(guests.id, existing.id))
          .returning();
        remember(updated!);
        result.updated += 1;
      } else {
        const [created] = await tx.db
          .insert(guests)
          .values({
            restaurantId: ctx.restaurantId,
            fullName: row.fullName,
            phone: row.phone,
            phoneNormalized: row.phoneNormalized,
            email: row.email,
            profileNote: note,
            tags,
            marketingConsent: row.marketingConsent ?? false,
          })
          .returning();
        remember(created!);
        result.created += 1;
      }
    }
    await recordAudit(tx, {
      entity: "import",
      action: "create",
      changes: { kind: "guests", created: result.created, updated: result.updated, skipped: result.skipped },
    });
  });
  return result;
}

/**
 * Adds future bookings. Rules that protect guests from overbooking still apply (tables can't be
 * double-booked); pacing limits don't, since these bookings were already accepted elsewhere.
 */
export async function importReservations(
  ctx: TenantContext,
  rows: unknown[],
  firstRow: number,
  now: Date,
): Promise<ImportResult> {
  const result: ImportResult = { created: 0, updated: 0, skipped: 0, errors: [] };
  const restaurant = await getRestaurant(ctx);
  const today = instantToLocal(now, restaurant.timezone).date;
  const tables = await ctx.db
    .select({ id: diningTables.id, name: diningTables.name })
    .from(diningTables)
    .where(eq(diningTables.restaurantId, ctx.restaurantId));
  const tableByName = new Map(tables.map((t) => [t.name.trim().toLowerCase(), t.id]));

  for (const [i, raw] of rows.entries()) {
    const line = firstRow + i;
    const parsed = reservationImportRow.safeParse(raw);
    if (!parsed.success) {
      result.errors.push({ row: line, message: firstIssue(parsed.error) });
      continue;
    }
    const row = parsed.data;
    if (row.date < today) {
      result.skipped += 1;
      continue;
    }
    const [duplicate] = await ctx.db
      .select({ id: reservations.id })
      .from(reservations)
      .where(
        and(
          eq(reservations.restaurantId, ctx.restaurantId),
          eq(reservations.date, row.date),
          eq(reservations.startTime, row.time),
          sql`lower(${reservations.guestName}) = ${row.guestName.toLowerCase()}`,
        ),
      )
      .limit(1);
    if (duplicate) {
      result.skipped += 1;
      continue;
    }

    const tableIds = row.tableName
      ? row.tableName
          .split(/[+,]/)
          .map((name) => tableByName.get(name.trim().toLowerCase()))
          .filter((id): id is string => Boolean(id))
      : [];
    try {
      await createReservation(ctx, {
        date: row.date,
        time: row.time,
        partySize: row.partySize,
        guestName: row.guestName,
        guestPhone: row.guestPhone ?? null,
        guestEmail: row.guestEmail ?? null,
        guestNote: row.guestNote ?? null,
        internalNote: row.internalNote ?? null,
        status: row.status ?? "confirmed",
        ignorePacing: true,
        ...(tableIds.length ? { tableIds: [...new Set(tableIds)], ignoreCapacity: true } : {}),
      });
      result.created += 1;
    } catch (error) {
      if (!(error instanceof AppError)) throw error;
      result.errors.push({ row: line, message: error.message });
    }
  }
  return result;
}
