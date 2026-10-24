import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { client, createTestApp, registerOwner, type Client, type TestContext } from "./helpers.js";

let ctx: TestContext;
let owner: Awaited<ReturnType<typeof registerOwner>>;
let guest: Client;

/** The test clock is Friday 23 October 2026, 10:00 in Rome: yesterday is Thursday. */
const THURSDAY = "2026-10-22";
const GOOGLE = "https://g.page/r/osteria-recensioni/review";

beforeAll(async () => {
  ctx = await createTestApp();
  guest = client(ctx.app);
});
afterAll(() => ctx.close());

beforeEach(async () => {
  owner = await registerOwner(ctx.app, "Osteria Stelle");
  const post = async (path: string, body: object) => {
    const res = await owner.api.post(`${owner.base}${path}`, body);
    if (res.status !== 201) throw new Error(`${path}: ${JSON.stringify(res.body)}`);
    return res.body.data;
  };
  const room = await post("/rooms", { name: "Sala" });
  await post("/tables", { roomId: room.id, name: "T1", minCovers: 1, maxCovers: 6 });
  for (const name of ["T2", "T3", "T4"])
    await post("/tables", { roomId: room.id, name, minCovers: 1, maxCovers: 6 });
  await post("/services", {
    name: "Cena",
    daysOfWeek: [1, 2, 3, 4, 5, 6, 7],
    firstArrival: "19:00",
    lastArrival: "22:00",
  });
});

const emailsTo = (to: string) => ctx.sentEmails.filter((e) => e.to === to);
const runJob = () => client(ctx.app, "test-cron-secret-0123456789").post("/v1/internal/reminders");

async function dinner(email: string, time = "20:00", locale?: "en") {
  const res = await owner.api.post(`${owner.base}/reservations`, {
    date: THURSDAY,
    time,
    partySize: 2,
    guestName: "Lucia Verdi",
    guestEmail: email,
    ...(locale ? { locale } : {}),
  });
  if (res.status !== 201) throw new Error(JSON.stringify(res.body));
  return res.body.data.id as string;
}

const tokenIn = (email: string) => /\/recensione\/([\w.-]+)\?voto=5/.exec(emailsTo(email).at(-1)!.text)?.[1];

describe("reviews after the meal", () => {
  it("asks yesterday's guests once, and nobody when the restaurant didn't turn it on", async () => {
    await dinner("off@example.com");
    await runJob();
    expect(emailsTo("off@example.com").some((e) => /Com'è andata/.test(e.subject))).toBe(false);

    await owner.api.patch(`${owner.base}/booking-policy`, { reviewRequests: true, reviewUrl: GOOGLE });
    await dinner("lucia@example.com", "20:30");
    const noShow = await dinner("noshow@example.com", "21:00");
    await owner.api.post(`${owner.base}/reservations/${noShow}/status`, { status: "no_show" });

    const res = await runJob();
    expect(res.body.data.reviews.sent).toBeGreaterThanOrEqual(1);
    const email = emailsTo("lucia@example.com").at(-1)!;
    expect(email.subject).toBe("Com'è andata da Osteria Stelle?");
    expect(email.text).toContain("grazie della visita di giovedì 22 ottobre");
    expect(tokenIn("lucia@example.com")).toBeTruthy();
    expect(emailsTo("noshow@example.com").some((e) => /Com'è andata/.test(e.subject))).toBe(false);

    await runJob();
    expect(emailsTo("lucia@example.com").filter((e) => /Com'è andata/.test(e.subject))).toHaveLength(1);
  });

  it("sends happy guests to the public review, and keeps the others' comments for the restaurant", async () => {
    await owner.api.patch(`${owner.base}/booking-policy`, { reviewRequests: true, reviewUrl: GOOGLE });
    const id = await dinner("happy@example.com", "19:00", "en");
    await runJob();
    expect(emailsTo("happy@example.com").at(-1)!.subject).toBe("How was your visit to Osteria Stelle?");
    const token = tokenIn("happy@example.com")!;

    const page = await guest.get(`/v1/public/reviews/${token}`);
    expect(page.body.data).toMatchObject({
      restaurant: { name: "Osteria Stelle" },
      booking: { date: THURSDAY, partySize: 2, guestName: "Lucia Verdi", locale: "en" },
      rating: null,
      publicReviewUrl: null,
    });

    const happy = await guest.post(`/v1/public/reviews/${token}`, { rating: 5 });
    expect(happy.body.data).toMatchObject({ rating: 5, publicReviewUrl: GOOGLE });

    const unhappy = await guest.post(`/v1/public/reviews/${token}`, { rating: 2, feedback: "Pasta fredda" });
    expect(unhappy.body.data).toMatchObject({ rating: 2, feedback: "Pasta fredda", publicReviewUrl: null });
    expect((await guest.post(`/v1/public/reviews/${token}`, { rating: 6 })).status).toBe(400);

    const list = (await owner.api.get(`${owner.base}/reviews`)).body.data;
    expect(list).toMatchObject({ count: 1, average: 2, byRating: [0, 1, 0, 0, 0], requested: 1 });
    expect(list.reviews[0]).toMatchObject({ reservationId: id, rating: 2, feedback: "Pasta fredda" });
  });

  it("only opens with the review link", async () => {
    const id = await dinner("x@example.com");
    const [, signature] = (await import("../src/lib/tokens.js"))
      .createTokenService("x".repeat(32))
      .signReview(id)
      .split(".");
    expect((await guest.get(`/v1/public/reviews/${id}.${signature}`)).status).toBe(404);
    expect((await guest.get(`/v1/public/reviews/${id}.${"A".repeat(22)}`)).status).toBe(404);

    const other = await registerOwner(ctx.app, "Altro");
    expect((await other.api.get(`${other.base}/reviews`)).body.data.count).toBe(0);
  });
});
