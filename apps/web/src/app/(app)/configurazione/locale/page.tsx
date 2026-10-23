"use client";

import type { FormEvent } from "react";
import { useConfigSave } from "@/components/config/use-save";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import { PageLoader } from "@/components/ui/spinner";
import { useConfig } from "@/lib/queries";
import { useRestaurant } from "@/lib/restaurant";

export default function RestaurantProfilePage() {
  const config = useConfig();
  const { can } = useRestaurant();
  const { save, pending } = useConfigSave();
  if (config.isPending || !config.data) return <PageLoader />;
  const r = config.data.restaurant;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const text = (name: string) => String(data.get(name) ?? "").trim() || null;
    await save(
      "PATCH",
      "",
      {
        name: text("name"),
        phone: text("phone"),
        email: text("email"),
        website: text("website"),
        addressLine: text("addressLine"),
        city: text("city"),
        postalCode: text("postalCode"),
        timezone: text("timezone"),
      },
      "Dati del locale salvati",
    ).catch(() => undefined);
  }

  return (
    <Card>
      <CardHeader
        title="Dati del locale"
        description={
          can("restaurant.write")
            ? "Compaiono nella pagina di prenotazione e nelle email ai clienti."
            : "Solo il titolare può modificarli."
        }
      />
      <form onSubmit={submit}>
        <fieldset disabled={!can("restaurant.write")} className="grid gap-4 p-5 md:grid-cols-2">
          <Field label="Nome">{(id) => <Input id={id} name="name" required defaultValue={r.name} />}</Field>
          <Field label="Telefono">
            {(id) => <Input id={id} name="phone" type="tel" defaultValue={r.phone ?? ""} />}
          </Field>
          <Field label="Email">
            {(id) => <Input id={id} name="email" type="email" defaultValue={r.email ?? ""} />}
          </Field>
          <Field label="Sito web">
            {(id) => (
              <Input
                id={id}
                name="website"
                type="url"
                placeholder="https://"
                defaultValue={r.website ?? ""}
              />
            )}
          </Field>
          <Field label="Indirizzo" className="md:col-span-2">
            {(id) => <Input id={id} name="addressLine" defaultValue={r.addressLine ?? ""} />}
          </Field>
          <Field label="Città">{(id) => <Input id={id} name="city" defaultValue={r.city ?? ""} />}</Field>
          <Field label="CAP">
            {(id) => <Input id={id} name="postalCode" defaultValue={r.postalCode ?? ""} />}
          </Field>
          <Field label="Fuso orario" hint="Es. Europe/Rome">
            {(id) => <Input id={id} name="timezone" required defaultValue={r.timezone} />}
          </Field>
          <div className="flex items-end justify-end md:col-span-2">
            <Button type="submit" loading={pending}>
              Salva
            </Button>
          </div>
        </fieldset>
      </form>
    </Card>
  );
}
