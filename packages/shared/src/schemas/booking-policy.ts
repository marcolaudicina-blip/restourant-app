import { z } from "zod";
import { checkMinMax, optionalText } from "./common.js";

export const CONFIRMATION_MODES = ["auto", "manual", "auto_up_to"] as const;
export const LARGE_PARTY_MODES = ["request", "phone_only"] as const;
export const SLOT_INTERVALS = [5, 10, 15, 20, 30, 60] as const;

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
};
