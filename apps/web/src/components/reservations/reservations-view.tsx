"use client";

import { isBlockingStatus } from "@restourant/shared";
import { CalendarPlus, DoorOpen, Globe, Search, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { useConfig, useReservations } from "@/lib/queries";
import type { Reservation } from "@/lib/types";
import { useSelectedDate } from "@/lib/use-date";
import { DateNav } from "../date-nav";
import { Button } from "../ui/button";
import { Card, EmptyState, PageHeader } from "../ui/card";
import { Input } from "../ui/field";
import { PageLoader } from "../ui/spinner";
import { ReservationDialog } from "./reservation-dialog";
import { ReservationRow } from "./reservation-row";

type DialogState = { kind: "create"; walkIn?: boolean } | { kind: "edit"; reservation: Reservation } | null;

export function ReservationsView() {
  const { date } = useSelectedDate();
  const reservations = useReservations(date);
  const config = useConfig();
  const [dialog, setDialog] = useState<DialogState>(null);
  const [showAll, setShowAll] = useState(false);
  const [onlineOnly, setOnlineOnly] = useState(false);
  const [query, setQuery] = useState("");

  const all = useMemo(() => reservations.data ?? [], [reservations.data]);
  const active = all.filter((r) => isBlockingStatus(r.status) || r.status === "completed");
  const visible = (showAll ? all : active).filter((r) => {
    if (onlineOnly && r.channel !== "online") return false;
    const q = query.trim().toLowerCase();
    return (
      !q ||
      r.guestName.toLowerCase().includes(q) ||
      (r.guestPhone ?? "").replace(/\s/g, "").includes(q.replace(/\s/g, ""))
    );
  });

  const groups = useMemo(() => {
    const services = config.data?.services ?? [];
    const byService = Map.groupBy(visible, (r) => r.serviceId ?? "none");
    const list = services
      .filter((s) => byService.has(s.id))
      .map((s) => ({ id: s.id, name: s.name, items: byService.get(s.id)! }));
    if (byService.has("none"))
      list.push({ id: "none", name: "Fuori servizio", items: byService.get("none")! });
    return list;
  }, [visible, config.data]);

  const covers = (list: Reservation[]) => list.reduce((sum, r) => sum + r.partySize, 0);
  const counted = all.filter((r) => isBlockingStatus(r.status) || r.status === "completed");
  const seatedNow = all.filter((r) => r.status === "seated");
  const online = counted.filter((r) => r.channel === "online");

  return (
    <>
      <PageHeader
        title="Prenotazioni"
        actions={
          <>
            <DateNav />
            <Button variant="secondary" onClick={() => setDialog({ kind: "create", walkIn: true })}>
              <DoorOpen className="h-4 w-4" /> Walk-in
            </Button>
            <Button onClick={() => setDialog({ kind: "create" })}>
              <CalendarPlus className="h-4 w-4" /> Nuova
            </Button>
          </>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Prenotazioni" value={counted.length} />
        <Stat label="Coperti" value={covers(counted)} />
        <Stat label="Seduti ora" value={covers(seatedNow)} />
        <Stat label="Online" value={online.length} />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cerca per nome o telefono"
            className="pl-9"
            aria-label="Cerca"
          />
        </div>
        <div className="flex rounded-lg border border-line bg-surface p-0.5 text-sm">
          {[
            { value: false, label: "Attive" },
            { value: true, label: "Tutte" },
          ].map((tab) => (
            <button
              key={tab.label}
              onClick={() => setShowAll(tab.value)}
              className={cn(
                "rounded-md px-3 py-1.5 font-medium",
                showAll === tab.value ? "bg-brand-600 text-white" : "text-muted hover:text-ink",
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => setOnlineOnly(!onlineOnly)}
          aria-pressed={onlineOnly}
          className={cn(
            "flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium",
            onlineOnly
              ? "border-violet-300 bg-violet-100 text-violet-700"
              : "border-line bg-surface text-muted hover:text-ink",
          )}
        >
          <Globe className="h-4 w-4" /> Solo online
        </button>
      </div>

      {reservations.isPending ? (
        <PageLoader />
      ) : groups.length === 0 ? (
        <Card>
          <EmptyState
            icon={<CalendarPlus className="h-8 w-8" />}
            title={
              query ? "Nessun risultato" : onlineOnly ? "Nessuna prenotazione online" : "Nessuna prenotazione"
            }
          >
            {query
              ? "Prova con un altro nome o numero."
              : onlineOnly
                ? "Le prenotazioni fatte dai clienti sul sito compariranno qui."
                : "Inserisci la prima prenotazione della giornata."}
          </EmptyState>
        </Card>
      ) : (
        <div className="flex flex-col gap-5">
          {groups.map((group) => (
            <Card key={group.id}>
              <div className="flex items-center justify-between border-b border-line px-4 py-3">
                <h2 className="font-semibold">{group.name}</h2>
                <span className="flex items-center gap-1 text-sm text-muted">
                  <Users className="h-4 w-4" />{" "}
                  {covers(group.items.filter((r) => r.status !== "cancelled" && r.status !== "no_show"))}{" "}
                  coperti · {group.items.length} prenotazioni
                </span>
              </div>
              <ul>
                {group.items.map((r) => (
                  <ReservationRow
                    key={r.id}
                    reservation={r}
                    onEdit={() => setDialog({ kind: "edit", reservation: r })}
                  />
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}

      {dialog && (
        <ReservationDialog
          key={dialog.kind === "edit" ? dialog.reservation.id : dialog.walkIn ? "walk-in" : "new"}
          open
          onClose={() => setDialog(null)}
          mode={dialog}
          date={date}
        />
      )}
    </>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <Card className="px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
    </Card>
  );
}
