import { describe, expect, it } from "vitest";
import {
  DEFAULT_BOOKING_POLICY,
  bookingPolicy,
  calendarException,
  can,
  combination,
  registerInput,
  service,
  serviceDefaults,
  table,
  tableBlock,
  tableDefaults,
} from "../src/index.js";

const ID_A = "6f1c1d1e-8a5b-4a2e-9f7c-1a2b3c4d5e6f";
const ID_B = "7a2d2e2f-9b6c-4b3f-8a8d-2b3c4d5e6f70";

const messages = (result: { success: boolean; error?: { issues: { path: PropertyKey[] }[] } }) =>
  result.error?.issues.map((i) => i.path.join(".")) ?? [];

describe("booking policy", () => {
  it("accepts the defaults", () => {
    expect(bookingPolicy.safeParse(DEFAULT_BOOKING_POLICY).success).toBe(true);
  });

  it("rejects inverted party limits", () => {
    const result = bookingPolicy.safeParse({
      ...DEFAULT_BOOKING_POLICY,
      minPartyOnline: 6,
      maxPartyOnline: 4,
    });
    expect(messages(result)).toContain("maxPartyOnline");
  });

  it("requires a threshold for auto_up_to", () => {
    const result = bookingPolicy.safeParse({ ...DEFAULT_BOOKING_POLICY, confirmationMode: "auto_up_to" });
    expect(messages(result)).toContain("autoConfirmMaxParty");
  });

  it("requires at least one contact field", () => {
    const result = bookingPolicy.safeParse({
      ...DEFAULT_BOOKING_POLICY,
      requirePhone: false,
      requireEmail: false,
    });
    expect(result.success).toBe(false);
  });

  it("only allows known slot intervals", () => {
    expect(bookingPolicy.safeParse({ ...DEFAULT_BOOKING_POLICY, slotIntervalMinutes: 7 }).success).toBe(
      false,
    );
  });
});

describe("table", () => {
  const base = { ...tableDefaults, roomId: ID_A, name: "12", minCovers: 2, maxCovers: 4 };

  it("accepts a valid table", () => {
    expect(table.safeParse(base).success).toBe(true);
  });

  it("rejects min > max", () => {
    expect(messages(table.safeParse({ ...base, minCovers: 6 }))).toContain("maxCovers");
  });
});

describe("combination", () => {
  it("needs two distinct tables", () => {
    const base = {
      name: "T1+T2",
      minCovers: 3,
      maxCovers: 4,
      priority: 0,
      onlineBookable: true,
      isActive: true,
    };
    expect(combination.safeParse({ ...base, tableIds: [ID_A] }).success).toBe(false);
    expect(combination.safeParse({ ...base, tableIds: [ID_A, ID_A] }).success).toBe(false);
    expect(combination.safeParse({ ...base, tableIds: [ID_A, ID_B] }).success).toBe(true);
  });
});

describe("service", () => {
  const base = {
    ...serviceDefaults,
    name: "Cena",
    daysOfWeek: [5, 6],
    firstArrival: "19:00",
    lastArrival: "22:00",
  };

  it("accepts a continuous service", () => {
    expect(service.safeParse(base).success).toBe(true);
  });

  it("rejects last arrival before first arrival", () => {
    expect(messages(service.safeParse({ ...base, lastArrival: "18:00" }))).toContain("lastArrival");
  });

  it("requires seatings within the arrival window for fixed services", () => {
    const fixed = { ...base, seatingMode: "fixed" as const };
    expect(service.safeParse({ ...fixed, fixedSeatings: [] }).success).toBe(false);
    expect(service.safeParse({ ...fixed, fixedSeatings: ["22:30"] }).success).toBe(false);
    expect(service.safeParse({ ...fixed, fixedSeatings: ["19:30", "19:30"] }).success).toBe(false);
    expect(service.safeParse({ ...fixed, fixedSeatings: ["19:30", "21:30"] }).success).toBe(true);
  });

  it("rejects invalid weekdays and inverted seasons", () => {
    expect(service.safeParse({ ...base, daysOfWeek: [0] }).success).toBe(false);
    expect(service.safeParse({ ...base, daysOfWeek: [] }).success).toBe(false);
    expect(service.safeParse({ ...base, validFrom: "2026-09-30", validTo: "2026-06-01" }).success).toBe(
      false,
    );
  });
});

describe("calendar exception", () => {
  const closure = {
    kind: "closed" as const,
    scope: "all" as const,
    dateFrom: "2026-08-10",
    dateTo: "2026-08-20",
    serviceId: null,
    firstArrival: null,
    lastArrival: null,
    note: "Ferie estive",
  };

  it("accepts a closure", () => {
    expect(calendarException.safeParse(closure).success).toBe(true);
  });

  it("rejects closures with hours", () => {
    expect(calendarException.safeParse({ ...closure, firstArrival: "19:00" }).success).toBe(false);
  });

  it("requires service and hours for special hours", () => {
    const special = { ...closure, kind: "special_hours" as const };
    expect(calendarException.safeParse(special).success).toBe(false);
    expect(
      calendarException.safeParse({
        ...special,
        serviceId: ID_A,
        firstArrival: "20:00",
        lastArrival: "21:00",
      }).success,
    ).toBe(true);
  });
});

describe("table block", () => {
  const base = {
    startsAt: "2026-12-31T19:00:00+01:00",
    endsAt: "2027-01-01T02:00:00+01:00",
    onlineOnly: false,
    reason: null,
  };

  it("targets exactly one of table or room", () => {
    expect(tableBlock.safeParse({ ...base, tableId: ID_A, roomId: null }).success).toBe(true);
    expect(tableBlock.safeParse({ ...base, tableId: ID_A, roomId: ID_B }).success).toBe(false);
    expect(tableBlock.safeParse({ ...base, tableId: null, roomId: null }).success).toBe(false);
  });

  it("rejects an empty window", () => {
    expect(
      tableBlock.safeParse({ ...base, tableId: ID_A, roomId: null, endsAt: base.startsAt }).success,
    ).toBe(false);
  });
});

describe("auth input", () => {
  it("lowercases emails and enforces password length", () => {
    const ok = registerInput.parse({
      email: "Marco@Example.com",
      password: "a-long-password",
      fullName: "Marco",
      restaurantName: "Da Marco",
    });
    expect(ok.email).toBe("marco@example.com");
    expect(registerInput.safeParse({ ...ok, password: "short" }).success).toBe(false);
  });
});

describe("permissions", () => {
  it("lets staff read but not change configuration", () => {
    expect(can("staff", "config.read")).toBe(true);
    expect(can("staff", "config.write")).toBe(false);
    expect(can("manager", "config.write")).toBe(true);
    expect(can("manager", "restaurant.write")).toBe(false);
    expect(can("owner", "restaurant.write")).toBe(true);
  });
});
