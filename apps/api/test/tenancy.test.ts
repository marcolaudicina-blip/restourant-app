import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addMember, client, createTestApp, registerOwner, type TestContext } from "./helpers.js";

let ctx: TestContext;

beforeAll(async () => {
  ctx = await createTestApp();
});
afterAll(() => ctx.close());

describe("restaurant scope", () => {
  it("hides other restaurants behind a 404", async () => {
    const a = await registerOwner(ctx.app);
    const b = await registerOwner(ctx.app);
    const res = await b.api.get(`${a.base}/rooms`);
    expect(res.status).toBe(404);
    expect((await b.api.get("/v1/restaurants/not-a-uuid/rooms")).status).toBe(404);
    expect((await client(ctx.app).get(`${a.base}/rooms`)).status).toBe(401);
  });

  it("never lets a reference cross tenants", async () => {
    const a = await registerOwner(ctx.app);
    const b = await registerOwner(ctx.app);
    const roomOfA = (await a.api.post(`${a.base}/rooms`, { name: "Sala" })).body.data;
    const res = await b.api.post(`${b.base}/tables`, {
      roomId: roomOfA.id,
      name: "1",
      minCovers: 1,
      maxCovers: 2,
    });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/Sala non trovato/);
    expect((await b.api.get(`${b.base}/rooms/${roomOfA.id}`)).status).toBe(404);
    expect((await b.api.delete(`${b.base}/rooms/${roomOfA.id}`)).status).toBe(404);
    expect((await a.api.get(`${a.base}/rooms/${roomOfA.id}`)).status).toBe(200);
  });

  it("lets staff read the setup but not change it", async () => {
    const owner = await registerOwner(ctx.app);
    const staff = await addMember(ctx, owner.restaurantId, "staff");
    expect((await staff.get(`${owner.base}/config`)).status).toBe(200);
    const res = await staff.post(`${owner.base}/rooms`, { name: "Sala" });
    expect(res.status).toBe(403);
    expect((await staff.get(`${owner.base}/audit-log`)).status).toBe(403);
  });

  it("lets managers change the setup but not the restaurant profile", async () => {
    const owner = await registerOwner(ctx.app);
    const manager = await addMember(ctx, owner.restaurantId, "manager");
    expect((await manager.post(`${owner.base}/rooms`, { name: "Sala" })).status).toBe(201);
    expect((await manager.patch(owner.base, { name: "Nuovo nome" })).status).toBe(403);
    expect((await owner.api.patch(owner.base, { name: "Nuovo nome" })).body.data.name).toBe("Nuovo nome");
  });
});
