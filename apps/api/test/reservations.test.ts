import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { addMember, createTestApp, registerOwner, type TestContext } from "./helpers.js";

let ctx: TestContext;
let owner: Awaited<ReturnType<typeof registerOwner>>;
let room: { id: string };
let terrace: { id: string };
let t: Record<string, { id: string }>;
let dinner: { id: string };

const SATURDAY = "2026-10-24";

beforeAll(async () => {
  ctx = await createTestApp();
});
afterAll(() => ctx.close());

/*
 * Sala: T1 (2-4, priority 10), T2 (2-4, priority 5), T3 (2-4, priority 0), T2 and T3 side by side.
 * Terrazza: D1 (2-4). Dinner Tue-Sun 19:00-22:00, two hours per table.
 */
beforeEach(async () => {
  owner = await registerOwner(ctx.app);
  const post = async (path: string, body: object) => {
    const res = await owner.api.post(`${owner.base}${path}`, body);
    if (res.status !== 201) throw new Error(`${path}: ${JSON.stringify(res.body)}`);
    return res.body.data;
  };
  room = await post("/rooms", { name: "Sala" });
  terrace = await post("/rooms", { name: "Terrazza", sortOrder: 1 });
  t = {
    T1: await post("/tables", { roomId: room.id, name: "T1", minCovers: 2, maxCovers: 4, priority: 10 }),
    T2: await post("/tables", { roomId: room.id, name: "T2", minCovers: 2, maxCovers: 4, priority: 5 }),
    T3: await post("/tables", { roomId: room.id, name: "T3", minCovers: 2, maxCovers: 4 }),
    D1: await post("/tables", { roomId: terrace.id, name: "D1", minCovers: 2, maxCovers: 4 }),
  };
  await owner.api.put(`${owner.base}/table-adjacencies`, {
    pairs: [{ tableAId: t.T2!.id, tableBId: t.T3!.id }],
  });
  dinner = await post("/services", {
    name: "Cena",
    daysOfWeek: [2, 3, 4, 5, 6, 7],
    firstArrival: "19:00",
    lastArrival: "22:00",
  });
});

const book = (body: object = {}) =>
  owner.api.post(`${owner.base}/reservations`, {
    date: SATURDAY,
    time: "20:00",
    partySize: 4,
    guestName: "Rossi",
    guestPhone: "+39 333 1234567",
    ...body,
  });

const tablesOf = (res: { body: { data: { tables: { name: string }[] } } }) =>
  res.body.data.tables.map((x) => x.name).join("+");

describe("automatic table assignment", () => {
  it("fills tables in priority order", async () => {
    const first = await book();
    expect(first.status).toBe(201);
    expect(first.body.data).toMatchObject({
      status: "confirmed",
      channel: "staff",
      serviceId: dinner.id,
      time: "20:00",
      durationMinutes: 120,
    });
    expect(tablesOf(first)).toBe("T1");
    expect(tablesOf(await book())).toBe("T2");
    expect(tablesOf(await book())).toBe("T3");
    expect(tablesOf(await book())).toBe("D1");

    const full = await book();
    expect(full.status).toBe(409);
    expect(full.body.error.code).toBe("no_table_available");
  });

  it("follows priority changes immediately", async () => {
    await owner.api.patch(`${owner.base}/tables/${t.D1!.id}`, { priority: 50 });
    expect(tablesOf(await book())).toBe("D1");
  });

  it("reuses a table once the previous stay is over", async () => {
    expect(tablesOf(await book({ time: "19:00" }))).toBe("T1");
    expect(tablesOf(await book({ time: "21:00" }))).toBe("T1");
    expect(tablesOf(await book({ time: "20:00" }))).toBe("T2");
  });

  it("joins adjacent tables for a party no single table can seat", async () => {
    const res = await book({ partySize: 6 });
    expect(res.status).toBe(201);
    expect(tablesOf(res)).toBe("T2+T3");
  });

  it("prefers a predefined combination over joining tables", async () => {
    await owner.api.post(`${owner.base}/combinations`, {
      name: "Tavolata",
      tableIds: [t.T1!.id, t.T2!.id],
      minCovers: 5,
      maxCovers: 8,
      priority: 1,
    });
    expect(tablesOf(await book({ partySize: 6 }))).toBe("T1+T2");
    // T2 is now part of the combination, so the T2+T3 join is not possible at the same time.
    const next = await book({ partySize: 6, time: "20:30" });
    expect(next.body.error.code).toBe("no_table_available");
  });

  it("can be restricted to a room", async () => {
    expect(tablesOf(await book({ roomId: terrace.id }))).toBe("D1");
  });

  it("reports when no table can seat the party at all", async () => {
    const res = await book({ partySize: 20 });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("no_suitable_table");
  });
});

describe("tables chosen by staff", () => {
  it("accepts a free table and refuses an occupied one", async () => {
    expect(tablesOf(await book({ tableIds: [t.T3!.id] }))).toBe("T3");
    const clash = await book({ tableIds: [t.T3!.id], time: "21:00" });
    expect(clash.status).toBe(409);
    expect(clash.body.error).toMatchObject({ code: "table_taken", message: expect.stringContaining("T3") });
  });

  it("checks capacity unless forced", async () => {
    const tooSmall = await book({ partySize: 6, tableIds: [t.T1!.id] });
    expect(tooSmall.body.error.code).toBe("capacity_mismatch");
    const forced = await book({ partySize: 6, tableIds: [t.T1!.id], ignoreCapacity: true });
    expect(forced.status).toBe(201);
  });

  it("refuses blocked tables", async () => {
    await owner.api.post(`${owner.base}/table-blocks`, {
      tableId: t.T1!.id,
      startsAt: "2026-10-24T19:00:00+02:00",
      endsAt: "2026-10-24T23:00:00+02:00",
      reason: "Compleanno",
    });
    expect((await book({ tableIds: [t.T1!.id] })).body.error.code).toBe("table_blocked");
    expect(tablesOf(await book())).toBe("T2");
  });
});

describe("moving and joining tables", () => {
  it("moves a reservation to another table", async () => {
    const res = await book();
    const moved = await owner.api.put(`${owner.base}/reservations/${res.body.data.id}/tables`, {
      tableIds: [t.D1!.id],
    });
    expect(tablesOf(moved)).toBe("D1");
    // T1 is free again.
    expect(tablesOf(await book())).toBe("T1");
  });

  it("joins a second table to a reservation", async () => {
    const res = await book();
    const joined = await owner.api.put(`${owner.base}/reservations/${res.body.data.id}/tables`, {
      tableIds: [t.T1!.id, t.T2!.id],
    });
    expect(tablesOf(joined)).toBe("T1+T2");
    expect(tablesOf(await book())).toBe("T3");
  });

  it("refuses to move onto an occupied table", async () => {
    const a = await book();
    await book();
    const res = await owner.api.put(`${owner.base}/reservations/${a.body.data.id}/tables`, {
      tableIds: [t.T2!.id],
    });
    expect(res.status).toBe(409);
  });
});

describe("editing", () => {
  it("keeps the tables when moving the time if they are still free", async () => {
    const res = await book();
    const later = await owner.api.patch(`${owner.base}/reservations/${res.body.data.id}`, { time: "20:30" });
    expect(later.body.data).toMatchObject({ time: "20:30" });
    expect(tablesOf(later)).toBe("T1");
  });

  it("moves to free tables when the current ones are taken at the new time", async () => {
    const early = await book({ time: "19:00", tableIds: [t.T3!.id] });
    await book({ time: "21:00" }); // T1
    const clash = await owner.api.patch(`${owner.base}/reservations/${early.body.data.id}`, {
      time: "20:00",
      reassignTables: false,
    });
    expect(clash.status).toBe(200); // T3 is still free at 20:00
    const res = await book({ time: "22:00", tableIds: [t.T3!.id] });
    expect(res.status).toBe(201);
    // Exactly these tables, or nothing.
    const blocked = await owner.api.patch(`${owner.base}/reservations/${early.body.data.id}`, {
      time: "21:00",
      reassignTables: false,
    });
    expect(blocked.body.error.code).toBe("table_taken");
    // By default the booking moves to a free table on its own.
    const moved = await owner.api.patch(`${owner.base}/reservations/${early.body.data.id}`, {
      time: "21:00",
    });
    expect(tablesOf(moved)).toBe("T2");
  });

  it("accepts a change that keeps the same time (nothing else to write)", async () => {
    const res = await book();
    const same = await owner.api.patch(`${owner.base}/reservations/${res.body.data.id}`, {
      time: res.body.data.time,
    });
    expect(same.status).toBe(200);
  });

  it("leaves tables of a room the new service doesn't use", async () => {
    // Lunch only in the Sala.
    await owner.api.post(`${owner.base}/services`, {
      name: "Pranzo",
      daysOfWeek: [2, 3, 4, 5, 6, 7],
      firstArrival: "12:00",
      lastArrival: "14:00",
      roomIds: [room.id],
    });
    const res = await book({ time: "20:00", tableIds: [t.D1!.id] });
    const lunch = await owner.api.patch(`${owner.base}/reservations/${res.body.data.id}`, { time: "13:00" });
    expect(lunch.status).toBe(200);
    expect(["T1", "T2", "T3"]).toContain(tablesOf(lunch));
  });

  it("lets staff use a table closed only to online bookings, but not reinstate on a blocked one", async () => {
    // Online-only block: staff can still seat people there.
    await owner.api.post(`${owner.base}/table-blocks`, {
      tableId: t.T2!.id,
      startsAt: "2026-10-24T17:00:00Z",
      endsAt: "2026-10-24T21:00:00Z",
      onlineOnly: true,
    });
    const onT2 = await book({ time: "20:00", tableIds: [t.T2!.id] });
    expect(onT2.status).toBe(201);

    // A cancelled booking can't come back on a table blocked since.
    const res = await book({ time: "20:00", tableIds: [t.T3!.id] });
    await owner.api.post(`${owner.base}/reservations/${res.body.data.id}/status`, { status: "cancelled" });
    await owner.api.post(`${owner.base}/table-blocks`, {
      tableId: t.T3!.id,
      startsAt: "2026-10-24T17:00:00Z",
      endsAt: "2026-10-24T21:00:00Z",
    });
    const back = await owner.api.post(`${owner.base}/reservations/${res.body.data.id}/status`, {
      status: "confirmed",
    });
    expect(back.status).toBe(409);
    expect(back.body.error.code).toBe("table_blocked");
  });

  it("moves to a free table when the current one is blocked at the new time", async () => {
    const res = await book({ time: "19:00", tableIds: [t.T3!.id] });
    await owner.api.post(`${owner.base}/table-blocks`, {
      tableId: t.T3!.id,
      startsAt: "2026-10-24T19:00:00Z",
      endsAt: "2026-10-24T21:00:00Z",
    });
    const moved = await owner.api.patch(`${owner.base}/reservations/${res.body.data.id}`, { time: "21:00" });
    expect(moved.status).toBe(200);
    expect(tablesOf(moved)).not.toBe("T3");
  });

  it("follows the party size: bigger tables when more people come, joined ones freed when fewer", async () => {
    const res = await book({ partySize: 2 });
    expect(tablesOf(res)).toBe("T1");
    const grown = await owner.api.patch(`${owner.base}/reservations/${res.body.data.id}`, { partySize: 6 });
    expect(grown.status).toBe(200);
    expect(tablesOf(grown)).toBe("T2+T3");
    const smaller = await owner.api.patch(`${owner.base}/reservations/${res.body.data.id}`, { partySize: 3 });
    expect(tablesOf(smaller).split("+")).toHaveLength(1);
    expect(["T2", "T3"]).toContain(tablesOf(smaller));
    // Same people at another time: the table stays.
    const later = await owner.api.patch(`${owner.base}/reservations/${res.body.data.id}`, { time: "21:30" });
    expect(tablesOf(later)).toBe(tablesOf(smaller));
  });

  it("recomputes the duration when the party grows", async () => {
    await owner.api.post(`${owner.base}/duration-rules`, { minParty: 5, maxParty: 8, durationMinutes: 150 });
    const res = await book({ partySize: 2 });
    const grown = await owner.api.patch(`${owner.base}/reservations/${res.body.data.id}`, {
      partySize: 6,
      reassignTables: true,
    });
    expect(grown.body.data).toMatchObject({ partySize: 6, durationMinutes: 150 });
    expect(tablesOf(grown)).toBe("T2+T3");
  });

  it("updates guest details without touching the tables", async () => {
    const res = await book();
    const edited = await owner.api.patch(`${owner.base}/reservations/${res.body.data.id}`, {
      guestNote: "Celiaco",
      internalNote: "Cliente abituale",
    });
    expect(edited.body.data).toMatchObject({ guestNote: "Celiaco", internalNote: "Cliente abituale" });
    expect(tablesOf(edited)).toBe("T1");
  });
});

describe("status flow", () => {
  it("frees the table when the guests leave", async () => {
    const res = await book();
    const id = res.body.data.id;
    const seated = await owner.api.post(`${owner.base}/reservations/${id}/status`, { status: "seated" });
    expect(seated.body.data.seatedAt).not.toBeNull();
    await owner.api.post(`${owner.base}/reservations/${id}/status`, { status: "completed" });
    expect(tablesOf(await book())).toBe("T1");
  });

  it("frees the table on cancellation and refuses to reinstate over a new booking", async () => {
    const res = await book({ tableIds: [t.T1!.id] });
    const id = res.body.data.id;
    await owner.api.post(`${owner.base}/reservations/${id}/status`, { status: "cancelled" });
    expect(tablesOf(await book({ tableIds: [t.T1!.id] }))).toBe("T1");
    const reinstate = await owner.api.post(`${owner.base}/reservations/${id}/status`, {
      status: "confirmed",
    });
    expect(reinstate.status).toBe(409);
    expect(reinstate.body.error.code).toBe("table_taken");
  });

  it("refuses impossible transitions", async () => {
    const res = await owner.api.post(`${owner.base}/reservations`, {
      date: SATURDAY,
      time: "20:00",
      partySize: 2,
      guestName: "Bianchi",
      status: "requested",
    });
    const skip = await owner.api.post(`${owner.base}/reservations/${res.body.data.id}/status`, {
      status: "seated",
    });
    expect(skip.body.error.code).toBe("invalid_transition");
  });
});

describe("service rules", () => {
  it("rejects times outside service hours, except walk-ins", async () => {
    const res = await book({ time: "17:00" });
    expect(res.body.error.code).toBe("outside_service_hours");
    const walkIn = await book({ time: "17:00", channel: "walk_in" });
    expect(walkIn.status).toBe(201);
    expect(walkIn.body.data).toMatchObject({ status: "seated", serviceId: null, channel: "walk_in" });
  });

  it("enforces pacing unless staff forces it", async () => {
    await owner.api.patch(`${owner.base}/services/${dinner.id}`, { maxCoversPerSlot: 6 });
    expect((await book({ time: "20:00" })).status).toBe(201);
    const second = await book({ time: "20:05" });
    expect(second.body.error.code).toBe("pacing_covers");
    expect((await book({ time: "20:15" })).status).toBe(201);
    expect((await book({ time: "20:05", ignorePacing: true })).status).toBe(201);
  });
});

describe("availability", () => {
  it("shows which table each slot would get", async () => {
    await book({ time: "20:00" });
    const res = await owner.api.get(`${owner.base}/availability?date=${SATURDAY}&partySize=4`);
    const cena = res.body.data.services[0];
    expect(cena.status).toBe("open");
    const slot = (time: string) => cena.slots.find((s: { time: string }) => s.time === time);
    expect(slot("19:00").option.name).toBe("T2");
    expect(slot("22:00").option.name).toBe("T1");
  });

  it("explains closed slots", async () => {
    for (let i = 0; i < 4; i++) await book({ time: "20:00" });
    const res = await owner.api.get(`${owner.base}/availability?date=${SATURDAY}&partySize=4`);
    const reasons = new Set(res.body.data.services[0].slots.map((s: { reason: string | null }) => s.reason));
    expect(reasons).toEqual(new Set(["tables_taken", null]));
    const big = await owner.api.get(`${owner.base}/availability?date=${SATURDAY}&partySize=30`);
    expect(big.body.data.services[0].slots[0].reason).toBe("no_suitable_table");
  });

  it("applies online rules", async () => {
    await owner.api.patch(`${owner.base}/booking-policy`, { maxPartyOnline: 4, maxAdvanceDays: 30 });
    const tooLarge = await owner.api.get(
      `${owner.base}/availability?date=${SATURDAY}&partySize=6&channel=online`,
    );
    expect(tooLarge.body.data.services[0]).toMatchObject({ status: "closed", reason: "large_party_request" });
    const tooFar = await owner.api.get(
      `${owner.base}/availability?date=2027-03-01&partySize=2&channel=online`,
    );
    expect(tooFar.body.data.services[0].reason).toBe("too_far");
    const past = await owner.api.get(`${owner.base}/availability?date=2026-10-20&partySize=2&channel=online`);
    expect(past.body.data.services[0].reason).toBe("past");
  });

  it("hides tables that are not bookable online", async () => {
    for (const name of ["T1", "T2", "T3"]) {
      await owner.api.patch(`${owner.base}/tables/${t[name]!.id}`, { onlineBookable: false });
    }
    const res = await owner.api.get(`${owner.base}/availability?date=${SATURDAY}&partySize=4&channel=online`);
    expect(res.body.data.services[0].slots[0].option.name).toBe("D1");
  });
});

describe("listing and permissions", () => {
  it("lists a day's reservations in time order, filterable by status", async () => {
    await book({ time: "21:00", guestName: "Verdi" });
    const early = await book({ time: "19:30", guestName: "Neri" });
    await owner.api.post(`${owner.base}/reservations/${early.body.data.id}/status`, { status: "cancelled" });
    const all = await owner.api.get(`${owner.base}/reservations?date=${SATURDAY}`);
    expect(all.body.data.map((r: { guestName: string }) => r.guestName)).toEqual(["Neri", "Verdi"]);
    const active = await owner.api.get(`${owner.base}/reservations?date=${SATURDAY}&status=confirmed,seated`);
    expect(active.body.data.map((r: { guestName: string }) => r.guestName)).toEqual(["Verdi"]);
  });

  it("lets staff take bookings", async () => {
    const staff = await addMember(ctx, owner.restaurantId, "staff");
    const res = await staff.post(`${owner.base}/reservations`, {
      date: SATURDAY,
      time: "20:00",
      partySize: 2,
      guestName: "Gialli",
    });
    expect(res.status).toBe(201);
    expect((await staff.get(`${owner.base}/availability?date=${SATURDAY}&partySize=2`)).status).toBe(200);
  });

  it("keeps history: tables and services with reservations can't be deleted", async () => {
    await book();
    const table = await owner.api.delete(`${owner.base}/tables/${t.T1!.id}`);
    expect(table.status).toBe(409);
    expect(table.body.error.code).toBe("in_use");
    expect((await owner.api.delete(`${owner.base}/services/${dinner.id}`)).body.error.code).toBe("in_use");
    expect((await owner.api.delete(`${owner.base}/tables/${t.T3!.id}`)).status).toBe(204);
  });
});
