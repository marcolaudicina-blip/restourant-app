"use client";

import { minutesToTime } from "@restourant/shared";
import { Minus, Plus, Sparkles, TriangleAlert } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { api, ApiError, describeError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { byName, formatInstant } from "@/lib/labels";
import { CLOSED_REASON_LABELS, SLOT_REASON_LABELS } from "@/lib/labels";
import { useAvailability, useConfig, useRestaurantMutation } from "@/lib/queries";
import { useRestaurant } from "@/lib/restaurant";
import type { Reservation } from "@/lib/types";
import { GuestLookup, type GuestContact, type LinkedGuest } from "../guests/guest-lookup";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";
import { Field, Input, Textarea } from "../ui/field";
import { useToast } from "../ui/toast";
import { ChannelBadge } from "./channel-badge";

type Mode =
  /** `time` and `tableIds` pre-fill a new booking, e.g. from an empty slot of the grid. */
  | { kind: "create"; walkIn?: boolean; time?: string; tableIds?: string[] }
  | { kind: "edit"; reservation: Reservation };

/** Overrides the API lets staff confirm after a warning. */
const OVERRIDES: Record<
  string,
  { flag: "ignorePacing" | "ignoreCapacity" | "reassignTables"; label: string }
> = {
  pacing_covers: { flag: "ignorePacing", label: "Prenota comunque" },
  pacing_bookings: { flag: "ignorePacing", label: "Prenota comunque" },
  service_full: { flag: "ignorePacing", label: "Prenota comunque" },
  capacity_mismatch: { flag: "ignoreCapacity", label: "Usa comunque questi tavoli" },
  table_taken: { flag: "reassignTables", label: "Scegli altri tavoli in automatico" },
};

function nowRounded(timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  })
    .format(new Date())
    .split(":")
    .map(Number);
  const minutes = (parts[0] ?? 0) * 60 + (parts[1] ?? 0);
  return minutesToTime(Math.floor(minutes / 5) * 5);
}

export function ReservationDialog({
  open,
  onClose,
  mode,
  date: initialDate,
  guest: initialGuest,
}: {
  open: boolean;
  onClose: () => void;
  mode: Mode;
  date: string;
  /** Pre-select a guest, e.g. "new booking" from a guest profile. */
  guest?: { linked: LinkedGuest; phone: string | null; email: string | null };
}) {
  const editing = mode.kind === "edit" ? mode.reservation : null;
  const walkIn = mode.kind === "create" && mode.walkIn === true;
  const { timezone } = useRestaurant();
  const config = useConfig();
  const toast = useToast();

  const [date, setDate] = useState(editing?.date ?? initialDate);
  const [partySize, setPartySize] = useState(editing?.partySize ?? 2);
  const preset = mode.kind === "create" ? mode : null;
  const [time, setTime] = useState<string | null>(
    editing?.time ?? preset?.time ?? (walkIn ? nowRounded(timezone) : null),
  );
  const [manualTables, setManualTables] = useState<string[] | null>(
    editing ? editing.tableIds : (preset?.tableIds ?? null),
  );
  const [warning, setWarning] = useState<{ code: string; message: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [contact, setContact] = useState<GuestContact>({
    name: editing?.guestName ?? initialGuest?.linked.fullName ?? (walkIn ? "Walk-in" : ""),
    phone: editing?.guestPhone ?? initialGuest?.phone ?? "",
    email: editing?.guestEmail ?? initialGuest?.email ?? "",
  });
  const [linkedGuest, setLinkedGuest] = useState<LinkedGuest | null>(
    editing?.guest ?? initialGuest?.linked ?? null,
  );

  const availability = useAvailability(date, partySize, "staff", open && !walkIn);
  const selectedSlot = availability.data?.services.flatMap((s) => s.slots).find((s) => s.time === time);

  const save = useRestaurantMutation(
    (base, body: Record<string, unknown>) =>
      editing
        ? api<Reservation>(`${base}/reservations/${editing.id}`, { method: "PATCH", body })
        : api<Reservation>(`${base}/reservations`, { method: "POST", body }),
    ["reservations", "availability", "guests"],
  );
  const saveTables = useRestaurantMutation(
    (base, body: { tableIds: string[]; ignoreCapacity?: boolean }) =>
      api<Reservation>(`${base}/reservations/${editing!.id}/tables`, { method: "PUT", body }),
    ["reservations", "availability", "guests"],
  );

  const tablesByRoom = useMemo(() => {
    const rooms = config.data?.rooms.filter((r) => r.isActive) ?? [];
    const tables = config.data?.tables.filter((t) => t.isActive) ?? [];
    return rooms
      .map((room) => ({ room, tables: tables.filter((t) => t.roomId === room.id).sort(byName) }))
      .filter((g) => g.tables.length);
  }, [config.data]);

  async function submit(event: FormEvent<HTMLFormElement>, overrides: Record<string, boolean> = {}) {
    event.preventDefault();
    setError(null);
    if (!time) {
      setError("Scegli un orario");
      return;
    }
    const form = new FormData(event.currentTarget);
    const text = (name: string) => {
      const v = String(form.get(name) ?? "").trim();
      return v === "" ? null : v;
    };
    const guest = {
      guestName: contact.name.trim(),
      guestPhone: contact.phone.trim() || null,
      guestEmail: contact.email.trim() || null,
      guestNote: text("guestNote"),
      internalNote: text("internalNote"),
    };

    try {
      if (editing) {
        const tablesChanged =
          manualTables !== null &&
          manualTables.slice().sort().join() !== editing.tableIds.slice().sort().join();
        await save.mutateAsync({ date, time, partySize, ...guest, ...overrides });
        if (tablesChanged) {
          await saveTables.mutateAsync({ tableIds: manualTables!, ignoreCapacity: overrides.ignoreCapacity });
        }
        toast.success("Prenotazione aggiornata");
      } else {
        await save.mutateAsync({
          date,
          time,
          partySize,
          ...guest,
          ...(manualTables?.length ? { tableIds: manualTables } : {}),
          ...(walkIn ? { channel: "walk_in" } : {}),
          ...(linkedGuest ? { guestId: linkedGuest.id } : {}),
          ...overrides,
        });
        toast.success(walkIn ? "Walk-in registrato" : `Prenotazione inserita alle ${time}`);
      }
      onClose();
    } catch (e) {
      if (e instanceof ApiError && OVERRIDES[e.code] && !overrides[OVERRIDES[e.code]!.flag]) {
        setWarning({ code: e.code, message: e.message });
      } else {
        setError(describeError(e));
      }
    }
  }

  const override = warning ? OVERRIDES[warning.code] : null;
  const pending = save.isPending || saveTables.isPending;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title={editing ? `Modifica: ${editing.guestName}` : walkIn ? "Walk-in" : "Nuova prenotazione"}
      description={
        editing ? (
          <span className="flex flex-wrap items-center gap-2">
            <ChannelBadge channel={editing.channel} />
            {editing.channel === "online"
              ? "Prenotata dal cliente online"
              : editing.channel === "walk_in"
                ? "Registrata all'arrivo"
                : "Inserita dallo staff"}{" "}
            il {formatInstant(editing.createdAt, timezone)}
          </span>
        ) : walkIn ? (
          "Clienti arrivati senza prenotazione: vengono fatti sedere subito."
        ) : undefined
      }
    >
      <form
        id="reservation-form"
        onSubmit={(e) => submit(e)}
        className="grid gap-5 md:grid-cols-[1fr_1fr]"
        onChange={() => setWarning(null)}
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-end gap-4">
            <Field label="Persone">
              {(id) => (
                <div className="flex items-center gap-1">
                  <Button
                    variant="secondary"
                    size="icon"
                    onClick={() => setPartySize((n) => Math.max(1, n - 1))}
                    aria-label="Meno"
                  >
                    <Minus className="h-4 w-4" />
                  </Button>
                  <Input
                    id={id}
                    type="number"
                    min={1}
                    max={100}
                    value={partySize}
                    onChange={(e) => setPartySize(Math.max(1, Number(e.target.value) || 1))}
                    className="w-16 text-center text-base font-semibold"
                  />
                  <Button
                    variant="secondary"
                    size="icon"
                    onClick={() => setPartySize((n) => n + 1)}
                    aria-label="Più"
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </Field>
            {!walkIn && (
              <Field label="Data">
                {(id) => (
                  <Input
                    id={id}
                    type="date"
                    value={date}
                    onChange={(e) => e.target.value && setDate(e.target.value)}
                  />
                )}
              </Field>
            )}
          </div>

          {walkIn ? (
            <Field label="Orario di arrivo">
              {(id) => (
                <Input
                  id={id}
                  type="time"
                  value={time ?? ""}
                  onChange={(e) => setTime(e.target.value || null)}
                />
              )}
            </Field>
          ) : (
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium">Orario</span>
              {availability.isPending && <p className="text-sm text-muted">Calcolo disponibilità…</p>}
              {availability.data?.services.length === 0 && (
                <p className="text-sm text-muted">Nessun servizio configurato.</p>
              )}
              {availability.data?.services.map((service) => (
                <div key={service.serviceId} className="rounded-xl border border-line p-3">
                  <div className="mb-2 flex items-baseline justify-between">
                    <span className="text-sm font-semibold">{service.name}</span>
                    {service.status === "closed" && (
                      <span className="text-xs text-muted">
                        {CLOSED_REASON_LABELS[service.reason ?? ""] ?? "Chiuso"}
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-5">
                    {service.slots.map((slot) => (
                      <button
                        key={slot.time}
                        type="button"
                        disabled={!slot.available && slot.time !== time}
                        onClick={() => setTime(slot.time)}
                        title={
                          slot.available
                            ? `Tavolo ${slot.option?.name}`
                            : SLOT_REASON_LABELS[slot.reason ?? ""]
                        }
                        className={cn(
                          "flex flex-col items-center rounded-lg border px-1 py-1.5 text-sm transition-colors",
                          slot.time === time
                            ? "border-brand-600 bg-brand-600 text-white"
                            : slot.available
                              ? "border-line hover:border-brand-500 hover:bg-brand-50"
                              : "cursor-not-allowed border-transparent bg-canvas text-muted/60 line-through",
                        )}
                      >
                        <span className="font-medium">{slot.time}</span>
                        {slot.available && (
                          <span
                            className={cn("text-[10px]", slot.time === time ? "text-white/80" : "text-muted")}
                          >
                            {slot.option?.name}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              <Field label="Altro orario" hint="Per orari fuori dalla griglia, es. 20:10">
                {(id) => (
                  <Input
                    id={id}
                    type="time"
                    value={time ?? ""}
                    onChange={(e) => setTime(e.target.value || null)}
                    className="w-36"
                  />
                )}
              </Field>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Tavoli</span>
              {manualTables !== null && !editing && (
                <button
                  type="button"
                  className="text-xs text-brand-700 hover:underline"
                  onClick={() => setManualTables(null)}
                >
                  Torna all&apos;assegnazione automatica
                </button>
              )}
            </div>
            {manualTables === null ? (
              <div className="flex items-center justify-between gap-2 rounded-xl bg-brand-50 px-3 py-2.5 text-sm text-brand-900">
                <span className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4" />
                  {selectedSlot?.option ? (
                    <>
                      Automatico: <strong>{selectedSlot.option.name}</strong>
                    </>
                  ) : (
                    "Automatico, per priorità"
                  )}
                </span>
                <Button size="sm" variant="secondary" onClick={() => setManualTables([])}>
                  Scegli
                </Button>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {tablesByRoom.map(({ room, tables }) => (
                  <div key={room.id}>
                    <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">{room.name}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {tables.map((table) => {
                        const on = manualTables.includes(table.id);
                        return (
                          <button
                            key={table.id}
                            type="button"
                            onClick={() =>
                              setManualTables((list) =>
                                on
                                  ? (list ?? []).filter((id) => id !== table.id)
                                  : [...(list ?? []), table.id],
                              )
                            }
                            className={cn(
                              "rounded-lg border px-2.5 py-1 text-sm",
                              on ? "border-brand-600 bg-brand-600 text-white" : "border-line hover:bg-canvas",
                            )}
                          >
                            {table.name}
                            <span className={cn("ml-1 text-xs", on ? "text-white/80" : "text-muted")}>
                              {table.minCovers}-{table.maxCovers}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
                <p className="text-xs text-muted">Seleziona più tavoli per unirli.</p>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <GuestLookup
            contact={contact}
            onContactChange={(next) => {
              setContact(next);
              setWarning(null);
            }}
            linked={linkedGuest}
            onLink={setLinkedGuest}
          />
          <Field label="Note del cliente" hint="Allergie, occasione, richieste">
            {(id) => <Textarea id={id} name="guestNote" defaultValue={editing?.guestNote ?? ""} />}
          </Field>
          <Field label="Note interne" hint="Visibili solo allo staff">
            {(id) => <Textarea id={id} name="internalNote" defaultValue={editing?.internalNote ?? ""} />}
          </Field>
        </div>

        <div className="flex flex-col gap-3 md:col-span-2">
          {warning && override && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <span className="flex items-start gap-2">
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                {warning.message}
              </span>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  const formEl = document.getElementById("reservation-form") as HTMLFormElement;
                  void submit(
                    { preventDefault: () => undefined, currentTarget: formEl } as FormEvent<HTMLFormElement>,
                    {
                      [override.flag]: true,
                    },
                  );
                }}
              >
                {override.label}
              </Button>
            </div>
          )}
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>
              Annulla
            </Button>
            <Button type="submit" loading={pending}>
              {editing ? "Salva modifiche" : walkIn ? "Fai sedere" : "Prenota"}
            </Button>
          </div>
        </div>
      </form>
    </Dialog>
  );
}
