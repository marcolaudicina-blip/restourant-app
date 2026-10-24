import { waitlistEntries } from "@restourant/db";
import {
  fitsWaitlistWindow,
  normalizePhone,
  normalizeTime,
  type OnlineWaitlistInput,
  type WaitlistCreateInput,
  type WaitlistUpdate,
} from "@restourant/shared";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { FastifyBaseLogger } from "fastify";
import { recordAudit } from "../../lib/audit.js";
import { inTransaction, type TenantContext } from "../../lib/context.js";
import { AppError, conflict, invalid, notFound } from "../../lib/errors.js";
import { definedOnly } from "../../lib/http.js";
import type { AppDeps } from "../../types.js";
import { getBookingPage } from "../booking-page/booking-page.service.js";
import { renderWaitlistEmail, type WaitlistEmailKind } from "../notifications/waitlist-email.template.js";
import { getPublicAvailability } from "../public/public.service.js";
import type { Reservation } from "../reservations/reservations.service.js";
import { getBookingPolicy, getRestaurant } from "../restaurants/restaurants.service.js";
import { OPEN } from "./waitlist-match.js";

/*
 * The waiting list of a full day. Staff add guests by hand, guests add themselves from the booking
 * page. When a booking of that day is cancelled, everyone still waiting whose time window now has
 * a free table gets an email with a link to book; the first to book gets it. A booking with the
 * same phone or email on that day takes the guest off the list (waitlist-match.ts).
 */

type Row = typeof waitlistEntries.$inferSelect;
type MailDeps = Pick<AppDeps, "mailer" | "publicUrl" | "now">;

export type WaitlistEntry = ReturnType<typeof toEntry>;

function toEntry({ restaurantId: _r, phoneNormalized: _p, timeFrom, timeTo, ...row }: Row) {
  return {
    ...row,
    timeFrom: timeFrom ? normalizeTime(timeFrom) : null,
    timeTo: timeTo ? normalizeTime(timeTo) : null,
    notifiedAt: row.notifiedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listWaitlist(ctx: TenantContext, date: string) {
  const rows = await ctx.db
    .select()
    .from(waitlistEntries)
    .where(and(eq(waitlistEntries.restaurantId, ctx.restaurantId), eq(waitlistEntries.date, date)))
    .orderBy(asc(waitlistEntries.createdAt));
  return rows.map(toEntry);
}

async function getRow(ctx: TenantContext, id: string) {
  const [row] = await ctx.db
    .select()
    .from(waitlistEntries)
    .where(and(eq(waitlistEntries.id, id), eq(waitlistEntries.restaurantId, ctx.restaurantId)))
    .limit(1);
  if (!row) throw notFound("Richiesta in lista d'attesa");
  return row;
}

function contact(input: { guestPhone?: string | null; guestEmail?: string | null }) {
  const phone = input.guestPhone?.trim() || null;
  const email = input.guestEmail?.trim() || null;
  if (phone && !normalizePhone(phone)) {
    throw invalid("Numero di telefono non valido", [{ path: "guestPhone", message: "Non valido" }]);
  }
  return { guestPhone: phone, guestEmail: email, phoneNormalized: phone ? normalizePhone(phone) : null };
}

export async function addToWaitlist(
  ctx: TenantContext,
  input: WaitlistCreateInput & { channel: "staff" | "online" },
): Promise<WaitlistEntry> {
  const details = contact(input);
  if (!details.guestPhone && !details.guestEmail) {
    throw invalid("Serve almeno un contatto (telefono o email)", [
      { path: "guestPhone", message: "Obbligatorio" },
    ]);
  }
  return inTransaction(ctx, async (tx) => {
    const [row] = await tx.db
      .insert(waitlistEntries)
      .values({
        restaurantId: ctx.restaurantId,
        date: input.date,
        partySize: input.partySize,
        timeFrom: input.timeFrom,
        timeTo: input.timeTo,
        guestName: input.guestName,
        note: input.note,
        channel: input.channel,
        locale: input.locale ?? "it",
        createdByUserId: ctx.actorUserId,
        ...details,
      })
      .returning();
    const { channel: _c, ...audit } = input;
    await recordAudit(tx, { entity: "waitlist", entityId: row!.id, action: "create", changes: audit });
    return toEntry(row!);
  });
}

export async function updateWaitlistEntry(
  ctx: TenantContext,
  id: string,
  patch: WaitlistUpdate,
): Promise<WaitlistEntry> {
  const current = await getRow(ctx, id);
  if (current.status === "booked") throw conflict("waitlist_booked", "Questa persona ha già prenotato");
  const merged = { ...current, ...definedOnly(patch) };
  const details = contact(merged);
  if (!details.guestPhone && !details.guestEmail) {
    throw invalid("Serve almeno un contatto (telefono o email)", [
      { path: "guestPhone", message: "Obbligatorio" },
    ]);
  }
  return inTransaction(ctx, async (tx) => {
    const [row] = await tx.db
      .update(waitlistEntries)
      .set({ ...definedOnly(patch), ...details })
      .where(and(eq(waitlistEntries.id, id), eq(waitlistEntries.restaurantId, ctx.restaurantId)))
      .returning();
    await recordAudit(tx, { entity: "waitlist", entityId: id, action: "update", changes: patch });
    return toEntry(row!);
  });
}

/**
 * Emails the guest (never throws). Returns the outcome, or null when there is no address; the
 * outcome is in the audit log like booking emails.
 */
async function sendWaitlistEmail(
  ctx: TenantContext,
  deps: MailDeps,
  entry: Row,
  kind: WaitlistEmailKind,
  times: string[],
  log: FastifyBaseLogger,
): Promise<"sent" | "failed" | "not_configured" | null> {
  const to = entry.guestEmail;
  if (!to) return null;
  try {
    let status: "sent" | "failed" | "not_configured" = "not_configured";
    if (deps.mailer.enabled) {
      const [restaurant, page] = await Promise.all([getRestaurant(ctx), getBookingPage(ctx)]);
      const email = renderWaitlistEmail({
        kind,
        restaurant,
        page,
        entry: toEntry(entry),
        times,
        publicUrl: deps.publicUrl,
      });
      try {
        await deps.mailer.send({ to, ...email, fromName: restaurant.name, replyTo: restaurant.email });
        status = "sent";
      } catch (e) {
        status = "failed";
        log.warn({ err: e, waitlistId: entry.id }, "Waitlist email not sent");
      }
    }
    await recordAudit(ctx, {
      entity: "email",
      entityId: entry.id,
      action: "create",
      changes: { kind: `waitlist_${kind}`, to, status },
    });
    return status;
  } catch (e) {
    log.error({ err: e, waitlistId: entry.id }, "Waitlist email failed");
    return "failed";
  }
}

export async function emailWaitlistJoined(
  ctx: TenantContext,
  deps: MailDeps,
  id: string,
  log: FastifyBaseLogger,
) {
  return sendWaitlistEmail(ctx, deps, await getRow(ctx, id), "joined", [], log);
}

/** Free online arrival times that suit the entry, right now. */
async function freeTimesFor(ctx: TenantContext, entry: Row, now: Date) {
  const offer = await getPublicAvailability(ctx, { date: entry.date, partySize: entry.partySize }, now);
  if (offer.mode !== "book") return [];
  const window = {
    timeFrom: entry.timeFrom ? normalizeTime(entry.timeFrom) : null,
    timeTo: entry.timeTo ? normalizeTime(entry.timeTo) : null,
  };
  return offer.services.flatMap((s) => s.times).filter((time) => fitsWaitlistWindow(time, window));
}

async function markNotified(ctx: TenantContext, id: string, now: Date) {
  await ctx.db
    .update(waitlistEntries)
    .set({ status: "notified", notifiedAt: now })
    .where(and(eq(waitlistEntries.id, id), eq(waitlistEntries.restaurantId, ctx.restaurantId)));
}

/**
 * Staff tell the guest by email that there is room (also when the booking page shows nothing free:
 * staff may know better). Guests without an email are called by staff instead.
 */
export async function notifyWaitlistEntry(
  ctx: TenantContext,
  deps: MailDeps,
  id: string,
  log: FastifyBaseLogger,
): Promise<WaitlistEntry & { emailSent: boolean }> {
  const row = await getRow(ctx, id);
  if (!OPEN.includes(row.status as (typeof OPEN)[number])) {
    throw conflict("waitlist_closed", "Questa persona non è più in lista d'attesa");
  }
  if (!row.guestEmail) throw conflict("no_email", "Nessuna email: chiama il cliente al telefono");
  const now = deps.now();
  const status = await sendWaitlistEmail(ctx, deps, row, "free", await freeTimesFor(ctx, row, now), log);
  await markNotified(ctx, id, now);
  return { ...toEntry(await getRow(ctx, id)), emailSent: status === "sent" };
}

/**
 * After a booking of `date` was cancelled or moved away: emails everyone still waiting (not yet
 * told) whose window now has a free table. Never throws, so it can't spoil the cancellation.
 */
export async function notifyWaitlist(
  ctx: TenantContext,
  deps: MailDeps,
  date: string,
  log: FastifyBaseLogger,
): Promise<number> {
  try {
    const waiting = await ctx.db
      .select()
      .from(waitlistEntries)
      .where(
        and(
          eq(waitlistEntries.restaurantId, ctx.restaurantId),
          eq(waitlistEntries.date, date),
          eq(waitlistEntries.status, "waiting"),
          sql`${waitlistEntries.guestEmail} is not null`,
        ),
      )
      .orderBy(asc(waitlistEntries.createdAt));
    const now = deps.now();
    let notified = 0;
    for (const entry of waiting) {
      const times = await freeTimesFor(ctx, entry, now);
      if (times.length === 0) continue;
      await sendWaitlistEmail(ctx, deps, entry, "free", times, log);
      await markNotified(ctx, entry.id, now);
      notified++;
    }
    return notified;
  } catch (e) {
    log.error({ err: e, date }, "Waitlist notification failed");
    return 0;
  }
}

/** A cancellation, or a booking moved or made smaller by staff, may leave room for the waiting list. */
export async function waitlistAfterStaffChange(
  ctx: TenantContext,
  deps: MailDeps,
  before: Reservation,
  after: Reservation,
  log: FastifyBaseLogger,
) {
  const freed =
    (after.status === "cancelled" && before.status !== "cancelled") ||
    (after.status !== "cancelled" &&
      (after.date !== before.date || after.time !== before.time || after.partySize < before.partySize));
  if (freed) await notifyWaitlist(ctx, deps, before.date, log);
}

/**
 * A guest joining from the booking page. Asking twice for the same day (same phone or email)
 * updates the first request instead of adding another.
 */
export async function joinWaitlistOnline(
  ctx: TenantContext,
  input: OnlineWaitlistInput,
  deps: MailDeps,
  log: FastifyBaseLogger,
) {
  if (input.website) throw new AppError(400, "rejected", "Richiesta non valida");
  const policy = await getBookingPolicy(ctx);
  if (!policy.onlineEnabled || !policy.waitlistEnabled) {
    throw conflict("waitlist_disabled", "La lista d'attesa non è attiva: contatta il ristorante");
  }
  const details = contact(input);
  if (policy.requirePhone && !details.guestPhone) {
    throw invalid("Il numero di telefono è obbligatorio", [{ path: "guestPhone", message: "Obbligatorio" }]);
  }
  if (policy.requireEmail && !details.guestEmail) {
    throw invalid("L'email è obbligatoria", [{ path: "guestEmail", message: "Obbligatoria" }]);
  }
  const offer = await getPublicAvailability(
    ctx,
    { date: input.date, partySize: input.partySize },
    deps.now(),
  );
  if (offer.mode === "closed") throw conflict(offer.reason, offer.message);
  if (offer.mode === "request") {
    throw conflict("large_party", "Per gruppi numerosi invia una richiesta di prenotazione");
  }

  const { website: _w, privacyAccepted: _p, ...fields } = input;
  const existing = await findOpenEntry(ctx, input.date, details);
  const entry = existing
    ? await updateWaitlistEntry(ctx, existing.id, {
        partySize: input.partySize,
        timeFrom: input.timeFrom,
        timeTo: input.timeTo,
        note: input.note,
        status: "waiting",
      })
    : await addToWaitlist(ctx, { ...fields, channel: "online" });
  const emailStatus = existing ? null : await emailWaitlistJoined(ctx, deps, entry.id, log);
  return {
    id: entry.id,
    date: entry.date,
    partySize: entry.partySize,
    timeFrom: entry.timeFrom,
    timeTo: entry.timeTo,
    guestEmail: entry.guestEmail,
    emailSent: emailStatus === "sent",
  };
}

async function findOpenEntry(
  ctx: TenantContext,
  date: string,
  details: { phoneNormalized: string | null; guestEmail: string | null },
) {
  const matches = [
    details.phoneNormalized ? sql`${waitlistEntries.phoneNormalized} = ${details.phoneNormalized}` : null,
    details.guestEmail
      ? sql`lower(${waitlistEntries.guestEmail}) = ${details.guestEmail.toLowerCase()}`
      : null,
  ].filter((m) => m !== null);
  if (matches.length === 0) return null;
  const [row] = await ctx.db
    .select({ id: waitlistEntries.id })
    .from(waitlistEntries)
    .where(
      and(
        eq(waitlistEntries.restaurantId, ctx.restaurantId),
        eq(waitlistEntries.date, date),
        inArray(waitlistEntries.status, [...OPEN]),
        sql`(${sql.join(matches, sql` or `)})`,
      ),
    )
    .limit(1);
  return row ?? null;
}
