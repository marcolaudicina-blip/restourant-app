/**
 * Local wall-clock helpers. Configuration is expressed in the restaurant's local time
 * ("HH:MM" strings and "YYYY-MM-DD" dates), so none of these functions touch time zones.
 */

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export type IsoWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export function isTimeString(value: string): boolean {
  return TIME_RE.test(value);
}

/** "19:30" -> 1170 */
export function timeToMinutes(value: string): number {
  const match = TIME_RE.exec(value);
  if (!match) throw new Error(`Invalid time "${value}", expected HH:MM`);
  return Number(match[1]) * 60 + Number(match[2]);
}

/** 1170 -> "19:30" */
export function minutesToTime(total: number): string {
  if (!Number.isInteger(total) || total < 0 || total >= 24 * 60) {
    throw new Error(`Minutes out of range: ${total}`);
  }
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Postgres returns `time` columns as "HH:MM:SS"; we only use minute precision. */
export function normalizeTime(value: string): string {
  return value.slice(0, 5);
}

export function compareTimes(a: string, b: string): number {
  return timeToMinutes(a) - timeToMinutes(b);
}

/** ISO weekday of a calendar date: Monday = 1 ... Sunday = 7. */
export function isoWeekday(date: string): IsoWeekday {
  const match = DATE_RE.exec(date);
  if (!match) throw new Error(`Invalid date "${date}", expected YYYY-MM-DD`);
  const day = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))).getUTCDay();
  return (day === 0 ? 7 : day) as IsoWeekday;
}

/** Inclusive range check on ISO date strings (lexicographic order == chronological order). */
export function isDateWithin(date: string, from: string | null, to: string | null): boolean {
  if (from !== null && date < from) return false;
  if (to !== null && date > to) return false;
  return true;
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}
