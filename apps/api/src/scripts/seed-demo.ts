/**
 * Creates a demo restaurant with realistic data, for trying the product and for sales demos.
 *
 *   DEMO_EMAIL=demo@example.com DEMO_PASSWORD=... DATABASE_URL=... pnpm --filter @restourant/api seed:demo
 *
 * Idempotent: if the demo account already exists only the missing upgrades are applied. Everything
 * goes through the real API (in-process), so the data obeys the same rules as data entered from the
 * app; the one exception is `markOnlineBookings`, see there.
 */
import { randomBytes } from "node:crypto";
import { bookingPages, createDatabase, memberships, reservations, users } from "@restourant/db";
import { addDays, instantToLocal } from "@restourant/shared";
import { and, eq, inArray, sql } from "drizzle-orm";
import { buildApp } from "../app.js";
import { disabledMailer } from "../lib/mailer.js";
import { createPasswordHasher } from "../lib/passwords.js";
import { createTokenService } from "../lib/tokens.js";

const TIMEZONE = "Europe/Rome";

/** Demo guests who "booked on the website". */
const ONLINE_GUESTS = ["Ferrari", "Esposito", "Colombo", "Gallo", "De Luca"];

const email = process.env.DEMO_EMAIL;
const password = process.env.DEMO_PASSWORD;
const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!email || !password || !url) {
  console.error("DEMO_EMAIL, DEMO_PASSWORD and DATABASE_URL are required");
  process.exit(1);
}

const database = await createDatabase(url, { maxConnections: 2 });
const app = await buildApp({
  deps: {
    db: database.db,
    // Tokens only live for this run.
    tokens: createTokenService(randomBytes(48).toString("base64")),
    passwords: createPasswordHasher(),
    now: () => new Date(),
    // Demo bookings never email anyone.
    mailer: disabledMailer,
    publicUrl: null,
    cronSecret: null,
    platformAdmins: [],
  },
  rateLimit: false,
});

let token = "";
async function call<T = unknown>(method: "GET" | "POST" | "PATCH" | "PUT", path: string, body?: unknown) {
  const response = await app.inject({
    method,
    url: `/v1${path}`,
    headers: token ? { authorization: `Bearer ${token}` } : {},
    ...(body === undefined ? {} : { payload: body as object }),
  });
  const json = response.body ? response.json() : undefined;
  if (response.statusCode >= 400) {
    throw new Error(`${method} ${path} → ${response.statusCode} ${JSON.stringify(json?.error)}`);
  }
  return json?.data as T;
}

try {
  const login = await app.inject({ method: "POST", url: "/v1/auth/login", payload: { email, password } });
  if (login.statusCode === 200) {
    console.log(`Demo account ${email} already exists`);
    token = (login.json() as { data: { token: string } }).data.token;
  } else {
    await seed();
  }
  await markOnlineBookings();
  await styleBookingPage();
} finally {
  await app.close();
  await database.close();
}

async function seed() {
  const registered = await call<{ token: string; restaurantId: string }>("POST", "/auth/register", {
    email,
    password,
    fullName: "Ristoratore Demo",
    restaurantName: "Trattoria Demo",
  });
  token = registered.token;
  const base = `/restaurants/${registered.restaurantId}`;

  await call("PATCH", base, {
    phone: "+39 091 123 4567",
    email: "info@trattoriademo.it",
    addressLine: "Via Roma 1",
    city: "Palermo",
    postalCode: "90100",
  });

  // Sala (12 tables) + Dehors (4), lunch and dinner Tuesday to Sunday, durations by party size.
  const config = await call<{
    tables: { id: string; name: string }[];
    services: { id: string; name: string }[];
  }>("POST", `${base}/setup/apply-template`, { template: "trattoria" });
  const table = (name: string) => config.tables.find((t) => t.name === name)!.id;
  const service = (name: string) => config.services.find((s) => s.name === name)!.id;

  // Window tables go first, the dehors next; the small tables by the door last.
  for (const name of ["T7", "T8", "T9", "T10"])
    await call("PATCH", `${base}/tables/${table(name)}`, { priority: 20 });
  for (const name of ["D1", "D2", "D3", "D4"])
    await call("PATCH", `${base}/tables/${table(name)}`, { priority: 10 });
  await call("PATCH", `${base}/tables/${table("T1")}`, { priority: 0, onlineBookable: false });

  await call("POST", `${base}/combinations`, {
    name: "Tavolata",
    tableIds: [table("T10"), table("T11"), table("T12")],
    minCovers: 9,
    maxCovers: 12,
    priority: 5,
  });
  await call("PATCH", `${base}/services/${service("Cena")}`, { maxCoversPerSlot: 16 });

  const today = instantToLocal(new Date(), TIMEZONE).date;
  const year = Number(today.slice(0, 4));
  const christmas = `${today <= `${year}-12-26` ? year : year + 1}-12-24`;
  await call("POST", `${base}/calendar-exceptions`, {
    kind: "closed",
    dateFrom: christmas,
    dateTo: addDays(christmas, 2),
    note: "Chiusura natalizia",
  });
  await call("POST", `${base}/calendar-exceptions`, {
    kind: "special_hours",
    dateFrom: addDays(christmas, 7),
    dateTo: addDays(christmas, 7),
    serviceId: service("Cena"),
    firstArrival: "20:30",
    lastArrival: "21:30",
    note: "Cenone di Capodanno",
  });

  // A realistic week: the next three days the restaurant is open.
  const openDays: string[] = [];
  for (let i = 0; openDays.length < 3 && i < 14; i++) {
    const date = addDays(today, i);
    const schedule = await call<{ services: { name: string; status: string }[] }>(
      "GET",
      `${base}/schedule?date=${date}`,
    );
    if (schedule.services.some((s) => s.name === "Cena" && s.status === "open")) openDays.push(date);
  }

  const bookings: [number, string, number, string, Partial<Record<string, string>>?][] = [
    // [day, time, party, name, extra]. Large groups first, as they are usually booked well ahead.
    [0, "20:30", 10, "Marino", { guestPhone: "+39 345 888 9900", guestNote: "Cena aziendale" }],
    [0, "19:30", 2, "Rossi", { guestPhone: "+39 333 111 2233" }],
    [
      0,
      "20:00",
      4,
      "Bianchi",
      { guestPhone: "+39 347 222 3344", guestNote: "Compleanno, portare candelina" },
    ],
    [0, "20:00", 2, "Esposito", { guestPhone: "+39 320 333 4455" }],
    [
      0,
      "20:15",
      6,
      "Russo",
      { guestPhone: "+39 339 444 5566", internalNote: "Cliente abituale, tavolo vicino alla finestra" },
    ],
    [0, "20:30", 3, "Romano", { guestPhone: "+39 348 555 6677", guestNote: "Un celiaco" }],
    [0, "20:45", 2, "Colombo", { guestPhone: "+39 331 666 7788" }],
    [0, "21:00", 4, "Ricci", { guestPhone: "+39 340 777 8899" }],
    [1, "13:00", 2, "Greco", { guestPhone: "+39 329 101 2020" }],
    [1, "20:00", 5, "Bruno", { guestPhone: "+39 338 303 4040" }],
    [1, "20:30", 2, "Gallo", { guestPhone: "+39 349 505 6060" }],
    [1, "21:00", 4, "Conti", { guestPhone: "+39 335 707 8080" }],
    [2, "12:30", 4, "De Luca", { guestPhone: "+39 342 909 1010" }],
    [2, "20:00", 8, "Mancini", { guestPhone: "+39 346 121 3141", guestNote: "Seggiolone per bambino" }],
  ];

  let created = 0;
  for (const [day, time, partySize, guestName, extra] of bookings) {
    const date = openDays[day];
    if (!date) continue;
    await call("POST", `${base}/reservations`, { date, time, partySize, guestName, ...extra });
    created += 1;
  }
  const pending = openDays[1];
  if (pending) {
    await call("POST", `${base}/reservations`, {
      date: pending,
      time: "21:30",
      partySize: 7,
      guestName: "Ferrari",
      guestPhone: "+39 333 999 0000",
      status: "requested",
      guestNote: "Richiesta dal sito: possibile tavolo in dehors?",
    });
    created += 1;
  }

  console.log(`Demo restaurant created for ${email}: ${created} reservations on ${openDays.join(", ")}`);
}

async function demoRestaurantId(): Promise<string | null> {
  const [owner] = await database.db
    .select({ restaurantId: memberships.restaurantId })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(eq(sql`lower(${users.email})`, email!.toLowerCase()));
  return owner?.restaurantId ?? null;
}

/** Colors and words of the public booking page, once: the owner may restyle it afterwards. */
async function styleBookingPage() {
  const restaurantId = await demoRestaurantId();
  if (!restaurantId) return;
  const [page] = await database.db
    .select({ id: bookingPages.restaurantId })
    .from(bookingPages)
    .where(eq(bookingPages.restaurantId, restaurantId));
  if (page) return;
  const styled = await call<{ slug: string }>("PATCH", `/restaurants/${restaurantId}/booking-page`, {
    brandColor: "#7a1f2b",
    description:
      "Cucina di casa nel cuore di Palermo: pasta fresca fatta a mano, pesce del giorno e i dolci della nonna. " +
      "D'estate si cena nel dehors sotto il pergolato.",
  });
  console.log(`Demo: booking page styled at /prenota/${styled.slug}`);
}

/**
 * Staff cannot create online bookings through the API (only the public booking page will), so the
 * demo marks a few of its bookings as online directly, once, to show how they stand out in the app.
 */
async function markOnlineBookings() {
  const db = database.db;
  const restaurantId = await demoRestaurantId();
  if (!restaurantId) return;
  const scope = eq(reservations.restaurantId, restaurantId);
  const [existing] = await db
    .select({ id: reservations.id })
    .from(reservations)
    .where(and(scope, eq(reservations.channel, "online")))
    .limit(1);
  if (existing) return;
  const marked = await db
    .update(reservations)
    .set({ channel: "online" })
    .where(and(scope, eq(reservations.channel, "staff"), inArray(reservations.guestName, ONLINE_GUESTS)))
    .returning({ id: reservations.id });
  console.log(`Demo: ${marked.length} bookings marked as online`);
}
