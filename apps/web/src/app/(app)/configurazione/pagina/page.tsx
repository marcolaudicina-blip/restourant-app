"use client";

import { addDays, MAX_GALLERY_PHOTOS } from "@restourant/shared";
import { TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { QrCard } from "@/components/config/qr-card";
import { useConfigSave } from "@/components/config/use-save";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/field";
import { PageLoader } from "@/components/ui/spinner";
import { useBookingPage, useConfig } from "@/lib/queries";
import { useRestaurant } from "@/lib/restaurant";
import type { BookingPageSettings, ConfigSnapshot, PublicProfile } from "@/lib/types";
import { useOrigin, ShareCard, EmbedCard } from "@/components/config/booking-page/share";
import { ColorPicker, ImageSlot, Gallery } from "@/components/config/booking-page/look";
import { Preview, NOTE_EXAMPLE, type PreviewMode } from "@/components/config/booking-page/preview";

export default function BookingPageSettingsPage() {
  const config = useConfig();
  const page = useBookingPage();
  if (!config.data || !page.data) return <PageLoader />;
  // Remounts with fresh values after a save.
  return <Editor key={JSON.stringify(page.data)} config={config.data} saved={page.data} />;
}

function Editor({ config, saved }: { config: ConfigSnapshot; saved: BookingPageSettings }) {
  const { can, today } = useRestaurant();
  const { save, pending } = useConfigSave();
  const [draft, setDraft] = useState(saved);
  const editable = can("config.write");
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const update = (patch: Partial<BookingPageSettings>) => setDraft((d) => ({ ...d, ...patch }));
  const [previewMode, setPreviewMode] = useState<PreviewMode>("page");

  const r = config.restaurant;
  const policy = config.bookingPolicy;
  const origin = useOrigin();
  const profile: PublicProfile = {
    // Times in the preview come from the saved address, which already works.
    slug: saved.slug,
    name: r.name,
    phone: r.phone,
    email: r.email,
    website: r.website,
    addressLine: r.addressLine,
    city: r.city,
    postalCode: r.postalCode,
    timezone: r.timezone,
    page: {
      brandColor: draft.brandColor,
      description: draft.description,
      confirmationNote: draft.confirmationNote,
      privacyUrl: draft.privacyUrl,
      logoId: draft.logoId,
      coverId: draft.coverId,
      photoIds: draft.photoIds,
    },
    booking: {
      enabled: policy.onlineEnabled,
      minParty: policy.minPartyOnline,
      maxParty: policy.maxPartyOnline,
      largePartyMode: policy.largePartyMode,
      requirePhone: policy.requirePhone,
      requireEmail: policy.requireEmail,
      policyText: policy.policyText,
      guestRetentionMonths: policy.guestRetentionMonths,
      reviewRequests: policy.reviewRequests,
      today: today(),
      lastDate: addDays(today(), policy.maxAdvanceDays),
    },
  };

  async function submit() {
    const { slug, ...rest } = draft;
    await save(
      "PATCH",
      "/booking-page",
      {
        ...rest,
        description: rest.description?.trim() || null,
        confirmationNote: rest.confirmationNote?.trim() || null,
        privacyUrl: rest.privacyUrl?.trim() || null,
        slug: slug.trim().toLowerCase(),
      },
      "Pagina di prenotazione salvata",
    ).catch(() => undefined);
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_400px]">
      <fieldset disabled={!editable} className="flex min-w-0 flex-col gap-5">
        {!policy.onlineEnabled && (
          <p className="flex items-start gap-2 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Le prenotazioni online sono disattivate: la pagina mostra solo i contatti.{" "}
              <Link href="/configurazione/regole" className="font-medium underline">
                Attivale nelle regole di prenotazione
              </Link>
              .
            </span>
          </p>
        )}

        <ShareCard saved={saved} draft={draft} onSlug={(slug) => update({ slug })} />

        <Card>
          <CardHeader title="Aspetto" description="Colore, logo e immagine di copertina del tuo locale." />
          <div className="flex flex-col gap-6 p-5">
            <ColorPicker value={draft.brandColor} onChange={(brandColor) => update({ brandColor })} />
            <div className="grid gap-5 md:grid-cols-[auto_minmax(0,1fr)]">
              <ImageSlot
                label="Logo"
                hint="Quadrato, sfondo trasparente se possibile"
                imageId={draft.logoId}
                onChange={(logoId) => update({ logoId })}
                maxSize={512}
                keepTransparency
                className="h-32 w-32"
                fit="contain"
              />
              <ImageSlot
                label="Copertina"
                hint="Foto orizzontale della sala o di un piatto"
                imageId={draft.coverId}
                onChange={(coverId) => update({ coverId })}
                maxSize={2000}
                className="aspect-[16/7] w-full"
              />
            </div>
            <Field
              label="Presentazione"
              hint={`${draft.description?.length ?? 0}/600 · Qualche riga sul locale: cucina, atmosfera, specialità`}
            >
              {(id) => (
                <Textarea
                  id={id}
                  maxLength={600}
                  rows={4}
                  value={draft.description ?? ""}
                  onChange={(e) => update({ description: e.target.value })}
                  placeholder="Cucina siciliana di mare, pasta fresca fatta in casa e una cantina di vini dell'Etna."
                />
              )}
            </Field>
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Foto del locale"
            description={`Fino a ${MAX_GALLERY_PHOTOS} foto, nell'ordine in cui compaiono. La prima è la più grande.`}
          />
          <div className="p-5">
            <Gallery photoIds={draft.photoIds} onChange={(photoIds) => update({ photoIds })} />
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Avviso dopo la prenotazione"
            description="Le tue regole e informazioni utili: compaiono subito dopo la prenotazione e nell'email di conferma."
          />
          <div className="flex flex-col gap-3 p-5">
            <Field
              label="Testo dell'avviso"
              hint={`${draft.confirmationNote?.length ?? 0}/2000 · Ritardi, disdette, caparra, parcheggio, allergie, animali…`}
            >
              {(id) => (
                <Textarea
                  id={id}
                  maxLength={2000}
                  rows={6}
                  value={draft.confirmationNote ?? ""}
                  onFocus={() => setPreviewMode("confirmation")}
                  onChange={(e) => update({ confirmationNote: e.target.value })}
                  placeholder={NOTE_EXAMPLE}
                />
              )}
            </Field>
            {!draft.confirmationNote?.trim() && (
              <div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    update({ confirmationNote: NOTE_EXAMPLE });
                    setPreviewMode("confirmation");
                  }}
                >
                  Parti da un esempio
                </Button>
              </div>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Informativa privacy per i clienti"
            description="Chi prenota deve dichiarare di averla letta. Se non ne hai una tua, usiamo quella che prepariamo noi con i dati del locale."
          />
          <div className="flex flex-col gap-3 p-5">
            <Field
              label="Link alla tua informativa (facoltativo)"
              hint="Lascia vuoto per usare quella pronta di TwentyReserve."
            >
              {(id) => (
                <Input
                  id={id}
                  type="url"
                  value={draft.privacyUrl ?? ""}
                  onChange={(e) => update({ privacyUrl: e.target.value })}
                  placeholder="https://www.iltuoristorante.it/privacy"
                />
              )}
            </Field>
            <a
              href={`/prenota/${saved.slug}/privacy`}
              target="_blank"
              rel="noreferrer"
              className="text-sm font-medium text-brand-700 hover:underline"
            >
              Vedi l&apos;informativa pronta
            </a>
          </div>
        </Card>

        <QrCard
          url={`${origin}/prenota/${saved.slug}`}
          slug={saved.slug}
          name={r.name}
          color={saved.brandColor}
        />
        <EmbedCard slug={saved.slug} color={saved.brandColor} />

        {editable && (
          <div className="sticky bottom-4 z-10 flex items-center justify-end gap-3 rounded-xl border border-line bg-surface/95 px-4 py-3 shadow-lg backdrop-blur">
            <span className="mr-auto text-sm text-muted">
              {dirty ? "Modifiche non salvate" : "Tutto salvato"}
            </span>
            <Button variant="secondary" disabled={!dirty || pending} onClick={() => setDraft(saved)}>
              Annulla
            </Button>
            <Button disabled={!dirty} loading={pending} onClick={submit}>
              Salva
            </Button>
          </div>
        )}
      </fieldset>

      <Preview profile={profile} mode={previewMode} onMode={setPreviewMode} />
    </div>
  );
}
