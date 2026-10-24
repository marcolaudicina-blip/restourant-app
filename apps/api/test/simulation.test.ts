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
/** 2 adds manual moves, reinstated bookings, day changes, rushes, waiting lists, live config changes. */
const LEVEL = Number(process.env.SIM_LEVEL ?? 1);
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
  validFrom: string | null;
  validTo: string | null;
};
type Exception = {
  kind: "closed" | "special_hours";
  scope: "all" | "online";
  dateFrom: string;
  dateTo: string;
  serviceId: string | null;
  firstArrival: string | null;
  lastArrival: string | null;
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
  calendarExceptions: Exception[];
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

/** The services open on a date for a channel, with special hours applied (like buildDaySchedule). */
function openServices(cfg: Config, date: string, channel: "online" | "staff"): Service[] {
  const today = cfg.calendarExceptions.filter((e) => date >= e.dateFrom && date <= e.dateTo);
  return cfg.services.flatMap((s) => {
    const applies = (e: Exception) => e.serviceId === null || e.serviceId === s.id;
    const special = today.find((e) => e.kind === "special_hours" && e.serviceId === s.id);
    if (!s.isActive) return [];
    if ((s.validFrom && date < s.validFrom) || (s.validTo && date > s.validTo)) return [];
    if (today.some((e) => e.kind === "closed" && e.scope === "all" && applies(e))) return [];
    if (!special && !s.daysOfWeek.includes(isoWeekday(date))) return [];
    if (channel === "online") {
      if (!s.onlineBookable) return [];
      if (today.some((e) => e.kind === "closed" && e.scope === "online" && applies(e))) return [];
    }
    return [
      {
        ...s,
        firstArrival: special?.firstArrival ?? s.firstArrival,
        lastArrival: special?.lastArrival ?? s.lastArrival,
      },
    ];
  });
}

/** The service staff bookings get at a time: the first open one whose arrival window has it. */
const serviceByWindow = (cfg: Config, date: string, time: string) =>
  openServices(cfg, date, "staff").find(
    (s) =>
      timeToMinutes(time) >= timeToMinutes(s.firstArrival) &&
      timeToMinutes(time) <= timeToMinutes(s.lastArrival),
  ) ?? null;

const serviceAt = (cfg: Config, date: string, time: string) =>
  openServices(cfg, date, "staff").find((s) => slotsOf(s, cfg.bookingPolicy).includes(time)) ?? null;

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

/** A big place: three rooms, long rows of joinable tables, overlapping combinations, seasonal brunch. */
async function big(owner: Awaited<ReturnType<typeof registerOwner>>) {
  const post = async (path: string, body: object) => {
    const res = await owner.api.post(`${owner.base}${path}`, body);
    if (res.status !== 201) throw new Error(`${path}: ${JSON.stringify(res.body)}`);
    return res.body.data;
  };
  const a = await post("/rooms", { name: "Sala A", sortOrder: 0 });
  const b = await post("/rooms", { name: "Sala B", sortOrder: 1 });
  const g = await post("/rooms", { name: "Giardino", sortOrder: 2 });
  const t: Record<string, { id: string }> = {};
  const table = async (room: { id: string }, name: string, min: number, max: number, extra: object = {}) =>
    (t[name] = await post("/tables", { roomId: room.id, name, minCovers: min, maxCovers: max, ...extra }));
  for (let i = 1; i <= 8; i++) await table(a, `A${i}`, 1, 2, { priority: i % 3 });
  for (let i = 9; i <= 16; i++) await table(a, `A${i}`, 2, 4, { priority: i % 4 });
  for (let i = 17; i <= 20; i++) await table(a, `A${i}`, 4, 6, { priority: i === 20 ? 30 : 0 });
  await table(a, "A21", 3, 3);
  for (let i = 1; i <= 10; i++) await table(b, `B${i}`, 2, 4, { onlineMaxCovers: i > 8 ? 2 : null });
  for (let i = 1; i <= 8; i++) await table(g, `G${i}`, 2, 4);
  const pairs: [string, string][] = [];
  for (let i = 1; i < 8; i += 2) pairs.push([`A${i}`, `A${i + 1}`]);
  for (let i = 9; i < 16; i++) pairs.push([`A${i}`, `A${i + 1}`]);
  pairs.push(["A17", "A18"], ["A19", "A20"]);
  for (let i = 1; i < 10; i++) pairs.push([`B${i}`, `B${i + 1}`]);
  for (let i = 1; i < 8; i++) pairs.push([`G${i}`, `G${i + 1}`]);
  await owner.api.put(`${owner.base}/table-adjacencies`, {
    pairs: pairs.map(([x, y]) => ({ tableAId: t[x]!.id, tableBId: t[y]!.id })),
  });
  await post("/combinations", {
    name: "Fila B1-B4",
    tableIds: ["B1", "B2", "B3", "B4"].map((x) => t[x]!.id),
    minCovers: 10,
    maxCovers: 16,
    priority: 5,
  });
  await post("/combinations", {
    name: "Fila B3-B6",
    tableIds: ["B3", "B4", "B5", "B6"].map((x) => t[x]!.id),
    minCovers: 10,
    maxCovers: 16,
    priority: 2,
  });
  await post("/combinations", {
    name: "Doppio 6",
    tableIds: ["A17", "A18"].map((x) => t[x]!.id),
    minCovers: 7,
    maxCovers: 12,
    priority: 0,
  });
  await post("/services", {
    name: "Pranzo",
    daysOfWeek: [1, 2, 3, 4, 5, 6, 7],
    firstArrival: "12:00",
    lastArrival: "14:30",
    roomIds: [a.id, b.id],
  });
  await post("/services", {
    name: "Cena",
    daysOfWeek: [1, 2, 3, 4, 5, 6, 7],
    firstArrival: "19:00",
    lastArrival: "23:00",
    maxCoversPerSlot: 30,
    maxBookingsPerSlot: 10,
  });
  await post("/services", {
    name: "Brunch",
    daysOfWeek: [7],
    firstArrival: "11:00",
    lastArrival: "12:30",
    seatingMode: "fixed",
    fixedSeatings: ["11:00", "12:30"],
    roomIds: [g.id],
    validFrom: "2026-10-25",
    maxCovers: 30,
  });
  await post("/duration-rules", { minParty: 1, maxParty: 4, durationMinutes: 90 });
  await post("/duration-rules", { minParty: 5, maxParty: 10, durationMinutes: 135 });
  await post("/duration-rules", { minParty: 11, maxParty: 100, durationMinutes: 180 });
  await owner.api.patch(`${owner.base}/booking-policy`, {
    maxPartyOnline: 12,
    confirmationMode: "auto_up_to",
    autoConfirmMaxParty: 6,
    onlinePartyLimits: [{ daysOfWeek: [6], from: "21:00", to: "22:00", maxParty: 6 }],
  });
}

async function runRestaurant(
  name: string,
  setup: (owner: Awaited<ReturnType<typeof registerOwner>>) => Promise<void>,
) {
  const owner = await registerOwner(ctx.app, name);
  await setup(owner);
  await owner.api.patch(`${owner.base}/booking-policy`, { requireEmail: false });
  let cfg = {} as Config;
  /** Re-reads the configuration (after changes made in the middle of the session). */
  async function reload() {
    const next = (await owner.api.get(`${owner.base}/config`)).body.data as Config;
    const blocks = await owner.api.get(
      `${owner.base}/table-blocks?from=2026-10-01T00:00:00Z&to=2026-12-01T00:00:00Z`,
    );
    next.tableBlocks = (blocks.body.data ?? []) as Block[];
    next.calendarExceptions = next.calendarExceptions ?? [];
    cfg = next;
  }
  await reload();
  const slug = (await owner.api.get(`${owner.base}/booking-page`)).body.data.slug as string;
  const names = new Map(cfg.tables.map((t) => [t.id, t.name]));
  const label = (ids: string[]) => ids.map((id) => names.get(id)).join("+") || "nessuno";
  const days = DAYS.filter((d) => openServices(cfg, d, "staff").length > 0);
  const dayOf = async (date: string) =>
    (await owner.api.get(`${owner.base}/reservations?date=${date}`)).body.data as Reservation[];
  const tokens = new Map<string, string>();
  /** Days where staff knowingly went past the service limits (reinstated bookings). */
  const overLimit = new Set<string>();
  const assignedAs = new Map<string, "online" | "staff">();
  let n = 0;

  const tableById = (id: string) => cfg.tables.find((t) => t.id === id);
  /** Tables a booking keeps after a change: still big enough, in a room of its service (staff rules). */
  function keptTablesOk(r: Reservation, service: Service | null) {
    const tables = r.tableIds.map(tableById);
    if (tables.some((t) => !t)) return false;
    const seats = tables.reduce((sum, t) => sum + t!.maxCovers, 0);
    if (seats < r.partySize || (tables.length === 1 && r.partySize < tables[0]!.minCovers)) return false;
    return !service?.roomIds.length || tables.every((t) => service.roomIds.includes(t!.roomId));
  }

  /** Checks a booking right after the engine placed it, against the state just before. */
  function checkPlacement(
    op: string,
    before: Reservation[],
    r: Reservation,
    channel: "online" | "staff",
    movedFrom?: string[],
    /** The change lowered the party size (joined tables should then be freed). */
    fewer = false,
  ) {
    const service = cfg.services.find((s) => s.id === r.serviceId) ?? null;
    const opts = options(cfg, r.partySize, channel, service);
    const kept = !!movedFrom && r.tableIds.length > 0 && r.tableIds.every((id) => movedFrom.includes(id));
    const keptValid = kept && keptTablesOk(r, service);
    const valid =
      opts.find((o) => o.tableIds.join("+") === [...r.tableIds].sort().join("+")) ??
      (keptValid
        ? {
            tableIds: [...r.tableIds].sort(),
            kind: "table" as const,
            capacity: r.tableIds.reduce((s2, id) => s2 + (tableById(id)?.maxCovers ?? 0), 0),
            priority: 0,
            roomId: tableById(r.tableIds[0]!)!.roomId,
            name: label(r.tableIds),
          }
        : undefined);
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
    if (!movedFrom && r.durationMinutes !== expectedDuration) {
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
      fewer &&
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

  // ---- History and emails: every change leaves its trace, guests hear what they should ----

  type Trail = { history: number; emails: number; email: string | null };
  const EMAIL_KINDS: [RegExp, string][] = [
    [/^Prenotazione confermata/, "confermata"],
    [/^Richiesta di prenotazione ricevuta/, "richiesta"],
    [/^Prenotazione modificata/, "modificata"],
    [/^Prenotazione cancellata/, "cancellata"],
  ];
  const emailsTo = (address: string | null) =>
    address ? ctx.sentEmails.filter((e) => e.to === address) : [];
  async function historyOf(id: string) {
    return (await owner.api.get(`${owner.base}/reservations/${id}/history`)).body.data as {
      title: string;
      actor: { kind: string; name: string };
      lines: string[];
    }[];
  }
  async function trail(r: { id: string; guestEmail: string | null }): Promise<Trail> {
    return {
      history: (await historyOf(r.id)).length,
      emails: emailsTo(r.guestEmail).length,
      email: r.guestEmail,
    };
  }
  /**
   * Checks the new history entries and emails after an operation. `email` is the email the guest
   * should get (null: none); history lines are derived from what changed between `was` and `now`.
   */
  async function checkTrail(
    op: string,
    t: Trail,
    was: Reservation | null,
    now: Reservation,
    actor: "staff" | "guest",
    email: string | null,
    extra: { title?: RegExp; lines?: RegExp[] } = {},
  ) {
    const history = (await historyOf(now.id)).slice(t.history).filter((h) => !h.title.startsWith("Email"));
    const where = `${op}: ${now.date} ${now.time}, ${now.partySize} pers.`;
    const entry = history[0];
    if (!entry) {
      note({
        severity: "ERRORE",
        restaurant: name,
        what: "Modifica senza riga nello storico",
        detail: where,
      });
    } else {
      if (entry.actor.kind !== actor) {
        note({
          severity: "ERRORE",
          restaurant: name,
          what: "Storico: autore sbagliato",
          detail: `${where}: ${entry.actor.kind} invece di ${actor}`,
        });
      }
      const expected: RegExp[] = [...(extra.lines ?? [])];
      if (was) {
        if (was.time !== now.time) expected.push(new RegExp(`^Ora: ${was.time} → ${now.time}$`));
        if (was.partySize !== now.partySize)
          expected.push(new RegExp(`^Persone: ${was.partySize} → ${now.partySize}$`));
        if (was.date !== now.date) expected.push(/^Giorno: .+ → .+/);
        if ([...was.tableIds].sort().join() !== [...now.tableIds].sort().join() && now.tableIds.length)
          expected.push(/^Tavolo: .+ → .+/);
        if (was.status !== now.status) expected.push(/^Stato: .+ → .+/);
      }
      for (const re of expected) {
        if (!entry.lines.some((l) => re.test(l))) {
          note({
            severity: "ERRORE",
            restaurant: name,
            what: "Storico: manca una modifica",
            detail: `${where}: atteso ${re.source}, righe: ${entry.lines.join(" | ") || "nessuna"}`,
          });
        }
      }
      if (extra.title && !extra.title.test(entry.title)) {
        note({
          severity: "ERRORE",
          restaurant: name,
          what: "Storico: titolo sbagliato",
          detail: `${where}: «${entry.title}»`,
        });
      }
    }
    const sent = emailsTo(t.email)
      .slice(t.emails)
      .map((e) => EMAIL_KINDS.find(([re]) => re.test(e.subject))?.[1] ?? e.subject);
    const got = sent.join(",") || null;
    if (got !== email) {
      note({
        severity: "ERRORE",
        restaurant: name,
        what: "Email al cliente sbagliata o mancante",
        detail: `${where}: attesa ${email ?? "nessuna"}, inviata ${got ?? "nessuna"}`,
      });
    }
    count(name, `storico ed email verificati`);
  }
  const ACTIVE_STATUSES = new Set(["requested", "confirmed"]);
  /** The email staff changes should send, by the rules (emails to staff bookings are on by default). */
  function staffEmail(was: Reservation, now: Reservation): string | null {
    if (!now.guestEmail || now.channel === "walk_in") return null;
    if (now.status === "cancelled") return ACTIVE_STATUSES.has(was.status) ? "cancellata" : null;
    if (was.status === "requested" && now.status === "confirmed") return "confermata";
    if (was.status === "cancelled" && ACTIVE_STATUSES.has(now.status)) return "confermata";
    const moved = was.date !== now.date || was.time !== now.time || was.partySize !== now.partySize;
    return ACTIVE_STATUSES.has(now.status) && moved ? "modificata" : null;
  }
  const getReservation = async (id: string) =>
    (await owner.api.get(`${owner.base}/reservations/${id}`)).body.data as Reservation;

  async function onlineBooking() {
    const date = pick(days);
    const party = weighted(PARTY);
    const before = await dayOf(date);
    const avail = (
      await guest.get(`/v1/public/restaurants/${slug}/availability?date=${date}&partySize=${party}`)
    ).body.data;
    const offered: string[] = (avail.services ?? []).flatMap((s: { times: string[] }) => s.times);
    const forced = rand() < 0.15 || offered.length === 0;
    const allSlots = openServices(cfg, date, "online").flatMap((s) => slotsOf(s, cfg.bookingPolicy));
    const time = forced ? pick(allSlots.length ? allSlots : ["20:00"]) : pick(offered);
    n++;
    const email = `g${n}.${slug}@sim.test`;
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
    await checkTrail(
      "prenotazione online",
      { history: 0, emails: 0, email },
      null,
      r,
      "guest",
      r.status === "requested" ? "richiesta" : "confermata",
      { title: /^Prenotazione creata dal sito$/ },
    );
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
    const services = openServices(cfg, date, "staff");
    if (!services.length) return;
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
    const opts = options(cfg, party, "staff", serviceByWindow(cfg, date, time) ?? service);
    const free = firstFree(cfg, opts, busyOf(cfg, before, "staff"), date, time, party, service.id);
    const pacing = pacingOk(cfg, serviceByWindow(cfg, date, time) ?? service, before, date, time, party);
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
    await checkTrail(
      kind,
      { history: 0, emails: 0, email: null },
      null,
      res.body.data as Reservation,
      "staff",
      null,
      {
        title: walkIn ? /^Prenotazione creata walk-in$/ : /^Prenotazione creata dallo staff$/,
      },
    );
  }

  async function active(): Promise<Reservation | null> {
    const date = pick(days);
    const list = (await dayOf(date)).filter((r) => BLOCKING.has(r.status) && r.tableIds.length > 0);
    return list.length ? pick(list) : null;
  }

  async function staffEdit() {
    const r = await active();
    if (!r) return;
    const service = openServices(cfg, r.date, "staff").find((s) => s.id === r.serviceId);
    if (!service) return;
    const change =
      rand() < 0.5
        ? { partySize: Math.max(1, r.partySize + pick([-3, -2, -1, 1, 2, 3])) }
        : { time: pick(slotsOf(service, cfg.bookingPolicy)) };
    const before = await dayOf(r.date);
    const t0 = await trail(r);
    const res = await owner.api.patch(`${owner.base}/reservations/${r.id}`, change);
    count(
      name,
      res.status === 200 ? "modifica staff: ok" : `modifica staff: rifiutata (${res.body.error?.code})`,
    );
    if (res.status === 200) {
      const now = res.body.data as Reservation;
      await checkTrail("modifica staff", t0, r, now, "staff", staffEmail(r, now));
    }
    if (res.status !== 200) {
      const time = "time" in change ? change.time! : r.time;
      const party = "partySize" in change ? change.partySize! : r.partySize;
      const svc = serviceByWindow(cfg, r.date, time) ?? service;
      const busy = busyOf(cfg, before, "staff", r.id);
      // A new time keeps the booking's duration; a new party size takes it from the rules.
      const keepsDuration = party === r.partySize;
      const startMs = localToInstant(r.date, timeToMinutes(time), TZ).getTime();
      const free = keepsDuration
        ? (options(cfg, party, "staff", svc).find((o) =>
            isFree(busy, o.tableIds, startMs, startMs + r.durationMinutes * 60_000),
          ) ?? null)
        : firstFree(cfg, options(cfg, party, "staff", svc), busy, r.date, time, party, svc.id);
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
    checkPlacement(
      "modifica staff",
      before,
      res.body.data as Reservation,
      "staff",
      r.tableIds,
      (res.body.data as Reservation).partySize < r.partySize,
    );
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
    const t0 = await trail(old);
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
    await checkTrail(
      "modifica cliente",
      t0,
      old,
      r,
      "guest",
      r.status === "requested" ? "richiesta" : "modificata",
      {
        title: /^Modificata dal cliente$/,
      },
    );
    // Tables the guest already had (maybe chosen by staff) may stay even if not offered online.
    const kept = r.tableIds.every((t) => old.tableIds.includes(t));
    checkPlacement(
      "modifica cliente",
      before,
      r,
      kept ? "staff" : "online",
      old.tableIds,
      party < old.partySize,
    );
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
    const t0 = await trail(r);
    const res = await owner.api.post(`${owner.base}/reservations/${r.id}/status`, { status: to });
    count(name, `stato ${to}: ${res.status === 200 ? "ok" : res.body.error?.code}`);
    if (res.status === 200) {
      const now = res.body.data as Reservation;
      await checkTrail(`stato ${to}`, t0, r, now, "staff", staffEmail(r, now), {
        title: to === "cancelled" ? /^Cancellata$/ : /^Cambio stato$/,
      });
    }
  }

  /** A guest cancels from the link in the email. */
  async function guestCancel() {
    const candidates = [...tokens.entries()];
    if (!candidates.length) return;
    const [id, token] = pick(candidates);
    const view = (await guest.get(`/v1/public/bookings/${token}`)).body.data;
    if (!view?.canCancel) return;
    const was = await getReservation(id);
    const t0 = await trail(was);
    const res = await guest.post(`/v1/public/bookings/${token}/cancel`);
    count(name, `disdetta cliente: ${res.status === 200 ? "ok" : res.body.error?.code}`);
    if (res.status !== 200) return;
    const now = await getReservation(id);
    await checkTrail("disdetta cliente", t0, was, now, "guest", "cancellata", {
      title: /^Disdetta dal cliente$/,
    });
    const day = await dayOf(now.date);
    if (day.some((x) => BLOCKING.has(x.status) && x.id === id)) {
      note({
        severity: "ERRORE",
        restaurant: name,
        what: "Disdetta che non libera il tavolo",
        detail: `${now.date} ${now.time}`,
      });
    }
  }

  // ---- Harder operations (SIM_LEVEL=2) ----

  /** What the API should answer when staff put a booking on these tables (null: accept). */
  function expectedTablesOutcome(r: Reservation, tableIds: string[], day: Reservation[]) {
    const tables = tableIds.map(tableById);
    if (tables.some((t) => !t)) return "invalid";
    if (tables.some((t) => !t!.isActive)) return "table_inactive";
    const seats = tables.reduce((sum, t) => sum + t!.maxCovers, 0);
    if (seats < r.partySize || (tables.length === 1 && r.partySize < tables[0]!.minCovers))
      return "capacity_mismatch";
    const busy = busyOf(cfg, day, "staff", r.id);
    const blocked = cfg.tableBlocks.some(
      (b) =>
        !b.onlineOnly &&
        Date.parse(b.startsAt) < Date.parse(r.endsAt) &&
        Date.parse(b.endsAt) > Date.parse(r.startsAt) &&
        tables.some((t) => b.tableId === t!.id || (b.tableId === null && b.roomId === t!.roomId)),
    );
    if (blocked) return "table_blocked";
    if (!isFree(busy, tableIds, Date.parse(r.startsAt), Date.parse(r.endsAt))) return "table_taken";
    return null;
  }

  /** Staff move a booking to other tables, or join a neighbouring table, by hand. */
  async function manualMove() {
    const r = await active();
    if (!r) return;
    const day = await dayOf(r.date);
    const neighbours = cfg.tableAdjacencies
      .filter((a) => r.tableIds.includes(a.tableAId) || r.tableIds.includes(a.tableBId))
      .map((a) => (r.tableIds.includes(a.tableAId) ? a.tableBId : a.tableAId))
      .filter((id) => !r.tableIds.includes(id));
    const target =
      rand() < 0.4 && neighbours.length
        ? [...r.tableIds, pick(neighbours)]
        : [pick(cfg.tables.filter((t) => t.isActive)).id];
    const expected = expectedTablesOutcome(r, target, day);
    const t0 = await trail(r);
    const res = await owner.api.put(`${owner.base}/reservations/${r.id}/tables`, { tableIds: target });
    if (res.status === 200) {
      await checkTrail("spostamento manuale", t0, r, res.body.data as Reservation, "staff", null, {
        title: /^Cambio tavolo$/,
      });
    }
    const got = res.status === 200 ? null : res.body.error?.code;
    count(name, `spostamento manuale: ${got ?? "ok"}`);
    if ((expected === null) !== (got === null) || (expected && got && expected !== got)) {
      note({
        severity: "ERRORE",
        restaurant: name,
        what: "Spostamento manuale con esito sbagliato",
        detail: `${r.date} ${r.time}, ${r.partySize} pers. ${label(r.tableIds)} → ${label(target)}: atteso ${expected ?? "ok"}, ottenuto ${got ?? "ok"}`,
      });
    }
  }

  /** Staff choose the tables themselves when booking (sometimes the wrong size). */
  async function staffBookingOnTables() {
    const date = pick(days);
    const service = pick(openServices(cfg, date, "staff").length ? openServices(cfg, date, "staff") : [null]);
    if (!service) return;
    const time = pick(slotsOf(service, cfg.bookingPolicy));
    const party = weighted(PARTY);
    const tables = [
      pick(
        cfg.tables.filter(
          (t) => t.isActive && (!service.roomIds.length || service.roomIds.includes(t.roomId)),
        ),
      ),
    ];
    const before = await dayOf(date);
    n++;
    const res = await owner.api.post(`${owner.base}/reservations`, {
      date,
      time,
      partySize: party,
      guestName: `Scelto ${n}`,
      tableIds: tables.map((t) => t!.id),
      ignorePacing: true,
    });
    const got = res.status === 201 ? null : res.body.error?.code;
    count(name, `staff con tavolo scelto: ${got ?? "ok"}`);
    const start = localToInstant(date, timeToMinutes(time), TZ).getTime();
    const end = start + durationOf(cfg, party, service.id, tables[0]!.roomId) * 60_000;
    const fake = {
      id: "new",
      partySize: party,
      startsAt: new Date(start).toISOString(),
      endsAt: new Date(end).toISOString(),
    } as Reservation;
    const expected = expectedTablesOutcome(
      fake,
      tables.map((t) => t!.id),
      before,
    );
    if ((expected === null) !== (got === null)) {
      note({
        severity: "ERRORE",
        restaurant: name,
        what: "Tavolo scelto dallo staff: esito sbagliato",
        detail: `${date} ${time}, ${party} pers. su ${label(tables.map((t) => t!.id))}: atteso ${expected ?? "ok"}, ottenuto ${got ?? "ok"}`,
      });
    }
  }

  /** A cancelled booking put back: only if its tables are still free. */
  async function reinstate() {
    const date = pick(days);
    const day = await dayOf(date);
    const cancelled = day.filter((r) => r.status === "cancelled" && r.tableIds.length);
    if (!cancelled.length) return;
    const r = pick(cancelled);
    const free = isFree(
      busyOf(cfg, day, "staff", r.id),
      r.tableIds,
      Date.parse(r.startsAt),
      Date.parse(r.endsAt),
    );
    const service = cfg.services.find((s) => s.id === r.serviceId);
    const pacing = service ? pacingOk(cfg, service, day, date, r.time, r.partySize, r.id) : true;
    const t0 = await trail(r);
    const res = await owner.api.post(`${owner.base}/reservations/${r.id}/status`, { status: "confirmed" });
    const ok = res.status === 200;
    count(name, `ripristino: ${ok ? "ok" : res.body.error?.code}`);
    if (ok) {
      const now = res.body.data as Reservation;
      await checkTrail("ripristino", t0, r, now, "staff", staffEmail(r, now), { title: /^Cambio stato$/ });
    }
    if (ok && !free)
      note({
        severity: "ERRORE",
        restaurant: name,
        what: "Ripristinata su un tavolo occupato",
        detail: `${date} ${r.time} ${label(r.tableIds)}`,
      });
    if (!ok && free)
      note({
        severity: "ERRORE",
        restaurant: name,
        what: "Ripristino rifiutato con tavolo libero",
        detail: `${date} ${r.time} ${label(r.tableIds)}: ${res.body.error?.code}`,
      });
    if (ok && !pacing) {
      overLimit.add(date);
      note({
        severity: "AVVISO",
        restaurant: name,
        what: "Ripristino oltre il ritmo o i coperti massimi",
        detail: `${date} ${r.time}, ${r.partySize} pers.`,
      });
    }
  }

  /** Requests waiting for the restaurant get confirmed. */
  async function confirmRequest() {
    const date = pick(days);
    const requests = (await dayOf(date)).filter((r) => r.status === "requested");
    if (!requests.length) return;
    const r = pick(requests);
    const t0 = await trail(r);
    const res = await owner.api.post(`${owner.base}/reservations/${r.id}/status`, { status: "confirmed" });
    count(name, `conferma richiesta: ${res.status === 200 ? "ok" : res.body.error?.code}`);
    if (res.status === 200) {
      const now = res.body.data as Reservation;
      await checkTrail("conferma richiesta", t0, r, now, "staff", staffEmail(r, now), {
        title: /^Cambio stato$/,
      });
    }
    if (res.status !== 200)
      note({
        severity: "ERRORE",
        restaurant: name,
        what: "Conferma di una richiesta rifiutata",
        detail: `${date} ${r.time}: ${res.body.error?.code}`,
      });
  }

  /** Staff move a booking to another day (and time), or give it a longer or shorter stay. */
  async function moveDayOrDuration() {
    const r = await active();
    if (!r) return;
    if (rand() < 0.5) {
      const date = pick(days.filter((d) => d !== r.date));
      const services = openServices(cfg, date, "staff");
      if (!date || !services.length) return;
      const service = pick(services);
      const time = pick(slotsOf(service, cfg.bookingPolicy));
      const before = await dayOf(date);
      const t0 = await trail(r);
      const res = await owner.api.patch(`${owner.base}/reservations/${r.id}`, { date, time });
      count(name, `cambio giorno: ${res.status === 200 ? "ok" : res.body.error?.code}`);
      if (res.status === 200) {
        const now = res.body.data as Reservation;
        await checkTrail("cambio giorno", t0, r, now, "staff", staffEmail(r, now));
      }
      // The booking keeps its duration when it changes day.
      const svc = serviceByWindow(cfg, date, time) ?? service;
      const start = localToInstant(date, timeToMinutes(time), TZ).getTime();
      const busyNew = busyOf(cfg, before, "staff", r.id);
      const free =
        options(cfg, r.partySize, "staff", svc).find((o) =>
          isFree(busyNew, o.tableIds, start, start + r.durationMinutes * 60_000),
        ) ?? null;
      const pacing = pacingOk(cfg, svc, before, date, time, r.partySize, r.id);
      if (res.status !== 200 && free && pacing) {
        note({
          severity: "ERRORE",
          restaurant: name,
          what: "Cambio giorno rifiutato con tavolo libero",
          detail: `${r.date}→${date} ${time}, ${r.partySize} pers.: ${res.body.error?.code}, libero ${label(free.tableIds)}`,
        });
      }
      if (res.status === 200)
        checkPlacement("cambio giorno", before, res.body.data as Reservation, "staff", r.tableIds);
    } else {
      const durationMinutes = pick([60, 90, 150, 180, 240]);
      const day = await dayOf(r.date);
      const t0 = await trail(r);
      const res = await owner.api.patch(`${owner.base}/reservations/${r.id}`, { durationMinutes });
      count(name, `cambio durata: ${res.status === 200 ? "ok" : res.body.error?.code}`);
      if (res.status === 200) {
        const now = res.body.data as Reservation;
        const lines =
          r.durationMinutes !== durationMinutes
            ? [new RegExp(`^Durata: ${r.durationMinutes} min → ${durationMinutes} min$`)]
            : [];
        await checkTrail("cambio durata", t0, r, now, "staff", null, { lines });
      }
      if (res.status === 200) {
        const after = res.body.data as Reservation;
        if (after.durationMinutes !== durationMinutes)
          note({
            severity: "ERRORE",
            restaurant: name,
            what: "Durata scelta dallo staff non applicata",
            detail: `${r.date} ${r.time}: ${after.durationMinutes} invece di ${durationMinutes}`,
          });
        if (
          !isFree(
            busyOf(cfg, day, "staff", r.id),
            after.tableIds,
            Date.parse(after.startsAt),
            Date.parse(after.endsAt),
          )
        ) {
          note({
            severity: "ERRORE",
            restaurant: name,
            what: "Durata allungata su un tavolo occupato",
            detail: `${r.date} ${r.time} ${label(after.tableIds)}`,
          });
        }
      }
    }
  }

  /** Several guests book the same last minutes at once: never two on one table. */
  async function rush() {
    const date = pick(days);
    const services = openServices(cfg, date, "online");
    if (!services.length) return;
    const time = pick(slotsOf(pick(services), cfg.bookingPolicy));
    const before = await dayOf(date);
    const service = serviceAt(cfg, date, time);
    if (!service) return;
    const freeTables = options(cfg, 2, "online", service).filter(
      (o) =>
        o.kind === "table" &&
        isFree(
          busyOf(cfg, before, "online"),
          o.tableIds,
          localToInstant(date, timeToMinutes(time), TZ).getTime(),
          localToInstant(date, timeToMinutes(time), TZ).getTime() +
            durationOf(cfg, 2, service.id, o.roomId) * 60_000,
        ),
    );
    const results = await Promise.all(
      Array.from({ length: 6 }, () => {
        n++;
        return guest.post(`/v1/public/restaurants/${slug}/reservations`, {
          date,
          time,
          partySize: 2,
          guestName: `Corsa ${n}`,
          guestPhone: `366${String(1000000 + n)}`,
          guestEmail: null,
          guestNote: null,
          privacyAccepted: true,
        });
      }),
    );
    const ok = results.filter((r) => r.status === 201).length;
    count(name, `prenotazioni simultanee: ${ok} su 6 riuscite`);
    if (results.some((r) => r.status >= 500)) {
      note({
        severity: "ERRORE",
        restaurant: name,
        what: "Errore del server con prenotazioni simultanee",
        detail: `${date} ${time}: ${results.map((r) => r.status).join(",")}`,
      });
    }
    if (ok > freeTables.length + 3) {
      note({
        severity: "AVVISO",
        restaurant: name,
        what: "Più prenotazioni simultanee dei tavoli liberi",
        detail: `${date} ${time}: ${ok} riuscite, ${freeTables.length} tavoli da 2-4 liberi`,
      });
    }
  }

  /** Guests join the waiting list of a full day; cancellations must email those who now fit. */
  async function waitlistJoin() {
    const date = pick(days);
    const party = weighted(PARTY.filter(([p]) => p <= 6));
    const avail = (
      await guest.get(`/v1/public/restaurants/${slug}/availability?date=${date}&partySize=${party}`)
    ).body.data;
    if (!avail.waitlist || avail.services.some((s: { times: string[] }) => s.times.length)) return;
    n++;
    const res = await guest.post(`/v1/public/restaurants/${slug}/waitlist`, {
      date,
      partySize: party,
      timeFrom: null,
      timeTo: null,
      guestName: `Attesa ${n}`,
      guestPhone: `377${String(1000000 + n)}`,
      guestEmail: `w${n}.${slug}@sim.test`,
      note: null,
      privacyAccepted: true,
    });
    count(name, `lista d'attesa: ${res.status === 201 ? "iscritti" : res.body.error?.code}`);
  }

  async function cancelAndCheckWaitlist() {
    const r = await active();
    if (!r) return;
    const waitingBefore = (
      (await owner.api.get(`${owner.base}/waitlist?date=${r.date}`)).body.data as {
        id: string;
        status: string;
        partySize: number;
      }[]
    ).filter((e) => e.status === "waiting");
    const t0 = await trail(r);
    const res = await owner.api.post(`${owner.base}/reservations/${r.id}/status`, { status: "cancelled" });
    count(name, `disdetta con lista d'attesa: ${res.status === 200 ? "ok" : res.body.error?.code}`);
    if (res.status === 200) {
      const now = res.body.data as Reservation;
      await checkTrail("disdetta staff", t0, r, now, "staff", staffEmail(r, now), { title: /^Cancellata$/ });
    }
    if (res.status !== 200 || !waitingBefore.length) return;
    const after = (await owner.api.get(`${owner.base}/waitlist?date=${r.date}`)).body.data as {
      id: string;
      status: string;
      partySize: number;
    }[];
    const day = await dayOf(r.date);
    for (const e of waitingBefore) {
      const now = after.find((x) => x.id === e.id)!;
      // Free online now for that party at some time of the day?
      const fits = openServices(cfg, r.date, "online").some((service) =>
        slotsOf(service, cfg.bookingPolicy).some((time) => {
          const limit = onlinePartyLimitAt(
            cfg.bookingPolicy.onlinePartyLimits,
            isoWeekday(r.date),
            timeToMinutes(time),
          );
          return (
            (limit === null || e.partySize <= limit) &&
            e.partySize <= cfg.bookingPolicy.maxPartyOnline &&
            pacingOk(cfg, service, day, r.date, time, e.partySize) &&
            !!firstFree(
              cfg,
              options(cfg, e.partySize, "online", service),
              busyOf(cfg, day, "online"),
              r.date,
              time,
              e.partySize,
              service.id,
            )
          );
        }),
      );
      count(name, `lista d'attesa dopo disdetta: ${now.status}`);
      if (fits && now.status !== "notified")
        note({
          severity: "ERRORE",
          restaurant: name,
          what: "Lista d'attesa: posto libero ma nessun avviso",
          detail: `${r.date}, ${e.partySize} pers.`,
        });
      if (!fits && now.status === "notified")
        note({
          severity: "ERRORE",
          restaurant: name,
          what: "Lista d'attesa: avviso senza posto libero",
          detail: `${r.date}, ${e.partySize} pers.`,
        });
    }
  }

  /** The restaurant changes things during the day: blocks, closures, special hours, tables. */
  async function changeConfig(step: number) {
    const date = pick(days);
    const post = (path: string, body: object) => owner.api.post(`${owner.base}${path}`, body);
    const kinds = [
      "block",
      "room_block",
      "online_closed",
      "closed",
      "special_hours",
      "deactivate",
      "priority",
      "online_max",
    ];
    const kind = kinds[step % kinds.length]!;
    const table = pick(cfg.tables.filter((t) => t.isActive));
    const service = pick(
      openServices(cfg, date, "staff").length ? openServices(cfg, date, "staff") : cfg.services,
    );
    let res;
    switch (kind) {
      case "block": {
        const from = localToInstant(date, 20 * 60, TZ);
        res = await post("/table-blocks", {
          tableId: table.id,
          startsAt: from.toISOString(),
          endsAt: new Date(from.getTime() + 3 * 3_600_000).toISOString(),
          onlineOnly: rand() < 0.3,
        });
        break;
      }
      case "room_block": {
        const from = localToInstant(date, 12 * 60, TZ);
        res = await post("/table-blocks", {
          tableId: null,
          roomId: table.roomId,
          startsAt: from.toISOString(),
          endsAt: new Date(from.getTime() + 2 * 3_600_000).toISOString(),
          onlineOnly: true,
        });
        break;
      }
      case "online_closed":
        res = await post("/calendar-exceptions", {
          kind: "closed",
          scope: "online",
          dateFrom: date,
          dateTo: date,
          serviceId: service.id,
        });
        break;
      case "closed":
        res = await post("/calendar-exceptions", {
          kind: "closed",
          scope: "all",
          dateFrom: date,
          dateTo: date,
          serviceId: service.id,
        });
        break;
      case "special_hours": {
        if (service.seatingMode === "fixed") return;
        // Last arrival one hour earlier that day.
        const last = Math.max(timeToMinutes(service.firstArrival), timeToMinutes(service.lastArrival) - 60);
        const hhmm = `${String(Math.floor(last / 60)).padStart(2, "0")}:${String(last % 60).padStart(2, "0")}`;
        res = await post("/calendar-exceptions", {
          kind: "special_hours",
          scope: "all",
          dateFrom: date,
          dateTo: date,
          serviceId: service.id,
          firstArrival: service.firstArrival,
          lastArrival: hhmm,
        });
        break;
      }
      case "deactivate":
        res = await owner.api.patch(`${owner.base}/tables/${table.id}`, { isActive: false });
        break;
      case "priority":
        res = await owner.api.patch(`${owner.base}/tables/${table.id}`, {
          priority: Math.floor(rand() * 50),
        });
        break;
      case "online_max":
        res = await owner.api.patch(`${owner.base}/tables/${table.id}`, {
          onlineMaxCovers: table.maxCovers > 2 ? table.maxCovers - 1 : null,
        });
        break;
    }
    count(name, `modifica configurazione ${kind}: ${res && res.status < 300 ? "ok" : res?.body.error?.code}`);
    await reload();
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
      [guestCancel, 3],
      ...(LEVEL >= 2
        ? ([
            [manualMove, 8],
            [staffBookingOnTables, 5],
            [reinstate, 4],
            [confirmRequest, 3],
            [moveDayOrDuration, 6],
            [rush, 2],
            [waitlistJoin, 4],
            [cancelAndCheckWaitlist, 4],
          ] as [() => Promise<unknown>, number][])
        : []),
    ]);
    await op();
    // Configuration changes spread over the session.
    if (LEVEL >= 2 && i > 0 && i % Math.floor(OPS / 9) === 0) await changeConfig(i / Math.floor(OPS / 9));
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
    for (const service of openServices(cfg, date, "staff")) {
      const load = active.filter((r) => r.serviceId === service.id);
      const covers = load.reduce((s, r) => s + r.partySize, 0);
      if (service.maxCovers !== null && covers > service.maxCovers) {
        note({
          severity: overLimit.has(date) ? "AVVISO" : "ERRORE",
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
      const onlineOpen = new Set(openServices(cfg, date, "online").map((s) => s.id));
      if (online.mode === "book") {
        for (const s of online.services as { serviceId: string; times: string[] }[]) {
          if (!onlineOpen.has(s.serviceId) && s.times.length) {
            note({
              severity: "ERRORE",
              restaurant: name,
              what: "Orari online offerti in un servizio chiuso",
              detail: `${date}: ${s.times.join(", ")}`,
            });
          }
        }
      }
      for (const service of openServices(cfg, date, "staff")) {
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
          if (online.mode !== "book" || !onlineOpen.has(service.id)) continue;
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
  it("big", async () => {
    await runRestaurant("Ristorante grande", big);
  }, 1_200_000);
  it("has no errors", () => {
    expect(findings.filter((f) => f.severity === "ERRORE")).toEqual([]);
  });
});
