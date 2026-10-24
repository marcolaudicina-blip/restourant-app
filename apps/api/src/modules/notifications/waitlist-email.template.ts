import { brandPalette } from "@restourant/shared";
import {
  button,
  capitalize,
  detailsTable,
  emailShell,
  escape,
  MUTED,
  type RenderedEmail,
} from "./booking-email.template.js";

/** Emails to guests on the waiting list: joined, and "a table is free". */

export type WaitlistEmailKind = "joined" | "free";

export type WaitlistEmailInput = {
  kind: WaitlistEmailKind;
  restaurant: { name: string; slug: string; phone: string | null };
  page: { brandColor: string; logoId: string | null };
  entry: {
    date: string;
    partySize: number;
    timeFrom: string | null;
    timeTo: string | null;
    guestName: string;
    locale: "it" | "en";
  };
  /** Free arrival times found for the guest (kind "free"). */
  times: string[];
  publicUrl: string | null;
};

const TEXT = {
  it: {
    tag: "it-IT",
    joined: {
      subject: (name: string, day: string) => `Sei in lista d'attesa · ${name} · ${day}`,
      headline: "Sei in lista d'attesa",
      intro: "ti scriviamo appena si libera un tavolo per te.",
    },
    free: {
      subject: (name: string, day: string) => `Si è liberato un tavolo · ${name} · ${day}`,
      headline: "Si è liberato un tavolo",
      intro: "c'è di nuovo posto nel giorno che volevi. Prenota subito: il tavolo va a chi arriva prima.",
    },
    hello: (name: string) => `Ciao ${name}`,
    day: "Giorno",
    window: "Orario",
    anyTime: "Qualsiasi orario",
    between: (from: string | null, to: string | null) =>
      from && to ? `Dalle ${from} alle ${to}` : from ? `Dalle ${from}` : `Fino alle ${to}`,
    partySize: "Persone",
    people: (n: number) => `${n} ${n === 1 ? "persona" : "persone"}`,
    times: "Orari liberi ora",
    book: "Prenota ora",
    phone: "Tel.",
    joinedNote: "Non è ancora una prenotazione: se trovi posto altrove, puoi ignorare le nostre email.",
    why: (name: string) => `Hai ricevuto questa email perché ti sei messo in lista d'attesa da ${name}.`,
  },
  en: {
    tag: "en-GB",
    joined: {
      subject: (name: string, day: string) => `You're on the waiting list · ${name} · ${day}`,
      headline: "You're on the waiting list",
      intro: "we'll email you as soon as a table frees up.",
    },
    free: {
      subject: (name: string, day: string) => `A table is free · ${name} · ${day}`,
      headline: "A table just freed up",
      intro: "there is room again on the day you wanted. Book now: the table goes to whoever books first.",
    },
    hello: (name: string) => `Hi ${name}`,
    day: "Day",
    window: "Time",
    anyTime: "Any time",
    between: (from: string | null, to: string | null) =>
      from && to ? `From ${from} to ${to}` : from ? `From ${from}` : `Until ${to}`,
    partySize: "People",
    people: (n: number) => `${n} ${n === 1 ? "person" : "people"}`,
    times: "Free times now",
    book: "Book now",
    phone: "Phone",
    joinedNote: "This is not a booking yet: if you find a table elsewhere, just ignore our emails.",
    why: (name: string) => `You received this email because you joined the waiting list at ${name}.`,
  },
};

/** Link to the booking page with day, party size and language already chosen. */
export function waitlistBookingUrl(
  publicUrl: string,
  slug: string,
  entry: { date: string; partySize: number; locale: "it" | "en" },
) {
  const query = new URLSearchParams({
    data: entry.date,
    persone: String(entry.partySize),
    lang: entry.locale,
  });
  return `${publicUrl}/prenota/${slug}?${query}`;
}

export function renderWaitlistEmail(input: WaitlistEmailInput): RenderedEmail {
  const { restaurant, page, entry, kind } = input;
  const lang = entry.locale === "en" ? "en" : "it";
  const t = TEXT[lang];
  const copy = t[kind];
  const palette = brandPalette(page.brandColor);
  const day = capitalize(
    new Intl.DateTimeFormat(t.tag, {
      weekday: "long",
      day: "numeric",
      month: "long",
      timeZone: "UTC",
    }).format(new Date(`${entry.date}T12:00:00Z`)),
  );
  const firstName = entry.guestName.trim().split(/\s+/)[0] ?? entry.guestName;
  const subject = copy.subject(restaurant.name, day);
  const intro = `${t.hello(firstName)}, ${copy.intro}`;

  const details: [string, string][] = [
    [t.day, day],
    [t.partySize, t.people(entry.partySize)],
    kind === "free" && input.times.length
      ? [t.times, input.times.slice(0, 8).join(" · ")]
      : [t.window, entry.timeFrom || entry.timeTo ? t.between(entry.timeFrom, entry.timeTo) : t.anyTime],
  ];
  const action =
    kind === "free" && input.publicUrl
      ? {
          label: t.book,
          url: waitlistBookingUrl(input.publicUrl, restaurant.slug, { ...entry, locale: lang }),
        }
      : null;
  const logoUrl = input.publicUrl && page.logoId ? `${input.publicUrl}/api/media/${page.logoId}` : null;

  const body = `<h1 style="margin:0 0 8px;font-size:20px;line-height:1.3">${copy.headline}</h1>
<p style="margin:0 0 20px;font-size:15px;line-height:1.5;color:${MUTED}">${escape(intro)}</p>
${detailsTable(details)}`;
  const footer = `${restaurant.phone ? `<div>${t.phone} <a href="tel:${escape(restaurant.phone.replace(/\s/g, ""))}" style="color:${palette.strong}">${escape(restaurant.phone)}</a></div>` : ""}
${kind === "joined" ? `<div style="margin-top:8px">${escape(t.joinedNote)}</div>` : ""}
${action ? button(palette, action) : ""}`;

  const html = emailShell({
    lang,
    subject,
    palette,
    logoUrl,
    restaurantName: restaurant.name,
    body,
    footer,
    why: t.why(restaurant.name),
  });
  const text = [
    restaurant.name,
    "",
    copy.headline,
    intro,
    "",
    ...details.map(([label, value]) => `${label}: ${value}`),
    ...(restaurant.phone ? ["", `${t.phone} ${restaurant.phone}`] : []),
    ...(kind === "joined" ? ["", t.joinedNote] : []),
    ...(action ? ["", `${action.label}: ${action.url}`] : []),
  ].join("\n");
  return { subject, html, text };
}
