"use client";

import Link from "next/link";
import { brandStyle } from "@/lib/brand";
import { COMPANY } from "@/lib/site";
import type { PublicProfile } from "@/lib/types";
import { PRODUCT_NAME } from "../product-logo";
import { Footer, LanguageSwitch, Logo } from "./booking-page";
import { useGuestText } from "./i18n";

/*
 * GDPR art. 13 notice for the guests of one restaurant, built from its details and settings
 * (reminders, reviews, storage limit). The restaurant is the controller, TwentyReserve its processor.
 * Restaurants with their own notice link to it instead (booking page settings).
 */

type Facts = {
  name: string;
  contact: string;
  retention: number | null;
  reviews: boolean;
};

const TEXT = {
  it: {
    title: "Informativa sulla privacy",
    intro: (f: Facts) =>
      `Come ${f.name} tratta i dati di chi prenota un tavolo, ai sensi dell'art. 13 del Regolamento (UE) 2016/679.`,
    controller: "Titolare del trattamento",
    data: "Quali dati",
    dataText:
      "Nome, telefono, email, lingua, giorno, ora e numero di persone, le richieste che scrivi (anche allergie o intolleranze, se le indichi) e lo storico delle tue prenotazioni presso il locale.",
    purposes: "Perché e su quale base",
    purposeList: (f: Facts) => [
      "Gestire la prenotazione o la lista d'attesa e mandarti conferme, modifiche e promemoria: esecuzione di misure richieste da te (art. 6.1.b).",
      "Allergie e intolleranze che indichi: le usiamo solo per servirti, sulla base del tuo consenso esplicito dato scrivendole (art. 9.2.a); puoi chiederne la cancellazione in ogni momento.",
      "Ricordare le tue visite per accoglierti meglio: legittimo interesse del ristorante (art. 6.1.f).",
      ...(f.reviews
        ? [
            "Chiederti, il giorno dopo, com'è andata: legittimo interesse (art. 6.1.f). Puoi opporti rispondendo all'email.",
          ]
        : []),
    ],
    noMarketing: "I dati non vengono usati per pubblicità né ceduti a terzi.",
    processor: "Chi li tratta per conto del ristorante",
    processorText: `Le prenotazioni sono gestite con ${PRODUCT_NAME}, fornito da ${COMPANY.name}, nominato responsabile del trattamento (art. 28), che si avvale di fornitori di hosting e invio email anche con sede negli Stati Uniti, con le garanzie previste dal GDPR (Data Privacy Framework o Clausole contrattuali standard).`,
    retention: "Per quanto tempo",
    retentionText: (f: Facts) =>
      f.retention
        ? `I tuoi dati vengono resi anonimi ${f.retention} mesi dopo la tua ultima prenotazione.`
        : "Fino a quando non ne chiedi la cancellazione al ristorante; i dati che non servono più vengono cancellati.",
    rights: "I tuoi diritti",
    rightsText: (f: Facts) =>
      `Puoi chiedere accesso, rettifica, cancellazione, limitazione, portabilità e opporti al trattamento (artt. 15-22) scrivendo a ${f.contact}. Puoi anche proporre reclamo al Garante per la protezione dei dati personali (www.garanteprivacy.it).`,
    required:
      "Nome e un contatto sono necessari per gestire la prenotazione: senza non è possibile prenotare online.",
    back: "Torna alla prenotazione",
  },
  en: {
    title: "Privacy notice",
    intro: (f: Facts) =>
      `How ${f.name} handles the data of people who book a table, under Article 13 of Regulation (EU) 2016/679 (GDPR).`,
    controller: "Data controller",
    data: "What data",
    dataText:
      "Name, phone, email, language, day, time and number of people, the requests you write (including allergies or intolerances, if you mention them) and the history of your bookings at the restaurant.",
    purposes: "Why, and on what basis",
    purposeList: (f: Facts) => [
      "Managing your booking or waiting list request and sending you confirmations, changes and reminders: steps you asked for (Art. 6(1)(b)).",
      "Allergies and intolerances you mention: used only to serve you, based on the explicit consent you give by writing them (Art. 9(2)(a)); you can ask for them to be erased at any time.",
      "Remembering your visits to welcome you better: the restaurant's legitimate interest (Art. 6(1)(f)).",
      ...(f.reviews
        ? [
            "Asking you the day after how it went: legitimate interest (Art. 6(1)(f)). You can object by replying to the email.",
          ]
        : []),
    ],
    noMarketing: "Your data is not used for advertising and is not sold or given to third parties.",
    processor: "Who processes it for the restaurant",
    processorText: `Bookings are managed with ${PRODUCT_NAME}, provided by ${COMPANY.name}, appointed as data processor (Art. 28), which uses hosting and email providers, some based in the United States, with the safeguards required by the GDPR (Data Privacy Framework or Standard Contractual Clauses).`,
    retention: "How long",
    retentionText: (f: Facts) =>
      f.retention
        ? `Your data is anonymized ${f.retention} months after your last booking.`
        : "Until you ask the restaurant to erase it; data no longer needed is deleted.",
    rights: "Your rights",
    rightsText: (f: Facts) =>
      `You can ask for access, rectification, erasure, restriction, portability and object to processing (Arts. 15-22) by writing to ${f.contact}. You can also lodge a complaint with the Italian Data Protection Authority (www.garanteprivacy.it).`,
    required: "A name and one contact are needed to manage the booking: without them you cannot book online.",
    back: "Back to booking",
  },
};

export function RestaurantPrivacy({ profile }: { profile: PublicProfile }) {
  const { locale } = useGuestText();
  const t = TEXT[locale === "en" ? "en" : "it"];
  const address = [profile.addressLine, profile.postalCode, profile.city].filter(Boolean).join(", ");
  const facts: Facts = {
    name: profile.name,
    contact: profile.email ?? profile.phone ?? profile.name,
    retention: profile.booking.guestRetentionMonths,
    reviews: profile.booking.reviewRequests,
  };
  const sections: [string, React.ReactNode][] = [
    [
      t.controller,
      <>
        <strong>{profile.name}</strong>
        {address && `, ${address}`}
        {profile.email && `, ${profile.email}`}
        {profile.phone && `, ${profile.phone}`}
      </>,
    ],
    [t.data, t.dataText],
    [
      t.purposes,
      <>
        <ul className="ml-5 list-disc space-y-1">
          {t.purposeList(facts).map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
        <p className="mt-2">{t.noMarketing}</p>
        <p className="mt-2">{t.required}</p>
      </>,
    ],
    [t.processor, t.processorText],
    [t.retention, t.retentionText(facts)],
    [t.rights, t.rightsText(facts)],
  ];
  return (
    <div lang={locale} style={brandStyle(profile.page.brandColor)} className="min-h-dvh bg-canvas">
      <header className="bg-[var(--brand)] text-[var(--brand-contrast)]">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-5">
          <Logo profile={profile} size="sm" />
          <p className="min-w-0 flex-1 truncate text-lg font-semibold">{profile.name}</p>
          <LanguageSwitch dark />
        </div>
      </header>
      <main className="mx-auto flex max-w-2xl flex-col gap-5 px-4 py-8 text-[15px] leading-relaxed">
        <h1 className="text-2xl font-semibold">{t.title}</h1>
        <p className="text-muted">{t.intro(facts)}</p>
        {sections.map(([title, body]) => (
          <section key={title}>
            <h2 className="mb-1 font-semibold">{title}</h2>
            <div>{body}</div>
          </section>
        ))}
        <Link
          href={`/prenota/${profile.slug}?lang=${locale}`}
          className="font-medium text-[var(--brand-strong)] hover:underline"
        >
          ← {t.back}
        </Link>
        <Footer />
      </main>
    </div>
  );
}
