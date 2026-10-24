"use client";

import { Check, Copy, ExternalLink } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { cn } from "@/lib/cn";
import type { BookingPageSettings } from "@/lib/types";

/** Link, sharing and embedding of the booking page, in its settings. */

export function useOrigin() {
  return typeof window === "undefined" ? "" : window.location.origin;
}

export function CopyButton({ text, label = "Copia" }: { text: string; label?: string }) {
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

export function ShareCard({
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

export function EmbedCard({ slug, color }: { slug: string; color: string }) {
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
