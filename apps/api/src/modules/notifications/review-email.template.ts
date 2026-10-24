import { brandPalette } from "@restourant/shared";
import { capitalize, emailShell, escape, MUTED, type RenderedEmail } from "./booking-email.template.js";

/** The day after the meal: "how was it?", answered with one click on the stars. */

export type ReviewEmailInput = {
  restaurant: { name: string };
  page: { brandColor: string; logoId: string | null };
  reservation: { date: string; guestName: string; locale: "it" | "en" };
  /** The guest's page for the answer, e.g. https://app.example.com/recensione/<token>. */
  reviewUrl: string;
  publicUrl: string | null;
};

const TEXT = {
  it: {
    tag: "it-IT",
    subject: (name: string) => `Com'è andata da ${name}?`,
    headline: "Com'è andata?",
    intro: (first: string, day: string) =>
      `Ciao ${first}, grazie della visita di ${day}. Ci dici com'è andata? Basta un clic.`,
    stars: (n: number) => `${n} ${n === 1 ? "stella" : "stelle"}`,
    scale: "1 = male · 5 = benissimo",
    footer: "Il tuo giudizio arriva direttamente al ristorante e ci aiuta a migliorare.",
    why: (name: string) => `Hai ricevuto questa email perché hai prenotato da ${name}.`,
  },
  en: {
    tag: "en-GB",
    subject: (name: string) => `How was your visit to ${name}?`,
    headline: "How was it?",
    intro: (first: string, day: string) =>
      `Hi ${first}, thank you for your visit on ${day}. Will you tell us how it went? Just one click.`,
    stars: (n: number) => `${n} ${n === 1 ? "star" : "stars"}`,
    scale: "1 = poor · 5 = excellent",
    footer: "Your answer goes straight to the restaurant and helps it do better.",
    why: (name: string) => `You received this email because you booked at ${name}.`,
  },
};

export function renderReviewEmail(input: ReviewEmailInput): RenderedEmail {
  const { restaurant, page, reservation } = input;
  const lang = reservation.locale === "en" ? "en" : "it";
  const t = TEXT[lang];
  const palette = brandPalette(page.brandColor);
  const day = new Intl.DateTimeFormat(t.tag, {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(`${reservation.date}T12:00:00Z`));
  const first = reservation.guestName.trim().split(/\s+/)[0] ?? reservation.guestName;
  const subject = t.subject(restaurant.name);
  const intro = t.intro(first, lang === "it" ? day : capitalize(day));
  const link = (n: number) => `${input.reviewUrl}?voto=${n}`;

  const stars = [1, 2, 3, 4, 5]
    .map(
      (n) =>
        `<td align="center" style="padding:0 4px"><a href="${escape(link(n))}" title="${t.stars(n)}" style="display:block;width:48px;height:48px;line-height:48px;border-radius:12px;background:${palette.soft};color:${palette.strong};font-size:28px;text-decoration:none">&#9733;</a><div style="margin-top:4px;font-size:12px;color:${MUTED}">${n}</div></td>`,
    )
    .join("");
  const body = `<h1 style="margin:0 0 8px;font-size:20px;line-height:1.3">${t.headline}</h1>
<p style="margin:0 0 24px;font-size:15px;line-height:1.5;color:${MUTED}">${escape(intro)}</p>
<table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:0 auto"><tr>${stars}</tr></table>
<p style="margin:12px 0 0;text-align:center;font-size:12px;color:${MUTED}">${t.scale}</p>`;
  const logoUrl = input.publicUrl && page.logoId ? `${input.publicUrl}/api/media/${page.logoId}` : null;
  const html = emailShell({
    lang,
    subject,
    palette,
    logoUrl,
    restaurantName: restaurant.name,
    body,
    footer: `<div>${escape(t.footer)}</div>`,
    why: t.why(restaurant.name),
  });
  const text = [
    restaurant.name,
    "",
    t.headline,
    intro,
    "",
    ...[5, 4, 3, 2, 1].map((n) => `${t.stars(n)}: ${link(n)}`),
    "",
    t.footer,
  ].join("\n");
  return { subject, html, text };
}
