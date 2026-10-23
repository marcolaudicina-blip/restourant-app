"use client";

import { CalendarOff, Plus, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useConfigSave } from "@/components/config/use-save";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardHeader, EmptyState } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/field";
import { PageLoader } from "@/components/ui/spinner";
import { formatDateLong } from "@/lib/labels";
import { useConfig } from "@/lib/queries";
import { useRestaurant } from "@/lib/restaurant";

type Kind = "closed" | "closed_online" | "special_hours";

export default function ClosuresPage() {
  const config = useConfig();
  const { can, today } = useRestaurant();
  const { save, run, pending } = useConfigSave();
  const [kind, setKind] = useState<Kind>("closed");

  if (config.isPending) return <PageLoader />;
  const services = config.data?.services ?? [];
  const serviceName = new Map(services.map((s) => [s.id, s.name]));
  const upcoming = (config.data?.calendarExceptions ?? []).filter((e) => e.dateTo >= today());
  const editable = can("config.write");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const dateFrom = String(data.get("dateFrom"));
    const special = kind === "special_hours";
    await save(
      "POST",
      "/calendar-exceptions",
      {
        kind: special ? "special_hours" : "closed",
        scope: kind === "closed_online" ? "online" : "all",
        dateFrom,
        dateTo: String(data.get("dateTo") || dateFrom),
        serviceId: data.get("serviceId") || null,
        firstArrival: special ? data.get("firstArrival") : null,
        lastArrival: special ? data.get("lastArrival") : null,
        note: String(data.get("note") ?? "").trim() || null,
      },
      "Eccezione salvata",
    )
      .then(() => form.reset())
      .catch(() => undefined);
  }

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader
          title="Chiusure e orari speciali"
          description="Ferie, giorni di chiusura, serate con orari diversi."
        />
        {upcoming.length === 0 ? (
          <EmptyState icon={<CalendarOff className="h-8 w-8" />} title="Nessuna eccezione in programma" />
        ) : (
          <ul>
            {upcoming.map((e) => (
              <li
                key={e.id}
                className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3 last:border-b-0"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium capitalize">
                    {formatDateLong(e.dateFrom)}
                    {e.dateTo !== e.dateFrom && ` → ${formatDateLong(e.dateTo)}`}
                  </p>
                  <p className="text-sm text-muted">
                    {e.serviceId ? serviceName.get(e.serviceId) : "Tutti i servizi"}
                    {e.kind === "special_hours" && ` · arrivi ${e.firstArrival}–${e.lastArrival}`}
                    {e.note && ` · ${e.note}`}
                  </p>
                </div>
                <Badge
                  className={
                    e.kind === "special_hours"
                      ? "bg-brand-50 text-brand-700"
                      : e.scope === "online"
                        ? "bg-amber-50 text-amber-800"
                        : "bg-red-50 text-red-700"
                  }
                >
                  {e.kind === "special_hours"
                    ? "Orario speciale"
                    : e.scope === "online"
                      ? "Chiuso online"
                      : "Chiuso"}
                </Badge>
                {editable && (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Elimina"
                    onClick={() =>
                      run("DELETE", `/calendar-exceptions/${e.id}`, undefined, "Eccezione eliminata")
                    }
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {editable && (
        <Card>
          <CardHeader title="Aggiungi" />
          <form onSubmit={submit} className="grid gap-4 p-5 md:grid-cols-3">
            <Field label="Tipo">
              {(id) => (
                <Select id={id} value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
                  <option value="closed">Chiuso</option>
                  <option value="closed_online">Chiuso solo online (telefono aperto)</option>
                  <option value="special_hours">Orario speciale</option>
                </Select>
              )}
            </Field>
            <Field label="Dal">
              {(id) => <Input id={id} name="dateFrom" type="date" required min={today()} />}
            </Field>
            <Field label="Al" hint="Vuoto = un solo giorno">
              {(id) => <Input id={id} name="dateTo" type="date" min={today()} />}
            </Field>
            <Field label="Servizio">
              {(id) => (
                <Select id={id} name="serviceId" required={kind === "special_hours"}>
                  {kind !== "special_hours" && <option value="">Tutti i servizi</option>}
                  {services.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            {kind === "special_hours" && (
              <>
                <Field label="Primo arrivo">
                  {(id) => <Input id={id} name="firstArrival" type="time" required />}
                </Field>
                <Field label="Ultimo arrivo">
                  {(id) => <Input id={id} name="lastArrival" type="time" required />}
                </Field>
              </>
            )}
            <Field label="Nota" className="md:col-span-2">
              {(id) => <Input id={id} name="note" placeholder="Es. Ferie estive" />}
            </Field>
            <div className="flex items-end justify-end md:col-span-3">
              <Button type="submit" loading={pending}>
                <Plus className="h-4 w-4" /> Aggiungi
              </Button>
            </div>
          </form>
        </Card>
      )}
    </div>
  );
}
