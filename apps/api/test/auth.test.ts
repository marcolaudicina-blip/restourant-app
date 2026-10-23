import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { client, createTestApp, registerOwner, type TestContext } from "./helpers.js";

let ctx: TestContext;

beforeAll(async () => {
  ctx = await createTestApp();
});
afterAll(() => ctx.close());

describe("auth", () => {
  it("registers an owner with a restaurant and default booking rules", async () => {
    const owner = await registerOwner(ctx.app, "Osteria Bella Vista");
    const me = await owner.api.get("/v1/auth/me");
    expect(me.status).toBe(200);
    expect(me.body.data.memberships).toEqual([
      expect.objectContaining({
        restaurantId: owner.restaurantId,
        role: "owner",
        slug: "osteria-bella-vista",
      }),
    ]);
    const policy = await owner.api.get(`${owner.base}/booking-policy`);
    expect(policy.body.data).toMatchObject({ onlineEnabled: true, slotIntervalMinutes: 15 });
  });

  it("gives clashing restaurant names distinct slugs", async () => {
    const a = await registerOwner(ctx.app, "Da Gino");
    const b = await registerOwner(ctx.app, "Da Gino");
    const slugA = (await a.api.get(a.base)).body.data.slug;
    const slugB = (await b.api.get(b.base)).body.data.slug;
    expect(slugA).not.toBe(slugB);
  });

  it("rejects a duplicate email, case-insensitively", async () => {
    const owner = await registerOwner(ctx.app);
    const res = await client(ctx.app).post("/v1/auth/register", {
      email: owner.email.toUpperCase(),
      password: "another-long-password",
      fullName: "Someone",
      restaurantName: "Altro",
    });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("email_taken");
  });

  it("validates registration input", async () => {
    const res = await client(ctx.app).post("/v1/auth/register", {
      email: "not-an-email",
      password: "short",
      fullName: "",
      restaurantName: "X",
    });
    expect(res.status).toBe(400);
    expect(res.body.error.issues.map((i: { path: string }) => i.path)).toEqual(
      expect.arrayContaining(["email", "password", "fullName"]),
    );
  });

  it("logs in with the right password only", async () => {
    const owner = await registerOwner(ctx.app);
    const wrong = await client(ctx.app).post("/v1/auth/login", {
      email: owner.email,
      password: "nope-nope-nope",
    });
    expect(wrong.status).toBe(401);
    const unknown = await client(ctx.app).post("/v1/auth/login", {
      email: "ghost@example.com",
      password: "whatever-123",
    });
    expect(unknown.status).toBe(401);
    expect(unknown.body.error.message).toBe(wrong.body.error.message);

    const ok = await client(ctx.app).post("/v1/auth/login", {
      email: owner.email,
      password: "correct-horse-battery",
    });
    expect(ok.status).toBe(200);
    const me = await client(ctx.app, ok.body.data.token).get("/v1/auth/me");
    expect(me.body.data.user.email).toBe(owner.email);
  });

  it("requires a valid token", async () => {
    expect((await client(ctx.app).get("/v1/auth/me")).status).toBe(401);
    expect((await client(ctx.app, "garbage").get("/v1/auth/me")).status).toBe(401);
    expect((await client(ctx.app).get("/v1/templates")).status).toBe(401);
  });
});
