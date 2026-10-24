import { brandPalette } from "@restourant/shared";

/*
 * Emails to guests about their booking, in the restaurant's colors. Plain inline-styled tables, the
 * only layout every mail client renders; a text version goes along for clients without HTML.
 */

export type BookingEmailKind =
  /** Booked and confirmed, or a request the restaurant just confirmed. */
  | "confirmed"
  /** A request waiting for the restaurant (manual confirmation, large groups). */
  | "requested"
  /** New date, time or party size (by the guest or the restaurant). */
  | "updated"
  | "cancelled"
  /** The day before. */
  | "reminder";

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
  reservation: {
    date: string;
    time: string;
    partySize: number;
    guestName: string;
    guestNote: string | null;
    /** The language the guest booked in. */
    locale: "it" | "en";
  };
  /** e.g. https://app.example.com; links and logo are left out without it. */
  publicUrl: string | null;
  /** The guest's own link to change or cancel the booking, when the restaurant allows it. */
  manage: { url: string; canCancel: boolean; canModify: boolean; noticeHours: number } | null;
};

export type RenderedEmail = { subject: string; html: string; text: string };

const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );

/** Escaped, with line breaks kept (`white-space: pre-line` is not reliable in mail clients). */
const paragraphs = (value: string) => escape(value.trim()).replace(/\r?\n/g, "<br>");

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

type Copy = {
  subject: (name: string, when: string, time: string) => string;
  headline: string;
  intro: string;
};

/** Everything the email says, in the language the guest booked in. */
const TEXT = {
  it: {
    tag: "it-IT",
    copy: {
      confirmed: {
        subject: (name, when) => `Prenotazione confermata · ${name} · ${when}`,
        headline: "La tua prenotazione è confermata",
        intro: "ti aspettiamo!",
      },
      requested: {
        subject: (name) => `Richiesta di prenotazione ricevuta · ${name}`,
        headline: "Abbiamo ricevuto la tua richiesta",
        intro: "il ristorante la controllerà e ti confermerà al più presto.",
      },
      updated: {
        subject: (name, when) => `Prenotazione modificata · ${name} · ${when}`,
        headline: "La tua prenotazione è stata modificata",
        intro: "ecco i nuovi dettagli.",
      },
      cancelled: {
        subject: (name, when) => `Prenotazione cancellata · ${name} · ${when}`,
        headline: "La tua prenotazione è stata cancellata",
        intro: "la prenotazione qui sotto non è più valida. Speriamo di vederti presto!",
      },
      reminder: {
        subject: (name, _when, time) => `Promemoria: ${name}, domani alle ${time}`,
        headline: "Ti aspettiamo domani",
        intro: "ti ricordiamo la tua prenotazione.",
      },
    } satisfies Record<BookingEmailKind, Copy>,
    hello: (name: string) => `Ciao ${name}`,
    when: (day: string, time: string) => `${day} ore ${time}`,
    people: (n: number) => `${n} ${n === 1 ? "persona" : "persone"}`,
    day: "Giorno",
    time: "Ora",
    partySize: "Persone",
    requests: "Le tue richieste",
    info: "Informazioni dal ristorante",
    phone: "Tel.",
    manage: (what: "both" | "cancel" | "modify", hours: number) =>
      `Puoi ${what === "both" ? "modificare o disdire" : what === "cancel" ? "disdire" : "modificare"} la prenotazione online ${
        hours > 0
          ? `fino a ${hours === 1 ? "un'ora" : `${hours} ore`} prima dell'arrivo`
          : "fino all'orario di arrivo"
      }.`,
    afterByPhone: " Dopo, contatta il ristorante per telefono.",
    contact: (phone: boolean, email: boolean, cancelled: boolean) =>
      `${cancelled ? "Per qualsiasi domanda" : "Per modifiche o disdette"} contatta il ristorante${phone ? " per telefono" : ""}${email ? " o rispondi a questa email" : ""}.`,
    manageButton: "Gestisci la prenotazione",
    bookAgain: "Prenota di nuovo",
    visitPage: "Vai alla pagina del ristorante",
    why: (name: string) => `Hai ricevuto questa email perché hai prenotato da ${name}.`,
  },
  en: {
    tag: "en-GB",
    copy: {
      confirmed: {
        subject: (name, when) => `Booking confirmed · ${name} · ${when}`,
        headline: "Your booking is confirmed",
        intro: "we look forward to seeing you!",
      },
      requested: {
        subject: (name) => `Booking request received · ${name}`,
        headline: "We received your request",
        intro: "the restaurant will check it and confirm as soon as possible.",
      },
      updated: {
        subject: (name, when) => `Booking changed · ${name} · ${when}`,
        headline: "Your booking has been changed",
        intro: "here are the new details.",
      },
      cancelled: {
        subject: (name, when) => `Booking cancelled · ${name} · ${when}`,
        headline: "Your booking has been cancelled",
        intro: "the booking below is no longer valid. We hope to see you soon!",
      },
      reminder: {
        subject: (name, _when, time) => `Reminder: ${name}, tomorrow at ${time}`,
        headline: "See you tomorrow",
        intro: "this is a reminder of your booking.",
      },
    } satisfies Record<BookingEmailKind, Copy>,
    hello: (name: string) => `Hi ${name}`,
    when: (day: string, time: string) => `${day} at ${time}`,
    people: (n: number) => `${n} ${n === 1 ? "person" : "people"}`,
    day: "Day",
    time: "Time",
    partySize: "People",
    requests: "Your requests",
    info: "Information from the restaurant",
    phone: "Phone",
    manage: (what: "both" | "cancel" | "modify", hours: number) =>
      `You can ${what === "both" ? "change or cancel" : what === "cancel" ? "cancel" : "change"} your booking online ${
        hours > 0
          ? `up to ${hours === 1 ? "one hour" : `${hours} hours`} before arrival`
          : "until your arrival time"
      }.`,
    afterByPhone: " After that, please call the restaurant.",
    contact: (phone: boolean, email: boolean, cancelled: boolean) =>
      `${cancelled ? "For any questions" : "To change or cancel"}, please contact the restaurant${phone ? " by phone" : ""}${email ? " or reply to this email" : ""}.`,
    manageButton: "Manage your booking",
    bookAgain: "Book again",
    visitPage: "Visit the restaurant's page",
    why: (name: string) => `You received this email because you booked at ${name}.`,
  },
};

export function renderBookingEmail(input: BookingEmailInput): RenderedEmail {
  const { restaurant, page, reservation, kind } = input;
  const lang = reservation.locale === "en" ? "en" : "it";
  const t = TEXT[lang];
  const palette = brandPalette(page.brandColor);
  const day = capitalize(
    new Intl.DateTimeFormat(t.tag, {
      weekday: "long",
      day: "numeric",
      month: "long",
      timeZone: "UTC",
    }).format(new Date(`${reservation.date}T12:00:00Z`)),
  );
  const firstName = reservation.guestName.trim().split(/\s+/)[0] ?? reservation.guestName;
  const copy: Copy = t.copy[kind];
  const cancelled = kind === "cancelled";
  const manage = cancelled ? null : input.manage;

  const subject = copy.subject(restaurant.name, t.when(day, reservation.time), reservation.time);
  const headline = copy.headline;
  const intro = `${t.hello(firstName)}, ${copy.intro}`;

  const details: [string, string][] = [
    [t.day, day],
    [t.time, reservation.time],
    [t.partySize, t.people(reservation.partySize)],
  ];
  if (reservation.guestNote?.trim()) details.push([t.requests, reservation.guestNote.trim()]);

  const address = [restaurant.addressLine, restaurant.city].filter(Boolean).join(", ");
  const pageUrl = input.publicUrl ? `${input.publicUrl}/prenota/${restaurant.slug}` : null;
  const logoUrl = input.publicUrl && page.logoId ? `${input.publicUrl}/api/media/${page.logoId}` : null;
  const note = cancelled ? null : page.confirmationNote?.trim() || null;
  const contact = manage
    ? `${t.manage(
        manage.canCancel && manage.canModify ? "both" : manage.canCancel ? "cancel" : "modify",
        manage.noticeHours,
      )}${restaurant.phone ? t.afterByPhone : ""}`
    : t.contact(Boolean(restaurant.phone), Boolean(restaurant.email), cancelled);
  const action = manage
    ? { label: t.manageButton, url: manage.url }
    : pageUrl
      ? { label: cancelled ? t.bookAgain : t.visitPage, url: `${pageUrl}?lang=${lang}` }
      : null;
  const muted = "#6f6a62";

  const html = `<!doctype html>
<html lang="${lang}">
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
<div style="font-size:13px;font-weight:600;color:${palette.strong};margin-bottom:6px">${t.info}</div>
<div style="font-size:14px;line-height:1.6">${paragraphs(note)}</div>
</div>`
    : ""
}
</td></tr>
<tr><td style="padding:16px 32px 28px;font-size:14px;line-height:1.6;color:${muted}">
${address ? `<div>${escape(address)}</div>` : ""}
${restaurant.phone ? `<div>${t.phone} <a href="tel:${escape(restaurant.phone.replace(/\s/g, ""))}" style="color:${palette.strong}">${escape(restaurant.phone)}</a></div>` : ""}
<div style="margin-top:8px">${escape(contact)}</div>
${action ? `<div style="margin-top:20px"><a href="${escape(action.url)}" style="display:inline-block;background:${palette.brand};color:${palette.contrast};text-decoration:none;font-weight:600;padding:12px 22px;border-radius:999px">${action.label}</a></div>` : ""}
</td></tr>
</table>
<p style="max-width:560px;margin:16px auto 0;font-size:12px;line-height:1.5;color:${muted}">${escape(t.why(restaurant.name))}</p>
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
    ...(note ? ["", `${t.info}:`, note] : []),
    "",
    ...(address ? [address] : []),
    ...(restaurant.phone ? [`${t.phone} ${restaurant.phone}`] : []),
    contact,
    ...(action ? ["", `${action.label}: ${action.url}`] : []),
  ].join("\n");

  return { subject, html, text };
}
