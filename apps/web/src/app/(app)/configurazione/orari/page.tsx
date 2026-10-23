"use client";

import { SLOT_INTERVALS } from "@restourant/shared";
import { Clock, Pencil, Plus, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useConfigSave } from "@/components/config/use-save";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardHeader, EmptyState } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, Switch } from "@/components/ui/field";
import { PageLoader } from "@/components/ui/spinner";
import { cn } from "@/lib/cn";
import { WEEKDAYS } from "@/lib/labels";
import { useConfig } from "@/lib/queries";
import { useRestaurant } from "@/lib/restaurant";
import type { Service } from "@/lib/types";

export default function OpeningHoursPage() {
  const config = useConfig();
  const { can } = useRestaurant();
  const { run } = useConfigSave();
  const [editing, setEditing] = useState<Service | "new" | null>(null);

  if (config.isPending) return <PageLoader />;
  const services = config.data?.services ?? [];
  const policy = config.data!.bookingPolicy;
  const editable = can("config.write");

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader
          title="Orari prenotabili"
          description="Ogni servizio (pranzo, cena…) ha i suoi giorni, il primo e l'ultimo orario di arrivo e i limiti per la cucina. Per ferie e giorni speciali usa Chiusure."
          actions={
            editable && (
              <Button onClick={() => setEditing("new")}>
                <Plus className="h-4 w-4" /> Nuovo servizio
              </Button>
            )
          }
        />
        {services.length === 0 ? (
          <EmptyState icon={<Clock className="h-8 w-8" />} title="Nessun servizio">
            Crea almeno un servizio (es. Cena) per iniziare a prendere prenotazioni.
          </EmptyState>
        ) : (
          <ul>
            {services.map((s) => (
              <li
                key={s.id}
                className={cn(
                  "flex flex-wrap items-center gap-3 border-b border-line px-5 py-3 last:border-b-0",
                  !s.isActive && "opacity-50",
                )}
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{s.name}</p>
                  <p className="text-sm text-muted">
                    {WEEKDAYS.filter((d) => s.daysOfWeek.includes(d.value))
                      .map((d) => d.short)
                      .join(" ")}{" "}
                    · arrivi {s.firstArrival}–{s.lastArrival}
                    {s.seatingMode === "fixed"
                      ? ` · turni ${s.fixedSeatings.join(", ")}`
                      : ` · ogni ${s.slotIntervalMinutes ?? policy.slotIntervalMinutes}'`}
                  </p>
                </div>
                {s.maxCoversPerSlot && (
                  <Badge className="bg-canvas text-muted">max {s.maxCoversPerSlot} coperti/fascia</Badge>
                )}
                {s.maxCovers && <Badge className="bg-canvas text-muted">max {s.maxCovers} coperti</Badge>}
                {!s.onlineBookable && <Badge className="bg-canvas text-muted">Solo staff</Badge>}
                {s.validFrom && <Badge className="bg-amber-50 text-amber-800">Stagionale</Badge>}
                {editable && (
                  <>
                    <Button variant="ghost" size="icon" onClick={() => setEditing(s)} aria-label="Modifica">
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Elimina"
                      onClick={() =>
                        confirm(`Eliminare il servizio "${s.name}"?`) &&
                        run("DELETE", `/services/${s.id}`, undefined, "Servizio eliminato")
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {editing && (
        <ServiceDialog service={editing === "new" ? null : editing} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}

function ServiceDialog({ service, onClose }: { service: Service | null; onClose: () => void }) {
  const config = useConfig();
  const { save, pending } = useConfigSave();
  const [days, setDays] = useState<number[]>(service?.daysOfWeek ?? [2, 3, 4, 5, 6, 7]);
  const [mode, setMode] = useState(service?.seatingMode ?? "continuous");
  const [onlineBookable, setOnline] = useState(service?.onlineBookable ?? true);
  const [isActive, setActive] = useState(service?.isActive ?? true);
  const [roomIds, setRoomIds] = useState<string[]>(service?.roomIds ?? []);
  const rooms = config.data?.rooms ?? [];

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const optionalNumber = (name: string) => (data.get(name) ? Number(data.get(name)) : null);
    const optionalText = (name: string) => (data.get(name) ? String(data.get(name)) : null);
    const body = {
      name: String(data.get("name")),
      daysOfWeek: [...days].sort(),
      firstArrival: String(data.get("firstArrival")),
      lastArrival: String(data.get("lastArrival")),
      seatingMode: mode,
      fixedSeatings:
        mode === "fixed"
          ? String(data.get("fixedSeatings") ?? "")
              .split(/[,\s]+/)
              .filter(Boolean)
          : [],
      slotIntervalMinutes: optionalNumber("slotIntervalMinutes"),
      maxCovers: optionalNumber("maxCovers"),
      maxCoversPerSlot: optionalNumber("maxCoversPerSlot"),
      maxBookingsPerSlot: optionalNumber("maxBookingsPerSlot"),
      validFrom: optionalText("validFrom"),
      validTo: optionalText("validTo"),
      onlineBookable,
      isActive,
      roomIds,
    };
    await (
      service
        ? save("PATCH", `/services/${service.id}`, body, "Servizio aggiornato")
        : save("POST", "/services", body, "Servizio creato")
    )
      .then(onClose)
      .catch(() => undefined);
  }

  return (
    <Dialog open onClose={onClose} title={service ? `Modifica ${service.name}` : "Nuovo servizio"} size="lg">
      <form onSubmit={submit} className="grid gap-4 md:grid-cols-2">
        <Field label="Nome" className="md:col-span-2">
          {(id) => <Input id={id} name="name" required defaultValue={service?.name} placeholder="Es. Cena" />}
        </Field>
        <div className="md:col-span-2">
          <p className="mb-1.5 text-sm font-medium">Giorni</p>
          <div className="flex flex-wrap gap-1.5">
            {WEEKDAYS.map((d) => {
              const on = days.includes(d.value);
              return (
                <button
                  key={d.value}
                  type="button"
                  onClick={() =>
                    setDays((list) => (on ? list.filter((x) => x !== d.value) : [...list, d.value]))
                  }
                  className={cn(
                    "w-14 rounded-lg border py-1.5 text-sm font-medium",
                    on ? "border-brand-600 bg-brand-600 text-white" : "border-line",
                  )}
                >
                  {d.short}
                </button>
              );
            })}
          </div>
        </div>
        <Field label="Primo arrivo">
          {(id) => (
            <Input
              id={id}
              name="firstArrival"
              type="time"
              required
              defaultValue={service?.firstArrival ?? "19:00"}
            />
          )}
        </Field>
        <Field label="Ultimo arrivo">
          {(id) => (
            <Input
              id={id}
              name="lastArrival"
              type="time"
              required
              defaultValue={service?.lastArrival ?? "22:30"}
            />
          )}
        </Field>
        <Field label="Modalità">
          {(id) => (
            <Select id={id} value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}>
              <option value="continuous">Arrivi continui</option>
              <option value="fixed">Turni fissi</option>
            </Select>
          )}
        </Field>
        {mode === "fixed" ? (
          <Field label="Orari dei turni" hint="Separati da virgola, es. 19:30, 21:30">
            {(id) => (
              <Input
                id={id}
                name="fixedSeatings"
                required
                defaultValue={service?.fixedSeatings.join(", ") ?? "19:30, 21:30"}
              />
            )}
          </Field>
        ) : (
          <Field label="Intervallo tra gli arrivi">
            {(id) => (
              <Select id={id} name="slotIntervalMinutes" defaultValue={service?.slotIntervalMinutes ?? ""}>
                <option value="">Come da regole del locale</option>
                {SLOT_INTERVALS.map((m) => (
                  <option key={m} value={m}>
                    Ogni {m} minuti
                  </option>
                ))}
              </Select>
            )}
          </Field>
        )}
        <Field label="Max coperti per fascia" hint="Protegge la cucina. Vuoto = nessun limite">
          {(id) => (
            <Input
              id={id}
              name="maxCoversPerSlot"
              type="number"
              min={1}
              defaultValue={service?.maxCoversPerSlot ?? ""}
            />
          )}
        </Field>
        <Field label="Max prenotazioni per fascia" hint="Protegge l'accoglienza">
          {(id) => (
            <Input
              id={id}
              name="maxBookingsPerSlot"
              type="number"
              min={1}
              defaultValue={service?.maxBookingsPerSlot ?? ""}
            />
          )}
        </Field>
        <Field label="Max coperti del servizio">
          {(id) => (
            <Input id={id} name="maxCovers" type="number" min={1} defaultValue={service?.maxCovers ?? ""} />
          )}
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Valido dal">
            {(id) => <Input id={id} name="validFrom" type="date" defaultValue={service?.validFrom ?? ""} />}
          </Field>
          <Field label="al">
            {(id) => <Input id={id} name="validTo" type="date" defaultValue={service?.validTo ?? ""} />}
          </Field>
        </div>
        {rooms.length > 1 && (
          <div className="md:col-span-2">
            <p className="mb-1.5 text-sm font-medium">Sale</p>
            <div className="flex flex-wrap gap-1.5">
              {rooms.map((r) => {
                const on = roomIds.includes(r.id);
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setRoomIds((ids) => (on ? ids.filter((x) => x !== r.id) : [...ids, r.id]))}
                    className={cn(
                      "rounded-lg border px-3 py-1.5 text-sm",
                      on ? "border-brand-600 bg-brand-600 text-white" : "border-line",
                    )}
                  >
                    {r.name}
                  </button>
                );
              })}
            </div>
            <p className="mt-1 text-xs text-muted">Nessuna selezionata = tutte le sale.</p>
          </div>
        )}
        <div className="flex flex-col gap-3 md:col-span-2">
          <Switch label="Prenotabile online" checked={onlineBookable} onChange={setOnline} />
          <Switch label="Attivo" checked={isActive} onChange={setActive} />
        </div>
        <div className="flex justify-end gap-2 md:col-span-2">
          <Button variant="secondary" onClick={onClose}>
            Annulla
          </Button>
          <Button type="submit" loading={pending} disabled={days.length === 0}>
            Salva
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
