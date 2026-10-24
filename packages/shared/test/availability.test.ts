import { describe, expect, it } from "vitest";
import {
  buildSeatingOptions,
  computeSlotAvailability,
  indexBusy,
  onlinePartyLimitAt,
  slotWindows,
  type BusyInterval,
  type SeatingTable,
  type ServiceLoad,
  type SlotAvailabilityInput,
} from "../src/index.js";

const table = (name: string, min: number, max: number, priority = 0): SeatingTable => ({
  id: name,
  name,
  roomId: "sala",
  minCovers: min,
  maxCovers: max,
  priority,
  onlineBookable: true,
  combinationOnly: false,
  isActive: true,
});

const tables = [table("T1", 2, 4, 10), table("T2", 2, 4, 5), table("T3", 2, 4)];
const options = buildSeatingOptions({
  partySize: 4,
  channel: "staff",
  tables,
  rooms: [{ id: "sala", isActive: true, onlineBookable: true }],
  adjacencies: [],
  combinations: [],
});

const at = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));

function availability(
  overrides: Partial<SlotAvailabilityInput> & {
    busyList?: BusyInterval[];
    channel?: "staff" | "online";
  } = {},
) {
  const { busyList = [], channel = "staff", ...rest } = overrides;
  return computeSlotAvailability({
    slots: ["19:00", "19:30", "20:00"],
    options,
    partySize: 4,
    durationFor: () => 90,
    busy: indexBusy(busyList, channel),
    load: [],
    pacing: { maxCovers: null, maxCoversPerSlot: null, maxBookingsPerSlot: null },
    slotIntervalMinutes: 30,
    ...rest,
  });
}

describe("computeSlotAvailability", () => {
  it("assigns the highest priority free table", () => {
    const result = availability();
    expect(result.every((s) => s.available)).toBe(true);
    expect(result[0]).toMatchObject({ option: { name: "T1" }, durationMinutes: 90 });
  });

  it("falls back to the next priority when the best table is taken", () => {
    const result = availability({ busyList: [{ tableId: "T1", start: at("18:30"), end: at("20:00") }] });
    expect(result.map((s) => s.option?.name)).toEqual(["T2", "T2", "T1"]);
  });

  it("treats intervals as half-open: a table freed at 19:00 can be booked at 19:00", () => {
    const result = availability({ busyList: [{ tableId: "T1", start: at("17:30"), end: at("19:00") }] });
    expect(result[0]?.option?.name).toBe("T1");
  });

  it("reports tables_taken when every suitable table is busy", () => {
    const busyList = tables.map((t) => ({ tableId: t.id, start: at("18:00"), end: at("20:15") }));
    expect(availability({ busyList }).map((s) => s.reason)).toEqual([
      "tables_taken",
      "tables_taken",
      "tables_taken",
    ]);
  });

  it("considers the whole stay, not just the arrival time", () => {
    // T1 is free at 19:00 but booked again from 20:00: a 90-minute stay would overlap.
    const result = availability({ busyList: [{ tableId: "T1", start: at("20:00"), end: at("21:30") }] });
    expect(result[0]?.option?.name).toBe("T2");
  });

  it("applies online-only blocks to the online channel only", () => {
    const busyList = [{ tableId: "T1", start: at("18:00"), end: at("23:00"), onlineOnly: true }];
    expect(availability({ busyList, channel: "staff" })[0]?.option?.name).toBe("T1");
    expect(availability({ busyList, channel: "online" })[0]?.option?.name).toBe("T2");
  });

  it("reports no_suitable_table when nothing fits the party", () => {
    expect(availability({ options: [] })[0]?.reason).toBe("no_suitable_table");
  });

  it("enforces the minimum notice", () => {
    expect(availability({ notBefore: at("19:15") }).map((s) => s.reason)).toEqual(["too_soon", null, null]);
  });

  describe("pacing", () => {
    const load: ServiceLoad[] = [
      { start: at("19:00"), partySize: 6 },
      { start: at("19:15"), partySize: 2 },
      { start: at("19:30"), partySize: 4 },
    ];

    it("limits covers arriving in the same slot window", () => {
      const result = availability({
        load,
        pacing: { maxCovers: null, maxCoversPerSlot: 10, maxBookingsPerSlot: null },
      });
      expect(result.map((s) => s.reason)).toEqual(["pacing_covers", null, null]);
    });

    it("limits bookings arriving in the same slot window", () => {
      const result = availability({
        load,
        pacing: { maxCovers: null, maxCoversPerSlot: null, maxBookingsPerSlot: 2 },
      });
      expect(result.map((s) => s.reason)).toEqual(["pacing_bookings", null, null]);
    });

    it("caps the total covers of the service", () => {
      const result = availability({
        load,
        pacing: { maxCovers: 15, maxCoversPerSlot: null, maxBookingsPerSlot: null },
      });
      expect(result.every((s) => s.reason === "service_full")).toBe(true);
    });
  });
});

describe("slotWindows", () => {
  it("spans from each slot to the next, fixed seatings included", () => {
    expect(slotWindows(["19:30", "21:30"], 30)).toEqual([
      { start: 1170, end: 1290 },
      { start: 1290, end: 1320 },
    ]);
  });
});

describe("onlinePartyLimitAt", () => {
  const limits = [
    { daysOfWeek: [5, 6], from: "19:00", to: "20:00", maxParty: 6 },
    { daysOfWeek: [6], from: "19:30", to: "19:45", maxParty: 4 },
  ];

  it("applies between the two times, both included, on the chosen days", () => {
    expect(onlinePartyLimitAt(limits, 5, 18 * 60 + 45)).toBeNull();
    expect(onlinePartyLimitAt(limits, 5, 19 * 60)).toBe(6);
    expect(onlinePartyLimitAt(limits, 5, 20 * 60)).toBe(6);
    expect(onlinePartyLimitAt(limits, 5, 20 * 60 + 15)).toBeNull();
    expect(onlinePartyLimitAt(limits, 4, 19 * 60 + 30)).toBeNull();
  });

  it("takes the strictest of overlapping limits", () => {
    expect(onlinePartyLimitAt(limits, 6, 19 * 60 + 30)).toBe(4);
    expect(onlinePartyLimitAt(limits, 6, 19 * 60 + 50)).toBe(6);
  });
});
