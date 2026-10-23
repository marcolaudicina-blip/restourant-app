import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestApp, registerOwner, type TestContext } from "./helpers.js";

let ctx: TestContext;
let owner: Awaited<ReturnType<typeof registerOwner>>;

beforeAll(async () => {
  ctx = await createTestApp();
});
afterAll(() => ctx.close());
beforeEach(async () => {
  owner = await registerOwner(ctx.app);
});

const issuePaths = (body: { error: { issues?: { path: string }[] } }) =>
  body.error.issues?.map((i) => i.path) ?? [];

async function createRoom(name = "Sala") {
  const res = await owner.api.post(`${owner.base}/rooms`, { name });
  expect(res.status).toBe(201);
  return res.body.data as { id: string };
}

async function createTable(roomId: string, name: string, minCovers = 2, maxCovers = 4) {
  const res = await owner.api.post(`${owner.base}/tables`, { roomId, name, minCovers, maxCovers });
  expect(res.status).toBe(201);
  return res.body.data as { id: string };
}

describe("restaurant profile and booking policy", () => {
  it("validates the merged profile", async () => {
    const res = await owner.api.patch(owner.base, { timezone: "Mars/Olympus" });
    expect(res.status).toBe(400);
    const ok = await owner.api.patch(owner.base, { city: "Palermo", phone: "+39 091 000000" });
    expect(ok.body.data).toMatchObject({ city: "Palermo", timezone: "Europe/Rome" });
  });

  it("checks rules against the stored policy, not just the patch", async () => {
    await owner.api.patch(`${owner.base}/booking-policy`, { maxPartyOnline: 6 });
    const res = await owner.api.patch(`${owner.base}/booking-policy`, { minPartyOnline: 8 });
    expect(res.status).toBe(400);
    expect(issuePaths(res.body)).toContain("maxPartyOnline");

    const missingThreshold = await owner.api.patch(`${owner.base}/booking-policy`, {
      confirmationMode: "auto_up_to",
    });
    expect(issuePaths(missingThreshold.body)).toContain("autoConfirmMaxParty");

    const ok = await owner.api.patch(`${owner.base}/booking-policy`, {
      confirmationMode: "auto_up_to",
      autoConfirmMaxParty: 6,
    });
    expect(ok.status).toBe(200);
    expect(ok.body.data).toMatchObject({
      confirmationMode: "auto_up_to",
      autoConfirmMaxParty: 6,
      maxPartyOnline: 6,
    });
  });
});

describe("rooms and tables", () => {
  it("creates rooms with defaults and rejects duplicate names", async () => {
    const res = await owner.api.post(`${owner.base}/rooms`, { name: "Terrazza", guestSelectable: true });
    expect(res.body.data).toMatchObject({
      name: "Terrazza",
      isActive: true,
      onlineBookable: true,
      guestSelectable: true,
    });
    expect(res.body.data).not.toHaveProperty("restaurantId");
    const dup = await owner.api.post(`${owner.base}/rooms`, { name: "Terrazza" });
    expect(dup.status).toBe(409);
  });

  it("validates table capacity on create and on partial update", async () => {
    const room = await createRoom();
    const bad = await owner.api.post(`${owner.base}/tables`, {
      roomId: room.id,
      name: "1",
      minCovers: 6,
      maxCovers: 2,
    });
    expect(bad.status).toBe(400);
    expect(issuePaths(bad.body)).toContain("maxCovers");

    const table = await createTable(room.id, "1", 2, 4);
    const inverted = await owner.api.patch(`${owner.base}/tables/${table.id}`, { minCovers: 5 });
    expect(inverted.status).toBe(400);
    const moved = await owner.api.patch(`${owner.base}/tables/${table.id}`, {
      posX: 10,
      posY: 4,
      rotation: 90,
    });
    expect(moved.body.data).toMatchObject({ posX: 10, posY: 4, rotation: 90, minCovers: 2, maxCovers: 4 });
  });

  it("lists tables by room order and filters by room", async () => {
    const sala = await createRoom("Sala");
    const terrazza = await createRoom("Terrazza");
    await owner.api.patch(`${owner.base}/rooms/${terrazza.id}`, { sortOrder: 1 });
    await createTable(terrazza.id, "D1");
    await createTable(sala.id, "T1");
    const all = await owner.api.get(`${owner.base}/tables`);
    expect(all.body.data.map((t: { name: string }) => t.name)).toEqual(["T1", "D1"]);
    const filtered = await owner.api.get(`${owner.base}/tables?roomId=${terrazza.id}`);
    expect(filtered.body.data.map((t: { name: string }) => t.name)).toEqual(["D1"]);
  });

  it("deleting a room removes its tables", async () => {
    const room = await createRoom();
    const table = await createTable(room.id, "1");
    expect((await owner.api.delete(`${owner.base}/rooms/${room.id}`)).status).toBe(204);
    expect((await owner.api.get(`${owner.base}/tables/${table.id}`)).status).toBe(404);
  });
});

describe("table adjacencies and combinations", () => {
  it("stores adjacency pairs once, in canonical order", async () => {
    const room = await createRoom();
    const t1 = await createTable(room.id, "1");
    const t2 = await createTable(room.id, "2");
    const res = await owner.api.put(`${owner.base}/table-adjacencies`, {
      pairs: [
        { tableAId: t2.id, tableBId: t1.id },
        { tableAId: t1.id, tableBId: t2.id },
      ],
    });
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    const [a, b] = [t1.id, t2.id].sort();
    expect(res.body.data[0]).toEqual({ tableAId: a, tableBId: b });

    const cleared = await owner.api.put(`${owner.base}/table-adjacencies`, { pairs: [] });
    expect(cleared.body.data).toEqual([]);
  });

  it("creates and updates combinations with their tables", async () => {
    const room = await createRoom();
    const t1 = await createTable(room.id, "1");
    const t2 = await createTable(room.id, "2");
    const t3 = await createTable(room.id, "3");
    const created = await owner.api.post(`${owner.base}/combinations`, {
      name: "1+2",
      tableIds: [t1.id, t2.id],
      minCovers: 5,
      maxCovers: 8,
    });
    expect(created.status).toBe(201);
    expect(created.body.data.tableIds).toEqual([t1.id, t2.id].sort());

    const updated = await owner.api.patch(`${owner.base}/combinations/${created.body.data.id}`, {
      tableIds: [t1.id, t2.id, t3.id],
      maxCovers: 12,
    });
    expect(updated.body.data).toMatchObject({ maxCovers: 12, minCovers: 5 });
    expect(updated.body.data.tableIds).toHaveLength(3);

    const single = await owner.api.post(`${owner.base}/combinations`, {
      name: "solo",
      tableIds: [t1.id],
      minCovers: 1,
      maxCovers: 2,
    });
    expect(single.status).toBe(400);
  });
});

describe("services, durations and calendar", () => {
  it("creates a fixed-seating service limited to a room", async () => {
    const room = await createRoom();
    const res = await owner.api.post(`${owner.base}/services`, {
      name: "Cena",
      daysOfWeek: [6, 5],
      firstArrival: "19:30",
      lastArrival: "21:30",
      seatingMode: "fixed",
      fixedSeatings: ["21:30", "19:30"],
      roomIds: [room.id],
    });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      daysOfWeek: [5, 6],
      firstArrival: "19:30",
      fixedSeatings: ["19:30", "21:30"],
      roomIds: [room.id],
    });

    const bad = await owner.api.patch(`${owner.base}/services/${res.body.data.id}`, { lastArrival: "21:00" });
    expect(bad.status).toBe(400);
    expect(issuePaths(bad.body)).toContain("fixedSeatings");
  });

  it("scopes duration rules to services of the same restaurant", async () => {
    const other = await registerOwner(ctx.app);
    const foreign = await other.api.post(`${other.base}/services`, {
      name: "Pranzo",
      daysOfWeek: [1],
      firstArrival: "12:00",
      lastArrival: "14:00",
    });
    const res = await owner.api.post(`${owner.base}/duration-rules`, {
      serviceId: foreign.body.data.id,
      minParty: 1,
      maxParty: 2,
      durationMinutes: 90,
    });
    expect(res.status).toBe(400);

    const ok = await owner.api.post(`${owner.base}/duration-rules`, {
      minParty: 1,
      maxParty: 2,
      durationMinutes: 90,
    });
    expect(ok.body.data).toMatchObject({ serviceId: null, roomId: null, durationMinutes: 90 });
  });

  it("previews the day schedule with closures, online-only closures and special hours", async () => {
    const dinner = (
      await owner.api.post(`${owner.base}/services`, {
        name: "Cena",
        daysOfWeek: [2, 3, 4, 5, 6, 7],
        firstArrival: "19:00",
        lastArrival: "19:30",
      })
    ).body.data;

    const saturday = await owner.api.get(`${owner.base}/schedule?date=2026-10-24`);
    expect(saturday.body.data.services[0]).toMatchObject({
      status: "open",
      slots: ["19:00", "19:15", "19:30"],
    });

    const monday = await owner.api.get(`${owner.base}/schedule?date=2026-10-26`);
    expect(monday.body.data.services[0]).toMatchObject({ status: "closed", reason: "not_scheduled_day" });

    await owner.api.post(`${owner.base}/calendar-exceptions`, {
      kind: "closed",
      scope: "online",
      dateFrom: "2026-10-24",
      dateTo: "2026-10-24",
      note: "Evento privato",
    });
    expect((await owner.api.get(`${owner.base}/schedule?date=2026-10-24`)).body.data.services[0].status).toBe(
      "open",
    );
    const online = await owner.api.get(`${owner.base}/schedule?date=2026-10-24&channel=online`);
    expect(online.body.data.services[0]).toMatchObject({
      reason: "online_closed_exception",
      note: "Evento privato",
    });

    const special = await owner.api.post(`${owner.base}/calendar-exceptions`, {
      kind: "special_hours",
      dateFrom: "2026-10-26",
      dateTo: "2026-10-26",
      serviceId: dinner.id,
      firstArrival: "20:00",
      lastArrival: "20:30",
    });
    expect(special.status).toBe(201);
    expect(special.body.data).toMatchObject({ firstArrival: "20:00", lastArrival: "20:30" });
    const opened = await owner.api.get(`${owner.base}/schedule?date=2026-10-26`);
    expect(opened.body.data.services[0]).toMatchObject({
      status: "open",
      slots: ["20:00", "20:15", "20:30"],
    });

    const range = await owner.api.get(`${owner.base}/calendar-exceptions?from=2026-10-25&to=2026-10-31`);
    expect(range.body.data).toHaveLength(1);
  });

  it("validates special hours", async () => {
    const res = await owner.api.post(`${owner.base}/calendar-exceptions`, {
      kind: "special_hours",
      dateFrom: "2026-12-31",
      dateTo: "2026-12-31",
    });
    expect(res.status).toBe(400);
    expect(issuePaths(res.body)).toEqual(expect.arrayContaining(["serviceId", "firstArrival"]));
  });

  it("blocks a table for an event", async () => {
    const room = await createRoom();
    const table = await createTable(room.id, "1");
    const res = await owner.api.post(`${owner.base}/table-blocks`, {
      tableId: table.id,
      startsAt: "2026-12-31T19:00:00+01:00",
      endsAt: "2027-01-01T02:00:00+01:00",
      reason: "Cenone",
    });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ tableId: table.id, roomId: null, onlineOnly: false });
    const both = await owner.api.post(`${owner.base}/table-blocks`, {
      tableId: table.id,
      roomId: room.id,
      startsAt: "2026-12-31T19:00:00+01:00",
      endsAt: "2027-01-01T02:00:00+01:00",
    });
    expect(both.status).toBe(400);
    const listed = await owner.api.get(
      `${owner.base}/table-blocks?from=${encodeURIComponent("2026-12-31T23:00:00+01:00")}`,
    );
    expect(listed.body.data).toHaveLength(1);
  });
});

describe("audit log", () => {
  it("records who changed what", async () => {
    const room = await createRoom();
    await owner.api.patch(`${owner.base}/rooms/${room.id}`, { name: "Sala grande" });
    await owner.api.delete(`${owner.base}/rooms/${room.id}`);
    const res = await owner.api.get(`${owner.base}/audit-log?limit=3`);
    expect(res.body.data.map((e: { entity: string; action: string }) => `${e.entity}:${e.action}`)).toEqual([
      "room:delete",
      "room:update",
      "room:create",
    ]);
    expect(res.body.data[1]).toMatchObject({ changes: { name: "Sala grande" }, actor: { id: owner.userId } });
  });
});
