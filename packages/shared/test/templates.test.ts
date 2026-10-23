import { describe, expect, it } from "vitest";
import {
  CONFIG_TEMPLATES,
  DEFAULT_BOOKING_POLICY,
  bookingPolicy,
  durationRule,
  service,
  serviceDefaults,
  table,
  tableDefaults,
} from "../src/index.js";

const FAKE_ID = "6f1c1d1e-8a5b-4a2e-9f7c-1a2b3c4d5e6f";

describe.each(CONFIG_TEMPLATES)("template $key", (template) => {
  const tableNames = template.rooms.flatMap((r) => r.tables.map((t) => t.name));

  it("has unique table names", () => {
    expect(new Set(tableNames).size).toBe(tableNames.length);
  });

  it("only links existing tables", () => {
    for (const [a, b] of template.adjacencies) {
      expect(tableNames).toContain(a);
      expect(tableNames).toContain(b);
    }
  });

  it("produces valid configuration", () => {
    expect(bookingPolicy.safeParse({ ...DEFAULT_BOOKING_POLICY, ...template.policy }).success).toBe(true);
    for (const room of template.rooms) {
      for (const t of room.tables) {
        expect(table.safeParse({ ...tableDefaults, ...t, roomId: FAKE_ID }).success).toBe(true);
      }
    }
    for (const s of template.services) {
      const { rooms: _rooms, ...fields } = s as typeof s & { rooms?: string[] };
      expect(service.safeParse({ ...serviceDefaults, ...fields }).error).toBeUndefined();
    }
    for (const r of template.durationRules) {
      expect(durationRule.safeParse({ serviceId: null, roomId: null, ...r }).success).toBe(true);
    }
  });
});
