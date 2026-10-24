import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { client, clock, createTestApp, registerOwner, type Client, type TestContext } from "./helpers.js";

let ctx: TestContext;
let owner: Awaited<ReturnType<typeof registerOwner>>;
let guest: Client;
let slug: string;
let t: Record<string, { id: string }>;

/** The test clock is Friday 23 October 2026, 10:00 in Rome. */
const SATURDAY = "2026-10-24";
const SUNDAY = "2026-10-25";
const FRIDAY_10 = new Date("2026-10-23T08:00:00Z");

beforeAll(async () => {
  ctx = await createTestApp();
  guest = client(ctx.app);
});
afterAll(() => ctx.close());
afterEach(() => {
  clock.now = FRIDAY_10;
});

/* Sala: T1, T2 (2-4 people). Dinner every day 19:00-22:00. */
beforeEach(async () => {
  owner = await registerOwner(ctx.app, "Osteria Pubblica");
  const post = async (path: string, body: object) => {
    const res = await owner.api.post(`${owner.base}${path}`, body);
    if (res.status !== 201) throw new Error(`${path}: ${JSON.stringify(res.body)}`);
    return res.body.data;
  };
  const room = await post("/rooms", { name: "Sala" });
  t = {
    T1: await post("/tables", { roomId: room.id, name: "T1", minCovers: 2, maxCovers: 4, priority: 10 }),
    T2: await post("/tables", { roomId: room.id, name: "T2", minCovers: 2, maxCovers: 4 }),
  };
  await post("/services", {
    name: "Cena",
    daysOfWeek: [1, 2, 3, 4, 5, 6, 7],
    firstArrival: "19:00",
    lastArrival: "22:00",
  });
  slug = (await owner.api.get(`${owner.base}/booking-page`)).body.data.slug;
});

const policy = (patch: object) => owner.api.patch(`${owner.base}/booking-policy`, patch);
const emailsTo = (to: string) => ctx.sentEmails.filter((e) => e.to === to);

/** Books online and returns the booking id and the token from the guest's email link. */
async function bookOnline(email = "lucia@example.com", body: object = {}) {
  const res = await guest.post(`/v1/public/restaurants/${slug}/reservations`, {
    date: SATURDAY,
    time: "20:00",
    partySize: 2,
    guestName: "Lucia Verdi",
    guestPhone: "347 111 2222",
    guestEmail: email,
    guestNote: null,
    privacyAccepted: true,
    ...body,
  });
  if (res.status !== 201) throw new Error(JSON.stringify(res.body));
  const token = /\/prenotazione\/([\w.-]+)/.exec(emailsTo(email).at(-1)!.text)?.[1];
  return { id: res.body.data.id as string, token: token! };
}

const view = (token: string) => guest.get(`/v1/public/bookings/${token}`);

describe("the guest's own booking page", () => {
  it("opens from the link in the email, and only with an untouched link", async () => {
    const { token } = await bookOnline();
    const res = await view(token);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      restaurant: { name: "Osteria Pubblica", slug },
      booking: { date: SATURDAY, time: "20:00", partySize: 2, guestName: "Lucia Verdi", status: "confirmed" },
      canCancel: true,
      canModify: true,
      message: null,
    });
    // Two hours before arrival, by default.
    expect(res.body.data.deadline).toBe("2026-10-24T16:00:00.000Z");
    // No tables, no internal notes.
    expect(JSON.stringify(res.body.data)).not.toMatch(/tableIds|internalNote|"T1"/);

    const [id, signature] = token.split(".");
    expect((await view(`${id}.${"A".repeat(signature!.length)}`)).status).toBe(404);
    expect((await view(`00000000-0000-4000-8000-000000000000.${signature}`)).status).toBe(404);
  });

  it("lets the guest move the booking, counting their own table as free", async () => {
    // Both tables taken at 20:00: only the guest's own table makes 20:30 possible.
    const { id, token } = await bookOnline();
    await owner.api.post(`${owner.base}/reservations`, {
      date: SATURDAY,
      time: "20:00",
      partySize: 2,
      guestName: "Rossi",
      tableIds: [t.T2!.id],
    });
    const times = await guest.get(`/v1/public/bookings/${token}/availability?date=${SATURDAY}&partySize=3`);
    expect(times.body.data.services[0].times).toContain("20:30");

    const res = await guest.post(`/v1/public/bookings/${token}/change`, {
      date: SATURDAY,
      time: "20:30",
      partySize: 3,
    });
    expect(res.status).toBe(200);
    expect(res.body.data.booking).toMatchObject({ time: "20:30", partySize: 3, status: "confirmed" });

    const stored = (await owner.api.get(`${owner.base}/reservations/${id}`)).body.data;
    expect(stored).toMatchObject({ time: "20:30", partySize: 3, tableIds: [t.T1!.id] });
    expect(emailsTo("lucia@example.com").at(-1)!.subject).toBe(
      "Prenotazione modificata · Osteria Pubblica · Sabato 24 ottobre ore 20:30",
    );

    // Times that are not free are refused.
    const taken = await guest.post(`/v1/public/bookings/${token}/change`, {
      date: SATURDAY,
      time: "23:30",
      partySize: 3,
    });
    expect(taken.status).toBe(409);
  });

  it("lets the guest cancel, frees the table and tells the staff", async () => {
    const before = (await owner.api.get(`${owner.base}/reservations/activity`)).body.data.serverTime;
    const { id, token } = await bookOnline();
    const res = await guest.post(`/v1/public/bookings/${token}/cancel`);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      booking: { status: "cancelled" },
      canCancel: false,
      canModify: false,
      message: "Questa prenotazione è stata cancellata",
    });
    expect(emailsTo("lucia@example.com").at(-1)!.subject).toBe(
      "Prenotazione cancellata · Osteria Pubblica · Sabato 24 ottobre ore 20:00",
    );
    expect(emailsTo("lucia@example.com").at(-1)!.text).not.toContain("/prenotazione/");

    const activity = (
      await owner.api.get(`${owner.base}/reservations/activity?since=${encodeURIComponent(before)}`)
    ).body.data;
    expect(activity.guestChanges).toMatchObject([{ id, guestName: "Lucia Verdi", kind: "cancelled" }]);

    expect((await guest.post(`/v1/public/bookings/${token}/cancel`)).status).toBe(409);
  });

  it("follows the restaurant's rules on what guests may do and until when", async () => {
    const { token } = await bookOnline();
    // Saturday 20:00 is 34 hours away.
    await policy({ cancellationNoticeHours: 48 });
    expect((await view(token)).body.data).toMatchObject({
      canCancel: false,
      canModify: false,
      message: "Non è più possibile modificarla online: contatta il ristorante",
    });
    expect((await guest.post(`/v1/public/bookings/${token}/cancel`)).status).toBe(409);

    await policy({ cancellationNoticeHours: 2, guestCanModify: false });
    expect((await view(token)).body.data).toMatchObject({ canCancel: true, canModify: false });
    expect(
      (await guest.post(`/v1/public/bookings/${token}/change`, { date: SUNDAY, time: "20:00", partySize: 2 }))
        .status,
    ).toBe(409);

    await policy({ guestCanCancel: false });
    expect((await view(token)).body.data.message).toBe("Per modificare o disdire contatta il ristorante");
  });
});

describe("guests booking in English", () => {
  it("get their emails and their booking page in English", async () => {
    const { token } = await bookOnline("tourist@example.com", { locale: "en", guestName: "John Smith" });
    const confirmation = emailsTo("tourist@example.com").at(-1)!;
    expect(confirmation.subject).toBe("Booking confirmed · Osteria Pubblica · Saturday 24 October at 20:00");
    expect(confirmation.text).toContain("Hi John, we look forward to seeing you!");
    expect(confirmation.text).toContain(
      "You can change or cancel your booking online up to 2 hours before arrival.",
    );
    expect(confirmation.html).toContain('<html lang="en">');
    expect((await view(token)).body.data.booking.locale).toBe("en");

    await guest.post(`/v1/public/bookings/${token}/cancel`);
    expect(emailsTo("tourist@example.com").at(-1)!.subject).toBe(
      "Booking cancelled · Osteria Pubblica · Saturday 24 October at 20:00",
    );
    expect((await view(token)).body.data).toMatchObject({ reason: "cancelled" });
  });

  it("switch language when they change the booking from the English page", async () => {
    const { token } = await bookOnline("switch@example.com");
    await guest.post(`/v1/public/bookings/${token}/change`, {
      date: SATURDAY,
      time: "21:00",
      partySize: 2,
      locale: "en",
    });
    expect(emailsTo("switch@example.com").at(-1)!.subject).toMatch(/^Booking changed/);
  });
});

describe("emails for bookings handled by staff", () => {
  const create = (body: object = {}) =>
    owner.api.post(`${owner.base}/reservations`, {
      date: SATURDAY,
      time: "20:00",
      partySize: 2,
      guestName: "Marco Bianchi",
      guestEmail: "marco@example.com",
      ...body,
    });

  it("confirms, updates and cancels by email", async () => {
    const created = await create();
    expect(emailsTo("marco@example.com").at(-1)!.subject).toMatch(/^Prenotazione confermata/);
    expect(emailsTo("marco@example.com").at(-1)!.text).toContain("/prenotazione/");
    const id = created.body.data.id;

    // Notes and tables don't bother the guest; day, time and people do.
    const count = emailsTo("marco@example.com").length;
    await owner.api.patch(`${owner.base}/reservations/${id}`, { internalNote: "Tavolo tranquillo" });
    expect(emailsTo("marco@example.com")).toHaveLength(count);
    await owner.api.patch(`${owner.base}/reservations/${id}`, { time: "21:00" });
    expect(emailsTo("marco@example.com").at(-1)!.subject).toMatch(/^Prenotazione modificata .* ore 21:00$/);

    await owner.api.post(`${owner.base}/reservations/${id}/status`, { status: "cancelled" });
    expect(emailsTo("marco@example.com").at(-1)!.subject).toMatch(/^Prenotazione cancellata/);
    expect(emailsTo("marco@example.com")).toHaveLength(count + 2);
  });

  it("stays quiet when the restaurant turns it off, and for walk-ins", async () => {
    await policy({ emailStaffBookings: false });
    const created = await create({ guestEmail: "quiet@example.com" });
    await owner.api.post(`${owner.base}/reservations/${created.body.data.id}/status`, {
      status: "cancelled",
    });
    expect(emailsTo("quiet@example.com")).toHaveLength(0);

    await policy({ emailStaffBookings: true });
    await create({ guestEmail: "walkin@example.com", channel: "walk_in", time: "19:00" });
    expect(emailsTo("walkin@example.com")).toHaveLength(0);
  });
});

describe("day-before reminders", () => {
  const run = (secret?: string) => (secret ? client(ctx.app, secret) : guest).post("/v1/internal/reminders");

  it("emails tomorrow's confirmed guests once", async () => {
    await bookOnline("remind-me@example.com");
    await bookOnline("not-tomorrow@example.com", { date: SUNDAY });
    const { token } = await bookOnline("cancelled@example.com", { time: "21:00" });
    await guest.post(`/v1/public/bookings/${token}/cancel`);

    expect((await run()).status).toBe(401);
    expect((await run("wrong-secret-wrong-secret")).status).toBe(401);

    const first = await run("test-cron-secret-0123456789");
    expect(first.status).toBe(200);
    expect(first.body.data.sent).toBeGreaterThanOrEqual(1);
    const reminder = emailsTo("remind-me@example.com").at(-1)!;
    expect(reminder.subject).toBe("Promemoria: Osteria Pubblica, domani alle 20:00");
    expect(reminder.text).toContain("/prenotazione/");
    expect(emailsTo("not-tomorrow@example.com").at(-1)!.subject).not.toMatch(/Promemoria/);
    expect(emailsTo("cancelled@example.com").at(-1)!.subject).not.toMatch(/Promemoria/);

    // Running again sends nothing new.
    const second = await run("test-cron-secret-0123456789");
    expect(second.body.data.sent).toBe(0);
    expect(emailsTo("remind-me@example.com").filter((e) => /Promemoria/.test(e.subject))).toHaveLength(1);
  });

  it("skips restaurants that turned reminders off", async () => {
    await policy({ sendReminders: false });
    await bookOnline("no-reminder@example.com");
    await run("test-cron-secret-0123456789");
    expect(emailsTo("no-reminder@example.com").filter((e) => /Promemoria/.test(e.subject))).toHaveLength(0);
  });
});
