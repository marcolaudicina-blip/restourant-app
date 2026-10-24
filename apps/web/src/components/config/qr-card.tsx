"use client";

import { luminance } from "@restourant/shared";
import { Download, Printer } from "lucide-react";
import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";

/** QR codes need strong contrast: light brand colors fall back to near-black. */
const qrColor = (brand: string) => (luminance(brand) < 0.35 ? brand : "#1d1b18");

const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );

function download(href: string, filename: string) {
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  a.click();
}

/**
 * The booking page as a QR code, for table cards, the window, menus and receipts: download it (PNG
 * for print shops and social posts, SVG for designers) or print a ready-made card.
 */
export function QrCard({
  url,
  name,
  color,
  slug,
}: {
  url: string;
  name: string;
  color: string;
  slug: string;
}) {
  const [svg, setSvg] = useState<string | null>(null);
  const dark = qrColor(color);
  const options = { errorCorrectionLevel: "M" as const, margin: 2, color: { dark, light: "#ffffff" } };

  useEffect(() => {
    if (!url) return;
    let alive = true;
    void QRCode.toString(url, { ...options, type: "svg" }).then((s) => alive && setSvg(s));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- options derive from url and dark
  }, [url, dark]);

  async function png() {
    download(await QRCode.toDataURL(url, { ...options, width: 1200 }), `qr-prenotazioni-${slug}.png`);
  }

  function svgFile() {
    if (!svg) return;
    const href = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    download(href, `qr-prenotazioni-${slug}.svg`);
    setTimeout(() => URL.revokeObjectURL(href), 1000);
  }

  function printCard() {
    if (!svg) return;
    const win = window.open("", "_blank", "width=600,height=800");
    if (!win) return;
    win.document
      .write(`<!doctype html><html lang="it"><head><meta charset="utf-8"><title>QR ${escape(name)}</title>
<style>
  @page { margin: 12mm; }
  body { margin: 0; font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #1d1b18; }
  .card { width: 90mm; margin: 10mm auto; padding: 8mm; border: 1px solid #e7e4de; border-radius: 6mm; text-align: center; }
  .name { font-size: 20pt; font-weight: 700; color: ${dark}; margin-bottom: 2mm; }
  .cta { font-size: 13pt; margin-bottom: 4mm; }
  .qr svg { width: 62mm; height: 62mm; }
  .hint { font-size: 9pt; color: #6f6a62; margin-top: 3mm; }
  .url { font-size: 8pt; color: #6f6a62; word-break: break-all; margin-top: 1mm; }
</style></head><body>
<div class="card">
  <div class="name">${escape(name)}</div>
  <div class="cta">Prenota il tuo tavolo</div>
  <div class="qr">${svg}</div>
  <div class="hint">Inquadra il codice con la fotocamera del telefono</div>
  <div class="url">${escape(url)}</div>
</div>
<script>window.onload = () => { window.print(); };</script>
</body></html>`);
    win.document.close();
  }

  return (
    <Card>
      <CardHeader
        title="QR code"
        description="Porta dritto alla pagina di prenotazione: stampalo sui tavoli, in vetrina, sul menù o sullo scontrino."
      />
      <div className="flex flex-col items-center gap-5 p-5 sm:flex-row sm:items-start">
        <div
          role="img"
          aria-label={`QR code per ${url}`}
          data-testid="booking-qr"
          className="h-44 w-44 shrink-0 overflow-hidden rounded-xl border border-line bg-white [&>svg]:h-full [&>svg]:w-full"
          dangerouslySetInnerHTML={svg ? { __html: svg } : undefined}
        />
        <div className="flex flex-col gap-2 self-stretch sm:self-center">
          <Button type="button" onClick={printCard} disabled={!svg}>
            <Printer className="h-4 w-4" /> Stampa cartoncino
          </Button>
          <Button type="button" variant="secondary" onClick={png} disabled={!svg}>
            <Download className="h-4 w-4" /> Scarica PNG
          </Button>
          <Button type="button" variant="secondary" onClick={svgFile} disabled={!svg}>
            <Download className="h-4 w-4" /> Scarica SVG (per il grafico)
          </Button>
          <p className="max-w-64 text-xs text-muted">
            Se cambi l&apos;indirizzo della pagina, ristampa il QR: quello vecchio smette di funzionare.
          </p>
        </div>
      </div>
    </Card>
  );
}
