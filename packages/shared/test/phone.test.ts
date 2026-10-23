import { describe, expect, it } from "vitest";
import { normalizePhone } from "../src/index.js";

describe("normalizePhone", () => {
  it("recognizes the same Italian number written in different ways", () => {
    const forms = ["333 123 4567", "+39 333-123-4567", "0039 3331234567", "(+39) 333.123.4567", "3331234567"];
    expect(new Set(forms.map((f) => normalizePhone(f)))).toEqual(new Set(["+393331234567"]));
  });

  it("keeps foreign numbers", () => {
    expect(normalizePhone("+44 20 7946 0958")).toBe("+442079460958");
    expect(normalizePhone("0049 30 123456")).toBe("+4930123456");
  });

  it("handles landlines", () => {
    expect(normalizePhone("091 123 4567")).toBe("+390911234567");
  });

  it("rejects text and too short numbers", () => {
    expect(normalizePhone("chiedere a Marco")).toBeNull();
    expect(normalizePhone("1234")).toBeNull();
    expect(normalizePhone("")).toBeNull();
    expect(normalizePhone(null)).toBeNull();
  });
});
