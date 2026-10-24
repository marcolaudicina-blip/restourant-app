import type { FastifyBaseLogger } from "fastify";
import { recordAudit } from "../../lib/audit.js";
import type { TenantContext } from "../../lib/context.js";
import type { AppDeps } from "../../types.js";
import { getBookingPage } from "../booking-page/booking-page.service.js";
import { getReservation } from "../reservations/reservations.service.js";
import { getRestaurant } from "../restaurants/restaurants.service.js";
import { renderBookingEmail, type BookingEmailKind } from "./booking-email.template.js";

/**
 * Emails the guest about their booking, when they left an address. Never throws: a booking stays
 * valid whatever happens to the email. The outcome is returned (null: no address) and kept in the
 * audit log (entity "email").
 */
export async function sendBookingEmail(
  ctx: TenantContext,
  deps: Pick<AppDeps, "mailer" | "publicUrl">,
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
      const [restaurant, page] = await Promise.all([getRestaurant(ctx), getBookingPage(ctx)]);
      const email = renderBookingEmail({ kind, restaurant, page, reservation, publicUrl: deps.publicUrl });
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
