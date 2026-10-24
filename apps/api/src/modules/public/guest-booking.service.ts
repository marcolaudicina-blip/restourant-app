import { reservations, type Database } from "@restourant/db";
import { timeToMinutes, type GuestBookingChangeInput, type ReservationStatus } from "@restourant/shared";
import { eq } from "drizzle-orm";
import type { FastifyBaseLogger } from "fastify";
import type { TenantContext } from "../../lib/context.js";
import { conflict, notFound } from "../../lib/errors.js";
import type { AppDeps } from "../../types.js";
import { sendBookingEmail } from "../notifications/booking-email.service.js";
import { loadFloorContext } from "../reservations/floor-context.js";
import {
  getReservation,
  rescheduleReservation,
  setReservationStatus,
} from "../reservations/reservations.service.js";
import { getBookingPolicy } from "../restaurants/restaurants.service.js";
import {
  confirmationStatus,
  DAY_REASON_MESSAGES,
  getPublicAvailability,
  getPublicProfile,
  onlineOffer,
} from "./public.service.js";

/*
 * The page a guest reaches from the link in their emails: see the booking, move it or cancel it,
 * within the restaurant's rules (guestCanCancel, guestCanModify, cancellationNoticeHours). The link
 * carries a signature instead of a login (TokenService.signBooking).
 */

type Deps = Pick<AppDeps, "db" | "tokens" | "mailer" | "publicUrl" | "now">;

/** Finds the restaurant of the booking in the link. Altered or unknown links are "not found". */
export async function guestBookingContext(
  db: Database,
  tokens: AppDeps["tokens"],
  token: string,
): Promise<{ ctx: TenantContext; id: string }> {
  const id = tokens.verifyBooking(token);
  if (!id) throw notFound("Prenotazione");
  const [row] = await db
    .select({ restaurantId: reservations.restaurantId })
    .from(reservations)
    .where(eq(reservations.id, id))
    .limit(1);
  if (!row) throw notFound("Prenotazione");
  return { ctx: { db, restaurantId: row.restaurantId, actorUserId: null }, id };
}

const ACTIVE: ReservationStatus[] = ["requested", "confirmed"];

/** What the guest may still do, and why not when they can't. */
async function guestActions(ctx: TenantContext, id: string, now: Date) {
  const [reservation, policy] = await Promise.all([getReservation(ctx, id), getBookingPolicy(ctx)]);
  const deadline = new Date(reservation.startsAt.getTime() - policy.cancellationNoticeHours * 3_600_000);
  const active = ACTIVE.includes(reservation.status);
  const inTime = now < deadline;
  const canCancel = active && inTime && policy.guestCanCancel;
  const canModify = active && inTime && policy.guestCanModify && policy.onlineEnabled;
  const message =
    reservation.status === "cancelled"
      ? "Questa prenotazione è stata cancellata"
      : !active
        ? "Questa prenotazione è già passata"
        : !policy.guestCanCancel && !policy.guestCanModify
          ? "Per modificare o disdire contatta il ristorante"
          : !inTime
            ? "Non è più possibile modificarla online: contatta il ristorante"
            : null;
  return { reservation, canCancel, canModify, deadline, message };
}

export async function getGuestBooking(ctx: TenantContext, id: string, now: Date) {
  const [profile, actions] = await Promise.all([getPublicProfile(ctx, now), guestActions(ctx, id, now)]);
  const r = actions.reservation;
  return {
    restaurant: profile,
    booking: {
      date: r.date,
      time: r.time,
      partySize: r.partySize,
      durationMinutes: r.durationMinutes,
      guestName: r.guestName,
      guestNote: r.guestNote,
      status: r.status,
    },
    canCancel: actions.canCancel,
    canModify: actions.canModify,
    /** Until when the guest can act online. */
    deadline: actions.deadline.toISOString(),
    message: actions.message,
  };
}

export async function getGuestAvailability(
  ctx: TenantContext,
  id: string,
  query: { date: string; partySize: number },
  now: Date,
) {
  const { canModify } = await guestActions(ctx, id, now);
  if (!canModify) throw conflict("not_modifiable", "Questa prenotazione non si può più modificare online");
  return getPublicAvailability(ctx, query, now, id);
}

export async function cancelGuestBooking(ctx: TenantContext, id: string, deps: Deps, log: FastifyBaseLogger) {
  const now = deps.now();
  const { canCancel } = await guestActions(ctx, id, now);
  if (!canCancel) throw conflict("not_cancellable", "Questa prenotazione non si può più disdire online");
  await setReservationStatus(ctx, id, "cancelled", { by: "guest" });
  await sendBookingEmail(ctx, deps, id, "cancelled", log);
  return getGuestBooking(ctx, id, now);
}

export async function changeGuestBooking(
  ctx: TenantContext,
  id: string,
  input: GuestBookingChangeInput,
  deps: Deps,
  log: FastifyBaseLogger,
) {
  const now = deps.now();
  const { canModify, reservation } = await guestActions(ctx, id, now);
  if (!canModify) throw conflict("not_modifiable", "Questa prenotazione non si può più modificare online");

  const floor = await loadFloorContext(ctx, input.date, { excludeReservationId: id });
  const offer = onlineOffer(floor, input.date, input.partySize, now);
  if (offer.mode === "closed") throw conflict(offer.reason, DAY_REASON_MESSAGES[offer.reason]);
  if (offer.mode === "request") {
    throw conflict("large_party", "Per gruppi così numerosi contatta direttamente il ristorante");
  }
  const match = offer.services
    .flatMap((s) => s.slots.map((slot) => ({ serviceId: s.serviceId, slot })))
    .find((x) => x.slot.time === input.time && x.slot.available);
  if (!match) throw conflict("slot_unavailable", "Questo orario non è disponibile: scegline un altro");

  // A request stays a request; a confirmed booking may need a new confirmation (e.g. more people).
  const status =
    reservation.status === "requested" ? "requested" : confirmationStatus(floor, input.partySize);
  const saved = await rescheduleReservation(ctx, floor, id, {
    service: floor.serviceById(match.serviceId)!,
    start: timeToMinutes(input.time),
    time: input.time,
    partySize: input.partySize,
    seating: { tableIds: match.slot.option!.tableIds, durationMinutes: match.slot.durationMinutes! },
    status,
    audit: {
      by: "guest",
      from: { date: reservation.date, time: reservation.time, partySize: reservation.partySize },
      ...input,
      ...(status !== reservation.status ? { status: { from: reservation.status, to: status } } : {}),
    },
  });
  if (!saved) throw conflict("slot_unavailable", "Questo orario è appena stato prenotato: scegline un altro");

  await sendBookingEmail(ctx, deps, id, status === "requested" ? "requested" : "updated", log);
  return getGuestBooking(ctx, id, now);
}
