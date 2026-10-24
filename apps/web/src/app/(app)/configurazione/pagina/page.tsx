"use client";

import { addDays, MAX_GALLERY_PHOTOS } from "@restourant/shared";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CircleCheck,
  Copy,
  ExternalLink,
  ImagePlus,
  Monitor,
  Smartphone,
  TriangleAlert,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Confirmation } from "@/components/booking/booking-flow";
import { BookingPage } from "@/components/booking/booking-page";
import { QrCard } from "@/components/config/qr-card";
import { useConfigSave } from "@/components/config/use-save";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/field";
import { PageLoader, Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { api, describeError } from "@/lib/api";
import { BRAND_PRESETS, brandStyle } from "@/lib/brand";
import { cn } from "@/lib/cn";
import { resizeImage } from "@/lib/images";
import { mediaUrl } from "@/lib/media";
import { useBookingPage, useConfig } from "@/lib/queries";
import { useRestaurant } from "@/lib/restaurant";
import type { BookingPageSettings, ConfigSnapshot, PublicBooking, PublicProfile } from "@/lib/types";

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

function useOrigin() {
  return typeof window === "undefined" ? "" : window.location.origin;
}

function CopyButton({ text, label = "Copia" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="secondary"
      size="sm"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
    >
      {copied ? <Check className="h-4 w-4 text-brand-600" /> : <Copy className="h-4 w-4" />}
      {copied ? "Copiato" : label}
    </Button>
  );
}

function ShareCard({
  saved,
  draft,
  onSlug,
}: {
  saved: BookingPageSettings;
  draft: BookingPageSettings;
  onSlug: (slug: string) => void;
}) {
  const origin = useOrigin();
  const link = `${origin}/prenota/${saved.slug}`;
  return (
    <Card>
      <CardHeader
        title="Il tuo link di prenotazione"
        description="Mettilo sul sito, nella bio di Instagram, su Facebook e nella scheda Google del locale."
      />
      <div className="flex flex-col gap-4 p-5">
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-canvas p-2 pl-3">
          <span className="min-w-0 flex-1 truncate font-medium text-brand-700" data-testid="booking-link">
            {link}
          </span>
          <CopyButton text={link} label="Copia link" />
          <a
            href={link}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-sm font-medium hover:bg-canvas"
          >
            <ExternalLink className="h-4 w-4" /> Apri
          </a>
        </div>
        <Field
          label="Indirizzo della pagina"
          hint="Lettere minuscole, numeri e trattini. Se lo cambi, il vecchio link smette di funzionare."
        >
          {(id) => (
            <div className="flex items-center rounded-lg border border-line bg-surface focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-500/20">
              <span className="whitespace-nowrap pl-3 text-sm text-muted">/prenota/</span>
              <input
                id={id}
                value={draft.slug}
                onChange={(e) => onSlug(e.target.value.toLowerCase().replace(/\s+/g, "-"))}
                maxLength={60}
                className="h-10 min-w-0 flex-1 bg-transparent pr-3 text-sm outline-none"
              />
            </div>
          )}
        </Field>
      </div>
    </Card>
  );
}

function ColorPicker({ value, onChange }: { value: string; onChange: (color: string) => void }) {
  const [text, setText] = useState(value);
  return (
    <div>
      <p className="mb-2 text-sm font-medium">Colore del marchio</p>
      <div className="flex flex-wrap items-center gap-2">
        {BRAND_PRESETS.map((p) => (
          <button
            key={p.color}
            type="button"
            title={p.name}
            aria-label={`Colore ${p.name}`}
            aria-pressed={value === p.color}
            onClick={() => {
              onChange(p.color);
              setText(p.color);
            }}
            className={cn(
              "h-9 w-9 rounded-full ring-offset-2 transition-shadow",
              value === p.color ? "ring-2 ring-ink" : "hover:ring-2 hover:ring-line",
            )}
            style={{ backgroundColor: p.color }}
          />
        ))}
        <label
          className="relative ml-1 flex h-9 items-center gap-2 rounded-full border border-line pl-1 pr-3 text-sm"
          title="Colore personalizzato"
        >
          <input
            type="color"
            value={value}
            aria-label="Colore personalizzato"
            onChange={(e) => {
              onChange(e.target.value);
              setText(e.target.value);
            }}
            className="h-7 w-7 cursor-pointer rounded-full border-0 bg-transparent p-0 [&::-webkit-color-swatch]:rounded-full [&::-webkit-color-swatch]:border-0 [&::-webkit-color-swatch-wrapper]:p-0"
          />
          <input
            value={text}
            aria-label="Codice colore"
            maxLength={7}
            onChange={(e) => {
              setText(e.target.value);
              if (/^#[0-9a-fA-F]{6}$/.test(e.target.value)) onChange(e.target.value.toLowerCase());
            }}
            className="w-20 bg-transparent font-mono text-sm uppercase outline-none"
          />
        </label>
      </div>
    </div>
  );
}

function useUpload() {
  const { base } = useRestaurant();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  async function upload(file: File, options: { maxSize: number; keepTransparency?: boolean }) {
    setBusy(true);
    try {
      const dataUrl = await resizeImage(file, options);
      return (await api<{ id: string }>(`${base}/media`, { method: "POST", body: { dataUrl } })).id;
    } catch (error) {
      toast.error(error instanceof Error && !("status" in error) ? error.message : describeError(error));
      return null;
    } finally {
      setBusy(false);
    }
  }
  return { upload, busy };
}

function FilePicker({
  onFiles,
  multiple = false,
  children,
  className,
  disabled,
}: {
  onFiles: (files: File[]) => void;
  multiple?: boolean;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <button type="button" disabled={disabled} onClick={() => ref.current?.click()} className={className}>
        {children}
      </button>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        multiple={multiple}
        hidden
        onChange={(e) => {
          onFiles([...(e.target.files ?? [])]);
          e.target.value = "";
        }}
      />
    </>
  );
}

function ImageSlot({
  label,
  hint,
  imageId,
  onChange,
  maxSize,
  keepTransparency,
  className,
  fit = "cover",
}: {
  label: string;
  hint: string;
  imageId: string | null;
  onChange: (id: string | null) => void;
  maxSize: number;
  keepTransparency?: boolean;
  className: string;
  fit?: "cover" | "contain";
}) {
  const { upload, busy } = useUpload();
  const pick = async ([file]: File[]) => {
    if (!file) return;
    const id = await upload(file, { maxSize, keepTransparency });
    if (id) onChange(id);
  };
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <p className="text-sm font-medium">{label}</p>
      <FilePicker
        onFiles={pick}
        disabled={busy}
        className={cn(
          "group relative flex items-center justify-center overflow-hidden rounded-xl border border-dashed border-line bg-canvas text-muted hover:border-brand-500",
          className,
        )}
      >
        {imageId ? (
          <img
            src={mediaUrl(imageId)}
            alt={label}
            className={cn("h-full w-full", fit === "contain" ? "object-contain p-2" : "object-cover")}
          />
        ) : (
          <span className="flex flex-col items-center gap-1 text-xs">
            <ImagePlus className="h-6 w-6" />
            Carica {label.toLowerCase()}
          </span>
        )}
        {busy && (
          <span className="absolute inset-0 flex items-center justify-center bg-white/70">
            <Spinner className="h-5 w-5" />
          </span>
        )}
      </FilePicker>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted">{hint}</p>
        {imageId && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="shrink-0 text-xs font-medium text-red-600 hover:underline"
          >
            Rimuovi
          </button>
        )}
      </div>
    </div>
  );
}

function Gallery({ photoIds, onChange }: { photoIds: string[]; onChange: (ids: string[]) => void }) {
  const { upload, busy } = useUpload();
  const toast = useToast();
  const room = MAX_GALLERY_PHOTOS - photoIds.length;

  async function add(files: File[]) {
    if (files.length > room) toast.error(`Puoi aggiungere ancora ${room} foto`);
    const added: string[] = [];
    for (const file of files.slice(0, room)) {
      const id = await upload(file, { maxSize: 1600 });
      if (id) added.push(id);
    }
    onChange([...photoIds, ...added]);
  }
  const move = (from: number, to: number) => {
    const next = [...photoIds];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item!);
    onChange(next);
  };

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {photoIds.map((id, i) => (
        <div key={id} className="group relative overflow-hidden rounded-xl bg-canvas">
          <img src={mediaUrl(id)} alt={`Foto ${i + 1}`} className="aspect-[4/3] w-full object-cover" />
          <div className="absolute inset-x-0 bottom-0 flex justify-between bg-gradient-to-t from-black/60 to-transparent p-1.5">
            <div className="flex gap-1">
              <PhotoButton label="Sposta prima" disabled={i === 0} onClick={() => move(i, i - 1)}>
                <ArrowLeft className="h-3.5 w-3.5" />
              </PhotoButton>
              <PhotoButton
                label="Sposta dopo"
                disabled={i === photoIds.length - 1}
                onClick={() => move(i, i + 1)}
              >
                <ArrowRight className="h-3.5 w-3.5" />
              </PhotoButton>
            </div>
            <PhotoButton label="Rimuovi foto" onClick={() => onChange(photoIds.filter((p) => p !== id))}>
              <X className="h-3.5 w-3.5" />
            </PhotoButton>
          </div>
        </div>
      ))}
      {room > 0 && (
        <FilePicker
          multiple
          onFiles={add}
          disabled={busy}
          className="flex aspect-[4/3] flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-line bg-canvas text-xs text-muted hover:border-brand-500"
        >
          {busy ? <Spinner className="h-5 w-5" /> : <ImagePlus className="h-6 w-6" />}
          Aggiungi foto
        </FilePicker>
      )}
    </div>
  );
}

function PhotoButton({
  label,
  children,
  ...props
}: { label: string; children: ReactNode } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className="rounded-md bg-white/90 p-1 text-ink hover:bg-white disabled:opacity-30"
      {...props}
    >
      {children}
    </button>
  );
}

function EmbedCard({ slug, color }: { slug: string; color: string }) {
  const origin = useOrigin();
  const [kind, setKind] = useState<"button" | "widget">("button");
  const url = `${origin}/prenota/${slug}`;
  const text = color === "#ffffff" ? "#1d1b18" : "#ffffff";
  const code =
    kind === "button"
      ? `<a href="${url}" target="_blank" rel="noopener" style="display:inline-block;padding:14px 28px;border-radius:999px;background:${color};color:${text};font:600 16px/1 system-ui,sans-serif;text-decoration:none">Prenota un tavolo</a>`
      : `<iframe src="${url}?embed=1" title="Prenota un tavolo" style="width:100%;max-width:560px;height:760px;border:0" loading="lazy"></iframe>
<script>
  window.addEventListener("message", function (e) {
    if (!e.data || e.data.type !== "restourant:height") return;
    document.querySelectorAll('iframe[src^="${url}"]').forEach(function (f) {
      if (f.contentWindow === e.source) f.style.height = e.data.height + "px";
    });
  });
</script>`;
  return (
    <Card>
      <CardHeader
        title="Inserisci nel tuo sito"
        description="Copia il codice e incollalo nel tuo sito (su WordPress: blocco “HTML personalizzato”)."
      />
      <div className="flex flex-col gap-3 p-5">
        <div className="flex w-fit rounded-lg border border-line bg-surface p-0.5 text-sm">
          {(
            [
              ["button", "Pulsante"],
              ["widget", "Modulo nella pagina"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setKind(value)}
              className={cn(
                "rounded-md px-3 py-1.5 font-medium",
                kind === value ? "bg-brand-600 text-white" : "text-muted hover:text-ink",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="text-sm text-muted">
          {kind === "button"
            ? "Un pulsante con il tuo colore che apre la pagina di prenotazione."
            : "Il modulo di prenotazione direttamente dentro una pagina del tuo sito; si adatta in altezza da solo."}
        </p>
        <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-all rounded-xl bg-ink p-4 font-mono text-xs leading-relaxed text-white/90">
          {code}
        </pre>
        <div>
          <CopyButton text={code} label="Copia codice" />
        </div>
      </div>
    </Card>
  );
}

type PreviewMode = "page" | "embed" | "confirmation";

const NOTE_EXAMPLE = `Il tavolo è garantito per 15 minuti dall'orario prenotato: in caso di ritardo avvisaci.
Per disdire o cambiare la prenotazione chiamaci almeno 2 ore prima.
Segnalaci allergie o intolleranze: ne terremo conto in cucina.`;

function Preview({
  profile,
  mode,
  onMode,
}: {
  profile: PublicProfile;
  mode: PreviewMode;
  onMode: (mode: PreviewMode) => void;
}) {
  const { today } = useRestaurant();
  const sample: PublicBooking = {
    id: "anteprima",
    status: "confirmed",
    date: today(),
    time: "20:00",
    partySize: 2,
    durationMinutes: 120,
    guestName: "Mario Rossi",
    guestEmail: "mario.rossi@example.com",
    emailSent: true,
  };
  return (
    <div className="xl:sticky xl:top-4 xl:self-start">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Anteprima</h2>
        <div className="flex rounded-lg border border-line bg-surface p-0.5 text-xs">
          {(
            [
              ["page", "Pagina", Smartphone],
              ["embed", "Nel tuo sito", Monitor],
              ["confirmation", "Conferma", CircleCheck],
            ] as const
          ).map(([value, label, Icon]) => (
            <button
              key={value}
              type="button"
              onClick={() => onMode(value)}
              aria-pressed={mode === value}
              className={cn(
                "flex items-center gap-1 rounded-md px-2 py-1 font-medium",
                mode === value ? "bg-brand-600 text-white" : "text-muted hover:text-ink",
              )}
            >
              <Icon className="h-3.5 w-3.5" /> {label}
            </button>
          ))}
        </div>
      </div>
      <div
        className="mx-auto h-[720px] max-w-[400px] overflow-y-auto rounded-[2rem] border-[10px] border-ink bg-canvas shadow-xl"
        data-testid="booking-preview"
      >
        {mode === "confirmation" ? (
          <div style={brandStyle(profile.page.brandColor)} className="@container p-4">
            <div className="rounded-2xl border border-line bg-surface p-5">
              <Confirmation booking={sample} profile={profile} preview />
            </div>
          </div>
        ) : (
          <BookingPage profile={profile} embed={mode === "embed"} preview />
        )}
      </div>
    </div>
  );
}
