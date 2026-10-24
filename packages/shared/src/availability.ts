import type { Channel } from "./schedule.js";
import type { SeatingOption } from "./seating.js";
import { timeToMinutes } from "./time.js";

/*
 * Slot availability on top of the day schedule. All times are wall-clock minutes from local
 * midnight of the service date (see `wallMinutesFrom`), so a dinner ending at 00:30 ends at 1470.
 */

export type BusyInterval = {
  tableId: string;
  start: number;
  end: number;
  /** Blocks that only close a table to online bookings. */
  onlineOnly?: boolean;
};

/** A reservation already counted against the service (for pacing and the cover cap). */
export type ServiceLoad = { start: number; partySize: number };

export type PacingRules = {
  maxCovers: number | null;
  maxCoversPerSlot: number | null;
  maxBookingsPerSlot: number | null;
};

export type SlotUnavailableReason =
  /** Online only: closer to now than the minimum notice. */
  | "too_soon"
  /** No table or combination in the restaurant fits this party size. */
  | "no_suitable_table"
  /** The service already reached its total covers. */
  | "service_full"
  /** Too many covers arriving in this slot. */
  | "pacing_covers"
  /** Too many bookings arriving in this slot. */
  | "pacing_bookings"
  /** Suitable tables exist but are all occupied or blocked at this time. */
  | "tables_taken"
  /** Online only: at this arrival time the restaurant takes smaller parties (onlinePartyLimits). */
  | "party_size_limit";

export type SlotAvailability = {
  time: string;
  available: boolean;
  reason: SlotUnavailableReason | null;
  /** Best free option, i.e. what automatic assignment would pick. */
  option: SeatingOption | null;
  durationMinutes: number | null;
};

export type BusyIndex = ReadonlyMap<string, readonly BusyInterval[]>;

export function indexBusy(busy: readonly BusyInterval[], channel: Channel): BusyIndex {
  const index = new Map<string, BusyInterval[]>();
  for (const interval of busy) {
    if (interval.onlineOnly && channel !== "online") continue;
    const list = index.get(interval.tableId) ?? [];
    list.push(interval);
    index.set(interval.tableId, list);
  }
  return index;
}

export function isOptionFree(option: SeatingOption, start: number, end: number, busy: BusyIndex): boolean {
  return option.tableIds.every((tableId) =>
    (busy.get(tableId) ?? []).every((interval) => interval.end <= start || interval.start >= end),
  );
}

/** First option (in ranking order) whose tables are all free for the whole stay. */
export function findFreeOption(
  options: readonly SeatingOption[],
  start: number,
  durationFor: (roomId: string) => number,
  busy: BusyIndex,
): { option: SeatingOption; durationMinutes: number } | null {
  for (const option of options) {
    const durationMinutes = durationFor(option.roomId);
    if (isOptionFree(option, start, start + durationMinutes, busy)) return { option, durationMinutes };
  }
  return null;
}

/**
 * Pacing windows: a slot collects the arrivals from its own time up to the next slot.
 * With fixed seatings (19:30, 21:30) that means "everyone booked into this seating".
 */
export function slotWindows(
  slots: readonly string[],
  lastWindowMinutes: number,
): { start: number; end: number }[] {
  const minutes = slots.map(timeToMinutes);
  return minutes.map((start, i) => ({ start, end: minutes[i + 1] ?? start + lastWindowMinutes }));
}

/** Which pacing limit, if any, adding `partySize` covers at `start` would break. */
export function pacingViolation(
  window: { start: number; end: number },
  partySize: number,
  load: readonly ServiceLoad[],
  pacing: PacingRules,
): Extract<SlotUnavailableReason, "service_full" | "pacing_covers" | "pacing_bookings"> | null {
  if (pacing.maxCovers !== null) {
    const total = load.reduce((sum, l) => sum + l.partySize, 0);
    if (total + partySize > pacing.maxCovers) return "service_full";
  }
  const inWindow = load.filter((l) => l.start >= window.start && l.start < window.end);
  if (pacing.maxCoversPerSlot !== null) {
    const covers = inWindow.reduce((sum, l) => sum + l.partySize, 0);
    if (covers + partySize > pacing.maxCoversPerSlot) return "pacing_covers";
  }
  if (pacing.maxBookingsPerSlot !== null && inWindow.length + 1 > pacing.maxBookingsPerSlot) {
    return "pacing_bookings";
  }
  return null;
}

export type SlotAvailabilityInput = {
  slots: readonly string[];
  /** Ranked options from `buildSeatingOptions`. */
  options: readonly SeatingOption[];
  partySize: number;
  durationFor: (roomId: string) => number;
  busy: BusyIndex;
  load: readonly ServiceLoad[];
  pacing: PacingRules;
  slotIntervalMinutes: number;
  /** Slots starting before this minute are `too_soon`. */
  notBefore?: number | null;
};

export function computeSlotAvailability(input: SlotAvailabilityInput): SlotAvailability[] {
  const windows = slotWindows(input.slots, input.slotIntervalMinutes);

  return input.slots.map((time, i): SlotAvailability => {
    const window = windows[i]!;
    const unavailable = (reason: SlotUnavailableReason): SlotAvailability => ({
      time,
      available: false,
      reason,
      option: null,
      durationMinutes: null,
    });

    if (input.notBefore != null && window.start < input.notBefore) return unavailable("too_soon");
    if (input.options.length === 0) return unavailable("no_suitable_table");
    const pacing = pacingViolation(window, input.partySize, input.load, input.pacing);
    if (pacing) return unavailable(pacing);

    const free = findFreeOption(input.options, window.start, input.durationFor, input.busy);
    if (!free) return unavailable("tables_taken");
    return {
      time,
      available: true,
      reason: null,
      option: free.option,
      durationMinutes: free.durationMinutes,
    };
  });
}

/**
 * The largest party guests may book online for an arrival on `weekday` at `minutes` (wall clock),
 * or null when no limit applies. Overlapping limits: the strictest wins.
 */
export function onlinePartyLimitAt(
  limits: readonly { daysOfWeek: readonly number[]; from: string; to: string; maxParty: number }[],
  weekday: number,
  minutes: number,
): number | null {
  let limit: number | null = null;
  for (const rule of limits) {
    if (!rule.daysOfWeek.includes(weekday)) continue;
    // Arrivals after midnight belong to the evening before: compare within the day.
    const time = minutes % 1440;
    if (time < timeToMinutes(rule.from) || time > timeToMinutes(rule.to)) continue;
    limit = limit === null ? rule.maxParty : Math.min(limit, rule.maxParty);
  }
  return limit;
}
