import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { client, createTestApp, registerOwner, type Client, type TestContext } from "./helpers.js";

let ctx: TestContext;
let owner: Awaited<ReturnType<typeof registerOwner>>;
let guest: Client;
let slug: string;

/** The test clock is Friday 23 October 2026, 10:00 in Rome. */
const SATURDAY = "2026-10-24";

beforeAll(async () => {
  ctx = await createTestApp();
  guest = client(ctx.app);
});
afterAll(() => ctx.close());

/* One table T1 (2-4 people). Dinner every day 19:00-21:00, 2 hours: one booking fills the evening. */
beforeEach(async () => {
  owner = await registerOwner(ctx.app, "Osteria Piena");
  const post = async (path: string, body: object) => {
    const res = await owner.api.post(`${owner.base}${path}`, body);
    if (res.status !== 201) throw new Error(`${path}: ${JSON.stringify(res.body)}`);
    return res.body.data;
  };
  const room = await post("/rooms", { name: "Sala" });
  await post("/tables", { roomId: room.id, name: "T1", minCovers: 2, maxCovers: 4 });
  await post("/services", {
    name: "Cena",
    daysOfWeek: [1, 2, 3, 4, 5, 6, 7],
    firstArrival: "19:00",
    lastArrival: "21:00",
  });
  await owner.api.patch(`${owner.base}/booking-policy`, { defaultDurationMinutes: 240 });
  slug = (await owner.api.get(`${owner.base}/booking-page`)).body.data.slug;
});

const emailsTo = (to: string) => ctx.sentEmails.filter((e) => e.to === to);
const times = async () =>
  (await guest.get(`/v1/public/restaurants/${slug}/availability?date=${SATURDAY}&partySize=2`)).body.data;

async function fillEvening() {
  const res = await owner.api.post(`${owner.base}/reservations`, {
    date: SATURDAY,
    time: "19:00",
    partySize: 2,
    guestName: "Rossi",
  });
  expect(res.status).toBe(201);
  return res.body.data.id as string;
}

const join = (body: object = {}) =>
  guest.post(`/v1/public/restaurants/${slug}/waitlist`, {
    date: SATURDAY,
    partySize: 2,
    timeFrom: "19:00",
    timeTo: "21:00",
    guestName: "Lucia Verdi",
    guestPhone: "347 111 2222",
    guestEmail: "lucia@example.com",
    note: null,
    privacyAccepted: true,
    ...body,
  });

const list = async () => (await owner.api.get(`${owner.base}/waitlist?date=${SATURDAY}`)).body.data;

describe("waiting list", () => {
  it("is offered on a full day, and guests can join it from the booking page", async () => {
    await fillEvening();
    const day = await times();
    expect(day.services[0].times).toEqual([]);
    expect(day).toMatchObject({ waitlist: true });
    expect(day.services[0]).toMatchObject({ firstTime: "19:00", lastTime: "21:00" });

    const res = await join({ locale: "en" });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ date: SATURDAY, partySize: 2, emailSent: true });
    expect(emailsTo("lucia@example.com").at(-1)!.subject).toBe(
      "You're on the waiting list · Osteria Piena · Saturday 24 October",
    );

    // Asking again updates the same request.
    expect((await join({ partySize: 3, guestEmail: "LUCIA@example.com" })).status).toBe(201);
    const entries = await list();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ partySize: 3, status: "waiting", channel: "online", locale: "en" });
    expect(JSON.stringify(entries)).not.toMatch(/phoneNormalized|restaurantId/);
  });

  it("emails the guests waiting when a booking is cancelled, and takes them off once they book", async () => {
    const id = await fillEvening();
    await join();
    await join({
      guestName: "Marco",
      guestPhone: "333 000 1111",
      guestEmail: "marco@example.com",
      timeFrom: "22:00",
      timeTo: "23:00",
    });
    const before = ctx.sentEmails.length;

    await owner.api.post(`${owner.base}/reservations/${id}/status`, { status: "cancelled" });
    const free = emailsTo("lucia@example.com").at(-1)!;
    expect(free.subject).toBe("Si è liberato un tavolo · Osteria Piena · Sabato 24 ottobre");
    expect(free.text).toContain(`/prenota/${slug}?data=${SATURDAY}&persone=2&lang=it`);
    expect(free.text).toContain("19:00");
    // Marco wanted a time that is not free: no email.
    expect(emailsTo("marco@example.com").at(-1)!.subject).toContain("lista d'attesa");
    expect(ctx.sentEmails.length).toBe(before + 1);

    let entries = await list();
    expect(entries.find((e: { guestName: string }) => e.guestName === "Lucia Verdi")).toMatchObject({
      status: "notified",
    });

    // Lucia books online with the same phone: she is off the list.
    const booked = await guest.post(`/v1/public/restaurants/${slug}/reservations`, {
      date: SATURDAY,
      time: "19:00",
      partySize: 2,
      guestName: "Lucia Verdi",
      guestPhone: "+39 347 1112222",
      guestEmail: "altra@example.com",
      guestNote: null,
      privacyAccepted: true,
    });
    expect(booked.status).toBe(201);
    entries = await list();
    expect(entries.find((e: { guestName: string }) => e.guestName === "Lucia Verdi")).toMatchObject({
      status: "booked",
      reservationId: booked.body.data.id,
    });
    expect(entries.find((e: { guestName: string }) => e.guestName === "Marco")).toMatchObject({
      status: "waiting",
    });
  });

  it("lets staff add, notify, edit and remove guests", async () => {
    await fillEvening();
    const add = await owner.api.post(`${owner.base}/waitlist`, {
      date: SATURDAY,
      partySize: 4,
      timeFrom: null,
      timeTo: null,
      guestName: "Bianchi",
      guestPhone: "333 222 1111",
      guestEmail: null,
      note: "Anche al bancone",
    });
    expect(add.status).toBe(201);
    expect(add.body.data).toMatchObject({ channel: "staff", status: "waiting", timeFrom: null });
    const entryId = add.body.data.id;

    // No email: staff call them instead.
    const notify = await owner.api.post(`${owner.base}/waitlist/${entryId}/notify`, {});
    expect(notify.status).toBe(409);
    expect(notify.body.error.code).toBe("no_email");

    const edit = await owner.api.patch(`${owner.base}/waitlist/${entryId}`, {
      guestEmail: "bianchi@example.com",
      timeFrom: "20:00",
    });
    expect(edit.body.data).toMatchObject({ guestEmail: "bianchi@example.com", timeFrom: "20:00" });
    const notified = await owner.api.post(`${owner.base}/waitlist/${entryId}/notify`, {});
    expect(notified.body.data).toMatchObject({ status: "notified", emailSent: true });
    expect(emailsTo("bianchi@example.com").at(-1)!.subject).toContain("Si è liberato un tavolo");

    const removed = await owner.api.patch(`${owner.base}/waitlist/${entryId}`, { status: "removed" });
    expect(removed.body.data.status).toBe("removed");
    expect((await owner.api.post(`${owner.base}/waitlist/${entryId}/notify`, {})).status).toBe(409);

    // A window that ends before it starts is refused; at least one contact is needed.
    const bad = await owner.api.post(`${owner.base}/waitlist`, {
      date: SATURDAY,
      partySize: 2,
      timeFrom: "21:00",
      timeTo: "20:00",
      guestName: "X",
      guestPhone: null,
      guestEmail: null,
      note: null,
    });
    expect(bad.status).toBe(400);
  });

  it("can be switched off, and is never offered to other restaurants' staff", async () => {
    await owner.api.patch(`${owner.base}/booking-policy`, { waitlistEnabled: false });
    expect((await times()).waitlist).toBe(false);
    const res = await join();
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("waitlist_disabled");

    // Honeypot.
    await owner.api.patch(`${owner.base}/booking-policy`, { waitlistEnabled: true });
    expect((await join({ website: "spam" })).status).toBe(400);

    const entry = (await join()).body.data;
    const other = await registerOwner(ctx.app, "Altro Locale");
    expect((await other.api.patch(`${other.base}/waitlist/${entry.id}`, { status: "removed" })).status).toBe(
      404,
    );
    expect((await other.api.get(`${other.base}/waitlist?date=${SATURDAY}`)).body.data).toEqual([]);
  });

  it("shows new online requests in the activity feed", async () => {
    const since = new Date(Date.now() - 1000).toISOString();
    await join();
    const activity = (await owner.api.get(`${owner.base}/reservations/activity?since=${since}`)).body.data;
    expect(activity.newWaitlist).toMatchObject([{ guestName: "Lucia Verdi", partySize: 2, date: SATURDAY }]);
    expect(activity.lastChangeAt).not.toBeNull();
  });
});
