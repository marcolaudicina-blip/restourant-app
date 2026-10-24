import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { client, createTestApp, registerOwner, type Client, type TestContext } from "./helpers.js";

let ctx: TestContext;
let owner: Awaited<ReturnType<typeof registerOwner>>;
let guest: Client;
let slug: string;
let t: Record<string, { id: string }>;

const SATURDAY = "2026-10-24";
const MONDAY = "2026-10-26";
/** A 1×1 PNG. */
const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

beforeAll(async () => {
  ctx = await createTestApp();
  guest = client(ctx.app);
});
afterAll(() => ctx.close());

/*
 * Sala: T1 (2-4, priority 10), T2 and T3 (2-4, side by side), T9 (2-4, priority 50, staff only).
 * Dinner Tue-Sun 19:00-22:00. Default rules: online on, 1-8 people, groups send a request.
 */
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
    T3: await post("/tables", { roomId: room.id, name: "T3", minCovers: 2, maxCovers: 4 }),
    T9: await post("/tables", {
      roomId: room.id,
      name: "T9",
      minCovers: 2,
      maxCovers: 4,
      priority: 50,
      onlineBookable: false,
    }),
  };
  await owner.api.put(`${owner.base}/table-adjacencies`, {
    pairs: [{ tableAId: t.T2!.id, tableBId: t.T3!.id }],
  });
  await post("/services", {
    name: "Cena",
    daysOfWeek: [2, 3, 4, 5, 6, 7],
    firstArrival: "19:00",
    lastArrival: "22:00",
  });
  slug = (await owner.api.get(`${owner.base}/booking-page`)).body.data.slug;
});

const page = () => `/v1/public/restaurants/${slug}`;
const policy = (patch: object) => owner.api.patch(`${owner.base}/booking-policy`, patch);
const book = (body: object = {}) =>
  guest.post(`${page()}/reservations`, {
    date: SATURDAY,
    time: "20:00",
    partySize: 2,
    guestName: "Lucia Verdi",
    guestPhone: "347 111 2222",
    guestEmail: "lucia@example.com",
    guestNote: "Anniversario",
    privacyAccepted: true,
    ...body,
  });

describe("public restaurant profile", () => {
  it("is readable without signing in", async () => {
    const res = await guest.get(page());
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      name: "Osteria Pubblica",
      page: { brandColor: "#1f7466", logoId: null, photoIds: [] },
      booking: { enabled: true, minParty: 1, maxParty: 8, today: "2026-10-23" },
    });
  });

  it("answers 404 for unknown restaurants", async () => {
    expect((await guest.get("/v1/public/restaurants/non-esiste")).status).toBe(404);
  });

  it("lists which days are open to online bookings", async () => {
    const days: { date: string; open: boolean }[] = (await guest.get(`${page()}/days`)).body.data;
    expect(days[0]).toEqual({ date: "2026-10-23", open: true });
    expect(days.find((d) => d.date === MONDAY)?.open).toBe(false);
    expect(days.find((d) => d.date === SATURDAY)?.open).toBe(true);
  });
});

describe("public availability", () => {
  it("offers free times without revealing tables", async () => {
    const res = await guest.get(`${page()}/availability?date=${SATURDAY}&partySize=2`);
    expect(res.status).toBe(200);
    expect(res.body.data.mode).toBe("book");
    expect(res.body.data.services[0].name).toBe("Cena");
    expect(res.body.data.services[0].times).toContain("20:00");
    expect(JSON.stringify(res.body)).not.toMatch(/table|T1/i);
  });

  it("explains why a day can't be booked", async () => {
    const past = await guest.get(`${page()}/availability?date=2026-10-20&partySize=2`);
    expect(past.body.data).toMatchObject({ mode: "closed", reason: "past", services: [] });
    await policy({ onlineEnabled: false });
    const off = await guest.get(`${page()}/availability?date=${SATURDAY}&partySize=2`);
    expect(off.body.data.reason).toBe("online_disabled");
    const days: { open: boolean }[] = (await guest.get(`${page()}/days`)).body.data;
    expect(days.every((d) => !d.open)).toBe(true);
  });

  it("drops times whose tables are all taken", async () => {
    for (const name of ["A", "B", "C", "D"]) {
      await owner.api.post(`${owner.base}/reservations`, {
        date: SATURDAY,
        time: "20:00",
        partySize: 4,
        guestName: name,
      });
    }
    // Staff bookings fill T9 first, then T1, T2 and T3: nothing is left for guests at 20:00.
    const res = await guest.get(`${page()}/availability?date=${SATURDAY}&partySize=4`);
    expect(res.body.data.services[0].times).not.toContain("20:00");
    expect(res.body.data.services[0].times).toContain("22:00");
  });
});

describe("booking from the public page", () => {
  it("creates a confirmed online booking with a guest profile", async () => {
    const res = await book();
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ status: "confirmed", time: "20:00", partySize: 2 });

    const list = await owner.api.get(`${owner.base}/reservations?date=${SATURDAY}`);
    const created = list.body.data[0];
    expect(created).toMatchObject({ channel: "online", guestName: "Lucia Verdi", guestNote: "Anniversario" });
    // Staff-only tables are never given to online guests, even with a higher priority.
    expect(created.tables.map((x: { name: string }) => x.name)).toEqual(["T1"]);
    expect(created.guest.fullName).toBe("Lucia Verdi");
  });

  it("follows the confirmation rules", async () => {
    await policy({ confirmationMode: "auto_up_to", autoConfirmMaxParty: 4 });
    expect((await book({ partySize: 4 })).body.data.status).toBe("confirmed");
    expect((await book({ partySize: 6, time: "21:00" })).body.data.status).toBe("requested");
    await policy({ confirmationMode: "manual" });
    expect((await book({ time: "19:00" })).body.data.status).toBe("requested");
  });

  it("requires consent and the contacts the restaurant asks for", async () => {
    expect((await book({ privacyAccepted: false })).status).toBe(400);
    const noPhone = await book({ guestPhone: null });
    expect(noPhone.status).toBe(400);
    expect(noPhone.body.error.message).toMatch(/telefono/);
    expect((await book({ guestPhone: "abc12" })).status).toBe(400);
    await policy({ requireEmail: false });
    expect((await book({ guestEmail: null })).status).toBe(201);
  });

  it("drops bookings that fill the hidden field", async () => {
    const res = await book({ website: "http://spam.example" });
    expect(res.status).toBe(400);
    expect((await owner.api.get(`${owner.base}/reservations?date=${SATURDAY}`)).body.data).toHaveLength(0);
  });

  it("refuses times that are no longer free", async () => {
    await policy({ maxPartyOnline: 4 });
    for (let i = 0; i < 3; i++) expect((await book({ partySize: 4 })).status).toBe(201);
    const fourth = await book({ partySize: 4 });
    expect(fourth.status).toBe(409);
    expect(fourth.body.error.code).toBe("slot_unavailable");
    expect((await book({ time: "18:00" })).body.error.code).toBe("slot_unavailable");
    expect((await book({ date: MONDAY })).status).toBe(409);
  });

  it("turns large groups into requests for staff", async () => {
    await policy({ maxPartyOnline: 4 });
    const offer = await guest.get(`${page()}/availability?date=${SATURDAY}&partySize=10`);
    expect(offer.body.data.mode).toBe("request");
    expect(offer.body.data.services[0].times).toContain("20:00");

    const res = await book({ partySize: 10 });
    expect(res.body.data.status).toBe("requested");
    const [created] = (await owner.api.get(`${owner.base}/reservations?date=${SATURDAY}`)).body.data;
    // No table fits 10 people: staff will decide.
    expect(created).toMatchObject({ channel: "online", status: "requested", tables: [] });

    await policy({ largePartyMode: "phone_only" });
    const phone = await guest.get(`${page()}/availability?date=${SATURDAY}&partySize=10`);
    expect(phone.body.data).toMatchObject({ mode: "closed", reason: "large_party_phone" });
    expect((await book({ partySize: 10 })).status).toBe(409);
  });
});

describe("party limits by arrival time", () => {
  // Saturday: from 19:00 to 20:00 online only up to 4 people (T2+T3 seat 7).
  beforeEach(async () => {
    const res = await policy({
      onlinePartyLimits: [{ daysOfWeek: [6], from: "19:00", to: "20:00", maxParty: 4 }],
    });
    expect(res.status).toBe(200);
  });
  const times = async (partySize: number, date = SATURDAY) =>
    (await guest.get(`${page()}/availability?date=${date}&partySize=${partySize}`)).body.data.services[0]
      .times as string[];

  it("offers bigger parties only outside the limited hours", async () => {
    const seven = await times(7);
    expect(seven).not.toContain("19:00");
    expect(seven).not.toContain("20:00");
    expect(seven).toContain("20:15");
    expect(await times(4)).toContain("19:30");
    // Other days are not limited.
    expect(await times(7, "2026-10-25")).toContain("19:30");
  });

  it("refuses such bookings online, but staff can still take them", async () => {
    const res = await book({ time: "19:30", partySize: 7 });
    expect(res.status).toBe(409);
    const staff = await owner.api.get(
      `${owner.base}/availability?date=${SATURDAY}&partySize=7&channel=staff`,
    );
    expect(
      staff.body.data.services[0].slots.find((s: { time: string }) => s.time === "19:30").available,
    ).toBe(true);
    const online = await owner.api.get(
      `${owner.base}/availability?date=${SATURDAY}&partySize=7&channel=online`,
    );
    expect(online.body.data.services[0].slots.find((s: { time: string }) => s.time === "19:30").reason).toBe(
      "party_size_limit",
    );
  });

  it("validates the hours", async () => {
    const res = await policy({
      onlinePartyLimits: [{ daysOfWeek: [6], from: "21:00", to: "20:00", maxParty: 4 }],
    });
    expect(res.status).toBe(400);
  });
});

describe("booking page settings", () => {
  it("saves the look and the link", async () => {
    const res = await owner.api.patch(`${owner.base}/booking-page`, {
      brandColor: "#B03A2E",
      description: "Cucina di mare dal 1980",
      slug: "osteria-del-porto",
    });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ brandColor: "#b03a2e", slug: "osteria-del-porto" });

    expect((await guest.get(page())).status).toBe(404);
    const profile = await guest.get("/v1/public/restaurants/osteria-del-porto");
    expect(profile.body.data.page).toMatchObject({
      brandColor: "#b03a2e",
      description: "Cucina di mare dal 1980",
    });
  });

  it("validates the link address", async () => {
    const other = await registerOwner(ctx.app, "Altro Locale");
    await other.api.patch(`${other.base}/booking-page`, { slug: "nome-occupato" });
    const taken = await owner.api.patch(`${owner.base}/booking-page`, { slug: "nome-occupato" });
    expect(taken.status).toBe(409);
    expect(taken.body.error.code).toBe("slug_taken");
    expect((await owner.api.patch(`${owner.base}/booking-page`, { slug: "Con Spazi!" })).status).toBe(400);
  });

  it("stores pictures and serves them publicly", async () => {
    const upload = await owner.api.post(`${owner.base}/media`, { dataUrl: PNG });
    expect(upload.status).toBe(201);
    const logoId = upload.body.data.id;
    await owner.api.patch(`${owner.base}/booking-page`, { logoId });

    const image = await ctx.app.inject({ method: "GET", url: `/v1/public/media/${logoId}` });
    expect(image.statusCode).toBe(200);
    expect(image.headers["content-type"]).toBe("image/png");
    expect(image.headers["cache-control"]).toContain("immutable");
    expect(image.rawPayload.subarray(1, 4).toString()).toBe("PNG");

    // Replacing the logo deletes the old picture.
    const next = (await owner.api.post(`${owner.base}/media`, { dataUrl: PNG })).body.data.id;
    await owner.api.patch(`${owner.base}/booking-page`, { logoId: next });
    expect((await guest.get(`/v1/public/media/${logoId}`)).status).toBe(404);
    expect((await guest.get(page())).body.data.page.logoId).toBe(next);
  });

  it("rejects files that are not pictures and pictures of other restaurants", async () => {
    const fake = `data:image/png;base64,${Buffer.from("<script>alert(1)</script>").toString("base64")}`;
    expect((await owner.api.post(`${owner.base}/media`, { dataUrl: fake })).status).toBe(400);
    expect(
      (await owner.api.post(`${owner.base}/media`, { dataUrl: "data:text/html;base64,AAAA" })).status,
    ).toBe(400);

    const other = await registerOwner(ctx.app, "Altro Locale");
    const theirs = (await other.api.post(`${other.base}/media`, { dataUrl: PNG })).body.data.id;
    const res = await owner.api.patch(`${owner.base}/booking-page`, { coverId: theirs });
    expect(res.status).toBe(400);
  });

  it("is only editable by managers and owners", async () => {
    expect((await guest.patch(`${owner.base}/booking-page`, { brandColor: "#000000" })).status).toBe(401);
  });
});

describe("online capacity of a table", () => {
  it("offers a table online only up to its online maximum", async () => {
    // T1 (2-4) takes at most 2 people online; staff can still seat 4 there.
    const res = await owner.api.patch(`${owner.base}/tables/${t.T1!.id}`, { onlineMaxCovers: 2 });
    expect(res.status).toBe(200);
    expect(res.body.data.onlineMaxCovers).toBe(2);

    const four = await book({ partySize: 4 });
    expect(four.status).toBe(201);
    const [online] = (await owner.api.get(`${owner.base}/reservations?date=${SATURDAY}`)).body.data;
    expect(online.tables.map((x: { name: string }) => x.name)).not.toContain("T1");

    expect((await book({ partySize: 2, time: "21:00" })).status).toBe(201);
    const list = (await owner.api.get(`${owner.base}/reservations?date=${SATURDAY}`)).body.data;
    const two = list.find((r: { time: string }) => r.time === "21:00");
    expect(two.tables.map((x: { name: string }) => x.name)).toEqual(["T1"]);
  });

  it("must stay within the table's range", async () => {
    const res = await owner.api.patch(`${owner.base}/tables/${t.T1!.id}`, { onlineMaxCovers: 6 });
    expect(res.status).toBe(400);
    expect(res.body.error.issues[0].path).toBe("onlineMaxCovers");
    // Lowering the table below its online maximum is refused too.
    await owner.api.patch(`${owner.base}/tables/${t.T1!.id}`, { onlineMaxCovers: 3 });
    expect((await owner.api.patch(`${owner.base}/tables/${t.T1!.id}`, { maxCovers: 2 })).status).toBe(400);
    expect(
      (await owner.api.patch(`${owner.base}/tables/${t.T1!.id}`, { onlineMaxCovers: null })).status,
    ).toBe(200);
  });
});

describe("confirmation notice and emails", () => {
  const NOTE = "Il tavolo è garantito per 15 minuti.\nIn caso di ritardo chiamaci <sempre>.";
  const lastEmail = () => ctx.sentEmails.at(-1)!;

  beforeEach(async () => {
    await owner.api.patch(`${owner.base}`, { email: "info@osteria.example", phone: "+39 091 000 1111" });
    await owner.api.patch(`${owner.base}/booking-page`, { confirmationNote: NOTE, brandColor: "#7a1f2b" });
  });

  it("shows the notice on the public page", async () => {
    expect((await guest.get(page())).body.data.page.confirmationNote).toBe(NOTE);
  });

  it("emails the guest a confirmation with the notice", async () => {
    const before = ctx.sentEmails.length;
    const res = await book();
    expect(res.body.data).toMatchObject({ emailSent: true, guestEmail: "lucia@example.com" });
    expect(ctx.sentEmails).toHaveLength(before + 1);
    const email = lastEmail();
    expect(email).toMatchObject({
      to: "lucia@example.com",
      fromName: "Osteria Pubblica",
      replyTo: "info@osteria.example",
    });
    expect(email.subject).toBe("Prenotazione confermata · Osteria Pubblica · Sabato 24 ottobre ore 20:00");
    expect(email.text).toContain("Il tavolo è garantito per 15 minuti.");
    expect(email.text).toContain("Le tue richieste: Anniversario");
    // The restaurant's words are escaped and keep their line breaks.
    expect(email.html).toContain("15 minuti.<br>In caso di ritardo chiamaci &lt;sempre&gt;.");
    expect(email.html).toContain("background:#7a1f2b");
    // The guest can manage the booking from their own link.
    expect(email.html).toMatch(/https:\/\/app\.test\/prenotazione\/[0-9a-f-]{36}\.[\w-]{22}/);
    expect(email.text).toContain("Puoi modificare o disdire la prenotazione online fino a 2 ore prima");

    // The outcome is kept in the restaurant's audit log.
    const log = (await owner.api.get(`${owner.base}/audit-log?limit=5`)).body.data;
    expect(log.find((e: { entity: string }) => e.entity === "email")?.changes).toMatchObject({
      kind: "confirmed",
      to: "lucia@example.com",
      status: "sent",
    });
  });

  it("tells requests apart and confirms them when staff accept", async () => {
    await policy({ confirmationMode: "manual" });
    const res = await book();
    expect(res.body.data.status).toBe("requested");
    expect(lastEmail().subject).toBe("Richiesta di prenotazione ricevuta · Osteria Pubblica");

    const before = ctx.sentEmails.length;
    await owner.api.post(`${owner.base}/reservations/${res.body.data.id}/status`, { status: "confirmed" });
    expect(ctx.sentEmails).toHaveLength(before + 1);
    expect(lastEmail().subject).toMatch(/^Prenotazione confermata/);

    // Other status changes don't email.
    await owner.api.post(`${owner.base}/reservations/${res.body.data.id}/status`, { status: "arrived" });
    expect(ctx.sentEmails).toHaveLength(before + 1);
  });

  it("emails nobody without an address", async () => {
    await policy({ requireEmail: false });
    const before = ctx.sentEmails.length;
    expect((await book({ guestEmail: null })).status).toBe(201);
    expect(ctx.sentEmails).toHaveLength(before);
  });
});

describe("activity for the staff devices", () => {
  const activity = (since?: string) =>
    owner.api.get(`${owner.base}/reservations/activity${since ? `?since=${encodeURIComponent(since)}` : ""}`);

  it("reports new online bookings, requests to confirm and when anything changed", async () => {
    const first = (await activity()).body.data;
    expect(first).toMatchObject({ lastChangeAt: null, newOnline: [], pendingRequests: [] });

    await policy({ confirmationMode: "manual" });
    const booked = await book();
    const next = (await activity(first.serverTime)).body.data;
    expect(next.newOnline).toMatchObject([
      { id: booked.body.data.id, guestName: "Lucia Verdi", partySize: 2, date: SATURDAY, time: "20:00" },
    ]);
    expect(next.pendingRequests.map((r: { id: string }) => r.id)).toEqual([booked.body.data.id]);
    expect(next.lastChangeAt).not.toBeNull();

    // Already seen: not reported again.
    const again = (await activity(next.serverTime)).body.data;
    expect(again.newOnline).toEqual([]);

    // Moving the booking to another table counts as a change for the other devices.
    await new Promise((r) => setTimeout(r, 5));
    await owner.api.put(`${owner.base}/reservations/${booked.body.data.id}/tables`, { tableIds: [t.T3!.id] });
    const moved = (await activity(again.serverTime)).body.data;
    expect(new Date(moved.lastChangeAt).getTime()).toBeGreaterThan(new Date(next.lastChangeAt).getTime());

    // Confirmed requests leave the list.
    await owner.api.post(`${owner.base}/reservations/${booked.body.data.id}/status`, { status: "confirmed" });
    expect((await activity()).body.data.pendingRequests).toEqual([]);
  });
});
