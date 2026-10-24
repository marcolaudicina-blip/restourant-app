"use client";

import { addDays } from "@restourant/shared";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ArrowDownRight, ArrowUpRight, Star } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { BarChart, HorizontalBars } from "@/components/stats/charts";
import { Card, CardHeader, PageHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/field";
import { PageLoader } from "@/components/ui/spinner";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { useRestaurant } from "@/lib/restaurant";
import type { Stats } from "@/lib/types";

/*
 * How the restaurant is doing over a period (GET /stats): covers and bookings against the period
 * before, channels, no-shows, busiest days and hours, regulars. Owners and managers only.
 */

const PRESETS = [
  { days: 7, label: "7 giorni" },
  { days: 30, label: "30 giorni" },
  { days: 90, label: "3 mesi" },
  { days: 365, label: "12 mesi" },
];
const WEEKDAYS = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];
const CHANNEL_LABELS = { online: "Online (sito)", staff: "Staff / telefono", walk_in: "Walk-in" };

const num = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 1 });
const pct = new Intl.NumberFormat("it-IT", { style: "percent", maximumFractionDigits: 0 });
const shortDate = (date: string) =>
  new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "short", timeZone: "UTC" }).format(
    new Date(`${date}T12:00:00Z`),
  );
const longDate = (date: string) =>
  new Intl.DateTimeFormat("it-IT", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));

export default function StatsPage() {
  const { base, restaurantId, today, can } = useRestaurant();
  const [range, setRange] = useState(() => ({ from: addDays(today(), -29), to: today() }));
  const stats = useQuery({
    queryKey: ["reservations", restaurantId, "stats", range.from, range.to],
    queryFn: () => api<Stats>(`${base}/stats?from=${range.from}&to=${range.to}`),
    placeholderData: keepPreviousData,
    enabled: can("stats.read"),
  });

  if (!can("stats.read"))
    return <p className="text-sm text-muted">Le statistiche sono per titolare e manager.</p>;
  const preset = (days: number) => ({ from: addDays(today(), -(days - 1)), to: today() });
  const s = stats.data;

  return (
    <>
      <PageHeader
        title="Statistiche"
        description="Prenotazioni non cancellate e non no-show, per data della prenotazione."
      />

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div
          className="flex rounded-lg border border-line bg-surface p-0.5 text-sm"
          role="group"
          aria-label="Periodo"
        >
          {PRESETS.map((p) => {
            const active = range.from === preset(p.days).from && range.to === today();
            return (
              <button
                key={p.days}
                type="button"
                aria-pressed={active}
                onClick={() => setRange(preset(p.days))}
                className={cn(
                  "rounded-md px-3 py-1.5 font-medium",
                  active ? "bg-brand-600 text-white" : "text-muted hover:text-ink",
                )}
              >
                {p.label}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Input
            type="date"
            aria-label="Dal"
            value={range.from}
            max={range.to}
            onChange={(e) => e.target.value && setRange((r) => ({ ...r, from: e.target.value }))}
            className="w-40"
          />
          <span className="text-muted">→</span>
          <Input
            type="date"
            aria-label="Al"
            value={range.to}
            min={range.from}
            onChange={(e) => e.target.value && setRange((r) => ({ ...r, to: e.target.value }))}
            className="w-40"
          />
        </div>
      </div>

      {stats.isError && (
        <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          Impossibile calcolare le statistiche per questo periodo (al massimo 12 mesi).
        </p>
      )}
      {!s ? (
        <PageLoader />
      ) : (
        <div className={cn("flex flex-col gap-5", stats.isFetching && "opacity-70")}>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Tile
              label="Coperti"
              value={num.format(s.totals.covers)}
              change={change(s.totals.covers, s.previous.covers)}
            />
            <Tile
              label="Prenotazioni"
              value={num.format(s.totals.bookings)}
              change={change(s.totals.bookings, s.previous.bookings)}
              hint={`${num.format(s.totals.avgParty)} persone in media`}
            />
            <Tile
              label="Online"
              value={pct.format(s.totals.onlineShare)}
              hint={
                s.totals.avgLeadDaysOnline !== null
                  ? `${s.totals.online} prenotazioni · ${num.format(s.totals.avgLeadDaysOnline)} giorni di anticipo`
                  : `${s.totals.online} prenotazioni`
              }
            />
            <Tile
              label="No-show"
              value={pct.format(s.totals.noShowRate)}
              hint={`${s.totals.noShows} no-show · ${s.totals.cancelled} cancellate`}
            />
          </div>
          <p className="-mt-2 text-xs text-muted">
            Confronto con {shortDate(s.previous.from)} – {shortDate(s.previous.to)}.
          </p>

          <Card>
            <CardHeader title="Coperti per giorno" />
            <div className="p-5">
              <BarChart
                label="Coperti per giorno"
                bars={s.byDay.map((d) => ({
                  key: d.date,
                  value: d.covers,
                  axis: shortDate(d.date),
                  tooltip: `${longDate(d.date)}: ${d.covers} coperti, ${d.bookings} prenotazioni`,
                }))}
              />
              <details className="mt-4 text-sm">
                <summary className="cursor-pointer text-muted hover:text-ink">Mostra come tabella</summary>
                <table className="mt-2 w-full max-w-md text-left">
                  <thead className="text-xs uppercase tracking-wide text-muted">
                    <tr>
                      <th className="py-1 font-medium">Giorno</th>
                      <th className="py-1 text-right font-medium">Prenotazioni</th>
                      <th className="py-1 text-right font-medium">Coperti</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.byDay.map((d) => (
                      <tr key={d.date} className="border-t border-line">
                        <td className="py-1">{longDate(d.date)}</td>
                        <td className="py-1 text-right tabular-nums">{d.bookings}</td>
                        <td className="py-1 text-right tabular-nums">{d.covers}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            </div>
          </Card>

          <div className="grid gap-5 lg:grid-cols-2">
            <Card>
              <CardHeader title="Coperti medi per giorno della settimana" />
              <div className="p-5">
                <HorizontalBars
                  rows={s.byWeekday.map((d) => ({
                    key: String(d.weekday),
                    label: WEEKDAYS[d.weekday - 1]!,
                    value: d.avgCovers,
                    display: num.format(d.avgCovers),
                  }))}
                />
              </div>
            </Card>
            <Card>
              <CardHeader title="Coperti per ora di arrivo" />
              <div className="p-5">
                {s.byHour.length === 0 ? (
                  <p className="text-sm text-muted">Nessuna prenotazione nel periodo.</p>
                ) : (
                  <BarChart
                    label="Coperti per ora di arrivo"
                    bars={s.byHour.map((h) => ({
                      key: String(h.hour),
                      value: h.covers,
                      axis: `${h.hour}:00`,
                      tooltip: `Dalle ${h.hour}:00 alle ${h.hour}:59: ${h.covers} coperti`,
                    }))}
                  />
                )}
              </div>
            </Card>
            <Card>
              <CardHeader title="Da dove arrivano le prenotazioni" />
              <div className="p-5">
                <HorizontalBars
                  rows={s.byChannel.map((c) => ({
                    key: c.channel,
                    label: CHANNEL_LABELS[c.channel],
                    value: c.covers,
                    display: `${c.covers} coperti · ${c.bookings} pren.`,
                  }))}
                  labelWidth="w-32"
                />
              </div>
            </Card>
            <Card>
              <CardHeader title="Clienti abituali" description="Chi è venuto più di una volta nel periodo." />
              {s.topGuests.length === 0 ? (
                <p className="px-5 pb-5 text-sm text-muted">Nessun cliente è tornato nel periodo.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {s.topGuests.map((g) => (
                    <li key={g.guestId} className="flex items-center justify-between gap-3 px-5 py-2 text-sm">
                      <Link href={`/clienti/${g.guestId}`} className="font-medium hover:underline">
                        {g.name}
                      </Link>
                      <span className="tabular-nums text-muted">
                        {g.visits} visite · {g.covers} coperti
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {s.reviews.count > 0 && (
                <Link
                  href="/clienti/recensioni"
                  className="flex items-center gap-1.5 border-t border-line px-5 py-3 text-sm hover:bg-canvas"
                >
                  <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                  Giudizio medio {num.format(s.reviews.average ?? 0)} su 5 ({s.reviews.count} giudizi)
                </Link>
              )}
            </Card>
          </div>
        </div>
      )}
    </>
  );
}

/** Relative change against the period before, or null when there is nothing to compare. */
function change(now: number, before: number): number | null {
  return before > 0 ? (now - before) / before : null;
}

function Tile({
  label,
  value,
  change,
  hint,
}: {
  label: string;
  value: string;
  change?: number | null;
  hint?: string;
}) {
  return (
    <Card className="px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 flex items-baseline gap-2">
        <span className="text-2xl font-semibold tabular-nums">{value}</span>
        {change !== undefined && change !== null && (
          <span
            className={cn(
              "inline-flex items-center text-xs font-medium",
              change >= 0 ? "text-brand-700" : "text-red-700",
            )}
          >
            {change >= 0 ? (
              <ArrowUpRight className="h-3.5 w-3.5" />
            ) : (
              <ArrowDownRight className="h-3.5 w-3.5" />
            )}
            {pct.format(Math.abs(change))}
          </span>
        )}
      </p>
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </Card>
  );
}
