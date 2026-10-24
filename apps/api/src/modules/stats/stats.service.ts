import { reservations } from "@restourant/db";
import { addDays, instantToLocal, isoWeekday, normalizeTime } from "@restourant/shared";
import { and, eq, gte, lte } from "drizzle-orm";
import type { TenantContext } from "../../lib/context.js";
import { invalid } from "../../lib/errors.js";
import { getRestaurant } from "../restaurants/restaurants.service.js";

/*
 * How the restaurant is doing over a period: bookings and covers, channels, no-shows and
 * cancellations, busiest days and hours, regulars, ratings. Computed from reservations on the fly
 * (nothing is stored), by the booking's date. Covers count bookings that were not cancelled and
 * not no-shows.
 */

export const MAX_STATS_DAYS = 366;
const CHANNELS = ["online", "staff", "walk_in"] as const;

type Row = {
  date: string;
  time: string;
  partySize: number;
  status: string;
  channel: (typeof CHANNELS)[number];
  guestId: string | null;
  guestName: string;
  createdAt: Date;
  rating: number | null;
};

const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;

async function load(ctx: TenantContext, from: string, to: string): Promise<Row[]> {
  const rows = await ctx.db
    .select({
      date: reservations.date,
      time: reservations.startTime,
      partySize: reservations.partySize,
      status: reservations.status,
      channel: reservations.channel,
      guestId: reservations.guestId,
      guestName: reservations.guestName,
      createdAt: reservations.createdAt,
      rating: reservations.rating,
    })
    .from(reservations)
    .where(
      and(
        eq(reservations.restaurantId, ctx.restaurantId),
        gte(reservations.date, from),
        lte(reservations.date, to),
      ),
    );
  return rows.map((r) => ({ ...r, time: normalizeTime(r.time) }));
}

const happened = (r: Row) => r.status !== "cancelled" && r.status !== "no_show";

function totals(rows: Row[]) {
  const valid = rows.filter(happened);
  const noShows = rows.filter((r) => r.status === "no_show").length;
  const covers = valid.reduce((sum, r) => sum + r.partySize, 0);
  return {
    bookings: valid.length,
    covers,
    noShows,
    cancelled: rows.filter((r) => r.status === "cancelled").length,
  };
}

export async function getStats(ctx: TenantContext, query: { from?: string; to?: string }, now: Date) {
  const restaurant = await getRestaurant(ctx);
  const today = instantToLocal(now, restaurant.timezone).date;
  const to = query.to ?? today;
  const from = query.from ?? addDays(to, -29);
  if (from > to) throw invalid("La data iniziale deve venire prima di quella finale");
  const length = daysBetween(from, to);
  if (length > MAX_STATS_DAYS) throw invalid(`Al massimo ${MAX_STATS_DAYS} giorni`);
  const previousTo = addDays(from, -1);
  const previousFrom = addDays(previousTo, -(length - 1));

  const [rows, previousRows] = await Promise.all([load(ctx, from, to), load(ctx, previousFrom, previousTo)]);
  const valid = rows.filter(happened);
  const now_ = totals(rows);
  const online = valid.filter((r) => r.channel === "online");

  const byDay = Array.from({ length }, (_, i) => addDays(from, i)).map((date) => {
    const day = valid.filter((r) => r.date === date);
    return { date, bookings: day.length, covers: day.reduce((s, r) => s + r.partySize, 0) };
  });
  const byWeekday = [1, 2, 3, 4, 5, 6, 7].map((weekday) => {
    const days = byDay.filter((d) => isoWeekday(d.date) === weekday);
    const covers = days.reduce((s, d) => s + d.covers, 0);
    return { weekday, days: days.length, avgCovers: days.length ? covers / days.length : 0 };
  });
  const hours = new Map<number, number>();
  for (const r of valid) {
    const hour = Number(r.time.slice(0, 2));
    hours.set(hour, (hours.get(hour) ?? 0) + r.partySize);
  }
  const byHour = [...hours.entries()].sort((a, b) => a[0] - b[0]).map(([hour, covers]) => ({ hour, covers }));
  const byChannel = CHANNELS.map((channel) => {
    const list = valid.filter((r) => r.channel === channel);
    return { channel, bookings: list.length, covers: list.reduce((s, r) => s + r.partySize, 0) };
  });

  const guests = new Map<string, { guestId: string; name: string; visits: number; covers: number }>();
  for (const r of valid) {
    if (!r.guestId) continue;
    const g = guests.get(r.guestId) ?? { guestId: r.guestId, name: r.guestName, visits: 0, covers: 0 };
    g.visits += 1;
    g.covers += r.partySize;
    guests.set(r.guestId, g);
  }
  const topGuests = [...guests.values()]
    .filter((g) => g.visits > 1)
    .sort((a, b) => b.visits - a.visits || b.covers - a.covers)
    .slice(0, 8);

  const rated = rows.filter((r) => r.rating !== null);
  const leadDays = online.map((r) => {
    const booked = instantToLocal(r.createdAt, restaurant.timezone).date;
    return Math.max(0, daysBetween(booked, r.date) - 1);
  });

  return {
    from,
    to,
    totals: {
      ...now_,
      online: online.length,
      walkIns: valid.filter((r) => r.channel === "walk_in").length,
      /** No-shows over the bookings that should have come. */
      noShowRate: now_.bookings + now_.noShows ? now_.noShows / (now_.bookings + now_.noShows) : 0,
      onlineShare: valid.length ? online.length / valid.length : 0,
      avgParty: valid.length ? now_.covers / valid.length : 0,
      /** How many days ahead guests book online, on average. */
      avgLeadDaysOnline: leadDays.length ? leadDays.reduce((a, b) => a + b, 0) / leadDays.length : null,
    },
    /** The same number of days just before, to compare. */
    previous: { from: previousFrom, to: previousTo, ...totals(previousRows) },
    byDay,
    byWeekday,
    byHour,
    byChannel,
    topGuests,
    reviews: {
      count: rated.length,
      average: rated.length ? rated.reduce((s, r) => s + r.rating!, 0) / rated.length : null,
    },
  };
}
