import { describe, expect, it } from "vitest";
import {
  canTransition,
  isBlockingStatus,
  RESERVATION_STATUSES,
  RESERVATION_TRANSITIONS,
} from "../src/index.js";

describe("reservation lifecycle", () => {
  it("frees tables once a reservation is over", () => {
    expect(RESERVATION_STATUSES.filter(isBlockingStatus)).toEqual([
      "requested",
      "confirmed",
      "arrived",
      "seated",
    ]);
  });

  it("allows the normal flow and undo of mistakes", () => {
    expect(canTransition("confirmed", "seated")).toBe(true);
    expect(canTransition("seated", "completed")).toBe(true);
    expect(canTransition("completed", "seated")).toBe(true);
    expect(canTransition("cancelled", "confirmed")).toBe(true);
  });

  it("rejects skipping approval or reviving a finished stay as no-show", () => {
    expect(canTransition("requested", "seated")).toBe(false);
    expect(canTransition("completed", "no_show")).toBe(false);
  });

  it("only lists known statuses as targets", () => {
    for (const targets of Object.values(RESERVATION_TRANSITIONS)) {
      for (const t of targets) expect(RESERVATION_STATUSES).toContain(t);
    }
  });
});
