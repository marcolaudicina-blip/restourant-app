import { z } from "zod";
import { timeToMinutes } from "../time.js";
import { dateString, nonEmptyName, optionalText, timeString } from "./common.js";
import { partySize } from "./reservation.js";
import { SUPPORTED_LOCALES } from "./restaurant.js";

/**
 * The waiting list of a day: guests who found it full. When a booking is cancelled the ones still
 * waiting get an email ("a table is free, book now"); a booking with the same phone or email on that
 * day takes them off the list.
 *
 * waiting → notified (emailed about a free table) → booked, or removed by staff.
 */
export const WAITLIST_STATUSES = ["waiting", "notified", "booked", "removed"] as const;
export type WaitlistStatus = (typeof WAITLIST_STATUSES)[number];

export const WAITLIST_CHANNELS = ["staff", "online"] as const;

const guestFields = {
  guestName: nonEmptyName(120),
  guestPhone: z.string().trim().min(5, { message: "Numero di telefono non valido" }).max(40).nullable(),
  guestEmail: z.email({ message: "Email non valida" }).nullable(),
  note: optionalText(500),
};

/** Earliest and latest arrival that suit the guest; both empty means any time of the day. */
const timeWindow = {
  timeFrom: timeString.nullable(),
  timeTo: timeString.nullable(),
};

function checkWindow(value: { timeFrom?: string | null; timeTo?: string | null }, ctx: z.RefinementCtx) {
  if (value.timeFrom && value.timeTo && timeToMinutes(value.timeFrom) > timeToMinutes(value.timeTo)) {
    ctx.addIssue({
      code: "custom",
      path: ["timeTo"],
      message: "L'orario finale deve venire dopo quello iniziale",
    });
  }
}

export const waitlistCreateInput = z
  .object({
    date: dateString,
    partySize,
    ...timeWindow,
    ...guestFields,
    locale: z.enum(SUPPORTED_LOCALES).optional(),
  })
  .superRefine(checkWindow);

export const waitlistUpdate = z
  .object({
    date: dateString,
    partySize,
    ...timeWindow,
    ...guestFields,
    /** Staff put a guest back on the list or take them off. */
    status: z.enum(["waiting", "removed"]),
  })
  .partial()
  .superRefine(checkWindow);

/** A guest asking from the public booking page. */
export const onlineWaitlistInput = z
  .object({
    date: dateString,
    partySize,
    ...timeWindow,
    ...guestFields,
    privacyAccepted: z.literal(true, { message: "Serve il consenso al trattamento dei dati" }),
    /** Hidden field that people never fill in (see onlineReservationInput). */
    website: z.string().max(200).optional(),
    locale: z.enum(SUPPORTED_LOCALES).optional(),
  })
  .superRefine(checkWindow);

export type WaitlistCreateInput = z.infer<typeof waitlistCreateInput>;
export type WaitlistUpdate = z.infer<typeof waitlistUpdate>;
export type OnlineWaitlistInput = z.infer<typeof onlineWaitlistInput>;

/** Whether an arrival time suits the guest's window. */
export function fitsWaitlistWindow(time: string, entry: { timeFrom: string | null; timeTo: string | null }) {
  const t = timeToMinutes(time);
  return (
    (!entry.timeFrom || t >= timeToMinutes(entry.timeFrom)) &&
    (!entry.timeTo || t <= timeToMinutes(entry.timeTo))
  );
}
