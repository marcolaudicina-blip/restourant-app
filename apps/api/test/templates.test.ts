import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApp, registerOwner, type TestContext } from "./helpers.js";

let ctx: TestContext;

beforeAll(async () => {
  ctx = await createTestApp();
});
afterAll(() => ctx.close());

describe("starter templates", () => {
  it("lists templates with a summary", async () => {
    const owner = await registerOwner(ctx.app);
    const res = await owner.api.get("/v1/templates");
    expect(res.body.data.map((t: { key: string }) => t.key)).toEqual([
      "trattoria",
      "pizzeria_turni",
      "fine_dining",
    ]);
    expect(res.body.data[0].summary).toMatchObject({ rooms: 2, tables: 16, services: ["Pranzo", "Cena"] });
  });

  it("sets up an empty restaurant in one step", async () => {
    const owner = await registerOwner(ctx.app);
    const res = await owner.api.post(`${owner.base}/setup/apply-template`, { template: "trattoria" });
    expect(res.status).toBe(200);
    const config = res.body.data;
    expect(config.rooms.map((r: { name: string }) => r.name)).toEqual(["Sala", "Dehors"]);
    expect(config.tables).toHaveLength(16);
    expect(config.tableAdjacencies).toHaveLength(9);
    expect(config.services.map((s: { name: string }) => s.name)).toEqual(["Pranzo", "Cena"]);
    expect(config.durationRules).toHaveLength(4);

    const monday = await owner.api.get(`${owner.base}/schedule?date=2026-10-26`);
    expect(monday.body.data.services.every((s: { status: string }) => s.status === "closed")).toBe(true);
    const tuesday = await owner.api.get(`${owner.base}/schedule?date=2026-10-27`);
    expect(tuesday.body.data.services[1].slots[0]).toBe("19:00");
  });

  it("applies policy overrides and fixed seatings", async () => {
    const owner = await registerOwner(ctx.app);
    const pizzeria = await owner.api.post(`${owner.base}/setup/apply-template`, {
      template: "pizzeria_turni",
    });
    expect(pizzeria.body.data.bookingPolicy.maxPartyOnline).toBe(10);
    const friday = await owner.api.get(`${owner.base}/schedule?date=2026-10-23`);
    expect(friday.body.data.services.find((s: { name: string }) => s.name === "Cena").slots).toEqual([
      "19:30",
      "21:30",
    ]);
  });

  it("refuses to overwrite an existing setup", async () => {
    const owner = await registerOwner(ctx.app);
    await owner.api.post(`${owner.base}/rooms`, { name: "Sala" });
    const res = await owner.api.post(`${owner.base}/setup/apply-template`, { template: "fine_dining" });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("config_not_empty");
    expect((await owner.api.post(`${owner.base}/setup/apply-template`, { template: "nope" })).status).toBe(
      400,
    );
  });
});
