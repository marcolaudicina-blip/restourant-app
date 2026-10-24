import { z } from "zod";
import { dateString, id, nonEmptyName, optionalText, timeString, uniqueIds } from "./common.js";
import { SUPPORTED_LOCALES } from "./restaurant.js";

/**
 * Lifecycle of a reservation:
 * requested (needs approval) → confirmed → arrived (party at the door) → seated → completed,
 * with no_show / cancelled as exits. Staff can undo mistakes along the edges in RESERVATION_TRANSITIONS.
 */
export const RESERVATION_STATUSES = [
  "requested",
  "confirmed",
  "arrived",
  "seated",
  "completed",
  "no_show",
  "cancelled",
] as const;
export type ReservationStatus = (typeof RESERVATION_STATUSES)[number];

/** Statuses that keep tables occupied. */
export const BLOCKING_STATUSES = [
  "requested",
  "confirmed",
  "arrived",
  "seated",
] as const satisfies readonly ReservationStatus[];

export function isBlockingStatus(status: ReservationStatus): boolean {
  return (BLOCKING_STATUSES as readonly ReservationStatus[]).includes(status);
}

export const RESERVATION_TRANSITIONS: Record<ReservationStatus, readonly ReservationStatus[]> = {
  requested: ["confirmed", "cancelled"],
  confirmed: ["arrived", "seated", "no_show", "cancelled"],
  arrived: ["seated", "confirmed", "no_show", "cancelled"],
  seated: ["completed", "arrived", "confirmed"],
  completed: ["seated"],
  no_show: ["confirmed"],
  cancelled: ["confirmed"],
};

export function canTransition(from: ReservationStatus, to: ReservationStatus): boolean {
  return RESERVATION_TRANSITIONS[from].includes(to);
}

/** Default colors for the booking views; restaurants will be able to customize them later. */
export const RESERVATION_STATUS_COLORS: Record<ReservationStatus, string> = {
  requested: "#F59E0B",
  confirmed: "#3B82F6",
  arrived: "#8B5CF6",
  seated: "#10B981",
  completed: "#6B7280",
  no_show: "#EF4444",
  cancelled: "#9CA3AF",
};

export const RESERVATION_CHANNELS = ["staff", "online", "walk_in"] as const;
export type ReservationChannel = (typeof RESERVATION_CHANNELS)[number];

export const partySize = z.number().int().min(1).max(100);

const guestFields = {
  guestName: nonEmptyName(120),
  guestPhone: z.string().trim().min(5).max(40).nullable(),
  guestEmail: z.email().nullable(),
  /** Written by the guest (allergies, occasion). */
  guestNote: optionalText(1000),
  /** Only visible to staff. */
  internalNote: optionalText(1000),
};

export const reservationCreateInput = z.object({
  date: dateString,
  time: timeString,
  partySize,
  /** Derived from date and time when omitted. */
  serviceId: id.optional(),
  /** Tables chosen by staff. When omitted the system picks the best option by priority. */
  tableIds: uniqueIds.min(1).max(12).optional(),
  /** Overrides the duration rules. */
  durationMinutes: z.number().int().min(15).max(600).optional(),
  /** Existing guest picked by staff; otherwise the guest is matched or created from the phone/email. */
  guestId: id.optional(),
  /** Restrict automatic assignment to a room. */
  roomId: id.optional(),
  channel: z.enum(["staff", "walk_in"]).optional(),
  status: z.enum(["confirmed", "requested", "seated"]).optional(),
  /** Staff may exceed the service's pacing and cover limits (never double-book a table). */
  ignorePacing: z.boolean().optional(),
  /** Staff may seat a party on a table that is too small or too large. */
  ignoreCapacity: z.boolean().optional(),
  guestName: guestFields.guestName,
  guestPhone: guestFields.guestPhone.optional(),
  guestEmail: guestFields.guestEmail.optional(),
  guestNote: guestFields.guestNote.optional(),
  internalNote: guestFields.internalNote.optional(),
  /** Language of the guest's emails. */
  locale: z.enum(SUPPORTED_LOCALES).optional(),
});

export const reservationUpdate = z.object({
  date: dateString.optional(),
  time: timeString.optional(),
  partySize: partySize.optional(),
  durationMinutes: z.number().int().min(15).max(600).optional(),
  /** When date/time/size change and the current tables no longer work, pick new ones automatically. */
  reassignTables: z.boolean().optional(),
  ignorePacing: z.boolean().optional(),
  ignoreCapacity: z.boolean().optional(),
  guestName: guestFields.guestName.optional(),
  guestPhone: guestFields.guestPhone.optional(),
  guestEmail: guestFields.guestEmail.optional(),
  guestNote: guestFields.guestNote.optional(),
  internalNote: guestFields.internalNote.optional(),
  locale: z.enum(SUPPORTED_LOCALES).optional(),
});

/** Move a reservation to other tables, or join more tables to it. */
export const reservationTablesInput = z.object({
  tableIds: uniqueIds.min(1).max(12),
  ignoreCapacity: z.boolean().optional(),
});

export const reservationStatusInput = z.object({ status: z.enum(RESERVATION_STATUSES) });

export type ReservationCreateInput = z.infer<typeof reservationCreateInput>;
export type ReservationUpdate = z.infer<typeof reservationUpdate>;
export type ReservationTablesInput = z.infer<typeof reservationTablesInput>;
