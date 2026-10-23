import { describe, expect, it } from "vitest";
import {
  isDateWithin,
  isoWeekday,
  isValidTimeZone,
  minutesToTime,
  normalizeTime,
  timeToMinutes,
} from "../src/index.js";

describe("time helpers", () => {
  it("converts between HH:MM and minutes", () => {
    expect(timeToMinutes("00:00")).toBe(0);
    expect(timeToMinutes("19:30")).toBe(1170);
    expect(minutesToTime(1170)).toBe("19:30");
    expect(minutesToTime(23 * 60 + 59)).toBe("23:59");
  });

  it("rejects malformed times", () => {
    expect(() => timeToMinutes("24:00")).toThrow();
    expect(() => timeToMinutes("9:30")).toThrow();
    expect(() => minutesToTime(24 * 60)).toThrow();
  });

  it("normalizes Postgres time values", () => {
    expect(normalizeTime("19:30:00")).toBe("19:30");
  });

  it("computes ISO weekdays", () => {
    expect(isoWeekday("2026-10-19")).toBe(1); // Monday
    expect(isoWeekday("2026-10-25")).toBe(7); // Sunday
    expect(isoWeekday("2024-02-29")).toBe(4); // leap day, Thursday
  });

  it("checks inclusive date ranges with open ends", () => {
    expect(isDateWithin("2026-06-01", "2026-06-01", "2026-09-30")).toBe(true);
    expect(isDateWithin("2026-10-01", "2026-06-01", "2026-09-30")).toBe(false);
    expect(isDateWithin("2030-01-01", "2026-06-01", null)).toBe(true);
    expect(isDateWithin("2020-01-01", null, null)).toBe(true);
  });

  it("validates IANA time zones", () => {
    expect(isValidTimeZone("Europe/Rome")).toBe(true);
    expect(isValidTimeZone("Mars/Olympus")).toBe(false);
  });
});
