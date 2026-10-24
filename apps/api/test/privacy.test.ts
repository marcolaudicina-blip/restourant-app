import { users } from "@restourant/db";
import { TERMS_VERSION } from "@restourant/shared";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addMember, client, createTestApp, registerOwner, type TestContext } from "./helpers.js";

let ctx: TestContext;

beforeAll(async () => {
  ctx = await createTestApp();
});
afterAll(() => ctx.close());

/** The test clock is Friday 23 October 2026. */
const runJob = () => client(ctx.app, "test-cron-secret-0123456789").post("/v1/internal/reminders");

async function setUp(name: string) {
  const owner = await registerOwner(ctx.app, name);
  const post = async (path: string, body: object) => {
    const res = await owner.api.post(`${owner.base}${path}`, body);
    if (res.status !== 201) throw new Error(`${path}: ${JSON.stringify(res.body)}`);
    return res.body.data;
  };
  const room = await post("/rooms", { name: "Sala" });
  for (const table of ["T1", "T2", "T3"])
    await post("/tables", { roomId: room.id, name: table, minCovers: 1, maxCovers: 6 });
  await post("/services", {
    name: "Cena",
    daysOfWeek: [1, 2, 3, 4, 5, 6, 7],
    firstArrival: "19:00",
    lastArrival: "22:00",
  });
  return { owner, post };
}

describe("terms of service", () => {
  it("must be accepted to sign up, and the acceptance is kept", async () => {
    const body = {
      email: "nuovo@example.com",
      password: "password-lunga-123",
      fullName: "Nuovo",
      restaurantName: "Nuovo Locale",
    };
    const refused = await client(ctx.app).post("/v1/auth/register", body);
    expect(refused.status).toBe(400);
    expect(refused.body.error.issues.map((i: { path: string }) => i.path)).toContain("acceptTerms");

    const ok = await client(ctx.app).post("/v1/auth/register", { ...body, acceptTerms: true });
    expect(ok.status).toBe(201);
    const [user] = await ctx.database.db.select().from(users).where(eq(users.email, "nuovo@example.com"));
    expect(user!.termsVersion).toBe(TERMS_VERSION);
    expect(user!.termsAcceptedAt).toBeInstanceOf(Date);
  });
});

describe("the restaurant's privacy notice", () => {
  it("can point the booking page to the restaurant's own notice", async () => {
    const { owner } = await setUp("Osteria Privacy");
    const page = await owner.api.patch(`${owner.base}/booking-page`, {
      privacyUrl: "https://osteria.example.com/privacy",
    });
    expect(page.status).toBe(200);
    const profile = await client(ctx.app).get(`/v1/public/restaurants/${page.body.data.slug}`);
    expect(profile.body.data.page.privacyUrl).toBe("https://osteria.example.com/privacy");
    expect(
      (await owner.api.patch(`${owner.base}/booking-page`, { privacyUrl: "javascript:alert(1)" })).status,
    ).toBe(400);
  });
});

describe("data export", () => {
  it("gives the owner everything as JSON, and nobody else", async () => {
    const { owner, post } = await setUp("Osteria Export");
    await post("/reservations", {
      date: "2026-10-24",
      time: "20:00",
      partySize: 2,
      guestName: "Lucia Verdi",
      guestPhone: "347 111 2222",
    });
    const res = await owner.api.get(`${owner.base}/export`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      format: "twentyreserve-export",
      restaurant: { name: "Osteria Export" },
      guests: [{ fullName: "Lucia Verdi" }],
      reservations: [{ guestName: "Lucia Verdi", partySize: 2 }],
    });
    expect(res.body.reservations[0].tableIds).toHaveLength(1);
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash/);

    const manager = await addMember(ctx, owner.restaurantId, "manager");
    expect((await manager.get(`${owner.base}/export`)).status).toBe(403);
  });
});

describe("storage limits", () => {
  it("anonymizes guests not seen for longer than the restaurant keeps data", async () => {
    const { owner, post } = await setUp("Osteria Memoria");
    await owner.api.patch(`${owner.base}/booking-policy`, { guestRetentionMonths: 6 });
    const book = (date: string, guestName: string, guestPhone: string | null) =>
      post("/reservations", { date, time: "20:00", partySize: 2, guestName, guestPhone });
    const old = await book("2026-03-05", "Vecchio Cliente", "333 000 0001");
    await book("2026-03-06", "Abituale", "333 000 0002");
    const recent = await book("2026-10-10", "Abituale", "333 000 0002");
    const walkIn = await book("2026-02-01", "Signora al bancone", null);
    await owner.api.post(`${owner.base}/waitlist`, {
      date: "2026-08-01",
      partySize: 2,
      timeFrom: null,
      timeTo: null,
      guestName: "In attesa",
      guestPhone: "333 000 0003",
      guestEmail: null,
      note: null,
    });

    const res = await runJob();
    expect(res.body.data.retention).toMatchObject({ guests: expect.any(Number) });

    const get = async (id: string) => (await owner.api.get(`${owner.base}/reservations/${id}`)).body.data;
    expect(await get(old.id)).toMatchObject({
      guestName: "Cliente rimosso",
      guestPhone: null,
      guestId: null,
    });
    expect(await get(walkIn.id)).toMatchObject({ guestName: "Cliente rimosso" });
    expect(await get(recent.id)).toMatchObject({
      guestName: "Abituale",
      guest: { visits: expect.any(Number) },
    });

    const guests = (await owner.api.get(`${owner.base}/guests`)).body.data.map(
      (g: { fullName: string }) => g.fullName,
    );
    expect(guests).toEqual(["Abituale"]);
    expect((await owner.api.get(`${owner.base}/waitlist?date=2026-08-01`)).body.data).toEqual([]);
  });
});
