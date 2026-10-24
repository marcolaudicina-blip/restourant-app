import type { FastifyBaseLogger } from "fastify";
import { recordAudit } from "../../lib/audit.js";
import type { TenantContext } from "../../lib/context.js";
import type { AppDeps } from "../../types.js";
import { getBookingPage } from "../booking-page/booking-page.service.js";
import { getReservation, type Reservation } from "../reservations/reservations.service.js";
import { getBookingPolicy, getRestaurant } from "../restaurants/restaurants.service.js";
import { renderBookingEmail, type BookingEmailKind } from "./booking-email.template.js";

/**
 * Emails the guest about their booking, when they left an address. Never throws: a booking stays
 * valid whatever happens to the email. The outcome is returned (null: no address) and kept in the
 * audit log (entity "email").
 */
export async function sendBookingEmail(
  ctx: TenantContext,
  deps: Pick<AppDeps, "mailer" | "publicUrl" | "tokens">,
  reservationId: string,
  kind: BookingEmailKind,
  log: FastifyBaseLogger,
): Promise<"sent" | "failed" | "not_configured" | null> {
  try {
    const reservation = await getReservation(ctx, reservationId);
    const to = reservation.guestEmail;
    if (!to) return null;

    let status: "sent" | "failed" | "not_configured" = "not_configured";
    let error: string | null = null;
    if (deps.mailer.enabled) {
      const [restaurant, page, policy] = await Promise.all([
        getRestaurant(ctx),
        getBookingPage(ctx),
        getBookingPolicy(ctx),
      ]);
      const active = reservation.status === "requested" || reservation.status === "confirmed";
      const manage =
        deps.publicUrl && active && (policy.guestCanCancel || policy.guestCanModify)
          ? {
              url: `${deps.publicUrl}/prenotazione/${deps.tokens.signBooking(reservation.id)}`,
              canCancel: policy.guestCanCancel,
              canModify: policy.guestCanModify,
              noticeHours: policy.cancellationNoticeHours,
            }
          : null;
      const email = renderBookingEmail({
        kind,
        restaurant,
        page,
        reservation,
        publicUrl: deps.publicUrl,
        manage,
      });
      try {
        await deps.mailer.send({ to, ...email, fromName: restaurant.name, replyTo: restaurant.email });
        status = "sent";
      } catch (e) {
        status = "failed";
        error = e instanceof Error ? e.message : String(e);
        log.warn({ err: e, reservationId }, "Booking email not sent");
      }
    }
    await recordAudit(ctx, {
      entity: "email",
      entityId: reservationId,
      action: "create",
      changes: { kind, to, status, ...(error ? { error } : {}) },
    });
    return status;
  } catch (e) {
    log.error({ err: e, reservationId }, "Booking email failed");
    return "failed";
  }
}

/** Which email, if any, tells the guest what staff just did to their booking. */
function staffChangeKind(before: Reservation | null, after: Reservation): BookingEmailKind | null {
  const active = (r: Reservation) => r.status === "requested" || r.status === "confirmed";
  if (!before) return after.status === "confirmed" ? "confirmed" : null;
  if (after.status === "cancelled") return active(before) ? "cancelled" : null;
  if (before.status === "requested" && after.status === "confirmed") return "confirmed";
  // A cancelled booking put back: the guest was told it was cancelled, now it is on again.
  if (!active(before) && before.status === "cancelled" && active(after)) return "confirmed";
  const moved =
    before.date !== after.date || before.time !== after.time || before.partySize !== after.partySize;
  return active(after) && moved ? "updated" : null;
}

/**
 * Emails the guest after staff created, moved, confirmed or cancelled their booking, when the
 * restaurant wants it (`emailStaffBookings`). Accepting a request sent from the booking page is
 * always confirmed to the guest. Walk-ins get nothing.
 */
export async function emailAfterStaffChange(
  ctx: TenantContext,
  deps: Pick<AppDeps, "mailer" | "publicUrl" | "tokens">,
  before: Reservation | null,
  after: Reservation,
  log: FastifyBaseLogger,
) {
  if (!after.guestEmail || after.channel === "walk_in") return null;
  const kind = staffChangeKind(before, after);
  if (!kind) return null;
  const acceptedOnlineRequest =
    kind === "confirmed" && before?.status === "requested" && after.channel === "online";
  if (!acceptedOnlineRequest && !(await getBookingPolicy(ctx)).emailStaffBookings) return null;
  return sendBookingEmail(ctx, deps, after.id, kind, log);
}
