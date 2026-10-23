import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { addMember, createTestApp, registerOwner, type TestContext } from "./helpers.js";

let ctx: TestContext;
let owner: Awaited<ReturnType<typeof registerOwner>>;

const SATURDAY = "2026-10-24";
const NEXT_SATURDAY = "2026-10-31";
const PAST_SATURDAY = "2026-10-17";

beforeAll(async () => {
  ctx = await createTestApp();
});
afterAll(() => ctx.close());

beforeEach(async () => {
  owner = await registerOwner(ctx.app);
  await owner.api.post(`${owner.base}/setup/apply-template`, { template: "trattoria" });
});

const book = (body: object) =>
  owner.api.post(`${owner.base}/reservations`, {
    date: SATURDAY,
    time: "20:00",
    partySize: 2,
    guestName: "Rossi",
    ...body,
  });

describe("guest profiles from bookings", () => {
  it("creates one profile per phone, however the number is written", async () => {
    const a = await book({ guestName: "Mario Rossi", guestPhone: "333 123 4567" });
    const b = await book({ guestName: "Rossi", guestPhone: "+39 333-1234567", date: NEXT_SATURDAY });
    expect(a.body.data.guestId).toBeTruthy();
    expect(b.body.data.guestId).toBe(a.body.data.guestId);
    expect(b.body.data.guest).toMatchObject({ fullName: "Mario Rossi" });

    const list = await owner.api.get(`${owner.base}/guests`);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0]).toMatchObject({ fullName: "Mario Rossi", phone: "333 123 4567" });
    expect(list.body.data[0]).not.toHaveProperty("phoneNormalized");
  });

  it("matches by email when there is no phone and fills in missing contacts later", async () => {
    const first = await book({ guestName: "Anna Verdi", guestEmail: "Anna@Example.com" });
    const second = await book({
      guestName: "Anna",
      guestEmail: "anna@example.com",
      guestPhone: "347 000 1111",
      date: NEXT_SATURDAY,
    });
    expect(second.body.data.guestId).toBe(first.body.data.guestId);
    const guest = await owner.api.get(`${owner.base}/guests/${first.body.data.guestId}`);
    expect(guest.body.data).toMatchObject({ email: "anna@example.com", phone: "347 000 1111" });
  });

  it("does not create profiles without any contact", async () => {
    const walkIn = await book({ guestName: "Walk-in", channel: "walk_in", time: "17:00" });
    expect(walkIn.body.data.guestId).toBeNull();
    expect((await owner.api.get(`${owner.base}/guests`)).body.data).toHaveLength(0);
  });

  it("links to the guest picked by staff", async () => {
    const created = await owner.api.post(`${owner.base}/guests`, { fullName: "Giulia Neri", tags: ["VIP"] });
    const res = await book({ guestName: "Giulia", guestId: created.body.data.id });
    expect(res.body.data.guest).toMatchObject({ id: created.body.data.id, tags: ["VIP"] });
  });

  it("re-links a booking when its phone changes", async () => {
    const a = await book({ guestName: "Bianchi", guestPhone: "333 111 2222" });
    const b = await book({ guestName: "Verdi", guestPhone: "333 999 8888", time: "21:00" });
    const moved = await owner.api.patch(`${owner.base}/reservations/${b.body.data.id}`, {
      guestPhone: "333 111 2222",
    });
    expect(moved.body.data.guestId).toBe(a.body.data.guestId);
  });
});

describe("guest history and statistics", () => {
  it("counts visits, covers, no-shows and upcoming bookings", async () => {
    const phone = "333 555 6666";
    const past = await book({ date: PAST_SATURDAY, partySize: 4, guestPhone: phone });
    const missed = await book({ date: PAST_SATURDAY, time: "13:00", partySize: 2, guestPhone: phone });
    await owner.api.post(`${owner.base}/reservations/${missed.body.data.id}/status`, { status: "no_show" });
    const cancelled = await book({ date: NEXT_SATURDAY, guestPhone: phone });
    await owner.api.post(`${owner.base}/reservations/${cancelled.body.data.id}/status`, {
      status: "cancelled",
    });
    await book({ date: NEXT_SATURDAY, time: "21:00", partySize: 3, guestPhone: phone });

    const res = await owner.api.get(`${owner.base}/guests/${past.body.data.guestId}`);
    expect(res.body.data.stats).toMatchObject({
      visits: 1,
      covers: 4,
      noShows: 1,
      cancellations: 1,
      upcoming: 1,
      lastVisit: PAST_SATURDAY,
      nextBooking: NEXT_SATURDAY,
    });
    expect(
      res.body.data.reservations.map((r: { date: string; time: string }) => `${r.date} ${r.time}`),
    ).toEqual([
      `${NEXT_SATURDAY} 21:00`,
      `${NEXT_SATURDAY} 20:00`,
      `${PAST_SATURDAY} 20:00`,
      `${PAST_SATURDAY} 13:00`,
    ]);
  });

  it("shows the guest summary on bookings of the day", async () => {
    const created = await owner.api.post(`${owner.base}/guests`, {
      fullName: "Luca Gallo",
      phone: "340 123 0000",
      profileNote: "Celiaco",
      tags: ["Abituale"],
    });
    await book({ date: PAST_SATURDAY, guestPhone: "3401230000" });
    await book({ guestName: "Gallo", guestPhone: "+39 340 123 0000" });
    const day = await owner.api.get(`${owner.base}/reservations?date=${SATURDAY}`);
    expect(day.body.data[0].guest).toEqual({
      id: created.body.data.id,
      fullName: "Luca Gallo",
      tags: ["Abituale"],
      profileNote: "Celiaco",
      visits: 1,
      noShows: 0,
    });
  });

  it("searches by name, phone digits and email", async () => {
    await book({ guestName: "Marta Colombo", guestPhone: "333 777 1234" });
    await book({ guestName: "Paolo Ricci", guestEmail: "paolo@example.com", time: "21:00" });
    const names = async (q: string) =>
      (await owner.api.get(`${owner.base}/guests?q=${encodeURIComponent(q)}`)).body.data.map(
        (g: { fullName: string }) => g.fullName,
      );
    expect(await names("colom")).toEqual(["Marta Colombo"]);
    expect(await names("7771234")).toEqual(["Marta Colombo"]);
    expect(await names("paolo@")).toEqual(["Paolo Ricci"]);
    expect(await names("nessuno")).toEqual([]);
  });
});

describe("guest management", () => {
  it("validates and protects phone uniqueness", async () => {
    const res = await owner.api.post(`${owner.base}/guests`, { fullName: "X", phone: "abc" });
    expect(res.status).toBe(400);
    await owner.api.post(`${owner.base}/guests`, { fullName: "A", phone: "333 000 0001" });
    const dup = await owner.api.post(`${owner.base}/guests`, { fullName: "B", phone: "+393330000001" });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe("guest_phone_taken");
  });

  it("edits notes and tags", async () => {
    const created = await owner.api.post(`${owner.base}/guests`, { fullName: "Sara Bruno" });
    const res = await owner.api.patch(`${owner.base}/guests/${created.body.data.id}`, {
      profileNote: "Preferisce il dehors",
      tags: ["VIP", "Compleanno"],
    });
    expect(res.body.data).toMatchObject({ profileNote: "Preferisce il dehors", tags: ["VIP", "Compleanno"] });
    const dupTags = await owner.api.patch(`${owner.base}/guests/${created.body.data.id}`, {
      tags: ["VIP", "vip"],
    });
    expect(dupTags.status).toBe(400);
  });

  it("erases a guest and anonymizes their bookings", async () => {
    const res = await book({
      guestName: "Elena Conti",
      guestPhone: "333 444 5555",
      guestNote: "Anniversario",
    });
    const guestId = res.body.data.guestId;
    const staff = await addMember(ctx, owner.restaurantId, "staff");
    expect((await staff.delete(`${owner.base}/guests/${guestId}`)).status).toBe(403);
    expect((await owner.api.delete(`${owner.base}/guests/${guestId}`)).status).toBe(204);
    const booking = await owner.api.get(`${owner.base}/reservations/${res.body.data.id}`);
    expect(booking.body.data).toMatchObject({
      guestId: null,
      guestName: "Cliente rimosso",
      guestPhone: null,
      guestNote: null,
      partySize: 2,
    });
  });

  it("keeps guests private to each restaurant", async () => {
    const res = await book({ guestPhone: "333 222 3333" });
    const other = await registerOwner(ctx.app);
    await other.api.post(`${other.base}/setup/apply-template`, { template: "trattoria" });
    expect((await other.api.get(`${other.base}/guests/${res.body.data.guestId}`)).status).toBe(404);
    expect((await other.api.get(`${other.base}/guests`)).body.data).toEqual([]);
    const linked = await other.api.post(`${other.base}/reservations`, {
      date: SATURDAY,
      time: "20:00",
      partySize: 2,
      guestName: "X",
      guestId: res.body.data.guestId,
    });
    expect(linked.status).toBe(404);
  });
});
