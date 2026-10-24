import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { client, createTestApp, registerOwner, type Client, type TestContext } from "./helpers.js";

let ctx: TestContext;
let owner: Awaited<ReturnType<typeof registerOwner>>;
let guest: Client;
let t: Record<string, { id: string }>;

/** The test clock is Friday 23 October 2026, 10:00 in Rome. */
const SATURDAY = "2026-10-24";

beforeAll(async () => {
  ctx = await createTestApp();
  guest = client(ctx.app);
});
afterAll(() => ctx.close());

/* Sala: T1 (priority), T2 (2-4 people), joinable as T1+T2 (5-8). Dehors: D1 (5-8). */
beforeEach(async () => {
  owner = await registerOwner(ctx.app, "Osteria Tavoli");
  const post = async (path: string, body: object) => {
    const res = await owner.api.post(`${owner.base}${path}`, body);
    if (res.status !== 201) throw new Error(`${path}: ${JSON.stringify(res.body)}`);
    return res.body.data;
  };
  const sala = await post("/rooms", { name: "Sala" });
  const dehors = await post("/rooms", { name: "Dehors" });
  t = {
    T1: await post("/tables", { roomId: sala.id, name: "T1", minCovers: 2, maxCovers: 4, priority: 20 }),
    T2: await post("/tables", { roomId: sala.id, name: "T2", minCovers: 2, maxCovers: 4, priority: 10 }),
    D1: await post("/tables", { roomId: dehors.id, name: "D1", minCovers: 5, maxCovers: 8 }),
  };
  await post("/combinations", {
    name: "T1+T2",
    tableIds: [t.T1!.id, t.T2!.id],
    minCovers: 5,
    maxCovers: 8,
    priority: 50,
  });
  await post("/services", {
    name: "Cena",
    daysOfWeek: [1, 2, 3, 4, 5, 6, 7],
    firstArrival: "19:00",
    lastArrival: "22:00",
  });
});

const emailsTo = (to: string) => ctx.sentEmails.filter((e) => e.to === to);

/** A staff booking on given tables; returns its id and the guest's link from the email. */
async function staffBooking(email: string, partySize: number, tables: string[]) {
  const res = await owner.api.post(`${owner.base}/reservations`, {
    date: SATURDAY,
    time: "20:00",
    partySize,
    guestName: "Lucia Verdi",
    guestEmail: email,
    tableIds: tables.map((name) => t[name]!.id),
  });
  if (res.status !== 201) throw new Error(JSON.stringify(res.body));
  const token = /\/prenotazione\/([\w.-]+)/.exec(emailsTo(email).at(-1)!.text)![1]!;
  return { id: res.body.data.id as string, token };
}

const change = (token: string, partySize: number, time = "20:00") =>
  guest.post(`/v1/public/bookings/${token}/change`, { date: SATURDAY, time, partySize });
const tablesOf = async (id: string) =>
  (await owner.api.get(`${owner.base}/reservations/${id}`)).body.data.tables.map(
    (x: { name: string }) => x.name,
  );

describe("tables when guests change their booking", () => {
  it("keeps the guest's table when it still fits", async () => {
    const { id, token } = await staffBooking("keep@example.com", 2, ["T2"]);
    expect((await change(token, 3)).status).toBe(200);
    // T1 comes first for new bookings, but nobody is moved without need.
    expect(await tablesOf(id)).toEqual(["T2"]);
  });

  it("frees the joined table when fewer people come", async () => {
    const { id, token } = await staffBooking("fewer@example.com", 6, ["T1", "T2"]);
    expect((await change(token, 3)).status).toBe(200);
    expect(await tablesOf(id)).toEqual(["T1"]);
    // T2 is free again at that time.
    const other = await owner.api.post(`${owner.base}/reservations`, {
      date: SATURDAY,
      time: "20:00",
      partySize: 2,
      guestName: "Rossi",
      tableIds: [t.T2!.id],
    });
    expect(other.status).toBe(201);
  });

  it("finds a bigger table, also in another room, and tells staff where", async () => {
    const since = new Date(Date.now() - 1000).toISOString();
    const { id, token } = await staffBooking("more@example.com", 2, ["T1"]);
    // T2 is taken: the only place for six is the Dehors.
    await owner.api.post(`${owner.base}/reservations`, {
      date: SATURDAY,
      time: "20:00",
      partySize: 2,
      guestName: "Rossi",
      tableIds: [t.T2!.id],
    });
    expect((await change(token, 6)).status).toBe(200);
    expect(await tablesOf(id)).toEqual(["D1"]);

    const activity = (await owner.api.get(`${owner.base}/reservations/activity?since=${since}`)).body.data;
    expect(activity.guestChanges).toMatchObject([
      {
        guestName: "Lucia Verdi",
        partySize: 6,
        kind: "updated",
        tables: "D1",
        room: "Dehors",
        previousTables: "T1",
      },
    ]);
  });

  it("does not offer times for groups larger than the page takes", async () => {
    const { token } = await staffBooking("big@example.com", 2, ["T1"]);
    const res = await guest.get(`/v1/public/bookings/${token}/availability?date=${SATURDAY}&partySize=12`);
    expect(res.body.data).toMatchObject({ mode: "closed", reason: "large_party_phone", services: [] });
  });

  it("keeps large-group requests within the service's maximum covers", async () => {
    const services = (await owner.api.get(`${owner.base}/services`)).body.data;
    await owner.api.patch(`${owner.base}/services/${services[0].id}`, { maxCovers: 12 });
    await staffBooking("full@example.com", 6, ["D1"]);
    const slug = (await owner.api.get(`${owner.base}/booking-page`)).body.data.slug;
    const day = await guest.get(`/v1/public/restaurants/${slug}/availability?date=${SATURDAY}&partySize=10`);
    expect(day.body.data.mode).toBe("request");
    expect(day.body.data.services[0].times).toEqual([]);
  });
});
