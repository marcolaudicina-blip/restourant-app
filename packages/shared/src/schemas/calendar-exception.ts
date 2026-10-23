import { z } from "zod";
import { dateString, id, optionalText, timeString } from "./common.js";
import { timeToMinutes } from "../time.js";

/**
 * - `closed`: the restaurant (or one service) is closed on those dates.
 * - `special_hours`: a service runs with different arrival times, even on a day it normally doesn't.
 */
export const EXCEPTION_KINDS = ["closed", "special_hours"] as const;

/**
 * Only for `closed`: `all` closes the service entirely, `online` only stops online bookings
 * (staff can still take bookings by phone).
 */
export const EXCEPTION_SCOPES = ["all", "online"] as const;

export const calendarExceptionFields = z.object({
  kind: z.enum(EXCEPTION_KINDS),
  scope: z.enum(EXCEPTION_SCOPES),
  dateFrom: dateString,
  dateTo: dateString,
  /** Null means every service. Required for `special_hours`. */
  serviceId: id.nullable(),
  firstArrival: timeString.nullable(),
  lastArrival: timeString.nullable(),
  note: optionalText(200),
});

export function checkCalendarException(value: z.infer<typeof calendarExceptionFields>, ctx: z.RefinementCtx) {
  if (value.dateFrom > value.dateTo) {
    ctx.addIssue({ code: "custom", path: ["dateTo"], message: "La data di fine precede quella di inizio" });
  }
  if (value.kind === "special_hours") {
    if (value.serviceId === null) {
      ctx.addIssue({
        code: "custom",
        path: ["serviceId"],
        message: "Scegli il servizio con orario speciale",
      });
    }
    if (value.scope !== "all") {
      ctx.addIssue({
        code: "custom",
        path: ["scope"],
        message: "Un orario speciale vale per tutti i canali",
      });
    }
    if (value.firstArrival === null || value.lastArrival === null) {
      ctx.addIssue({ code: "custom", path: ["firstArrival"], message: "Indica primo e ultimo arrivo" });
    } else if (timeToMinutes(value.lastArrival) < timeToMinutes(value.firstArrival)) {
      ctx.addIssue({
        code: "custom",
        path: ["lastArrival"],
        message: "L'ultimo arrivo deve essere uguale o successivo al primo",
      });
    }
  } else if (value.firstArrival !== null || value.lastArrival !== null) {
    ctx.addIssue({ code: "custom", path: ["firstArrival"], message: "Una chiusura non ha orari" });
  }
}

export const calendarExceptionDefaults = {
  scope: "all",
  serviceId: null,
  firstArrival: null,
  lastArrival: null,
  note: null,
} as const satisfies Partial<z.infer<typeof calendarExceptionFields>>;

export const calendarExceptionCreateInput = calendarExceptionFields.partial({
  scope: true,
  serviceId: true,
  firstArrival: true,
  lastArrival: true,
  note: true,
});
export const calendarException = calendarExceptionFields.superRefine(checkCalendarException);
export const calendarExceptionUpdate = calendarExceptionFields.partial();

export type CalendarExceptionFields = z.infer<typeof calendarExceptionFields>;
export type CalendarExceptionCreateInput = z.infer<typeof calendarExceptionCreateInput>;
export type CalendarExceptionUpdate = z.infer<typeof calendarExceptionUpdate>;
