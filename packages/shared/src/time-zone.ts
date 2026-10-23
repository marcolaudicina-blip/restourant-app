/**
 * Conversions between absolute instants and the restaurant's local wall clock.
 * Built on Intl only, so it works the same in Node and in browsers.
 */

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatters.set(timeZone, f);
  }
  return f;
}

function wallClockParts(instant: Date, timeZone: string) {
  const parts = Object.fromEntries(
    formatter(timeZone)
      .formatToParts(instant)
      .map((p) => [p.type, p.value]),
  );
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

/** Offset of the zone from UTC at `instant`, in milliseconds (Rome in summer: +7_200_000). */
function zoneOffsetMs(instant: Date, timeZone: string): number {
  const p = wallClockParts(instant, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/**
 * The instant at which the local clock in `timeZone` shows `date` + `minutes` (minutes may exceed
 * 24h for times after midnight). Nonexistent local times (DST gap) resolve forward by the gap.
 */
export function localToInstant(date: string, minutes: number, timeZone: string): Date {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const wallAsUtc = Date.UTC(y, m - 1, d, 0, minutes);
  const firstGuess = wallAsUtc - zoneOffsetMs(new Date(wallAsUtc), timeZone);
  const offset = zoneOffsetMs(new Date(firstGuess), timeZone);
  return new Date(wallAsUtc - offset);
}

/** Local calendar date ("YYYY-MM-DD") and minutes since local midnight of an instant. */
export function instantToLocal(instant: Date, timeZone: string): { date: string; minutes: number } {
  const p = wallClockParts(instant, timeZone);
  const date = `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
  return { date, minutes: p.hour * 60 + p.minute };
}

const DAY_MS = 86_400_000;

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

/**
 * Wall-clock minutes of `instant` measured from local midnight of `date`: 20:00 the same day is
 * 1200, 01:00 the next day is 1500, 23:00 the day before is -60. Unlike elapsed time, this stays
 * aligned with the wall clock on DST change days.
 */
export function wallMinutesFrom(date: string, instant: Date, timeZone: string): number {
  const local = instantToLocal(instant, timeZone);
  return daysBetween(date, local.date) * 1440 + local.minutes;
}

/** `date` shifted by `days` calendar days. */
export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}
