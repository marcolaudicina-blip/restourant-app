"use client";

import {
  isBlockingStatus,
  minutesToTime,
  RESERVATION_TRANSITIONS,
  timeToMinutes,
  wallMinutesFrom,
} from "@restourant/shared";
import { Combine, Link2, Move, PencilRuler, Plus, Users, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api, ApiError, describeError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { byName, STATUS_ACTION_LABELS, STATUS_LABELS, statusColor } from "@/lib/labels";
import { useConfig, useReservations, useRestaurantMutation } from "@/lib/queries";
import { useRestaurant } from "@/lib/restaurant";
import type { Reservation, Table } from "@/lib/types";
import { useSelectedDate } from "@/lib/use-date";
import { useConfigSave } from "../config/use-save";
import { DateNav } from "../date-nav";
import { ReservationDialog } from "../reservations/reservation-dialog";
import { useStatusMutation } from "../reservations/reservation-row";
import { Button } from "../ui/button";
import { Badge, Card, EmptyState, PageHeader } from "../ui/card";
import { Select } from "../ui/field";
import { PageLoader } from "../ui/spinner";
import { useToast } from "../ui/toast";
import { FloorCanvas, ZoomControls, type TableAppearance } from "./floor-canvas";
import { nextTableName, TableInspector } from "./table-inspector";

/** A table counts as "booked soon" when its next guests arrive within this window. */
const UPCOMING_MINUTES = 60;

type Stay = { reservation: Reservation; start: number; end: number };

export function SalaView() {
  const { date, isToday } = useSelectedDate();
  const { timezone, can } = useRestaurant();
  const config = useConfig();
  const reservations = useReservations(date);
  const toast = useToast();
  const setStatus = useStatusMutation();

  const [roomId, setRoomId] = useState<string | null>(null);
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [minute, setMinute] = useState<number | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [joinMode, setJoinMode] = useState(false);
  const [layoutMode, setLayoutMode] = useState<"off" | "move" | "link">("off");
  const [linkFrom, setLinkFrom] = useState<string | null>(null);
  const [editing, setEditing] = useState<Reservation | null>(null);
  const [zoom, setZoom] = useState(1);
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const { save: saveConfig } = useConfigSave();

  const rooms = useMemo(
    () => (config.data?.rooms ?? []).filter((r) => r.isActive || layoutMode !== "off"),
    [config.data, layoutMode],
  );
  const services = useMemo(() => (config.data?.services ?? []).filter((s) => s.isActive), [config.data]);
  const room = rooms.find((r) => r.id === roomId) ?? rooms[0];
  const service =
    services.find((s) => s.id === serviceId) ?? pickService(services, isToday ? nowMinutes(timezone) : null);

  // Default the time to "now" during today's service, otherwise to the first arrival.
  const firstArrival = service?.firstArrival;
  const lastArrival = service?.lastArrival;
  useEffect(() => {
    if (!firstArrival || !lastArrival) return;
    const first = timeToMinutes(firstArrival);
    const last = timeToMinutes(lastArrival) + 90;
    const now = isToday ? nowMinutes(timezone) : null;
    setMinute(now !== null && now >= first && now <= last ? now - (now % 15) : first);
  }, [firstArrival, lastArrival, isToday, timezone]);

  const stays: Stay[] = useMemo(
    () =>
      (reservations.data ?? [])
        .filter((r) => isBlockingStatus(r.status))
        .map((r) => ({
          reservation: r,
          start: wallMinutesFrom(date, new Date(r.startsAt), timezone),
          end: wallMinutesFrom(date, new Date(r.endsAt), timezone),
        })),
    [reservations.data, date, timezone],
  );
  const selected = stays.find((s) => s.reservation.id === selectedId)?.reservation ?? null;

  const moveTables = useRestaurantMutation(
    (base, vars: { id: string; tableIds: string[]; ignoreCapacity?: boolean }) =>
      api<Reservation>(`${base}/reservations/${vars.id}/tables`, {
        method: "PUT",
        body: { tableIds: vars.tableIds, ignoreCapacity: vars.ignoreCapacity },
      }),
    ["reservations", "availability"],
  );
  const saveTable = useRestaurantMutation((base, vars: { id: string; posX: number; posY: number }) =>
    api(`${base}/tables/${vars.id}`, { method: "PATCH", body: { posX: vars.posX, posY: vars.posY } }),
  );
  const saveAdjacencies = useRestaurantMutation((base, pairs: { tableAId: string; tableBId: string }[]) =>
    api(`${base}/table-adjacencies`, { method: "PUT", body: { pairs } }),
  );

  if (config.isPending || reservations.isPending) return <PageLoader />;
  if (!room) {
    return (
      <>
        <PageHeader title="Sala" />
        <Card>
          <EmptyState title="Nessuna sala configurata">Crea sale e tavoli dalla Configurazione.</EmptyState>
        </Card>
      </>
    );
  }

  const roomTables = (config.data?.tables ?? [])
    .filter((t) => t.roomId === room.id && (t.isActive || layoutMode !== "off"))
    .sort(byName);
  const at = minute ?? 0;
  const stayAt = (table: Table) =>
    stays.find((s) => s.reservation.tableIds.includes(table.id) && s.start <= at && at < s.end);
  const nextStay = (table: Table) =>
    stays
      .filter(
        (s) => s.reservation.tableIds.includes(table.id) && s.start > at && s.start - at <= UPCOMING_MINUTES,
      )
      .sort((a, b) => a.start - b.start)[0];

  const appearance = (table: Table): TableAppearance => {
    if (layoutMode !== "off") {
      return { color: null, highlighted: linkFrom === table.id || selectedTableId === table.id };
    }
    const current = stayAt(table);
    const upcoming = nextStay(table);
    const isSelectedTable = selected?.tableIds.includes(table.id) ?? false;
    if (current) {
      return {
        color: statusColor(current.reservation.status),
        caption: `${current.reservation.guestName} · ${current.reservation.partySize}`,
        highlighted: isSelectedTable,
      };
    }
    return {
      color: null,
      outlined: upcoming ? "#F59E0B" : null,
      caption: upcoming ? `${upcoming.reservation.time} ${upcoming.reservation.guestName}` : undefined,
      highlighted: isSelectedTable,
    };
  };

  function onTableClick(table: Table) {
    if (layoutMode === "link") return toggleLink(table);
    if (layoutMode === "move") return setSelectedTableId(table.id === selectedTableId ? null : table.id);
    if (selected) {
      const current = selected.tableIds;
      if (joinMode) {
        const next = current.includes(table.id)
          ? current.filter((id) => id !== table.id)
          : [...current, table.id];
        if (next.length === 0) return;
        return move(selected, next);
      }
      if (current.includes(table.id)) return setSelectedId(null);
      return move(selected, [table.id]);
    }
    const occupant = stayAt(table) ?? nextStay(table);
    if (occupant) setSelectedId(occupant.reservation.id);
  }

  function move(reservation: Reservation, tableIds: string[], ignoreCapacity = false) {
    moveTables.mutate(
      { id: reservation.id, tableIds, ignoreCapacity },
      {
        onSuccess: (r) => toast.success(`${r.guestName} → tavolo ${r.tables.map((t) => t.name).join("+")}`),
        onError: (e) => {
          // Too few (or too many) seats: staff knows the room, let them confirm.
          if (
            e instanceof ApiError &&
            e.code === "capacity_mismatch" &&
            confirm(`${e.message.split(". Puoi")[0]}. Spostare comunque?`)
          ) {
            return move(reservation, tableIds, true);
          }
          toast.error(describeError(e));
        },
      },
    );
  }

  function toggleLink(table: Table) {
    if (!linkFrom) return setLinkFrom(table.id);
    if (linkFrom === table.id) return setLinkFrom(null);
    const pairs = config.data?.tableAdjacencies ?? [];
    const has = (p: { tableAId: string; tableBId: string }) =>
      (p.tableAId === linkFrom && p.tableBId === table.id) ||
      (p.tableAId === table.id && p.tableBId === linkFrom);
    const next = pairs.some(has)
      ? pairs.filter((p) => !has(p))
      : [...pairs, { tableAId: linkFrom, tableBId: table.id }];
    saveAdjacencies.mutate(next, { onError: (e) => toast.error(describeError(e)) });
    setLinkFrom(null);
  }

  async function addTable() {
    const bottom = Math.max(0, ...roomTables.map((t) => t.posY + t.height));
    const created = (await saveConfig(
      "POST",
      "/tables",
      {
        roomId: room!.id,
        // Follow the naming of this room ("T…" in Sala, "D…" in Dehors).
        name: nextTableName(config.data?.tables ?? [], roomTables.at(-1)?.name),
        minCovers: 2,
        maxCovers: 4,
        posX: 0,
        posY: roomTables.length ? bottom + 1 : 0,
      },
      "Tavolo aggiunto: trascinalo dove vuoi",
    ).catch(() => null)) as Table | null;
    if (created) setSelectedTableId(created.id);
  }

  const selectedTable = roomTables.find((t) => t.id === selectedTableId) ?? null;
  const serviceStays = stays.filter(
    (s) => !service || s.reservation.serviceId === service.id || !s.reservation.serviceId,
  );
  const rangeStart = service ? timeToMinutes(service.firstArrival) : 12 * 60;
  const rangeEnd = service ? timeToMinutes(service.lastArrival) + 120 : 23 * 60;

  return (
    <>
      <PageHeader
        title="Sala"
        actions={
          <>
            <DateNav />
            {can("config.write") && (
              <Button
                variant={layoutMode === "off" ? "secondary" : "primary"}
                onClick={() => {
                  setLayoutMode(layoutMode === "off" ? "move" : "off");
                  setSelectedId(null);
                  setLinkFrom(null);
                  setSelectedTableId(null);
                }}
              >
                <PencilRuler className="h-4 w-4" />{" "}
                {layoutMode === "off" ? "Modifica disposizione" : "Fine modifica"}
              </Button>
            )}
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-1 rounded-lg border border-line bg-surface p-0.5">
          {rooms.map((r) => (
            <button
              key={r.id}
              onClick={() => setRoomId(r.id)}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium",
                r.id === room.id ? "bg-brand-600 text-white" : "text-muted hover:text-ink",
              )}
            >
              {r.name}
            </button>
          ))}
        </div>
        {layoutMode === "off" && services.length > 0 && (
          <>
            <Select
              value={service?.id ?? ""}
              onChange={(e) => setServiceId(e.target.value)}
              className="w-auto"
              aria-label="Servizio"
            >
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
            <div className="flex min-w-64 flex-1 items-center gap-3">
              <input
                type="range"
                min={rangeStart}
                max={rangeEnd}
                step={15}
                value={Math.min(Math.max(at, rangeStart), rangeEnd)}
                onChange={(e) => setMinute(Number(e.target.value))}
                className="flex-1 accent-brand-600"
                aria-label="Orario"
              />
              <span className="w-14 text-right text-lg font-semibold tabular-nums">
                {minutesToTime(((at % 1440) + 1440) % 1440)}
              </span>
            </div>
          </>
        )}
        {layoutMode !== "off" && (
          <div className="flex gap-1 rounded-lg border border-line bg-surface p-0.5 text-sm">
            <button
              onClick={() => setLayoutMode("move")}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium",
                layoutMode === "move" ? "bg-brand-600 text-white" : "text-muted",
              )}
            >
              <Move className="h-4 w-4" /> Sposta tavoli
            </button>
            <button
              onClick={() => setLayoutMode("link")}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium",
                layoutMode === "link" ? "bg-brand-600 text-white" : "text-muted",
              )}
            >
              <Link2 className="h-4 w-4" /> Tavoli affiancati
            </button>
          </div>
        )}
        {layoutMode !== "off" && (
          <Button variant="secondary" onClick={addTable}>
            <Plus className="h-4 w-4" /> Aggiungi tavolo
          </Button>
        )}
        <div className={cn(layoutMode !== "off" && "ml-auto")}>
          <ZoomControls zoom={zoom} onChange={setZoom} />
        </div>
      </div>

      {layoutMode !== "off" && (
        <p className="mb-3 rounded-xl bg-brand-50 px-4 py-2.5 text-sm text-brand-900">
          {layoutMode === "move"
            ? "Trascina i tavoli per riprodurre la tua sala: la posizione si salva quando rilasci. Tocca un tavolo per cambiarne forma, misure e posti."
            : "Tocca due tavoli per segnarli come affiancati (o per scollegarli): il sistema potrà unirli per i gruppi numerosi."}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <Card className="min-w-0 p-3">
          {roomTables.length === 0 ? (
            <EmptyState title="Nessun tavolo in questa sala">
              {layoutMode !== "off"
                ? "Usa “Aggiungi tavolo” qui sopra."
                : "Aggiungili da Modifica disposizione."}
            </EmptyState>
          ) : (
            <FloorCanvas
              tables={roomTables}
              adjacencies={layoutMode !== "off" ? (config.data?.tableAdjacencies ?? []) : []}
              appearance={appearance}
              onTableClick={onTableClick}
              editable={layoutMode !== "off"}
              zoom={zoom}
              onMove={(table, pos) =>
                saveTable.mutate({ id: table.id, ...pos }, { onError: (e) => toast.error(describeError(e)) })
              }
            />
          )}
          {layoutMode === "off" && (
            <div className="mt-3 flex flex-wrap gap-4 px-1 text-xs text-muted">
              <Legend color="#3B82F6" label="Confermata" />
              <Legend color="#10B981" label="Seduta" />
              <Legend color="#F59E0B" label={`In arrivo entro ${UPCOMING_MINUTES}'`} outline />
              <Legend color="#acd8cf" label="Libero" outline />
            </div>
          )}
        </Card>

        {layoutMode !== "off" &&
          (selectedTable ? (
            <TableInspector
              key={selectedTable.id}
              table={selectedTable}
              allTables={config.data?.tables ?? []}
              onClose={() => setSelectedTableId(null)}
              onSelect={setSelectedTableId}
            />
          ) : (
            <p className="px-1 text-sm text-muted">
              {layoutMode === "move"
                ? "Tocca un tavolo per modificarlo, oppure aggiungine uno nuovo."
                : "Tocca il primo tavolo, poi quello affiancato."}
            </p>
          ))}

        {layoutMode === "off" && (
          <div className="flex flex-col gap-3">
            {selected ? (
              <Card className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">{selected.guestName}</p>
                    <p className="text-sm text-muted">
                      {selected.time} · {selected.partySize} persone · tavolo{" "}
                      {selected.tables.map((t) => t.name).join("+")}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setSelectedId(null)}
                    aria-label="Deseleziona"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                {selected.guestNote && (
                  <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
                    {selected.guestNote}
                  </p>
                )}
                <div className="mt-3 rounded-lg bg-canvas px-3 py-2 text-sm">
                  {joinMode
                    ? "Tocca altri tavoli per unirli (o toglierli)."
                    : "Tocca un tavolo per spostare qui il gruppo."}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant={joinMode ? "primary" : "secondary"}
                    onClick={() => setJoinMode((v) => !v)}
                  >
                    <Combine className="h-4 w-4" /> Unisci tavoli
                  </Button>
                  {RESERVATION_TRANSITIONS[selected.status]
                    .filter((s) => s !== "confirmed")
                    .map((s) => (
                      <Button key={s} size="sm" variant="secondary" onClick={() => setStatus(selected.id, s)}>
                        {STATUS_ACTION_LABELS[s]}
                      </Button>
                    ))}
                  <Button size="sm" variant="ghost" onClick={() => setEditing(selected)}>
                    Modifica
                  </Button>
                </div>
              </Card>
            ) : (
              <p className="px-1 text-sm text-muted">
                Tocca una prenotazione o un tavolo occupato per spostarla o unire tavoli.
              </p>
            )}

            <Card>
              <div className="border-b border-line px-4 py-3 text-sm font-semibold">
                {service?.name ?? "Prenotazioni"} ·{" "}
                {serviceStays.reduce((n, s) => n + s.reservation.partySize, 0)} coperti
              </div>
              <ul className="max-h-[50dvh] overflow-y-auto">
                {serviceStays.length === 0 && (
                  <li className="px-4 py-6 text-center text-sm text-muted">Nessuna prenotazione</li>
                )}
                {serviceStays.map(({ reservation: r }) => (
                  <li key={r.id}>
                    <button
                      onClick={() => {
                        setSelectedId(r.id === selectedId ? null : r.id);
                        const tableRoom = config.data?.tables.find((t) => t.id === r.tableIds[0])?.roomId;
                        if (tableRoom) setRoomId(tableRoom);
                      }}
                      className={cn(
                        "flex w-full items-center gap-3 border-b border-line px-4 py-2.5 text-left last:border-b-0 hover:bg-canvas",
                        r.id === selectedId && "bg-brand-50",
                      )}
                    >
                      <span className="w-11 font-semibold tabular-nums">{r.time}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{r.guestName}</span>
                        <span className="flex items-center gap-1 text-xs text-muted">
                          <Users className="h-3 w-3" /> {r.partySize} ·{" "}
                          {r.tables.map((t) => t.name).join("+") || "—"}
                        </span>
                      </span>
                      <Badge color={statusColor(r.status)}>{STATUS_LABELS[r.status]}</Badge>
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        )}
      </div>

      {editing && (
        <ReservationDialog
          open
          onClose={() => setEditing(null)}
          mode={{ kind: "edit", reservation: editing }}
          date={date}
        />
      )}
    </>
  );
}

function Legend({ color, label, outline = false }: { color: string; label: string; outline?: boolean }) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        className="h-3 w-3 rounded border-2"
        style={{ borderColor: color, backgroundColor: outline ? "transparent" : `${color}40` }}
      />
      {label}
    </span>
  );
}

function nowMinutes(timezone: string): number {
  const [h, m] = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  })
    .format(new Date())
    .split(":")
    .map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/** The service running now, or the next one today, or the first. */
function pickService<T extends { firstArrival: string; lastArrival: string }>(
  services: T[],
  now: number | null,
): T | undefined {
  if (now === null) return services[0];
  return (
    services.find((s) => now >= timeToMinutes(s.firstArrival) && now <= timeToMinutes(s.lastArrival) + 120) ??
    services.find((s) => timeToMinutes(s.firstArrival) > now) ??
    services[0]
  );
}
