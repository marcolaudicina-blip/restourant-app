import { describe, expect, it } from "vitest";
import { addDays, instantToLocal, localToInstant, wallMinutesFrom } from "../src/index.js";

const ROME = "Europe/Rome";

describe("time zones", () => {
  it("converts local wall time to an instant", () => {
    expect(localToInstant("2026-07-10", 20 * 60, ROME).toISOString()).toBe("2026-07-10T18:00:00.000Z");
    expect(localToInstant("2026-01-10", 20 * 60, ROME).toISOString()).toBe("2026-01-10T19:00:00.000Z");
  });

  it("handles times past midnight", () => {
    expect(localToInstant("2026-07-10", 24 * 60 + 30, ROME).toISOString()).toBe("2026-07-10T22:30:00.000Z");
  });

  it("stays on the wall clock across DST changes", () => {
    // 29 March 2026: clocks jump from 02:00 to 03:00 in Rome.
    const dinner = localToInstant("2026-03-29", 20 * 60, ROME);
    expect(dinner.toISOString()).toBe("2026-03-29T18:00:00.000Z");
    expect(wallMinutesFrom("2026-03-29", dinner, ROME)).toBe(1200);
    // A nonexistent local time resolves forward.
    expect(instantToLocal(localToInstant("2026-03-29", 150, ROME), ROME).minutes).toBe(210);
  });

  it("measures minutes relative to another day", () => {
    const lateNight = localToInstant("2026-07-11", 30, ROME);
    expect(wallMinutesFrom("2026-07-10", lateNight, ROME)).toBe(1470);
    expect(wallMinutesFrom("2026-07-12", lateNight, ROME)).toBe(-1410);
  });

  it("adds calendar days", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
});
