import { writeFileSync } from "node:fs";
import {
  isoWeekday,
  localToInstant,
  onlinePartyLimitAt,
  resolveDuration,
  timeToMinutes,
} from "@restourant/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { client, createTestApp, registerOwner, type Client, type TestContext } from "./helpers.js";

/*
 * A long, randomized session against the real API: several restaurants (the three templates and a
 * custom one with priorities, combinations, online limits, blocked tables), hundreds of bookings
 * of every kind (online, staff, walk-in, groups, staff edits, guests changing from their link,
 * cancellations, no-shows), then independent checks of every result. The checks do not reuse the
 * engine: tables, adjacency, combinations, durations and pacing are re-evaluated from the config.
 *
 *   SIMULATION=1 SIM_REPORT=/path/report.md SIM_SEED=7 pnpm --filter @restourant/api exec vitest run test/simulation.test.ts
 */

const ENABLED = process.env.SIMULATION === "1";
const OPS = Number(process.env.SIM_OPS ?? 220);
const TZ = "Europe/Rome";

// ---------------------------------------------------------------------------------------------
// Deterministic randomness
// ---------------------------------------------------------------------------------------------

let seed = Number(process.env.SIM_SEED ?? 20261023);
function rand() {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
}
const pick = <T>(list: readonly T[]): T => list[Math.floor(rand() * list.length)]!;
function weighted<T>(entries: readonly [T, number][]): T {
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let r = rand() * total;
  for (const [value, w] of entries) if ((r -= w) <= 0) return value;
  return entries.at(-1)![0];
}
const PARTY: [number, number][] = [
  [1, 4],
  [2, 34],
  [3, 14],
  [4, 20],
  [5, 8],
  [6, 8],
  [7, 4],
  [8, 4],
  [10, 2],
  [12, 2],
];

// ---------------------------------------------------------------------------------------------
// Config, as the API returns it
// ---------------------------------------------------------------------------------------------

type Table = {
  id: string;
  name: string;
  roomId: string;
  minCovers: number;
  maxCovers: number;
  priority: number;
  onlineBookable: boolean;
  onlineMaxCovers: number | null;
  combinationOnly: boolean;
  isActive: boolean;
};
type Room = { id: string; name: string; sortOrder: number; isActive: boolean; onlineBookable: boolean };
type Combination = {
  id: string;
  name: string;
  tableIds: string[];
  minCovers: number;
  maxCovers: number;
  priority: number;
  onlineBookable: boolean;
  isActive: boolean;
};
type Service = {
  id: string;
  name: string;
  daysOfWeek: number[];
  firstArrival: string;
  lastArrival: string;
  seatingMode: "continuous" | "fixed";
  slotIntervalMinutes: number | null;
  fixedSeatings: string[];
  maxCovers: number | null;
  maxCoversPerSlot: number | null;
  maxBookingsPerSlot: number | null;
  onlineBookable: boolean;
  isActive: boolean;
  roomIds: string[];
};
type Policy = {
  minPartyOnline: number;
  maxPartyOnline: number;
  largePartyMode: string;
  slotIntervalMinutes: number;
  defaultDurationMinutes: number;
  minNoticeMinutes: number;
  onlinePartyLimits: { daysOfWeek: number[]; from: string; to: string; maxParty: number }[];
};
type Block = {
  tableId: string | null;
  roomId: string | null;
  startsAt: string;
  endsAt: string;
  onlineOnly: boolean;
};
type Config = {
  tables: Table[];
  rooms: Room[];
  tableAdjacencies: { tableAId: string; tableBId: string }[];
  combinations: Combination[];
  services: Service[];
  bookingPolicy: Policy;
  durationRules: {
    minParty: number;
    maxParty: number;
    durationMinutes: number;
    serviceId: string | null;
    roomId: string | null;
  }[];
  tableBlocks: Block[];
};
type Reservation = {
  id: string;
  date: string;
  time: string;
  partySize: number;
  status: string;
  channel: string;
  serviceId: string | null;
  startsAt: string;
  endsAt: string;
  durationMinutes: number;
  tableIds: string[];
  tables: { id: string; name: string }[];
  guestEmail: string | null;
};

const BLOCKING = new Set(["requested", "confirmed", "arrived", "seated"]);

// ---------------------------------------------------------------------------------------------
// Independent seating model
// ---------------------------------------------------------------------------------------------

type Option = {
  tableIds: string[];
  kind: "table" | "combination" | "joined";
  capacity: number;
  priority: number;
  roomId: string;
  name: string;
};

function options(cfg: Config, party: number, channel: "online" | "staff", service: Service | null): Option[] {
  const rooms = new Map(cfg.rooms.map((r) => [r.id, r]));
  const allowed = service && service.roomIds.length ? new Set(service.roomIds) : null;
  const eligible = new Map<string, Table & { cap: number }>();
  for (const t of cfg.tables) {
    const room = rooms.get(t.roomId);
    if (!t.isActive || !room?.isActive) continue;
    if (allowed && !allowed.has(t.roomId)) continue;
    if (channel === "online" && (!t.onlineBookable || !room.onlineBookable)) continue;
    const cap =
      channel === "online" && t.onlineMaxCovers ? Math.min(t.maxCovers, t.onlineMaxCovers) : t.maxCovers;
    eligible.set(t.id, { ...t, cap });
  }
  const out: Option[] = [];
  const seen = new Set<string>();
  const key = (ids: string[]) => [...ids].sort().join("+");
  for (const t of eligible.values()) {
    if (t.combinationOnly || party < t.minCovers || party > t.cap) continue;
    seen.add(key([t.id]));
    out.push({
      tableIds: [t.id],
      kind: "table",
      capacity: t.cap,
      priority: t.priority,
      roomId: t.roomId,
      name: t.name,
    });
  }
  for (const c of cfg.combinations) {
    if (!c.isActive || (channel === "online" && !c.onlineBookable)) continue;
    if (party < c.minCovers || party > c.maxCovers) continue;
    if (!c.tableIds.every((id) => eligible.has(id)) || seen.has(key(c.tableIds))) continue;
    seen.add(key(c.tableIds));
    out.push({
      tableIds: [...c.tableIds].sort(),
      kind: "combination",
      capacity: c.maxCovers,
      priority: c.priority,
      roomId: eligible.get(c.tableIds[0]!)!.roomId,
      name: c.name,
    });
  }
  // Joined: connected groups of 2-3 adjacent tables in one room, minimal for the party.
  const nb = new Map<string, Set<string>>();
  for (const { tableAId: a, tableBId: b } of cfg.tableAdjacencies) {
    const ta = eligible.get(a);
    const tb = eligible.get(b);
    if (!ta || !tb || ta.roomId !== tb.roomId) continue;
    (nb.get(a) ?? nb.set(a, new Set()).get(a)!).add(b);
    (nb.get(b) ?? nb.set(b, new Set()).get(b)!).add(a);
  }
  const groups = new Set<string>();
  for (const a of nb.keys()) {
    for (const b of nb.get(a)!) {
      groups.add(key([a, b]));
      for (const c of [...nb.get(a)!, ...nb.get(b)!]) if (c !== a && c !== b) groups.add(key([a, b, c]));
    }
  }
  for (const g of groups) {
    const ids = g.split("+");
    const members = ids.map((id) => eligible.get(id)!);
    const cap = members.reduce((s, t) => s + t.cap, 0);
    if (cap < party || members.some((t) => cap - t.cap >= party) || seen.has(g)) continue;
    out.push({
      tableIds: ids,
      kind: "joined",
      capacity: cap,
      priority: Math.round((members.reduce((s, t) => s + t.priority, 0) / members.length) * 100) / 100,
      roomId: members[0]!.roomId,
      name: members
        .map((t) => t.name)
        .sort()
        .join("+"),
    });
  }
  const rank = { table: 0, combination: 1, joined: 2 };
  const order = (id: string) => rooms.get(id)?.sortOrder ?? 0;
  const collator = new Intl.Collator("it", { numeric: true, sensitivity: "base" });
  return out.sort(
    (a, b) =>
      rank[a.kind] - rank[b.kind] ||
      a.capacity - b.capacity ||
      b.priority - a.priority ||
      a.tableIds.length - b.tableIds.length ||
      order(a.roomId) - order(b.roomId) ||
      collator.compare(a.name, b.name),
  );
}

function slotsOf(service: Service, policy: Policy): string[] {
  if (service.seatingMode === "fixed") return service.fixedSeatings;
  const step = service.slotIntervalMinutes ?? policy.slotIntervalMinutes;
  const out: string[] = [];
  for (let m = timeToMinutes(service.firstArrival); m <= timeToMinutes(service.lastArrival); m += step) {
    out.push(`${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);
  }
  return out;
}

const durationOf = (cfg: Config, party: number, serviceId: string | null, roomId: string | null) =>
  resolveDuration(
    cfg.durationRules,
    { partySize: party, serviceId, roomId },
    cfg.bookingPolicy.defaultDurationMinutes,
  );

/** Busy intervals per table (ms), from bookings and blocks. */
function busyOf(cfg: Config, day: Reservation[], channel: "online" | "staff", exclude?: string) {
  const busy = new Map<string, [number, number][]>();
  const add = (id: string, a: number, b: number) => (busy.get(id) ?? busy.set(id, []).get(id)!).push([a, b]);
  for (const r of day) {
    if (!BLOCKING.has(r.status) || r.id === exclude) continue;
    for (const id of r.tableIds) add(id, Date.parse(r.startsAt), Date.parse(r.endsAt));
  }
  for (const b of cfg.tableBlocks) {
    if (b.onlineOnly && channel !== "online") continue;
    const ids = b.tableId ? [b.tableId] : cfg.tables.filter((t) => t.roomId === b.roomId).map((t) => t.id);
    for (const id of ids) add(id, Date.parse(b.startsAt), Date.parse(b.endsAt));
  }
  return busy;
}
const isFree = (busy: Map<string, [number, number][]>, ids: string[], a: number, b: number) =>
  ids.every((id) => (busy.get(id) ?? []).every(([s, e]) => e <= a || s >= b));

/** The first free option at a time, as the engine should pick it. */
function firstFree(
  cfg: Config,
  opts: Option[],
  busy: Map<string, [number, number][]>,
  date: string,
  time: string,
  party: number,
  serviceId: string,
) {
  const start = localToInstant(date, timeToMinutes(time), TZ).getTime();
  for (const o of opts) {
    const end = start + durationOf(cfg, party, serviceId, o.roomId) * 60_000;
    if (isFree(busy, o.tableIds, start, end)) return o;
  }
  return null;
}

function pacingOk(
  cfg: Config,
  service: Service,
  day: Reservation[],
  date: string,
  time: string,
  party: number,
  exclude?: string,
) {
  const load = day.filter((r) => r.serviceId === service.id && BLOCKING.has(r.status) && r.id !== exclude);
  if (service.maxCovers !== null && load.reduce((s, r) => s + r.partySize, 0) + party > service.maxCovers)
    return false;
  const slots = slotsOf(service, cfg.bookingPolicy).map(timeToMinutes);
  const t = timeToMinutes(time);
  const i = slots.findIndex(
    (s, k) =>
      t >= s &&
      t < (slots[k + 1] ?? s + (service.slotIntervalMinutes ?? cfg.bookingPolicy.slotIntervalMinutes)),
  );
  if (i < 0) return true;
  const from = slots[i]!;
  const to = slots[i + 1] ?? from + (service.slotIntervalMinutes ?? cfg.bookingPolicy.slotIntervalMinutes);
  const inWindow = load.filter((r) => timeToMinutes(r.time) >= from && timeToMinutes(r.time) < to);
  if (
    service.maxCoversPerSlot !== null &&
    inWindow.reduce((s, r) => s + r.partySize, 0) + party > service.maxCoversPerSlot
  )
    return false;
  if (service.maxBookingsPerSlot !== null && inWindow.length + 1 > service.maxBookingsPerSlot) return false;
  return true;
}

const serviceAt = (cfg: Config, date: string, time: string) =>
  cfg.services.find(
    (s) =>
      s.isActive &&
      s.daysOfWeek.includes(isoWeekday(date)) &&
      timeToMinutes(time) >= timeToMinutes(s.firstArrival) &&
      timeToMinutes(time) <= timeToMinutes(s.lastArrival),
  ) ?? null;

// ---------------------------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------------------------

type Finding = { severity: "ERRORE" | "AVVISO" | "NOTA"; restaurant: string; what: string; detail: string };
const findings: Finding[] = [];
const stats = new Map<string, Map<string, number>>();
const count = (restaurant: string, key: string) => {
  const m = stats.get(restaurant) ?? stats.set(restaurant, new Map()).get(restaurant)!;
  m.set(key, (m.get(key) ?? 0) + 1);
};
const note = (f: Finding) => {
  if (findings.filter((x) => x.what === f.what && x.restaurant === f.restaurant).length < 12)
    findings.push(f);
  count(f.restaurant, `${f.severity}: ${f.what}`);
};

// ---------------------------------------------------------------------------------------------
// The session
// ---------------------------------------------------------------------------------------------

let ctx: TestContext;
let guest: Client;

beforeAll(async () => {
  ctx = await createTestApp();
  guest = client(ctx.app);
});
afterAll(async () => {
  if (ENABLED && process.env.SIM_REPORT) writeFileSync(process.env.SIM_REPORT, report());
  await ctx?.close();
});

/** The test clock is Friday 23 October 2026 10:00; 25 October is the DST change in Italy. */
const DAYS = ["2026-10-24", "2026-10-25", "2026-10-28", "2026-10-30", "2026-10-31"];

async function custom(owner: Awaited<ReturnType<typeof registerOwner>>) {
  const post = async (path: string, body: object) => {
    const res = await owner.api.post(`${owner.base}${path}`, body);
    if (res.status !== 201) throw new Error(`${path}: ${JSON.stringify(res.body)}`);
    return res.body.data;
  };
  const sala = await post("/rooms", { name: "Sala", sortOrder: 0 });
  const veranda = await post("/rooms", { name: "Veranda", sortOrder: 1 });
  const prive = await post("/rooms", { name: "Privè", sortOrder: 2, onlineBookable: false });
  const t: Record<string, { id: string }> = {};
  const table = async (room: { id: string }, name: string, min: number, max: number, extra: object = {}) =>
    (t[name] = await post("/tables", { roomId: room.id, name, minCovers: min, maxCovers: max, ...extra }));
  for (let i = 1; i <= 4; i++) await table(sala, `S${i}`, 1, 2, { priority: i <= 2 ? 10 : 0 });
  for (let i = 5; i <= 8; i++) await table(sala, `S${i}`, 2, 4, { onlineMaxCovers: i === 8 ? 2 : null });
  await table(sala, "S9", 4, 6, { priority: 5 });
  for (let i = 1; i <= 4; i++) await table(veranda, `V${i}`, 2, 4);
  await table(veranda, "V5", 1, 2, { onlineBookable: false });
  await table(prive, "P1", 6, 10);
  await table(prive, "P2", 2, 4, { combinationOnly: true });
  await table(prive, "P3", 2, 4, { combinationOnly: true });
  await owner.api.put(`${owner.base}/table-adjacencies`, {
    pairs: [
      ["S1", "S2"],
      ["S3", "S4"],
      ["S5", "S6"],
      ["S6", "S7"],
      ["S7", "S8"],
      ["V1", "V2"],
      ["V2", "V3"],
      ["V3", "V4"],
      ["P2", "P3"],
      ["P1", "P2"],
    ].map(([a, b]) => ({ tableAId: t[a!]!.id, tableBId: t[b!]!.id })),
  });
  await post("/combinations", {
    name: "Tavolata Privè",
    tableIds: [t.P2!.id, t.P3!.id],
    minCovers: 5,
    maxCovers: 8,
    priority: 0,
  });
  await post("/combinations", {
    name: "Sala grande",
    tableIds: [t.S9!.id, t.S8!.id],
    minCovers: 7,
    maxCovers: 10,
    priority: 20,
    onlineBookable: false,
  });
  await post("/services", {
    name: "Pranzo",
    daysOfWeek: [6, 7],
    firstArrival: "12:30",
    lastArrival: "14:00",
    roomIds: [sala.id, veranda.id],
  });
  await post("/services", {
    name: "Cena",
    daysOfWeek: [1, 2, 3, 4, 5, 6, 7],
    firstArrival: "19:00",
    lastArrival: "23:30",
    maxCoversPerSlot: 20,
    maxBookingsPerSlot: 6,
    maxCovers: 90,
  });
  await post("/duration-rules", { minParty: 5, maxParty: 20, durationMinutes: 150 });
  await post("/duration-rules", { minParty: 1, maxParty: 2, durationMinutes: 75, roomId: veranda.id });
  await owner.api.patch(`${owner.base}/booking-policy`, {
    maxPartyOnline: 8,
    onlinePartyLimits: [{ daysOfWeek: [5, 6], from: "20:00", to: "21:00", maxParty: 4 }],
  });
  // A table out of service on Saturday evening, another closed to online bookings only.
  await post("/table-blocks", {
    tableId: t.V1!.id,
    startsAt: "2026-10-24T18:00:00Z",
    endsAt: "2026-10-24T22:00:00Z",
  });
  await post("/table-blocks", {
    tableId: t.S5!.id,
    startsAt: "2026-10-24T17:00:00Z",
    endsAt: "2026-10-24T23:00:00Z",
    onlineOnly: true,
  });
}

async function runRestaurant(
  name: string,
  setup: (owner: Awaited<ReturnType<typeof registerOwner>>) => Promise<void>,
) {
  const owner = await registerOwner(ctx.app, name);
  await setup(owner);
  await owner.api.patch(`${owner.base}/booking-policy`, { requireEmail: false });
  const cfgRes = await owner.api.get(`${owner.base}/config`);
  const cfg = cfgRes.body.data as Config;
  const blocks = await owner.api.get(
    `${owner.base}/table-blocks?from=2026-10-01T00:00:00Z&to=2026-12-01T00:00:00Z`,
  );
  cfg.tableBlocks = (blocks.body.data ?? []) as Block[];
  const slug = (await owner.api.get(`${owner.base}/booking-page`)).body.data.slug as string;
  const names = new Map(cfg.tables.map((t) => [t.id, t.name]));
  const label = (ids: string[]) => ids.map((id) => names.get(id)).join("+") || "nessuno";
  const days = DAYS.filter((d) =>
    cfg.services.some((s) => s.isActive && s.daysOfWeek.includes(isoWeekday(d))),
  );
  const dayOf = async (date: string) =>
    (await owner.api.get(`${owner.base}/reservations?date=${date}`)).body.data as Reservation[];
  const tokens = new Map<string, string>();
  const assignedAs = new Map<string, "online" | "staff">();
  let n = 0;

  /** Checks a booking right after the engine placed it, against the state just before. */
  function checkPlacement(
    op: string,
    before: Reservation[],
    r: Reservation,
    channel: "online" | "staff",
    movedFrom?: string[],
  ) {
    const service = cfg.services.find((s) => s.id === r.serviceId) ?? null;
    const opts = options(cfg, r.partySize, channel, service);
    const valid = opts.find((o) => o.tableIds.join("+") === [...r.tableIds].sort().join("+"));
    const where = `${r.date} ${r.time}, ${r.partySize} pers. (${channel}) → ${label(r.tableIds)}`;
    if (r.tableIds.length === 0) {
      if (r.status !== "requested")
        note({
          severity: "ERRORE",
          restaurant: name,
          what: "Prenotazione confermata senza tavolo",
          detail: `${op}: ${where}`,
        });
      return;
    }
    if (!valid) {
      note({
        severity: "ERRORE",
        restaurant: name,
        what: "Tavoli non validi per il gruppo",
        detail: `${op}: ${where}`,
      });
      return;
    }
    const busy = busyOf(cfg, before, channel, r.id);
    const start = Date.parse(r.startsAt);
    if (!isFree(busy, r.tableIds, start, Date.parse(r.endsAt))) {
      note({
        severity: "ERRORE",
        restaurant: name,
        what: "Tavolo già occupato o bloccato",
        detail: `${op}: ${where}`,
      });
    }
    const expectedDuration = durationOf(cfg, r.partySize, r.serviceId, valid.roomId);
    if (op !== "modifica staff" && r.durationMinutes !== expectedDuration) {
      note({
        severity: "AVVISO",
        restaurant: name,
        what: "Durata diversa dalle regole",
        detail: `${op}: ${where}: ${r.durationMinutes} min invece di ${expectedDuration}`,
      });
    }
    // Was there a better free option by the engine's own ranking? (Moves keep tables on purpose.)
    if (!movedFrom) {
      const best = firstFree(cfg, opts, busy, r.date, r.time, r.partySize, r.serviceId!);
      if (best && best.tableIds.join("+") !== valid.tableIds.join("+")) {
        note({
          severity: "AVVISO",
          restaurant: name,
          what: "Scelta diversa dalla migliore disponibile",
          detail: `${op}: ${where}, migliore: ${label(best.tableIds)}`,
        });
      }
    }
    // Wasted seats: a free option with fewer seats existed (informative: priority and kind come first).
    const tighter = opts.find(
      (o) =>
        o.capacity < valid.capacity &&
        isFree(busy, o.tableIds, start, start + durationOf(cfg, r.partySize, r.serviceId, o.roomId) * 60_000),
    );
    if (tighter && !movedFrom) {
      note({
        severity: "NOTA",
        restaurant: name,
        what: "Posti sprecati (c'era un tavolo più adatto libero)",
        detail: `${op}: ${where} (${valid.capacity} posti), libero ${label(tighter.tableIds)} (${tighter.capacity} posti)`,
      });
    }
    if (
      movedFrom &&
      movedFrom.length > 1 &&
      r.tableIds.length >= movedFrom.length &&
      r.tableIds.every((id) => movedFrom.includes(id))
    ) {
      const smaller = opts.find(
        (o) => o.tableIds.length < r.tableIds.length && o.tableIds.every((id) => movedFrom.includes(id)),
      );
      if (smaller)
        note({
          severity: "AVVISO",
          restaurant: name,
          what: "Tavolo unito non liberato con meno persone",
          detail: `${op}: ${where}`,
        });
    }
  }

  async function onlineBooking() {
    const date = pick(days);
    const party = weighted(PARTY);
    const before = await dayOf(date);
    const avail = (
      await guest.get(`/v1/public/restaurants/${slug}/availability?date=${date}&partySize=${party}`)
    ).body.data;
    const offered: string[] = (avail.services ?? []).flatMap((s: { times: string[] }) => s.times);
    const forced = rand() < 0.15 || offered.length === 0;
    const allSlots = cfg.services
      .filter((s) => s.daysOfWeek.includes(isoWeekday(date)))
      .flatMap((s) => slotsOf(s, cfg.bookingPolicy));
    const time = forced ? pick(allSlots.length ? allSlots : ["20:00"]) : pick(offered);
    n++;
    const email = `g${n}@sim.test`;
    const res = await guest.post(`/v1/public/restaurants/${slug}/reservations`, {
      date,
      time,
      partySize: party,
      guestName: `Ospite ${n}`,
      guestPhone: `333${String(1000000 + n)}`,
      guestEmail: email,
      guestNote: null,
      privacyAccepted: true,
    });
    const ok = res.status === 201;
    count(name, ok ? "online: prenotate" : `online: rifiutate (${res.body.error?.code})`);
    if (avail.mode === "book") {
      if (offered.includes(time) && !ok) {
        note({
          severity: "ERRORE",
          restaurant: name,
          what: "Orario offerto online ma prenotazione rifiutata",
          detail: `${date} ${time}, ${party} pers.: ${res.body.error?.code}`,
        });
      }
      if (!offered.includes(time) && ok) {
        note({
          severity: "ERRORE",
          restaurant: name,
          what: "Prenotazione online accettata a un orario non offerto",
          detail: `${date} ${time}, ${party} pers.`,
        });
      }
    }
    if (!ok) return;
    const r = (await owner.api.get(`${owner.base}/reservations/${res.body.data.id}`)).body
      .data as Reservation;
    assignedAs.set(r.id, "online");
    const token = /\/prenotazione\/([\w.-]+)/.exec(
      ctx.sentEmails.filter((e) => e.to === email).at(-1)?.text ?? "",
    )?.[1];
    if (token) tokens.set(r.id, token);
    if (avail.mode === "request") {
      count(name, "online: richieste gruppi");
      if (r.status !== "requested")
        note({
          severity: "ERRORE",
          restaurant: name,
          what: "Gruppo oltre il massimo online confermato in automatico",
          detail: `${date} ${time}, ${party} pers.`,
        });
      return;
    }
    checkPlacement("online", before, r, "online");
    const limit = onlinePartyLimitAt(
      cfg.bookingPolicy.onlinePartyLimits,
      isoWeekday(date),
      timeToMinutes(time),
    );
    if (limit !== null && party > limit) {
      note({
        severity: "ERRORE",
        restaurant: name,
        what: "Limite persone per fascia oraria superato online",
        detail: `${date} ${time}, ${party} pers. (max ${limit})`,
      });
    }
  }

  async function staffBooking(walkIn = false) {
    const date = pick(days);
    const party = weighted(PARTY);
    const services = cfg.services.filter((s) => s.isActive && s.daysOfWeek.includes(isoWeekday(date)));
    const service = pick(services);
    const time = pick(slotsOf(service, cfg.bookingPolicy));
    const before = await dayOf(date);
    n++;
    const res = await owner.api.post(`${owner.base}/reservations`, {
      date,
      time,
      partySize: party,
      guestName: `${walkIn ? "Walk-in" : "Cliente"} ${n}`,
      ...(walkIn ? { channel: "walk_in" } : { guestPhone: `347${String(1000000 + n)}` }),
    });
    const kind = walkIn ? "walk-in" : "staff";
    const ok = res.status === 201;
    count(name, ok ? `${kind}: inserite` : `${kind}: rifiutate (${res.body.error?.code})`);
    const opts = options(cfg, party, "staff", serviceAt(cfg, date, time) ?? service);
    const free = firstFree(cfg, opts, busyOf(cfg, before, "staff"), date, time, party, service.id);
    const pacing = pacingOk(cfg, serviceAt(cfg, date, time) ?? service, before, date, time, party);
    if (
      !ok &&
      free &&
      pacing &&
      !["pacing_covers", "pacing_bookings", "service_full"].includes(res.body.error?.code)
    ) {
      note({
        severity: "ERRORE",
        restaurant: name,
        what: "Prenotazione staff rifiutata ma c'era un tavolo libero",
        detail: `${date} ${time}, ${party} pers.: ${res.body.error?.code}, libero ${label(free.tableIds)}`,
      });
    }
    if (ok && (!free || !pacing)) {
      note({
        severity: "ERRORE",
        restaurant: name,
        what: "Prenotazione staff accettata senza posto o oltre il ritmo",
        detail: `${date} ${time}, ${party} pers. → ${label(res.body.data.tableIds)}`,
      });
    }
    if (!ok) return;
    assignedAs.set(res.body.data.id, "staff");
    checkPlacement(kind, before, res.body.data as Reservation, "staff");
  }

  async function active(): Promise<Reservation | null> {
    const date = pick(days);
    const list = (await dayOf(date)).filter((r) => BLOCKING.has(r.status) && r.tableIds.length > 0);
    return list.length ? pick(list) : null;
  }

  async function staffEdit() {
    const r = await active();
    if (!r) return;
    const service = cfg.services.find((s) => s.id === r.serviceId);
    if (!service) return;
    const change =
      rand() < 0.5
        ? { partySize: Math.max(1, r.partySize + pick([-3, -2, -1, 1, 2, 3])) }
        : { time: pick(slotsOf(service, cfg.bookingPolicy)) };
    const before = await dayOf(r.date);
    const res = await owner.api.patch(`${owner.base}/reservations/${r.id}`, change);
    count(
      name,
      res.status === 200 ? "modifica staff: ok" : `modifica staff: rifiutata (${res.body.error?.code})`,
    );
    if (res.status !== 200) {
      const time = "time" in change ? change.time! : r.time;
      const party = "partySize" in change ? change.partySize! : r.partySize;
      const svc = serviceAt(cfg, r.date, time) ?? service;
      const busy = busyOf(cfg, before, "staff", r.id);
      const free = firstFree(cfg, options(cfg, party, "staff", svc), busy, r.date, time, party, svc.id);
      if (
        free &&
        pacingOk(cfg, svc, before, r.date, time, party, r.id) &&
        res.body.error?.code !== "invalid_service"
      ) {
        note({
          severity: "ERRORE",
          restaurant: name,
          what: "Modifica staff rifiutata ma c'era un tavolo libero",
          detail: `${r.date} ${r.time}→${time}, ${r.partySize}→${party} pers.: ${res.body.error?.code}, libero ${label(free.tableIds)}`,
        });
      }
      return;
    }
    assignedAs.set(r.id, "staff");
    checkPlacement("modifica staff", before, res.body.data as Reservation, "staff", r.tableIds);
  }

  async function guestChange() {
    const candidates = [...tokens.entries()];
    if (!candidates.length) return;
    const [id, token] = pick(candidates);
    const view = (await guest.get(`/v1/public/bookings/${token}`)).body.data;
    if (!view?.canModify) return;
    const party = Math.max(1, view.booking.partySize + pick([-2, -1, 1, 2]));
    const date = view.booking.date;
    const avail = (
      await guest.get(`/v1/public/bookings/${token}/availability?date=${date}&partySize=${party}`)
    ).body.data;
    const times: string[] = (avail.services ?? []).flatMap((s: { times: string[] }) => s.times);
    if (!times.length) return count(name, "modifica cliente: nessun orario");
    const time = times.includes(view.booking.time) && rand() < 0.6 ? view.booking.time : pick(times);
    const before = await dayOf(date);
    const old = before.find((r) => r.id === id)!;
    const res = await guest.post(`/v1/public/bookings/${token}/change`, { date, time, partySize: party });
    count(
      name,
      res.status === 200 ? "modifica cliente: ok" : `modifica cliente: rifiutata (${res.body.error?.code})`,
    );
    if (res.status !== 200) {
      note({
        severity: "ERRORE",
        restaurant: name,
        what: "Modifica del cliente rifiutata a un orario offerto",
        detail: `${date} ${time}, ${party} pers.: ${res.body.error?.code}`,
      });
      return;
    }
    const r = (await owner.api.get(`${owner.base}/reservations/${id}`)).body.data as Reservation;
    // Tables the guest already had (maybe chosen by staff) may stay even if not offered online.
    const kept = r.tableIds.every((t) => old.tableIds.includes(t));
    checkPlacement("modifica cliente", before, r, kept ? "staff" : "online", old.tableIds);
    // Moved although the old tables (or part of them) still suited the party at that time.
    const service = cfg.services.find((x) => x.id === r.serviceId) ?? null;
    const stillFits = options(cfg, party, "staff", service).some(
      (o) =>
        o.tableIds.every((t) => old.tableIds.includes(t)) &&
        isFree(busyOf(cfg, before, "staff", id), o.tableIds, Date.parse(r.startsAt), Date.parse(r.endsAt)),
    );
    if (time === old.time && stillFits && !r.tableIds.every((t) => old.tableIds.includes(t))) {
      note({
        severity: "AVVISO",
        restaurant: name,
        what: "Cliente spostato senza bisogno",
        detail: `${date} ${time}, ${old.partySize}→${party} pers.: ${label(old.tableIds)} → ${label(r.tableIds)}`,
      });
    }
  }

  async function status(to: "cancelled" | "no_show" | "seated") {
    const r = await active();
    if (!r) return;
    const res = await owner.api.post(`${owner.base}/reservations/${r.id}/status`, { status: to });
    count(name, `stato ${to}: ${res.status === 200 ? "ok" : res.body.error?.code}`);
  }

  for (let i = 0; i < OPS; i++) {
    const op = weighted<() => Promise<unknown>>([
      [onlineBooking, 38],
      [() => staffBooking(false), 25],
      [() => staffBooking(true), 5],
      [staffEdit, 12],
      [guestChange, 9],
      [() => status("cancelled"), 7],
      [() => status("no_show"), 2],
      [() => status("seated"), 2],
    ]);
    await op();
  }

  // ---- Final state: overlaps, capacity, pacing, and availability against an independent model ----
  for (const date of days) {
    const day = await dayOf(date);
    const active = day.filter((r) => BLOCKING.has(r.status));
    stats.get(name)!.set(`giorno ${date}: prenotazioni attive`, active.length);
    stats.get(name)!.set(
      `giorno ${date}: coperti`,
      active.reduce((s, r) => s + r.partySize, 0),
    );
    for (let i = 0; i < active.length; i++) {
      for (let j = i + 1; j < active.length; j++) {
        const a = active[i]!;
        const b = active[j]!;
        const shared = a.tableIds.filter((t) => b.tableIds.includes(t));
        if (
          shared.length &&
          Date.parse(a.startsAt) < Date.parse(b.endsAt) &&
          Date.parse(b.startsAt) < Date.parse(a.endsAt)
        ) {
          note({
            severity: "ERRORE",
            restaurant: name,
            what: "Due prenotazioni sullo stesso tavolo alla stessa ora",
            detail: `${date}: ${a.time} e ${b.time} su ${label(shared)}`,
          });
        }
      }
    }
    for (const r of active) {
      const seats = r.tableIds.reduce(
        (s, id) => s + (cfg.tables.find((t) => t.id === id)?.maxCovers ?? 0),
        0,
      );
      if (r.tableIds.length && seats < r.partySize) {
        note({
          severity: "ERRORE",
          restaurant: name,
          what: "Tavoli troppo piccoli per il gruppo",
          detail: `${date} ${r.time}: ${r.partySize} pers. su ${label(r.tableIds)} (${seats} posti)`,
        });
      }
    }
    for (const service of cfg.services.filter((s) => s.daysOfWeek.includes(isoWeekday(date)))) {
      const load = active.filter((r) => r.serviceId === service.id);
      const covers = load.reduce((s, r) => s + r.partySize, 0);
      if (service.maxCovers !== null && covers > service.maxCovers) {
        note({
          severity: "ERRORE",
          restaurant: name,
          what: "Coperti massimi del servizio superati",
          detail: `${date} ${service.name}: ${covers}/${service.maxCovers}`,
        });
      }
    }
    // Availability, online and staff, for several party sizes.
    for (const party of [1, 2, 3, 4, 5, 6, 8]) {
      const online = (
        await guest.get(`/v1/public/restaurants/${slug}/availability?date=${date}&partySize=${party}`)
      ).body.data;
      const staff = (
        await owner.api.get(`${owner.base}/availability?date=${date}&partySize=${party}&channel=staff`)
      ).body.data;
      for (const service of cfg.services.filter(
        (s) => s.isActive && s.daysOfWeek.includes(isoWeekday(date)),
      )) {
        const staffSlots =
          staff.services.find((s: { serviceId: string }) => s.serviceId === service.id)?.slots ?? [];
        const onlineTimes: string[] =
          online.mode === "book"
            ? (online.services.find((s: { serviceId: string }) => s.serviceId === service.id)?.times ?? [])
            : [];
        for (const time of slotsOf(service, cfg.bookingPolicy)) {
          const pacing = pacingOk(cfg, service, day, date, time, party);
          const staffFree =
            !!firstFree(
              cfg,
              options(cfg, party, "staff", service),
              busyOf(cfg, day, "staff"),
              date,
              time,
              party,
              service.id,
            ) && pacing;
          const said = staffSlots.find((s: { time: string }) => s.time === time)?.available ?? false;
          if (said !== staffFree) {
            note({
              severity: "ERRORE",
              restaurant: name,
              what: "Disponibilità staff diversa dal controllo indipendente",
              detail: `${date} ${time}, ${party} pers.: app ${said ? "libero" : "pieno"}, controllo ${staffFree ? "libero" : "pieno"}`,
            });
          }
          if (online.mode !== "book" || !service.onlineBookable) continue;
          const limit = onlinePartyLimitAt(
            cfg.bookingPolicy.onlinePartyLimits,
            isoWeekday(date),
            timeToMinutes(time),
          );
          const onlineFree =
            (limit === null || party <= limit) &&
            pacing &&
            !!firstFree(
              cfg,
              options(cfg, party, "online", service),
              busyOf(cfg, day, "online"),
              date,
              time,
              party,
              service.id,
            );
          if (onlineTimes.includes(time) !== onlineFree) {
            note({
              severity: "ERRORE",
              restaurant: name,
              what: "Disponibilità online diversa dal controllo indipendente",
              detail: `${date} ${time}, ${party} pers.: app ${onlineTimes.includes(time) ? "libero" : "pieno"}, controllo ${onlineFree ? "libero" : "pieno"}`,
            });
          }
        }
      }
    }
  }
  count(name, "operazioni simulate");
  stats.get(name)!.set("operazioni simulate", OPS);
}

function report() {
  const lines = [
    "# Simulazione prenotazioni",
    "",
    `Seme ${process.env.SIM_SEED ?? 20261023}, ${OPS} operazioni per ristorante.`,
    "",
  ];
  for (const [restaurant, m] of stats) {
    lines.push(`## ${restaurant}`, "");
    for (const [k, v] of [...m.entries()].sort()) lines.push(`- ${k}: ${v}`);
    lines.push("");
  }
  lines.push("## Esempi", "");
  for (const f of findings) lines.push(`- **${f.severity}** · ${f.restaurant} · ${f.what}: ${f.detail}`);
  return lines.join("\n");
}

describe.runIf(ENABLED)("booking simulation", () => {
  it("trattoria", async () => {
    await runRestaurant("Trattoria (modello)", (o) =>
      o.api.post(`${o.base}/setup/apply-template`, { template: "trattoria" }).then(() => undefined),
    );
  }, 600_000);
  it("pizzeria", async () => {
    await runRestaurant("Pizzeria a turni (modello)", (o) =>
      o.api.post(`${o.base}/setup/apply-template`, { template: "pizzeria_turni" }).then(() => undefined),
    );
  }, 600_000);
  it("fine dining", async () => {
    await runRestaurant("Fine dining (modello)", (o) =>
      o.api.post(`${o.base}/setup/apply-template`, { template: "fine_dining" }).then(() => undefined),
    );
  }, 600_000);
  it("custom", async () => {
    await runRestaurant("Ristorante su misura", custom);
  }, 600_000);
  it("has no errors", () => {
    expect(findings.filter((f) => f.severity === "ERRORE")).toEqual([]);
  });
});
