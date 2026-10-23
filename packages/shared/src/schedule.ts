import type { CalendarExceptionFields } from "./schemas/calendar-exception.js";
import type { ServiceFields } from "./schemas/service.js";
import { isDateWithin, isoWeekday, minutesToTime, timeToMinutes } from "./time.js";

export type Channel = "staff" | "online";

export type ScheduleService = Pick<
  ServiceFields,
  | "name"
  | "daysOfWeek"
  | "firstArrival"
  | "lastArrival"
  | "seatingMode"
  | "slotIntervalMinutes"
  | "fixedSeatings"
  | "validFrom"
  | "validTo"
  | "onlineBookable"
  | "isActive"
  | "sortOrder"
> & { id: string };

export type ScheduleException = Pick<
  CalendarExceptionFields,
  "kind" | "scope" | "dateFrom" | "dateTo" | "serviceId" | "firstArrival" | "lastArrival" | "note"
> & { id: string };

/** Why a service does not take bookings on a given date. Stable codes for UI and API clients. */
export type ClosedReason =
  | "inactive"
  | "out_of_season"
  | "not_scheduled_day"
  | "closed_exception"
  | "online_closed_exception"
  | "not_online_bookable";

export type ServiceSchedule = {
  serviceId: string;
  name: string;
  firstArrival: string;
  lastArrival: string;
  /** Present when the day's hours come from a `special_hours` exception. */
  specialHoursExceptionId: string | null;
} & (
  | { status: "open"; slots: string[] }
  | { status: "closed"; reason: ClosedReason; exceptionId: string | null; note: string | null; slots: [] }
);

export type DayScheduleInput = {
  date: string;
  channel: Channel;
  defaultSlotIntervalMinutes: number;
  services: ScheduleService[];
  exceptions: ScheduleException[];
};

/**
 * Resolves which services run on a date and at which arrival times, purely from configuration.
 * Capacity (tables, covers, pacing) is applied later by the availability engine on top of this.
 *
 * Precedence, per service: inactive > season > closed exception > special hours > weekday > channel.
 */
export function buildDaySchedule(input: DayScheduleInput): ServiceSchedule[] {
  const { date, channel } = input;
  const weekday = isoWeekday(date);
  const exceptionsToday = input.exceptions.filter((e) => isDateWithin(date, e.dateFrom, e.dateTo));

  return [...input.services]
    .sort(
      (a, b) => a.sortOrder - b.sortOrder || timeToMinutes(a.firstArrival) - timeToMinutes(b.firstArrival),
    )
    .map((service): ServiceSchedule => {
      const applies = (e: ScheduleException) => e.serviceId === null || e.serviceId === service.id;
      const special = exceptionsToday.find((e) => e.kind === "special_hours" && e.serviceId === service.id);
      const firstArrival = special?.firstArrival ?? service.firstArrival;
      const lastArrival = special?.lastArrival ?? service.lastArrival;
      const base = {
        serviceId: service.id,
        name: service.name,
        firstArrival,
        lastArrival,
        specialHoursExceptionId: special?.id ?? null,
      };
      const closed = (reason: ClosedReason, exception?: ScheduleException): ServiceSchedule => ({
        ...base,
        status: "closed",
        reason,
        exceptionId: exception?.id ?? null,
        note: exception?.note ?? null,
        slots: [],
      });

      if (!service.isActive) return closed("inactive");
      if (!isDateWithin(date, service.validFrom, service.validTo)) return closed("out_of_season");

      const closure = exceptionsToday.find((e) => e.kind === "closed" && e.scope === "all" && applies(e));
      if (closure) return closed("closed_exception", closure);

      if (!special && !service.daysOfWeek.includes(weekday)) return closed("not_scheduled_day");

      if (channel === "online") {
        const onlineClosure = exceptionsToday.find(
          (e) => e.kind === "closed" && e.scope === "online" && applies(e),
        );
        if (onlineClosure) return closed("online_closed_exception", onlineClosure);
        if (!service.onlineBookable) return closed("not_online_bookable");
      }

      const slots =
        service.seatingMode === "fixed"
          ? fixedSlots(service.fixedSeatings, firstArrival, lastArrival)
          : continuousSlots(
              firstArrival,
              lastArrival,
              service.slotIntervalMinutes ?? input.defaultSlotIntervalMinutes,
            );

      return { ...base, status: "open", slots };
    });
}

export function continuousSlots(
  firstArrival: string,
  lastArrival: string,
  intervalMinutes: number,
): string[] {
  if (intervalMinutes <= 0) throw new Error("Slot interval must be positive");
  const slots: string[] = [];
  const last = timeToMinutes(lastArrival);
  for (let m = timeToMinutes(firstArrival); m <= last; m += intervalMinutes) {
    slots.push(minutesToTime(m));
  }
  return slots;
}

/** Fixed seatings, clipped to the day's arrival window (special hours may shorten it). */
export function fixedSlots(seatings: string[], firstArrival: string, lastArrival: string): string[] {
  const first = timeToMinutes(firstArrival);
  const last = timeToMinutes(lastArrival);
  return [...new Set(seatings.map(timeToMinutes))]
    .filter((m) => m >= first && m <= last)
    .sort((a, b) => a - b)
    .map(minutesToTime);
}
