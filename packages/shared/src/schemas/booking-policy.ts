import { z } from "zod";
import { timeToMinutes } from "../time.js";
import { checkMinMax, covers, optionalText, timeString } from "./common.js";

export const CONFIRMATION_MODES = ["auto", "manual", "auto_up_to"] as const;
export const LARGE_PARTY_MODES = ["request", "phone_only"] as const;
export const SLOT_INTERVALS = [5, 10, 15, 20, 30, 60] as const;

/**
 * "Arrivals from 19:00 to 20:00 (both included): online at most 6 people". Only online bookings are
 * limited; staff can still seat bigger parties.
 */
export const onlinePartyLimit = z
  .object({
    /** ISO weekdays, Monday = 1 ... Sunday = 7. */
    daysOfWeek: z
      .array(z.number().int().min(1).max(7))
      .min(1, { message: "Seleziona almeno un giorno" })
      .refine((days) => new Set(days).size === days.length, { message: "Giorni duplicati" }),
    from: timeString,
    to: timeString,
    maxParty: covers,
  })
  .refine((limit) => timeToMinutes(limit.from) <= timeToMinutes(limit.to), {
    path: ["to"],
    message: "L'orario finale deve venire dopo quello iniziale",
  });

export type OnlinePartyLimit = z.infer<typeof onlinePartyLimit>;

export const bookingPolicyFields = z.object({
  /** Master switch for the public booking page / widget. */
  onlineEnabled: z.boolean(),
  minPartyOnline: z.number().int().min(1).max(50),
  maxPartyOnline: z.number().int().min(1).max(100),
  /** What happens when a guest asks for more than `maxPartyOnline` covers. */
  largePartyMode: z.enum(LARGE_PARTY_MODES),
  /** How long before arrival a guest can still book online. */
  minNoticeMinutes: z
    .number()
    .int()
    .min(0)
    .max(7 * 24 * 60),
  /** How far ahead the calendar is open online. */
  maxAdvanceDays: z.number().int().min(1).max(365),
  confirmationMode: z.enum(CONFIRMATION_MODES),
  /** Only used with `auto_up_to`: bigger parties need manual approval. */
  autoConfirmMaxParty: z.number().int().min(1).max(100).nullable(),
  guestCanCancel: z.boolean(),
  guestCanModify: z.boolean(),
  /** After this point the cancel/modify link in emails stops working. */
  cancellationNoticeHours: z
    .number()
    .int()
    .min(0)
    .max(14 * 24),
  /** Default slot spacing; a service can override it. */
  slotIntervalMinutes: z.literal(SLOT_INTERVALS),
  /** Fallback table duration when no duration rule matches. */
  defaultDurationMinutes: z.number().int().min(15).max(600),
  requirePhone: z.boolean(),
  requireEmail: z.boolean(),
  policyText: optionalText(4000),
  /** Email the guest when staff add, move or cancel a booking (online bookings are always emailed). */
  emailStaffBookings: z.boolean(),
  /** Email a reminder the day before. */
  sendReminders: z.boolean(),
  /** Smaller party limits for some arrival times (see `onlinePartyLimitAt`). */
  onlinePartyLimits: z.array(onlinePartyLimit).max(30),
  /** Guests can join the waiting list of a full day from the booking page. */
  waitlistEnabled: z.boolean(),
});

export function checkBookingPolicy(value: z.infer<typeof bookingPolicyFields>, ctx: z.RefinementCtx) {
  checkMinMax(ctx, value.minPartyOnline, value.maxPartyOnline, "maxPartyOnline");
  if (value.confirmationMode === "auto_up_to" && value.autoConfirmMaxParty === null) {
    ctx.addIssue({
      code: "custom",
      path: ["autoConfirmMaxParty"],
      message: "Indica fino a quanti coperti la conferma è automatica",
    });
  }
  if (!value.requirePhone && !value.requireEmail) {
    ctx.addIssue({
      code: "custom",
      path: ["requirePhone"],
      message: "Serve almeno un contatto obbligatorio (telefono o email)",
    });
  }
}

export const bookingPolicy = bookingPolicyFields.superRefine(checkBookingPolicy);
export const bookingPolicyUpdate = bookingPolicyFields.partial();

export type BookingPolicy = z.infer<typeof bookingPolicyFields>;
export type BookingPolicyUpdate = z.infer<typeof bookingPolicyUpdate>;

export const DEFAULT_BOOKING_POLICY: BookingPolicy = {
  onlineEnabled: true,
  minPartyOnline: 1,
  maxPartyOnline: 8,
  largePartyMode: "request",
  minNoticeMinutes: 60,
  maxAdvanceDays: 90,
  confirmationMode: "auto",
  autoConfirmMaxParty: null,
  guestCanCancel: true,
  guestCanModify: true,
  cancellationNoticeHours: 2,
  slotIntervalMinutes: 15,
  defaultDurationMinutes: 120,
  requirePhone: true,
  requireEmail: true,
  policyText: null,
  emailStaffBookings: true,
  sendReminders: true,
  onlinePartyLimits: [],
  waitlistEnabled: true,
};
