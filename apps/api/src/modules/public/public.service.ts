import { restaurants, type Database } from "@restourant/db";
import {
  addDays,
  buildDaySchedule,
  findFreeOption,
  indexBusy,
  instantToLocal,
  normalizePhone,
  pacingViolation,
  slotWindows,
  timeToMinutes,
  type OnlineReservationInput,
  type ReservationStatus,
  type SlotAvailability,
} from "@restourant/shared";
import { eq } from "drizzle-orm";
import type { FastifyBaseLogger } from "fastify";
import type { TenantContext } from "../../lib/context.js";
import {
  AppError,
  conflict,
  invalid,
  notFound,
  pgErrorCode,
  PG_EXCLUSION_VIOLATION,
} from "../../lib/errors.js";
import type { AppDeps } from "../../types.js";
import { getBookingPage } from "../booking-page/booking-page.service.js";
import {
  listCalendarExceptions,
  toCalendarException,
} from "../calendar-exceptions/calendar-exceptions.service.js";
import {
  computeAvailability,
  exceedsOnlineLimit,
  onlineDayReason,
  seatingOptions,
  type OnlineDayReason,
} from "../reservations/availability.service.js";
import { sendBookingEmail } from "../notifications/booking-email.service.js";
import { loadFloorContext, type FloorContext } from "../reservations/floor-context.js";
import { getReservation, insertReservation } from "../reservations/reservations.service.js";
import { getBookingPolicy, getRestaurant } from "../restaurants/restaurants.service.js";
import { listServices } from "../services/services.service.js";

/*
 * What guests see and do on a restaurant's public booking page. Nothing here needs a login: the
 * restaurant is found by the slug in the link, and only what a guest may know leaves the API
 * (no table names, no other bookings).
 */

/** Days offered in the date picker; later dates can still be typed in. */
const MAX_PICKER_DAYS = 92;

export const DAY_REASON_MESSAGES: Record<OnlineDayReason, string> = {
  online_disabled: "Le prenotazioni online non sono attive: contatta il ristorante",
  past: "Questa data è già passata",
  too_far: "Non è ancora possibile prenotare per questa data",
  party_too_small: "Il numero di persone è troppo basso per prenotare online",
  large_party_phone: "Per gruppi così numerosi contatta direttamente il ristorante",
  large_party_request: "Per gruppi numerosi puoi inviare una richiesta",
};

export async function publicContext(db: Database, slug: string): Promise<TenantContext> {
  const [row] = await db
    .select({ id: restaurants.id })
    .from(restaurants)
    .where(eq(restaurants.slug, slug.toLowerCase()))
    .limit(1);
  if (!row) throw notFound("Ristorante");
  return { db, restaurantId: row.id, actorUserId: null };
}

export async function getPublicProfile(ctx: TenantContext, now: Date) {
  const [restaurant, policy, page] = await Promise.all([
    getRestaurant(ctx),
    getBookingPolicy(ctx),
    getBookingPage(ctx),
  ]);
  const today = instantToLocal(now, restaurant.timezone).date;
  return {
    slug: restaurant.slug,
    name: restaurant.name,
    phone: restaurant.phone,
    email: restaurant.email,
    website: restaurant.website,
    addressLine: restaurant.addressLine,
    city: restaurant.city,
    postalCode: restaurant.postalCode,
    timezone: restaurant.timezone,
    page: {
      brandColor: page.brandColor,
      description: page.description,
      confirmationNote: page.confirmationNote,
      privacyUrl: page.privacyUrl,
      logoId: page.logoId,
      coverId: page.coverId,
      photoIds: page.photoIds,
    },
    booking: {
      enabled: policy.onlineEnabled,
      minParty: policy.minPartyOnline,
      maxParty: policy.maxPartyOnline,
      largePartyMode: policy.largePartyMode,
      requirePhone: policy.requirePhone,
      requireEmail: policy.requireEmail,
      policyText: policy.policyText,
      /** For the privacy notice of the restaurant (/prenota/<slug>/privacy). */
      guestRetentionMonths: policy.guestRetentionMonths,
      reviewRequests: policy.reviewRequests,
      today,
      lastDate: addDays(today, policy.maxAdvanceDays),
    },
  };
}

/** Which of the next days have at least one service open to online bookings (tables not checked). */
export async function getOpenDays(ctx: TenantContext, now: Date) {
  const [restaurant, policy, services] = await Promise.all([
    getRestaurant(ctx),
    getBookingPolicy(ctx),
    listServices(ctx),
  ]);
  const today = instantToLocal(now, restaurant.timezone).date;
  const last = addDays(today, Math.min(policy.maxAdvanceDays, MAX_PICKER_DAYS - 1));
  const exceptions = (await listCalendarExceptions(ctx, { from: today, to: last })).map(toCalendarException);

  const days: { date: string; open: boolean }[] = [];
  for (let date = today; date <= last; date = addDays(date, 1)) {
    const schedule = buildDaySchedule({
      date,
      channel: "online",
      defaultSlotIntervalMinutes: policy.slotIntervalMinutes,
      services,
      exceptions,
    });
    days.push({ date, open: policy.onlineEnabled && schedule.some((s) => s.status === "open") });
  }
  return days;
}

type Offer =
  | { mode: "closed"; reason: OnlineDayReason }
  | {
      /** "book": free tables were checked. "request": a large group asks and staff decide. */
      mode: "book" | "request";
      services: { serviceId: string; name: string; slots: SlotAvailability[] }[];
    };

/** The arrival times a guest can choose on a date, with the rules of the booking page applied. */
export function onlineOffer(floor: FloorContext, date: string, partySize: number, now: Date): Offer {
  const policy = floor.policy;
  const query = { date, partySize, channel: "online" as const };

  if (partySize > policy.maxPartyOnline && policy.largePartyMode === "request") {
    // Same date rules as any online booking; then every time of the open services can be asked for.
    const reason = onlineDayReason(floor, { ...query, partySize: policy.maxPartyOnline }, now);
    if (reason) return { mode: "closed", reason };
    const notBefore = floor.toMinutes(new Date(now.getTime() + policy.minNoticeMinutes * 60_000));
    return {
      mode: "request",
      services: floor
        .schedule("online")
        .filter((day) => day.status === "open")
        .map((day) => {
          // Requests hold covers too: the service's limits (pacing, maximum covers) still apply.
          const service = floor.serviceById(day.serviceId)!;
          const windows = slotWindows(day.slots, service.slotIntervalMinutes ?? policy.slotIntervalMinutes);
          const load = floor.loadByService.get(service.id) ?? [];
          return {
            serviceId: day.serviceId,
            name: day.name,
            slots: day.slots
              .filter(
                (time, i) =>
                  timeToMinutes(time) >= notBefore &&
                  !exceedsOnlineLimit(floor, time, partySize) &&
                  !pacingViolation(windows[i]!, partySize, load, service),
              )
              .map((time) => ({ time, available: true, reason: null, option: null, durationMinutes: null })),
          };
        }),
    };
  }

  const reason = onlineDayReason(floor, query, now);
  if (reason) return { mode: "closed", reason };
  const availability = computeAvailability(floor, query, now);
  return {
    mode: "book",
    services: availability.services
      .filter((s) => s.status === "open")
      .map((s) => ({ serviceId: s.serviceId, name: s.name, slots: s.slots })),
  };
}

export async function getPublicAvailability(
  ctx: TenantContext,
  query: { date: string; partySize: number },
  now: Date,
  /** A guest moving their own booking: its tables count as free. */
  excludeReservationId?: string,
) {
  const floor = await loadFloorContext(ctx, query.date, { excludeReservationId });
  const offer = onlineOffer(floor, query.date, query.partySize, now);
  if (offer.mode === "closed") {
    return {
      ...query,
      mode: offer.mode,
      reason: offer.reason,
      message: DAY_REASON_MESSAGES[offer.reason],
      services: [],
      waitlist: false,
    };
  }
  return {
    ...query,
    mode: offer.mode,
    reason: null,
    message: null,
    services: offer.services.map((s) => ({
      serviceId: s.serviceId,
      name: s.name,
      times: s.slots.filter((slot) => slot.available).map((slot) => slot.time),
      /** First and last arrival of the service, for the waiting list's time window. */
      firstTime: s.slots[0]?.time ?? null,
      lastTime: s.slots.at(-1)?.time ?? null,
    })),
    /** Whether the guest may join the waiting list of this day (when it is full). */
    waitlist: offer.mode === "book" && floor.policy.waitlistEnabled,
  };
}

export function confirmationStatus(floor: FloorContext, partySize: number): ReservationStatus {
  const policy = floor.policy;
  switch (policy.confirmationMode) {
    case "auto":
      return "confirmed";
    case "manual":
      return "requested";
    case "auto_up_to":
      return partySize <= (policy.autoConfirmMaxParty ?? 0) ? "confirmed" : "requested";
  }
}

export async function createOnlineReservation(
  ctx: TenantContext,
  input: OnlineReservationInput,
  deps: Pick<AppDeps, "mailer" | "publicUrl" | "now" | "tokens">,
  log: FastifyBaseLogger,
) {
  const now = deps.now();
  if (input.website) throw new AppError(400, "rejected", "Prenotazione non valida");

  const floor = await loadFloorContext(ctx, input.date);
  const phone = input.guestPhone?.trim() || null;
  const email = input.guestEmail?.trim() || null;
  if (floor.policy.requirePhone && !phone) {
    throw invalid("Il numero di telefono è obbligatorio", [{ path: "guestPhone", message: "Obbligatorio" }]);
  }
  if (phone && !normalizePhone(phone)) {
    throw invalid("Numero di telefono non valido", [{ path: "guestPhone", message: "Non valido" }]);
  }
  if (floor.policy.requireEmail && !email) {
    throw invalid("L'email è obbligatoria", [{ path: "guestEmail", message: "Obbligatoria" }]);
  }

  const offer = onlineOffer(floor, input.date, input.partySize, now);
  if (offer.mode === "closed") throw conflict(offer.reason, DAY_REASON_MESSAGES[offer.reason]);
  const match = offer.services
    .flatMap((s) => s.slots.map((slot) => ({ serviceId: s.serviceId, slot })))
    .find((x) => x.slot.time === input.time && x.slot.available);
  if (!match) throw conflict("slot_unavailable", "Questo orario non è più disponibile: scegline un altro");

  const service = floor.serviceById(match.serviceId)!;
  const start = timeToMinutes(input.time);
  const durationFor = floor.durationFor(input.partySize, service.id);
  let seating: { tableIds: string[]; durationMinutes: number };
  let status: ReservationStatus;
  if (offer.mode === "request") {
    // Hold suitable tables when some are free; otherwise staff find a solution.
    const options = seatingOptions(floor, service, input.partySize, "staff");
    const free = findFreeOption(options, start, durationFor, indexBusy(floor.busy, "staff"));
    seating = free
      ? { tableIds: free.option.tableIds, durationMinutes: free.durationMinutes }
      : { tableIds: [], durationMinutes: durationFor(null) };
    status = "requested";
  } else {
    seating = { tableIds: match.slot.option!.tableIds, durationMinutes: match.slot.durationMinutes! };
    status = confirmationStatus(floor, input.partySize);
  }

  const { website: _website, privacyAccepted: _privacy, locale, ...details } = input;
  const reservation = { ...details, guestPhone: phone, guestEmail: email };
  let id: string;
  try {
    id = await insertReservation(ctx, floor, {
      service,
      start,
      seating,
      status,
      channel: "online",
      locale,
      input: reservation,
      audit: { ...reservation, tableIds: seating.tableIds, privacyAcceptedAt: now.toISOString() },
    });
  } catch (error) {
    // Someone else took the last table between the guest's choice and this request.
    if (pgErrorCode(error) === PG_EXCLUSION_VIOLATION) {
      throw conflict("slot_unavailable", "Questo orario è appena stato prenotato: scegline un altro");
    }
    throw error;
  }

  const created = await getReservation(ctx, id);
  const emailStatus = await sendBookingEmail(
    ctx,
    deps,
    id,
    created.status === "confirmed" ? "confirmed" : "requested",
    log,
  );
  return {
    id: created.id,
    status: created.status,
    date: created.date,
    time: created.time,
    partySize: created.partySize,
    durationMinutes: created.durationMinutes,
    guestName: created.guestName,
    guestEmail: created.guestEmail,
    emailSent: emailStatus === "sent",
  };
}
