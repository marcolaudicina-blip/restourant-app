import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addMember, createTestApp, registerOwner, type TestContext } from "./helpers.js";

let ctx: TestContext;

beforeAll(async () => {
  ctx = await createTestApp();
});
afterAll(() => ctx.close());

/** The test clock is Friday 23 October 2026. */
describe("statistics", () => {
  it("adds up covers, channels, no-shows and regulars over a period", async () => {
    const owner = await registerOwner(ctx.app, "Osteria Numeri");
    const post = async (path: string, body: object) => {
      const res = await owner.api.post(`${owner.base}${path}`, body);
      if (res.status !== 201) throw new Error(`${path}: ${JSON.stringify(res.body)}`);
      return res.body.data;
    };
    const room = await post("/rooms", { name: "Sala" });
    for (const name of ["T1", "T2", "T3", "T4"])
      await post("/tables", { roomId: room.id, name, minCovers: 1, maxCovers: 6 });
    await post("/services", {
      name: "Cena",
      daysOfWeek: [1, 2, 3, 4, 5, 6, 7],
      firstArrival: "19:00",
      lastArrival: "22:00",
    });
    const book = (date: string, time: string, partySize: number, guestName: string, guestPhone?: string) =>
      post("/reservations", { date, time, partySize, guestName, guestPhone });

    // Saturday 17 and Friday 23 October.
    await book("2026-10-17", "20:00", 4, "Rossi", "333 000 0001");
    await book("2026-10-17", "21:00", 2, "Bianchi");
    const noShow = await book("2026-10-17", "19:00", 3, "Verdi");
    await owner.api.post(`${owner.base}/reservations/${noShow.id}/status`, { status: "no_show" });
    await book("2026-10-23", "20:00", 2, "Rossi", "333 000 0001");
    const cancelled = await book("2026-10-23", "21:00", 5, "Neri");
    await owner.api.post(`${owner.base}/reservations/${cancelled.id}/status`, { status: "cancelled" });
    await post("/reservations", {
      date: "2026-10-23",
      time: "19:30",
      partySize: 2,
      guestName: "Walk-in",
      channel: "walk_in",
    });

    const res = await owner.api.get(`${owner.base}/stats?from=2026-10-17&to=2026-10-23`);
    expect(res.status).toBe(200);
    const stats = res.body.data;
    expect(stats.totals).toMatchObject({
      bookings: 4,
      covers: 10,
      noShows: 1,
      cancelled: 1,
      walkIns: 1,
      online: 0,
    });
    expect(stats.totals.noShowRate).toBeCloseTo(1 / 5);
    expect(stats.previous).toMatchObject({ from: "2026-10-10", to: "2026-10-16", covers: 0 });
    expect(stats.byDay).toHaveLength(7);
    expect(stats.byDay[0]).toMatchObject({ date: "2026-10-17", covers: 6, bookings: 2 });
    expect(stats.byWeekday.find((d: { weekday: number }) => d.weekday === 6)).toMatchObject({ avgCovers: 6 });
    expect(stats.byHour).toEqual([
      { hour: 19, covers: 2 },
      { hour: 20, covers: 6 },
      { hour: 21, covers: 2 },
    ]);
    expect(stats.byChannel).toEqual([
      { channel: "online", bookings: 0, covers: 0 },
      { channel: "staff", bookings: 3, covers: 8 },
      { channel: "walk_in", bookings: 1, covers: 2 },
    ]);
    expect(stats.topGuests).toMatchObject([{ name: "Rossi", visits: 2, covers: 6 }]);

    // Defaults to the last 30 days; staff can't see the figures.
    expect((await owner.api.get(`${owner.base}/stats`)).body.data).toMatchObject({
      from: "2026-09-24",
      to: "2026-10-23",
    });
    const waiter = await addMember(ctx, owner.restaurantId, "staff");
    expect((await waiter.get(`${owner.base}/stats`)).status).toBe(403);
    expect((await owner.api.get(`${owner.base}/stats?from=2025-01-01&to=2026-10-23`)).status).toBe(400);
  });
});
