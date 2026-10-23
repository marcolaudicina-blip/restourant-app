import { describe, expect, it } from "vitest";
import { resolveDuration, type DurationRuleFields } from "../src/index.js";

const rule = (overrides: Partial<DurationRuleFields>): DurationRuleFields => ({
  serviceId: null,
  roomId: null,
  minParty: 1,
  maxParty: 100,
  durationMinutes: 100,
  ...overrides,
});

const query = { partySize: 4, serviceId: "dinner", roomId: "terrace" };

describe("resolveDuration", () => {
  it("falls back to the default when nothing matches", () => {
    expect(resolveDuration([rule({ minParty: 5, maxParty: 8 })], query, 120)).toBe(120);
  });

  it("matches party size ranges inclusively", () => {
    const rules = [
      rule({ minParty: 1, maxParty: 2, durationMinutes: 90 }),
      rule({ minParty: 3, maxParty: 4, durationMinutes: 105 }),
    ];
    expect(resolveDuration(rules, { ...query, partySize: 2 }, 120)).toBe(90);
    expect(resolveDuration(rules, { ...query, partySize: 3 }, 120)).toBe(105);
  });

  it("prefers service+room over service over room over generic", () => {
    const generic = rule({ durationMinutes: 1 });
    const room = rule({ roomId: "terrace", durationMinutes: 2 });
    const service = rule({ serviceId: "dinner", durationMinutes: 3 });
    const both = rule({ serviceId: "dinner", roomId: "terrace", durationMinutes: 4 });
    expect(resolveDuration([generic, room], query, 0)).toBe(2);
    expect(resolveDuration([generic, room, service], query, 0)).toBe(3);
    expect(resolveDuration([both, generic, room, service], query, 0)).toBe(4);
  });

  it("ignores rules scoped to another service or room", () => {
    const rules = [
      rule({ serviceId: "lunch", durationMinutes: 60 }),
      rule({ roomId: "inside", durationMinutes: 70 }),
    ];
    expect(resolveDuration(rules, query, 120)).toBe(120);
  });

  it("breaks ties with the narrowest party range", () => {
    const rules = [rule({ durationMinutes: 120 }), rule({ minParty: 4, maxParty: 4, durationMinutes: 110 })];
    expect(resolveDuration(rules, query, 0)).toBe(110);
  });
});
