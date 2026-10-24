"use client";

import { ArrowLeft, Printer } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { formatDateLong, STATUS_LABELS } from "@/lib/labels";
import { useConfig, useReservations } from "@/lib/queries";
import { useRestaurant } from "@/lib/restaurant";
import type { Reservation } from "@/lib/types";
import { useSelectedDate } from "@/lib/use-date";
import { Button } from "../ui/button";
import { PageLoader } from "../ui/spinner";

const ACTIVE = new Set(["requested", "confirmed", "arrived", "seated", "completed"]);

/**
 * The day's bookings on paper, per service, for the kitchen and for whoever works the door: who,
 * how many, where, and everything worth knowing (notes, allergies, VIP).
 */
export function ServiceSheet() {
  const { date } = useSelectedDate();
  const { name } = useRestaurant();
  const reservations = useReservations(date);
  const config = useConfig();
  if (reservations.isPending || config.isPending) return <PageLoader />;

  const list = (reservations.data ?? []).filter((r) => ACTIVE.has(r.status));
  const services = config.data?.services ?? [];
  const groups = [
    ...services.map((s) => ({ id: s.id, name: s.name, items: list.filter((r) => r.serviceId === s.id) })),
    { id: "none", name: "Fuori servizio", items: list.filter((r) => !r.serviceId) },
  ].filter((g) => g.items.length > 0);
  const covers = (items: Reservation[]) => items.reduce((n, r) => n + r.partySize, 0);

  return (
    <div className="text-sm print:text-[11px]">
      <style>{"@page { size: A4 landscape; margin: 10mm; }"}</style>
      <div className="mb-5 flex flex-wrap items-center gap-3 print:hidden">
        <Link
          href={`/prenotazioni?data=${date}`}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 hover:underline"
        >
          <ArrowLeft className="h-4 w-4" /> Prenotazioni
        </Link>
        <Button onClick={() => window.print()} className="ml-auto">
          <Printer className="h-4 w-4" /> Stampa
        </Button>
      </div>

      <header className="mb-4 flex items-baseline justify-between border-b-2 border-ink pb-2">
        <h1 className="text-xl font-semibold first-letter:uppercase print:text-base">
          {name} · {formatDateLong(date)}
        </h1>
        <p className="tabular-nums text-muted">
          {list.length} prenotazioni · {covers(list)} coperti
        </p>
      </header>

      {groups.length === 0 && <p className="text-muted">Nessuna prenotazione per questa giornata.</p>}

      {groups.map((group) => (
        <section key={group.id} className="mb-6 break-inside-avoid-page">
          <h2 className="mb-1 flex items-baseline justify-between text-base font-semibold print:text-sm">
            {group.name}
            <span className="text-sm font-normal text-muted">
              {group.items.length} prenotazioni · {covers(group.items)} coperti
            </span>
          </h2>
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-ink text-left text-xs uppercase tracking-wide">
                <th className="w-14 py-1 pr-2">Ora</th>
                <th className="py-1 pr-2">Cliente</th>
                <th className="w-10 py-1 pr-2 text-right">Pers.</th>
                <th className="w-20 py-1 pr-2">Tavolo</th>
                <th className="w-32 py-1 pr-2">Telefono</th>
                <th className="py-1 pr-2">Note</th>
                <th className="w-24 py-1">Stato</th>
              </tr>
            </thead>
            <tbody>
              {group.items.map((r) => {
                const notes = [r.guest?.profileNote, r.guestNote, r.internalNote].filter(Boolean);
                const tags = r.guest?.tags ?? [];
                return (
                  <tr key={r.id} className="break-inside-avoid border-b border-line align-top">
                    <td className="py-1.5 pr-2 font-semibold tabular-nums">{r.time}</td>
                    <td className="py-1.5 pr-2">
                      <span className="font-semibold">{r.guestName}</span>
                      {tags.length > 0 && <span className="ml-1 text-xs uppercase">[{tags.join(", ")}]</span>}
                      {r.channel === "online" && <span className="ml-1 text-xs text-muted">online</span>}
                      {r.guest && r.guest.visits > 0 && (
                        <span className="block text-xs text-muted">
                          {r.guest.visits} {r.guest.visits === 1 ? "visita" : "visite"}
                        </span>
                      )}
                    </td>
                    <td className="py-1.5 pr-2 text-right font-semibold tabular-nums">{r.partySize}</td>
                    <td className="py-1.5 pr-2 font-semibold">
                      {r.tables.map((t) => t.name).join("+") || "—"}
                    </td>
                    <td className="py-1.5 pr-2 tabular-nums">{r.guestPhone ?? ""}</td>
                    <td className="py-1.5 pr-2">
                      {notes.map((n, i) => (
                        <span
                          key={i}
                          className={cn("block", i === 0 && r.guest?.profileNote && "font-semibold")}
                        >
                          {n}
                        </span>
                      ))}
                    </td>
                    <td className="py-1.5">{STATUS_LABELS[r.status]}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  );
}
