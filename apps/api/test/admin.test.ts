import { users } from "@restourant/db";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { client, createTestApp, registerOwner, type TestContext } from "./helpers.js";

let ctx: TestContext;
let admin: Awaited<ReturnType<typeof registerOwner>>;

beforeAll(async () => {
  ctx = await createTestApp();
  // The admin is listed in platformAdmins (helpers.ts) by email.
  admin = await registerOwner(ctx.app, "Locale dell'admin");
  await ctx.database.db
    .update(users)
    .set({ email: "admin@twentyreserve.test" })
    .where(eq(users.id, admin.userId));
});
afterAll(() => ctx.close());

describe("platform admin", () => {
  it("is hidden from everyone else", async () => {
    const owner = await registerOwner(ctx.app, "Trattoria Curiosa");
    expect((await owner.api.get("/v1/admin/restaurants")).status).toBe(404);
    expect((await client(ctx.app).get("/v1/admin/overview")).status).toBe(401);
    expect((await owner.api.get("/v1/auth/me")).body.data.platformAdmin).toBe(false);
    expect((await admin.api.get("/v1/auth/me")).body.data.platformAdmin).toBe(true);
  });

  it("lists every restaurant with its owner and usage", async () => {
    const owner = await registerOwner(ctx.app, "Osteria Elenco");
    await owner.api.post(`${owner.base}/setup/apply-template`, { template: "trattoria" });
    await owner.api.post(`${owner.base}/reservations`, {
      date: "2026-10-24",
      time: "20:00",
      partySize: 2,
      guestName: "Rossi",
    });

    const overview = (await admin.api.get("/v1/admin/overview")).body.data;
    expect(overview.restaurants).toBeGreaterThanOrEqual(2);
    expect(overview.bookingsLast30Days).toBeGreaterThanOrEqual(1);

    const list = (await admin.api.get("/v1/admin/restaurants")).body.data;
    const row = list.find((r: { id: string }) => r.id === owner.restaurantId);
    expect(row).toMatchObject({
      name: "Osteria Elenco",
      owner: { email: owner.email },
      members: 1,
      bookingsLast30Days: 1,
      trialDaysLeft: 30,
    });
    expect(row.lastActivityAt).not.toBeNull();
  });

  it("opens a restaurant as support, visibly, and leaves it", async () => {
    const owner = await registerOwner(ctx.app, "Pizzeria Aiuto");
    expect((await admin.api.get(`${owner.base}/reservations?date=2026-10-24`)).status).toBe(404);

    expect((await admin.api.post(`/v1/admin/restaurants/${owner.restaurantId}/support`)).status).toBe(200);
    expect((await admin.api.get(`${owner.base}/reservations?date=2026-10-24`)).status).toBe(200);
    const me = (await admin.api.get("/v1/auth/me")).body.data;
    expect(
      me.memberships.find((m: { restaurantId: string }) => m.restaurantId === owner.restaurantId),
    ).toMatchObject({ role: "manager", support: true });

    // The restaurant sees who is in, and the access is in its own log.
    const team = (await owner.api.get(`${owner.base}/team`)).body.data;
    expect(team.members.find((m: { email: string }) => m.email === "admin@twentyreserve.test")).toMatchObject(
      {
        support: true,
      },
    );
    const detail = (await admin.api.get(`/v1/admin/restaurants/${owner.restaurantId}`)).body.data;
    expect(detail.supportActive).toBe(true);
    expect(detail.recentActivity[0]).toMatchObject({ entity: "support_access", action: "create" });

    expect((await admin.api.delete(`/v1/admin/restaurants/${owner.restaurantId}/support`)).status).toBe(204);
    expect((await admin.api.get(`${owner.base}/reservations?date=2026-10-24`)).status).toBe(404);
  });

  it("never touches a real membership of the admin", async () => {
    const res = await admin.api.delete(`/v1/admin/restaurants/${admin.restaurantId}/support`);
    expect(res.status).toBe(409);
    expect((await admin.api.get(`${admin.base}/reservations?date=2026-10-24`)).status).toBe(200);
  });
});
