import { z } from "zod";
import { dateString, nonEmptyName, optionalText, timeString } from "./common.js";
import { partySize } from "./reservation.js";

/*
 * Rows imported from another system (Superb exports, spreadsheets). The web app reads the CSV and maps
 * its columns to these fields; the API validates each row on its own and reports the bad ones by
 * number instead of rejecting the whole file.
 */

export const MAX_GUEST_IMPORT_ROWS = 1000;
export const MAX_RESERVATION_IMPORT_ROWS = 50;

export const guestImportRow = z.object({
  fullName: nonEmptyName(120),
  phone: z.string().trim().max(40).nullable().optional(),
  email: z.email({ message: "Email non valida" }).nullable().optional(),
  note: optionalText(2000).optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  marketingConsent: z.boolean().optional(),
});

export const reservationImportRow = z.object({
  date: dateString,
  time: timeString,
  partySize,
  guestName: nonEmptyName(120),
  guestPhone: z.string().trim().max(40).nullable().optional(),
  guestEmail: z.email({ message: "Email non valida" }).nullable().optional(),
  guestNote: optionalText(1000).optional(),
  internalNote: optionalText(1000).optional(),
  status: z.enum(["confirmed", "requested"]).optional(),
  /** Matched by name against the restaurant's tables; otherwise assigned automatically. */
  tableName: z.string().trim().max(40).nullable().optional(),
});

/** `firstRow` is the file line of rows[0], so errors point at the right line of the file. */
const batch = (max: number) =>
  z.object({ firstRow: z.number().int().min(1).default(1), rows: z.array(z.unknown()).min(1).max(max) });

export const guestImportInput = batch(MAX_GUEST_IMPORT_ROWS);
export const reservationImportInput = batch(MAX_RESERVATION_IMPORT_ROWS);

export type GuestImportRow = z.infer<typeof guestImportRow>;
export type ReservationImportRow = z.infer<typeof reservationImportRow>;
export type ImportResult = {
  created: number;
  updated: number;
  skipped: number;
  errors: { row: number; message: string }[];
};
