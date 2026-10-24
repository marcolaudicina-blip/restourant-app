import { brandPalette } from "@restourant/shared";

/*
 * Emails to guests about their booking, in the restaurant's colors. Plain inline-styled tables, the
 * only layout every mail client renders; a text version goes along for clients without HTML.
 */

export type BookingEmailKind =
  /** Booked and confirmed, or a request the restaurant just confirmed. */
  | "confirmed"
  /** A request waiting for the restaurant (manual confirmation, large groups). */
  | "requested";

export type BookingEmailInput = {
  kind: BookingEmailKind;
  restaurant: {
    name: string;
    slug: string;
    phone: string | null;
    email: string | null;
    addressLine: string | null;
    city: string | null;
  };
  page: { brandColor: string; logoId: string | null; confirmationNote: string | null };
  reservation: { date: string; time: string; partySize: number; guestName: string; guestNote: string | null };
  /** e.g. https://app.example.com; links and logo are left out without it. */
  publicUrl: string | null;
};

export type RenderedEmail = { subject: string; html: string; text: string };

const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );

/** Escaped, with line breaks kept (`white-space: pre-line` is not reliable in mail clients). */
const paragraphs = (value: string) => escape(value.trim()).replace(/\r?\n/g, "<br>");

const longDate = (date: string) =>
  new Intl.DateTimeFormat("it-IT", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));

const people = (n: number) => `${n} ${n === 1 ? "persona" : "persone"}`;

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function renderBookingEmail(input: BookingEmailInput): RenderedEmail {
  const { restaurant, page, reservation, kind } = input;
  const palette = brandPalette(page.brandColor);
  const day = capitalize(longDate(reservation.date));
  const confirmed = kind === "confirmed";
  const firstName = reservation.guestName.trim().split(/\s+/)[0] ?? reservation.guestName;

  const subject = confirmed
    ? `Prenotazione confermata · ${restaurant.name} · ${day} ore ${reservation.time}`
    : `Richiesta di prenotazione ricevuta · ${restaurant.name}`;
  const headline = confirmed ? "La tua prenotazione è confermata" : "Abbiamo ricevuto la tua richiesta";
  const intro = confirmed
    ? `Ciao ${firstName}, ti aspettiamo!`
    : `Ciao ${firstName}, il ristorante la controllerà e ti confermerà al più presto.`;

  const details: [string, string][] = [
    ["Giorno", day],
    ["Ora", reservation.time],
    ["Persone", people(reservation.partySize)],
  ];
  if (reservation.guestNote?.trim()) details.push(["Le tue richieste", reservation.guestNote.trim()]);

  const address = [restaurant.addressLine, restaurant.city].filter(Boolean).join(", ");
  const pageUrl = input.publicUrl ? `${input.publicUrl}/prenota/${restaurant.slug}` : null;
  const logoUrl = input.publicUrl && page.logoId ? `${input.publicUrl}/api/media/${page.logoId}` : null;
  const note = page.confirmationNote?.trim() || null;
  const muted = "#6f6a62";

  const html = `<!doctype html>
<html lang="it">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(subject)}</title></head>
<body style="margin:0;padding:0;background:#f6f5f2;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1d1b18">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f5f2;padding:24px 12px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden">
<tr><td style="background:${palette.brand};padding:28px 32px;color:${palette.contrast}">
${logoUrl ? `<img src="${escape(logoUrl)}" width="56" height="56" alt="" style="display:block;width:56px;height:56px;border-radius:12px;background:#ffffff;object-fit:contain;margin-bottom:14px">` : ""}
<div style="font-size:22px;font-weight:600;line-height:1.3">${escape(restaurant.name)}</div>
</td></tr>
<tr><td style="padding:28px 32px 8px">
<h1 style="margin:0 0 8px;font-size:20px;line-height:1.3">${headline}</h1>
<p style="margin:0 0 20px;font-size:15px;line-height:1.5;color:${muted}">${escape(intro)}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e7e4de;border-radius:12px;font-size:15px">
${details
  .map(
    ([label, value], i) =>
      `<tr><td style="padding:12px 16px;color:${muted};${i ? "border-top:1px solid #e7e4de;" : ""}vertical-align:top">${label}</td><td align="right" style="padding:12px 16px;font-weight:600;${i ? "border-top:1px solid #e7e4de;" : ""}">${paragraphs(value)}</td></tr>`,
  )
  .join("\n")}
</table>
${
  note
    ? `<div style="margin-top:20px;background:${palette.soft};border-left:4px solid ${palette.brand};border-radius:8px;padding:14px 16px">
<div style="font-size:13px;font-weight:600;color:${palette.strong};margin-bottom:6px">Informazioni dal ristorante</div>
<div style="font-size:14px;line-height:1.6">${paragraphs(note)}</div>
</div>`
    : ""
}
</td></tr>
<tr><td style="padding:16px 32px 28px;font-size:14px;line-height:1.6;color:${muted}">
${address ? `<div>${escape(address)}</div>` : ""}
${restaurant.phone ? `<div>Tel. <a href="tel:${escape(restaurant.phone.replace(/\s/g, ""))}" style="color:${palette.strong}">${escape(restaurant.phone)}</a></div>` : ""}
<div style="margin-top:8px">Per modifiche o disdette contatta il ristorante${restaurant.phone ? " per telefono" : ""}${restaurant.email ? " o rispondi a questa email" : ""}.</div>
${pageUrl ? `<div style="margin-top:20px"><a href="${escape(pageUrl)}" style="display:inline-block;background:${palette.brand};color:${palette.contrast};text-decoration:none;font-weight:600;padding:12px 22px;border-radius:999px">Vai alla pagina del ristorante</a></div>` : ""}
</td></tr>
</table>
<p style="max-width:560px;margin:16px auto 0;font-size:12px;line-height:1.5;color:${muted}">Hai ricevuto questa email perché hai prenotato da ${escape(restaurant.name)}.</p>
</td></tr>
</table>
</body>
</html>`;

  const text = [
    restaurant.name,
    "",
    headline,
    intro,
    "",
    ...details.map(([label, value]) => `${label}: ${value}`),
    ...(note ? ["", "Informazioni dal ristorante:", note] : []),
    "",
    ...(address ? [address] : []),
    ...(restaurant.phone ? [`Tel. ${restaurant.phone}`] : []),
    "Per modifiche o disdette contatta il ristorante.",
    ...(pageUrl ? ["", pageUrl] : []),
  ].join("\n");

  return { subject, html, text };
}
