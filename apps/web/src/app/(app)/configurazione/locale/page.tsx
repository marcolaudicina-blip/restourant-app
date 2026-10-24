"use client";

import { Download } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useConfigSave } from "@/components/config/use-save";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import { PageLoader } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
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
    <>
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
      {can("restaurant.write") && <ExportCard />}
    </>
  );
}

/** GDPR portability, and a copy of everything the owner can keep. */
function ExportCard() {
  const { base } = useRestaurant();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function download() {
    setBusy(true);
    try {
      const response = await fetch(`/api/v1${base}/export`);
      if (!response.ok) throw new Error(String(response.status));
      const name =
        /filename="([^"]+)"/.exec(response.headers.get("content-disposition") ?? "")?.[1] ??
        "twentyreserve.json";
      const url = URL.createObjectURL(await response.blob());
      const link = Object.assign(document.createElement("a"), { href: url, download: name });
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Impossibile scaricare i dati ora. Riprova tra poco.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader
        title="I tuoi dati"
        description="Scarica in un file tutto quello che il locale ha in TwentyReserve: configurazione, clienti, prenotazioni, lista d'attesa e personale. Solo il titolare."
      />
      <div className="p-5">
        <Button variant="secondary" onClick={download} loading={busy}>
          <Download className="h-4 w-4" /> Scarica tutti i dati (JSON)
        </Button>
      </div>
    </Card>
  );
}
