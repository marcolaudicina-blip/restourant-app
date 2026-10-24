import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { addMember, createTestApp, registerOwner, type TestContext } from "./helpers.js";

let ctx: TestContext;
let owner: Awaited<ReturnType<typeof registerOwner>>;

const SATURDAY = "2026-10-24";

beforeAll(async () => {
  ctx = await createTestApp();
});
afterAll(() => ctx.close());
beforeEach(async () => {
  owner = await registerOwner(ctx.app, "Trattoria Import");
  await owner.api.post(`${owner.base}/setup/apply-template`, { template: "trattoria" });
});

describe("guest import", () => {
  it("adds guests, merges duplicates and reports bad rows by line", async () => {
    // Someone who already booked: the import completes their profile.
    await owner.api.post(`${owner.base}/reservations`, {
      date: SATURDAY,
      time: "20:00",
      partySize: 2,
      guestName: "Anna Neri",
      guestPhone: "+39 333 000 1111",
    });

    const rows = [
      {
        fullName: "Anna Neri",
        phone: "3330001111",
        email: "anna@example.com",
        tags: ["VIP"],
        note: "Celiaca",
      },
      { fullName: "Bruno Gialli", phone: "347 222 3333", marketingConsent: true },
      { fullName: "Bruno G.", phone: "+39 347 2223333", tags: ["Habitué"] },
      { fullName: "Carla", email: "non-una-email" },
      { fullName: "Dario", note: "senza contatti" },
    ];
    const res = await owner.api.post(`${owner.base}/import/guests`, { firstRow: 2, rows });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ created: 1, updated: 2, skipped: 1 });
    expect(res.body.data.errors.map((e: { row: number }) => e.row)).toEqual([5, 6]);

    const list = (await owner.api.get(`${owner.base}/guests`)).body.data;
    const anna = list.find((g: { fullName: string }) => g.fullName === "Anna Neri");
    expect(anna).toMatchObject({ email: "anna@example.com", tags: ["VIP"], profileNote: "Celiaca" });
    const bruno = list.find((g: { fullName: string }) => g.fullName === "Bruno Gialli");
    expect(bruno).toMatchObject({ tags: ["Habitué"], marketingConsent: true });

    // Importing the same file again changes nothing.
    const again = await owner.api.post(`${owner.base}/import/guests`, {
      firstRow: 2,
      rows: rows.slice(0, 3),
    });
    expect(again.body.data).toMatchObject({ created: 0, updated: 0, skipped: 3 });
  });

  it("needs configuration rights", async () => {
    const staff = await addMember(ctx, owner.restaurantId, "staff");
    const res = await staff.post(`${owner.base}/import/guests`, {
      rows: [{ fullName: "X", phone: "3330000000" }],
    });
    expect(res.status).toBe(403);
  });
});

describe("reservation import", () => {
  it("adds future bookings on the given tables, skips past and repeated ones", async () => {
    const rows = [
      {
        date: SATURDAY,
        time: "20:00",
        partySize: 4,
        guestName: "Rossi",
        guestPhone: "333 111 2222",
        tableName: "T7",
      },
      { date: SATURDAY, time: "20:30", partySize: 10, guestName: "Gruppo Bianchi", tableName: "T10+T11+T12" },
      { date: SATURDAY, time: "21:00", partySize: 2, guestName: "Verdi" },
      { date: "2026-10-01", time: "20:00", partySize: 2, guestName: "Passato" },
      { date: SATURDAY, time: "25:00", partySize: 2, guestName: "Orario sbagliato" },
    ];
    const res = await owner.api.post(`${owner.base}/import/reservations`, { firstRow: 2, rows });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ created: 3, skipped: 1 });
    expect(res.body.data.errors).toMatchObject([{ row: 6 }]);

    const day = (await owner.api.get(`${owner.base}/reservations?date=${SATURDAY}`)).body.data;
    const tablesOf = (name: string) =>
      day
        .find((r: { guestName: string }) => r.guestName === name)
        .tables.map((t: { name: string }) => t.name)
        .join("+");
    expect(tablesOf("Rossi")).toBe("T7");
    expect(tablesOf("Gruppo Bianchi")).toBe("T10+T11+T12");
    expect(tablesOf("Verdi")).not.toBe("");
    // The guest profile was created from the phone, as for any booking.
    expect(day.find((r: { guestName: string }) => r.guestName === "Rossi").guest).not.toBeNull();

    const again = await owner.api.post(`${owner.base}/import/reservations`, {
      firstRow: 2,
      rows: rows.slice(0, 3),
    });
    expect(again.body.data).toMatchObject({ created: 0, skipped: 3, errors: [] });
  });

  it("reports bookings that don't fit instead of double-booking", async () => {
    const rows = [
      { date: SATURDAY, time: "20:00", partySize: 4, guestName: "Primo", tableName: "T7" },
      { date: SATURDAY, time: "20:30", partySize: 4, guestName: "Secondo", tableName: "T7" },
    ];
    const res = await owner.api.post(`${owner.base}/import/reservations`, { rows });
    expect(res.body.data.created).toBe(1);
    expect(res.body.data.errors).toMatchObject([{ row: 2, message: expect.stringMatching(/occupato/) }]);
  });
});
