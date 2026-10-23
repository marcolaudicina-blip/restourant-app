import { z } from "zod";
import { SLOT_INTERVALS } from "./booking-policy.js";
import { dateString, nonEmptyName, timeString, uniqueIds } from "./common.js";
import { timeToMinutes } from "../time.js";

/**
 * - `continuous`: guests can arrive at any slot between first and last arrival.
 * - `fixed`: guests arrive only at the listed seatings (e.g. 19:30 and 21:30).
 */
export const SEATING_MODES = ["continuous", "fixed"] as const;

export const isoWeekdays = z
  .array(z.number().int().min(1).max(7))
  .min(1, { message: "Seleziona almeno un giorno" })
  .refine((days) => new Set(days).size === days.length, { message: "Giorni duplicati" });

export const serviceFields = z.object({
  name: nonEmptyName(60),
  /** ISO weekdays, Monday = 1 ... Sunday = 7. */
  daysOfWeek: isoWeekdays,
  firstArrival: timeString,
  lastArrival: timeString,
  seatingMode: z.enum(SEATING_MODES),
  /** Overrides the restaurant-wide slot interval for `continuous` services. */
  slotIntervalMinutes: z.literal(SLOT_INTERVALS).nullable(),
  /** Arrival times for `fixed` services. */
  fixedSeatings: z.array(timeString).max(12),
  /** Seasonal validity, inclusive. Null means open-ended. */
  validFrom: dateString.nullable(),
  validTo: dateString.nullable(),
  /** Total covers the service can take. */
  maxCovers: z.number().int().min(1).max(5_000).nullable(),
  /** Pacing: covers that may arrive in the same slot, to protect the kitchen. */
  maxCoversPerSlot: z.number().int().min(1).max(1_000).nullable(),
  /** Pacing: bookings that may arrive in the same slot, to protect the door. */
  maxBookingsPerSlot: z.number().int().min(1).max(500).nullable(),
  onlineBookable: z.boolean(),
  isActive: z.boolean(),
  sortOrder: z.number().int().min(0).max(1000),
  /** Rooms served; empty means every room. */
  roomIds: uniqueIds,
});

export function checkService(value: z.infer<typeof serviceFields>, ctx: z.RefinementCtx) {
  const first = timeToMinutes(value.firstArrival);
  const last = timeToMinutes(value.lastArrival);
  if (last < first) {
    ctx.addIssue({
      code: "custom",
      path: ["lastArrival"],
      message: "L'ultimo arrivo deve essere uguale o successivo al primo",
    });
  }
  if (value.validFrom !== null && value.validTo !== null && value.validFrom > value.validTo) {
    ctx.addIssue({ code: "custom", path: ["validTo"], message: "La data di fine precede quella di inizio" });
  }
  if (value.seatingMode === "fixed") {
    if (value.fixedSeatings.length === 0) {
      ctx.addIssue({ code: "custom", path: ["fixedSeatings"], message: "Indica almeno un turno" });
    }
    const minutes = value.fixedSeatings.map(timeToMinutes);
    if (new Set(minutes).size !== minutes.length) {
      ctx.addIssue({ code: "custom", path: ["fixedSeatings"], message: "Turni duplicati" });
    }
    if (minutes.some((m) => m < first || m > last)) {
      ctx.addIssue({
        code: "custom",
        path: ["fixedSeatings"],
        message: "Ogni turno deve cadere tra il primo e l'ultimo arrivo",
      });
    }
  }
}

export const serviceDefaults = {
  seatingMode: "continuous",
  slotIntervalMinutes: null,
  fixedSeatings: [],
  validFrom: null,
  validTo: null,
  maxCovers: null,
  maxCoversPerSlot: null,
  maxBookingsPerSlot: null,
  onlineBookable: true,
  isActive: true,
  sortOrder: 0,
  roomIds: [],
} as const satisfies Partial<z.infer<typeof serviceFields>>;

export const serviceCreateInput = serviceFields.partial({
  seatingMode: true,
  slotIntervalMinutes: true,
  fixedSeatings: true,
  validFrom: true,
  validTo: true,
  maxCovers: true,
  maxCoversPerSlot: true,
  maxBookingsPerSlot: true,
  onlineBookable: true,
  isActive: true,
  sortOrder: true,
  roomIds: true,
});
export const service = serviceFields.superRefine(checkService);
export const serviceUpdate = serviceFields.partial();

export type ServiceFields = z.infer<typeof serviceFields>;
export type ServiceCreateInput = z.infer<typeof serviceCreateInput>;
export type ServiceUpdate = z.infer<typeof serviceUpdate>;
