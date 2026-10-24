import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { addMember, client, createTestApp, registerOwner, type TestContext } from "./helpers.js";

let ctx: TestContext;
let owner: Awaited<ReturnType<typeof registerOwner>>;
let t: Record<string, { id: string }>;

/** The test clock is Friday 23 October 2026, 10:00 in Rome. */
const SATURDAY = "2026-10-24";

beforeAll(async () => {
  ctx = await createTestApp();
});
afterAll(() => ctx.close());

beforeEach(async () => {
  owner = await registerOwner(ctx.app, "Osteria Storico");
  const post = async (path: string, body: object) => {
    const res = await owner.api.post(`${owner.base}${path}`, body);
    if (res.status !== 201) throw new Error(`${path}: ${JSON.stringify(res.body)}`);
    return res.body.data;
  };
  const sala = await post("/rooms", { name: "Sala" });
  const dehors = await post("/rooms", { name: "Dehors" });
  t = {
    T1: await post("/tables", { roomId: sala.id, name: "T1", minCovers: 2, maxCovers: 4 }),
    D1: await post("/tables", { roomId: dehors.id, name: "D1", minCovers: 2, maxCovers: 6 }),
  };
  await post("/services", {
    name: "Cena",
    daysOfWeek: [1, 2, 3, 4, 5, 6, 7],
    firstArrival: "19:00",
    lastArrival: "22:00",
  });
});

describe("history of a booking", () => {
  it("lists every change with who made it", async () => {
    const created = await owner.api.post(`${owner.base}/reservations`, {
      date: SATURDAY,
      time: "20:00",
      partySize: 2,
      guestName: "Lucia Verdi",
      guestEmail: "lucia@example.com",
      tableIds: [t.T1!.id],
    });
    const id = created.body.data.id;
    const waiter = await addMember(ctx, owner.restaurantId, "staff");
    await waiter.put(`${owner.base}/reservations/${id}/tables`, { tableIds: [t.D1!.id] });
    await owner.api.patch(`${owner.base}/reservations/${id}`, { time: "21:00", partySize: 3 });
    await waiter.post(`${owner.base}/reservations/${id}/status`, { status: "seated" });

    const res = await waiter.get(`${owner.base}/reservations/${id}/history`);
    expect(res.status).toBe(200);
    const history = res.body.data as { title: string; actor: { name: string }; lines: string[] }[];
    const ownerName = (await owner.api.get("/v1/auth/me")).body.data.user.fullName;
    expect(history.map((h) => h.title)).toEqual([
      "Prenotazione creata dallo staff",
      expect.stringMatching(/^Email «conferma» inviata a lucia@example.com$/),
      "Cambio tavolo",
      "Modificata",
      "Email «modifica» inviata a lucia@example.com",
      "Cambio stato",
    ]);
    expect(history[0]).toMatchObject({
      actor: { name: ownerName },
      lines: ["2 persone, sab 24 ott ore 20:00", "Tavolo: T1 (Sala)"],
    });
    expect(history[2]).toMatchObject({
      actor: { kind: "staff", name: expect.stringMatching(/^staff \d+$/) },
      lines: ["Tavolo: T1 (Sala) → D1 (Dehors)"],
    });
    expect(history[3]!.lines).toEqual(["Ora: 20:00 → 21:00", "Persone: 2 → 3"]);
    expect(history[5]!.lines).toEqual(["Stato: Confermata → Seduta"]);
  });

  it("marks what guests did themselves", async () => {
    const slug = (await owner.api.get(`${owner.base}/booking-page`)).body.data.slug;
    const booked = await client(ctx.app).post(`/v1/public/restaurants/${slug}/reservations`, {
      date: SATURDAY,
      time: "20:00",
      partySize: 2,
      guestName: "Marco Neri",
      guestPhone: "347 000 1111",
      guestEmail: "marco@example.com",
      guestNote: null,
      privacyAccepted: true,
    });
    const id = booked.body.data.id;
    const token = /\/prenotazione\/([\w.-]+)/.exec(
      ctx.sentEmails.filter((e) => e.to === "marco@example.com").at(-1)!.text,
    )![1];
    await client(ctx.app).post(`/v1/public/bookings/${token}/cancel`);

    const history = (await owner.api.get(`${owner.base}/reservations/${id}/history`)).body.data;
    expect(history[0]).toMatchObject({ title: "Prenotazione creata dal sito", actor: { kind: "guest" } });
    expect(history.at(-2)).toMatchObject({
      title: "Disdetta dal cliente",
      actor: { kind: "guest", name: "Cliente" },
      lines: ["Stato: Confermata → Cancellata"],
    });
  });
});
