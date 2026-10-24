"use client";

import { SLOT_INTERVALS, type BookingPolicy, type OnlinePartyLimit } from "@restourant/shared";
import { Plus, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useConfigSave } from "@/components/config/use-save";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Field, Input, Select, Switch, Textarea } from "@/components/ui/field";
import { PageLoader } from "@/components/ui/spinner";
import { cn } from "@/lib/cn";
import { WEEKDAYS } from "@/lib/labels";
import { useConfig } from "@/lib/queries";
import { useRestaurant } from "@/lib/restaurant";

export default function BookingRulesPage() {
  const config = useConfig();
  if (config.isPending || !config.data) return <PageLoader />;
  // Remount the form when the stored policy changes, so defaults reflect the saved values.
  return <RulesForm key={config.data.bookingPolicy.updatedAt} policy={config.data.bookingPolicy} />;
}

function RulesForm({ policy }: { policy: BookingPolicy }) {
  const { can } = useRestaurant();
  const { save, pending } = useConfigSave();
  const [flags, setFlags] = useState({
    onlineEnabled: policy.onlineEnabled,
    guestCanCancel: policy.guestCanCancel,
    guestCanModify: policy.guestCanModify,
    requirePhone: policy.requirePhone,
    requireEmail: policy.requireEmail,
    emailStaffBookings: policy.emailStaffBookings,
    sendReminders: policy.sendReminders,
    waitlistEnabled: policy.waitlistEnabled,
  });
  const [confirmationMode, setConfirmationMode] = useState(policy.confirmationMode);
  const [limits, setLimits] = useState<OnlinePartyLimit[]>(policy.onlinePartyLimits);
  const flag = (name: keyof typeof flags) => ({
    checked: flags[name],
    onChange: (v: boolean) => setFlags((f) => ({ ...f, [name]: v })),
  });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const num = (name: string) => Number(data.get(name));
    await save(
      "PATCH",
      "/booking-policy",
      {
        ...flags,
        confirmationMode,
        autoConfirmMaxParty: confirmationMode === "auto_up_to" ? num("autoConfirmMaxParty") : null,
        minPartyOnline: num("minPartyOnline"),
        maxPartyOnline: num("maxPartyOnline"),
        largePartyMode: data.get("largePartyMode"),
        minNoticeMinutes: num("minNoticeMinutes"),
        maxAdvanceDays: num("maxAdvanceDays"),
        cancellationNoticeHours: num("cancellationNoticeHours"),
        slotIntervalMinutes: num("slotIntervalMinutes"),
        defaultDurationMinutes: num("defaultDurationMinutes"),
        policyText: String(data.get("policyText") ?? "").trim() || null,
        onlinePartyLimits: limits.map((l) => ({ ...l, daysOfWeek: [...l.daysOfWeek].sort() })),
      },
      "Regole salvate",
    ).catch(() => undefined);
  }

  return (
    <form onSubmit={submit}>
      <fieldset disabled={!can("config.write")} className="flex flex-col gap-5">
        <Card>
          <CardHeader
            title="Prenotazione online"
            description="Cosa può fare un cliente dalla pagina di prenotazione e dal widget."
          />
          <div className="grid gap-5 p-5 md:grid-cols-2">
            <div className="md:col-span-2">
              <Switch
                label="Prenotazioni online attive"
                description="Se disattivi, si prenota solo tramite lo staff."
                {...flag("onlineEnabled")}
              />
            </div>
            <Field label="Persone minime online">
              {(id) => (
                <Input
                  id={id}
                  name="minPartyOnline"
                  type="number"
                  min={1}
                  defaultValue={policy.minPartyOnline}
                />
              )}
            </Field>
            <Field label="Persone massime online">
              {(id) => (
                <Input
                  id={id}
                  name="maxPartyOnline"
                  type="number"
                  min={1}
                  defaultValue={policy.maxPartyOnline}
                />
              )}
            </Field>
            <Field label="Gruppi più numerosi">
              {(id) => (
                <Select id={id} name="largePartyMode" defaultValue={policy.largePartyMode}>
                  <option value="request">Possono inviare una richiesta</option>
                  <option value="phone_only">Devono telefonare</option>
                </Select>
              )}
            </Field>
            <Field label="Conferma">
              {(id) => (
                <Select
                  id={id}
                  value={confirmationMode}
                  onChange={(e) => setConfirmationMode(e.target.value as typeof confirmationMode)}
                >
                  <option value="auto">Automatica</option>
                  <option value="manual">Manuale (approvi tu)</option>
                  <option value="auto_up_to">Automatica fino a N persone</option>
                </Select>
              )}
            </Field>
            {confirmationMode === "auto_up_to" && (
              <Field label="Conferma automatica fino a">
                {(id) => (
                  <Input
                    id={id}
                    name="autoConfirmMaxParty"
                    type="number"
                    min={1}
                    required
                    defaultValue={policy.autoConfirmMaxParty ?? 6}
                  />
                )}
              </Field>
            )}
            <Field
              label="Preavviso minimo (minuti)"
              hint="Es. 60: non si prenota online per l'ora successiva"
            >
              {(id) => (
                <Input
                  id={id}
                  name="minNoticeMinutes"
                  type="number"
                  min={0}
                  defaultValue={policy.minNoticeMinutes}
                />
              )}
            </Field>
            <Field label="Prenotabile fino a (giorni prima)">
              {(id) => (
                <Input
                  id={id}
                  name="maxAdvanceDays"
                  type="number"
                  min={1}
                  max={365}
                  defaultValue={policy.maxAdvanceDays}
                />
              )}
            </Field>
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Persone per fascia oraria"
            description="Limita i gruppi online in certi orari, es. dalle 19:00 alle 20:00 al massimo 6 persone. Lo staff può sempre inserirli."
          />
          <PartyLimits limits={limits} onChange={setLimits} max={policy.maxPartyOnline} />
        </Card>

        <Card>
          <CardHeader
            title="Modifiche e cancellazioni"
            description="Il cliente lo fa dal pulsante “Gestisci la prenotazione” nelle email: lo staff riceve un avviso."
          />
          <div className="grid gap-5 p-5 md:grid-cols-2">
            <Switch label="Il cliente può cancellare" {...flag("guestCanCancel")} />
            <Switch label="Il cliente può modificare" {...flag("guestCanModify")} />
            <Field label="Fino a quante ore prima" hint="Dopo, il cliente deve contattare il ristorante">
              {(id) => (
                <Input
                  id={id}
                  name="cancellationNoticeHours"
                  type="number"
                  min={0}
                  defaultValue={policy.cancellationNoticeHours}
                />
              )}
            </Field>
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Email ai clienti"
            description="Partono solo se il cliente ha lasciato l'email. Le prenotazioni online ricevono sempre la conferma."
          />
          <div className="grid gap-5 p-5 md:grid-cols-2">
            <Switch
              label="Avvisa delle prenotazioni gestite dallo staff"
              description="Conferma quando inserite una prenotazione, e un'email se la spostate o la cancellate."
              {...flag("emailStaffBookings")}
            />
            <Switch
              label="Promemoria il giorno prima"
              description="Ogni mattina, ai clienti con prenotazione confermata per il giorno dopo."
              {...flag("sendReminders")}
            />
            <Switch
              label="Lista d'attesa sulla pagina di prenotazione"
              description="Nei giorni pieni il cliente può mettersi in lista: se qualcuno disdice gli mandiamo un'email per prenotare."
              {...flag("waitlistEnabled")}
            />
          </div>
        </Card>

        <Card>
          <CardHeader title="Dati richiesti e orari" />
          <div className="grid gap-5 p-5 md:grid-cols-2">
            <Switch label="Telefono obbligatorio" {...flag("requirePhone")} />
            <Switch label="Email obbligatoria" {...flag("requireEmail")} />
            <Field label="Intervallo tra gli arrivi">
              {(id) => (
                <Select id={id} name="slotIntervalMinutes" defaultValue={policy.slotIntervalMinutes}>
                  {SLOT_INTERVALS.map((m) => (
                    <option key={m} value={m}>
                      Ogni {m} minuti
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Durata predefinita (minuti)" hint="Quando nessuna regola di durata corrisponde">
              {(id) => (
                <Input
                  id={id}
                  name="defaultDurationMinutes"
                  type="number"
                  min={15}
                  max={600}
                  defaultValue={policy.defaultDurationMinutes}
                />
              )}
            </Field>
            <Field
              label="Testo delle condizioni"
              className="md:col-span-2"
              hint="Mostrato al cliente prima di confermare"
            >
              {(id) => <Textarea id={id} name="policyText" defaultValue={policy.policyText ?? ""} rows={4} />}
            </Field>
          </div>
        </Card>

        <div className="flex justify-end">
          <Button type="submit" loading={pending} size="lg">
            Salva regole
          </Button>
        </div>
      </fieldset>
    </form>
  );
}

/** "Arrivals from … to … (included), on these days: online at most N people", one row each. */
function PartyLimits({
  limits,
  onChange,
  max,
}: {
  limits: OnlinePartyLimit[];
  onChange: (limits: OnlinePartyLimit[]) => void;
  max: number;
}) {
  const update = (i: number, patch: Partial<OnlinePartyLimit>) =>
    onChange(limits.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  return (
    <div className="flex flex-col gap-3 p-5">
      {limits.length === 0 && (
        <p className="text-sm text-muted">
          Nessun limite: online vale il massimo di {max} persone a ogni orario.
        </p>
      )}
      {limits.map((limit, i) => (
        <div
          key={i}
          role="group"
          aria-label={`Fascia ${i + 1}`}
          className="flex flex-wrap items-end gap-3 rounded-xl border border-line p-3"
        >
          <div className="flex flex-wrap gap-1">
            {WEEKDAYS.map((d) => {
              const on = limit.daysOfWeek.includes(d.value);
              return (
                <button
                  key={d.value}
                  type="button"
                  aria-pressed={on}
                  onClick={() =>
                    update(i, {
                      daysOfWeek: on
                        ? limit.daysOfWeek.filter((x) => x !== d.value)
                        : [...limit.daysOfWeek, d.value],
                    })
                  }
                  className={cn(
                    "w-11 rounded-lg border py-1.5 text-xs font-medium",
                    on ? "border-brand-600 bg-brand-600 text-white" : "border-line",
                  )}
                >
                  {d.short}
                </button>
              );
            })}
          </div>
          <label className="flex flex-col gap-1 text-xs text-muted">
            Arrivi dalle
            <Input type="time" value={limit.from} onChange={(e) => update(i, { from: e.target.value })} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            alle (compreso)
            <Input type="time" value={limit.to} onChange={(e) => update(i, { to: e.target.value })} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            Max persone online
            <Input
              type="number"
              min={1}
              max={100}
              className="w-24"
              value={limit.maxParty}
              onChange={(e) => update(i, { maxParty: Number(e.target.value) })}
            />
          </label>
          <Button
            type="button"
            variant="ghost"
            aria-label={`Elimina fascia ${i + 1}`}
            onClick={() => onChange(limits.filter((_, j) => j !== i))}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}
      <div>
        <Button
          type="button"
          variant="secondary"
          onClick={() =>
            onChange([
              ...limits,
              { daysOfWeek: [1, 2, 3, 4, 5, 6, 7], from: "19:00", to: "20:00", maxParty: Math.min(6, max) },
            ])
          }
        >
          <Plus className="h-4 w-4" /> Aggiungi fascia
        </Button>
      </div>
    </div>
  );
}
