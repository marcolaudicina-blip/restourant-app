"use client";

import { ArrowRight, CalendarOff, Clock, Globe, LayoutGrid, Timer } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { PageLoader } from "@/components/ui/spinner";
import { cn } from "@/lib/cn";
import { formatDateShort, formatDuration, WEEKDAYS } from "@/lib/labels";
import { useConfig } from "@/lib/queries";
import { useRestaurant } from "@/lib/restaurant";
import type { ConfigSnapshot, Service } from "@/lib/types";

/** Every rule of the restaurant on one page, each linking to the screen that edits it. */
export default function ConfigOverviewPage() {
  const config = useConfig();
  if (config.isPending || !config.data) return <PageLoader />;
  const data = config.data;

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Section
        title="Orari prenotabili"
        icon={<Clock className="h-5 w-5" />}
        href="/configurazione/orari"
        className="lg:col-span-2"
      >
        <WeeklyHours
          services={data.services.filter((s) => s.isActive)}
          defaultInterval={data.bookingPolicy.slotIntervalMinutes}
        />
      </Section>

      <Section title="Durata del tavolo" icon={<Timer className="h-5 w-5" />} href="/configurazione/durate">
        <Durations data={data} />
      </Section>

      <Section
        title="Regole di prenotazione"
        icon={<Globe className="h-5 w-5" />}
        href="/configurazione/regole"
      >
        <BookingRules data={data} />
      </Section>

      <Section title="Sale e tavoli" icon={<LayoutGrid className="h-5 w-5" />} href="/configurazione/tavoli">
        <Rooms data={data} />
      </Section>

      <Section
        title="Prossime chiusure"
        icon={<CalendarOff className="h-5 w-5" />}
        href="/configurazione/chiusure"
      >
        <Closures data={data} />
      </Section>
    </div>
  );
}

function Section({
  title,
  icon,
  href,
  children,
  className,
}: {
  title: string;
  icon: ReactNode;
  href: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("flex flex-col", className)}>
      <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
        <h2 className="flex items-center gap-2 font-semibold">
          <span className="text-brand-600">{icon}</span>
          {title}
        </h2>
        <Link
          href={href}
          className="flex items-center gap-1 text-sm font-medium text-brand-700 hover:underline"
        >
          Modifica <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
      <div className="flex-1 px-5 py-4">{children}</div>
    </Card>
  );
}

function Rows({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="divide-y divide-line text-sm">
      {rows.map(([label, value]) => (
        <div key={label} className="flex items-baseline justify-between gap-4 py-2 first:pt-0 last:pb-0">
          <dt className="text-muted">{label}</dt>
          <dd className="text-right font-medium">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function serviceHours(service: Service): string {
  return service.seatingMode === "fixed"
    ? `turni ${service.fixedSeatings.join(" · ")}`
    : `${service.firstArrival}–${service.lastArrival}`;
}

function WeeklyHours({ services, defaultInterval }: { services: Service[]; defaultInterval: number }) {
  const { today } = useRestaurant();
  if (services.length === 0) {
    return (
      <p className="text-sm text-muted">
        Nessun servizio: crea almeno un servizio per ricevere prenotazioni.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[480px] text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-muted">
              <th className="py-1.5 pr-4 font-medium">Giorno</th>
              {services.map((s) => (
                <th key={s.id} className="py-1.5 pr-4 font-medium">
                  {s.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {WEEKDAYS.map((day) => {
              const open = services.filter((s) => s.daysOfWeek.includes(day.value));
              return (
                <tr key={day.value} className="border-t border-line">
                  <td className="py-2 pr-4 font-medium">{day.long}</td>
                  {open.length === 0 ? (
                    <td colSpan={services.length} className="py-2 text-muted">
                      Chiuso
                    </td>
                  ) : (
                    services.map((s) => (
                      <td
                        key={s.id}
                        className={cn("py-2 pr-4 tabular-nums", !open.includes(s) && "text-muted")}
                      >
                        {open.includes(s) ? serviceHours(s) : "—"}
                      </td>
                    ))
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <ul className="flex flex-col gap-1 text-xs text-muted">
        {services.map((s) => {
          const notes = [
            s.seatingMode === "continuous"
              ? `arrivi ogni ${s.slotIntervalMinutes ?? defaultInterval} min`
              : null,
            s.maxCoversPerSlot ? `max ${s.maxCoversPerSlot} coperti per fascia` : null,
            s.maxBookingsPerSlot ? `max ${s.maxBookingsPerSlot} prenotazioni per fascia` : null,
            s.maxCovers ? `max ${s.maxCovers} coperti in tutto` : null,
            s.onlineBookable ? null : "solo tramite staff",
            s.validFrom || s.validTo
              ? `valido ${s.validFrom ? `dal ${formatDateShort(s.validFrom)}` : ""} ${s.validTo ? `al ${formatDateShort(s.validTo)}` : ""}`.trim()
              : null,
            s.validTo && s.validTo < today() ? "scaduto" : null,
          ].filter(Boolean);
          return (
            <li key={s.id}>
              <span className="font-medium text-ink">{s.name}</span>: {notes.join(", ")}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Durations({ data }: { data: ConfigSnapshot }) {
  const serviceName = new Map(data.services.map((s) => [s.id, s.name]));
  const roomName = new Map(data.rooms.map((r) => [r.id, r.name]));
  const rules = [...data.durationRules].sort((a, b) => a.minParty - b.minParty);
  const persons = (min: number, max: number) =>
    min === max
      ? `${min} ${min === 1 ? "persona" : "persone"}`
      : max >= 100
        ? `${min}+ persone`
        : `${min}–${max} persone`;
  return (
    <Rows
      rows={[
        ...rules.map((r): [string, ReactNode] => [
          [
            persons(r.minParty, r.maxParty),
            r.serviceId && serviceName.get(r.serviceId),
            r.roomId && roomName.get(r.roomId),
          ]
            .filter(Boolean)
            .join(" · "),
          formatDuration(r.durationMinutes),
        ]),
        ["Tutti gli altri casi", formatDuration(data.bookingPolicy.defaultDurationMinutes)],
      ]}
    />
  );
}

function BookingRules({ data }: { data: ConfigSnapshot }) {
  const p = data.bookingPolicy;
  const confirmation = {
    auto: "Automatica",
    manual: "Manuale (la approvi tu)",
    auto_up_to: `Automatica fino a ${p.autoConfirmMaxParty} persone`,
  }[p.confirmationMode];
  return (
    <Rows
      rows={[
        [
          "Prenotazioni online",
          p.onlineEnabled ? "Attive" : <span className="text-red-600">Disattivate</span>,
        ],
        ["Persone per prenotazione online", `da ${p.minPartyOnline} a ${p.maxPartyOnline}`],
        [
          "Gruppi più numerosi",
          p.largePartyMode === "request" ? "Inviano una richiesta" : "Devono telefonare",
        ],
        ["Preavviso minimo", p.minNoticeMinutes === 0 ? "Nessuno" : formatDuration(p.minNoticeMinutes)],
        ["Prenotabile fino a", `${p.maxAdvanceDays} giorni prima`],
        ["Conferma", confirmation],
        [
          "Cancellazione dal cliente",
          p.guestCanCancel ? `fino a ${p.cancellationNoticeHours} h prima` : "Non consentita",
        ],
        [
          "Contatti obbligatori",
          [p.requirePhone && "telefono", p.requireEmail && "email"].filter(Boolean).join(" e "),
        ],
      ]}
    />
  );
}

function Rooms({ data }: { data: ConfigSnapshot }) {
  const activeTables = data.tables.filter((t) => t.isActive);
  return (
    <Rows
      rows={[
        ...data.rooms.map((room): [string, ReactNode] => {
          const tables = activeTables.filter((t) => t.roomId === room.id);
          const seats = tables.reduce((n, t) => n + t.maxCovers, 0);
          return [
            room.name + (room.isActive ? "" : " (disattivata)"),
            `${tables.length} tavoli · ${seats} posti${room.onlineBookable ? "" : " · solo staff"}`,
          ];
        }),
        ["Combinazioni di tavoli", String(data.combinations.filter((c) => c.isActive).length)],
        ["Coppie di tavoli affiancati", String(data.tableAdjacencies.length)],
      ]}
    />
  );
}

function Closures({ data }: { data: ConfigSnapshot }) {
  const { today } = useRestaurant();
  const serviceName = new Map(data.services.map((s) => [s.id, s.name]));
  const upcoming = data.calendarExceptions.filter((e) => e.dateTo >= today()).slice(0, 4);
  if (upcoming.length === 0)
    return <p className="text-sm text-muted">Nessuna chiusura o orario speciale in programma.</p>;
  return (
    <Rows
      rows={upcoming.map((e): [string, ReactNode] => [
        e.dateFrom === e.dateTo
          ? formatDateShort(e.dateFrom)
          : `${formatDateShort(e.dateFrom)} → ${formatDateShort(e.dateTo)}`,
        [
          e.kind === "special_hours"
            ? `Orario speciale ${e.firstArrival}–${e.lastArrival}`
            : e.scope === "online"
              ? "Chiuso online"
              : "Chiuso",
          e.serviceId ? serviceName.get(e.serviceId) : null,
          e.note,
        ]
          .filter(Boolean)
          .join(" · "),
      ])}
    />
  );
}
