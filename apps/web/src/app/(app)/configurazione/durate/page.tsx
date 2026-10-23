"use client";

import { Info, Plus, Trash2 } from "lucide-react";
import type { FormEvent } from "react";
import { InlineNumber } from "@/components/config/inline";
import { useConfigSave } from "@/components/config/use-save";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/field";
import { PageLoader } from "@/components/ui/spinner";
import { formatDuration } from "@/lib/labels";
import { useConfig } from "@/lib/queries";
import { useRestaurant } from "@/lib/restaurant";

export default function TableDurationPage() {
  const config = useConfig();
  const { can } = useRestaurant();
  const { run, save } = useConfigSave();

  if (config.isPending || !config.data) return <PageLoader />;
  const { services, rooms, bookingPolicy: policy } = config.data;
  const rules = [...config.data.durationRules].sort(
    (a, b) => a.minParty - b.minParty || Number(a.serviceId !== null) - Number(b.serviceId !== null),
  );
  const editable = can("config.write");
  const serviceName = new Map(services.map((s) => [s.id, s.name]));
  const roomName = new Map(rooms.map((r) => [r.id, r.name]));

  async function addRule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    await save(
      "POST",
      "/duration-rules",
      {
        minParty: Number(data.get("minParty")),
        maxParty: Number(data.get("maxParty")),
        durationMinutes: Number(data.get("durationMinutes")),
        serviceId: data.get("serviceId") || null,
        roomId: data.get("roomId") || null,
      },
      "Regola aggiunta",
    )
      .then(() => form.reset())
      .catch(() => undefined);
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start gap-3 rounded-xl bg-brand-50 px-4 py-3 text-sm text-brand-900">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          La durata decide per quanto tempo un tavolo resta occupato, e quindi quando può essere riprenotato.
          Vale la regola più specifica: servizio + sala, poi servizio, poi sala, poi quella per tutti. Una
          prenotazione si può sempre allungare a mano.
        </p>
      </div>

      <Card>
        <CardHeader title="Durata del tavolo per numero di persone" />
        <fieldset disabled={!editable}>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-5 py-2 font-medium">Persone</th>
                <th className="px-2 py-2 font-medium">Minuti</th>
                <th className="px-2 py-2 font-medium">Durata</th>
                <th className="px-2 py-2 font-medium">Vale per</th>
                <th className="w-12" />
              </tr>
            </thead>
            <tbody>
              {rules.map((rule) => (
                <tr key={rule.id} className="border-t border-line">
                  <td className="px-3 py-1">
                    <span className="flex items-center gap-1">
                      <InlineNumber
                        value={rule.minParty}
                        min={1}
                        label="Da persone"
                        onCommit={(v) => v && run("PATCH", `/duration-rules/${rule.id}`, { minParty: v })}
                      />
                      –
                      <InlineNumber
                        value={rule.maxParty}
                        min={1}
                        label="A persone"
                        onCommit={(v) => v && run("PATCH", `/duration-rules/${rule.id}`, { maxParty: v })}
                      />
                    </span>
                  </td>
                  <td className="px-0 py-1">
                    <InlineNumber
                      value={rule.durationMinutes}
                      min={15}
                      max={600}
                      label="Minuti"
                      onCommit={(v) =>
                        v && run("PATCH", `/duration-rules/${rule.id}`, { durationMinutes: v })
                      }
                    />
                  </td>
                  <td className="px-2 py-1 font-medium">{formatDuration(rule.durationMinutes)}</td>
                  <td className="px-2 py-1 text-muted">
                    {[
                      rule.serviceId && serviceName.get(rule.serviceId),
                      rule.roomId && roomName.get(rule.roomId),
                    ]
                      .filter(Boolean)
                      .join(" · ") || "Tutti"}
                  </td>
                  <td className="pr-2 text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Elimina regola"
                      onClick={() =>
                        run("DELETE", `/duration-rules/${rule.id}`, undefined, "Regola eliminata")
                      }
                    >
                      <Trash2 className="h-4 w-4 text-muted" />
                    </Button>
                  </td>
                </tr>
              ))}
              <tr className="border-t border-line bg-canvas/60">
                <td className="px-5 py-2 text-muted">Tutti gli altri casi</td>
                <td className="px-0 py-1">
                  <InlineNumber
                    value={policy.defaultDurationMinutes}
                    min={15}
                    max={600}
                    label="Durata predefinita"
                    onCommit={(v) =>
                      v && run("PATCH", "/booking-policy", { defaultDurationMinutes: v }, "Durata aggiornata")
                    }
                  />
                </td>
                <td className="px-2 py-2 font-medium">{formatDuration(policy.defaultDurationMinutes)}</td>
                <td className="px-2 py-2 text-muted">Predefinita</td>
                <td />
              </tr>
            </tbody>
          </table>
        </fieldset>
        {editable && (
          <form onSubmit={addRule} className="flex flex-wrap items-end gap-2 border-t border-line px-5 py-3">
            <Input
              name="minParty"
              type="number"
              min={1}
              required
              placeholder="Da"
              className="w-20"
              aria-label="Nuova regola: da persone"
            />
            <Input
              name="maxParty"
              type="number"
              min={1}
              required
              placeholder="A"
              className="w-20"
              aria-label="Nuova regola: a persone"
            />
            <Input
              name="durationMinutes"
              type="number"
              min={15}
              max={600}
              step={5}
              required
              placeholder="Minuti"
              className="w-24"
              aria-label="Nuova regola: minuti"
            />
            <Select name="serviceId" className="w-40" aria-label="Servizio">
              <option value="">Tutti i servizi</option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
            <Select name="roomId" className="w-40" aria-label="Sala">
              <option value="">Tutte le sale</option>
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </Select>
            <Button type="submit" variant="secondary">
              <Plus className="h-4 w-4" /> Aggiungi regola
            </Button>
          </form>
        )}
      </Card>
    </div>
  );
}
