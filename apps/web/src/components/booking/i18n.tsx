"use client";

import type { ReservationStatus } from "@restourant/shared";
import { createContext, useContext, type ReactNode } from "react";
import { ApiError } from "@/lib/api";
import type { GuestLocale } from "@/lib/guest-locale";

/*
 * Texts of what guests see (booking page, widget, their own booking page), in Italian and English.
 * The restaurant's own words (description, notice, policy) are shown as written.
 */

export { GUEST_LOCALES, type GuestLocale } from "@/lib/guest-locale";

const it = {
  bookATable: "Prenota un tavolo",
  howMany: "Quante persone?",
  when: "Quando?",
  whatTime: "A che ora?",
  people: (n: number) => `${n} ${n === 1 ? "persona" : "persone"}`,
  peopleShort: "Persone",
  morePeople: (n: number) => `Più di ${n}`,
  onePersonLess: "Una persona in meno",
  onePersonMore: "Una persona in più",
  today: "Oggi",
  tomorrow: "Domani",
  closed: "chiuso",
  noDates: "Nessuna data disponibile al momento.",
  noTimes: (party: string) => `Nessun orario libero per ${party} in questo giorno. Prova un'altra data.`,
  timesError: "Impossibile caricare gli orari. Riprova tra poco.",
  onlineOff: "Le prenotazioni online non sono attive.",
  callRestaurant: "Chiama il ristorante al",
  largeGroupsCall: (max: number) => `Per gruppi di più di ${max} persone contatta direttamente il ristorante`,
  largeGroupsRequest: (max: number) =>
    `Per i gruppi di più di ${max} persone invii una richiesta: il ristorante ti ricontatta per confermare.`,
  yourDetails: "I tuoi dati",
  fullName: "Nome e cognome",
  phone: "Telefono",
  phoneOptional: "Telefono (facoltativo)",
  email: "Email",
  emailOptional: "Email (facoltativa)",
  requests: "Richieste (facoltativo)",
  requestsPlaceholder: "Allergie, intolleranze, occasioni speciali…",
  consent: ["Ho letto l'", "informativa sulla privacy", (name: string) => ` di ${name}.`] as [
    string,
    string,
    (name: string) => string,
  ],
  previewDisabled: "Anteprima: invio disattivato",
  sendRequest: "Invia richiesta",
  confirmBooking: "Conferma prenotazione",
  bookingError: "Impossibile inviare la prenotazione. Riprova tra poco.",
  confirmedTitle: "Prenotazione confermata",
  requestSentTitle: "Richiesta inviata",
  seeYou: (name: string) => `Ti aspettiamo, ${name}!`,
  requestPending: "Il ristorante la controllerà e ti contatterà per confermarla.",
  day: "Giorno",
  time: "Ora",
  infoFromRestaurant: "Informazioni dal ristorante",
  summarySentTo: "Ti abbiamo inviato il riepilogo a",
  addToCalendar: "Aggiungi al calendario",
  changesByLink: "Per modificare o disdire usa il link nell'email, oppure chiama il ristorante:",
  changesByPhone: "Per modifiche o disdette chiama il ristorante:",
  bookAgain: "Fai un'altra prenotazione",
  thePlace: "Il locale",
  photo: (i: number, n: number) => `Foto ${i} di ${n}`,
  photoAlt: (name: string, i: number) => `${name}, foto ${i}`,
  photos: "Foto del locale",
  close: "Chiudi",
  previousPhoto: "Foto precedente",
  nextPhoto: "Foto successiva",
  contacts: "Contatti",
  logoAlt: (name: string) => `Logo ${name}`,
  poweredBy: "Prenotazioni online con",
  language: "Lingua",
  // The guest's own booking page.
  yourBooking: "La tua prenotazione",
  hello: (name: string) => `Ciao ${name}`,
  status: {
    confirmed: "Confermata",
    requested: "In attesa di conferma",
    cancelled: "Cancellata",
    arrived: "In corso",
    seated: "In corso",
    completed: "Conclusa",
    no_show: "Conclusa",
  } satisfies Record<ReservationStatus, string>,
  yourRequests: "Le tue richieste",
  canDo: (modify: boolean, cancel: boolean, until: string) =>
    `Puoi ${modify && cancel ? "modificarla o disdirla" : modify ? "modificarla" : "disdirla"} online fino a ${until}.`,
  modify: "Modifica",
  cancel: "Disdici",
  cancelQuestion: "Vuoi davvero disdire la prenotazione? Il tavolo tornerà disponibile per altri clienti.",
  yesCancel: "Sì, disdici",
  noKeep: "No, tienila",
  cancelError: "Impossibile cancellare ora. Riprova tra poco.",
  cancelledNotice: "Prenotazione cancellata. Ti abbiamo inviato una conferma via email.",
  bookAgainShort: "Prenota di nuovo",
  changeTitle: "Modifica la prenotazione",
  changedNotice: "Prenotazione modificata. Ti abbiamo inviato un'email con i nuovi dettagli.",
  changeRequestedNotice: "Modifica inviata: il ristorante deve confermarla. Ti scriveremo via email.",
  largerCall: (max: number) => `Per più di ${max} persone contatta il ristorante.`,
  saveError: "Impossibile salvare ora. Riprova tra poco.",
  confirmChange: (when: string) => `Conferma: ${when}`,
  chooseTime: "Scegli un orario",
  back: "Annulla",
  // Waiting list of a full day.
  waitlistOffer: "Ti mettiamo in lista d'attesa: se si libera un tavolo ti scriviamo subito.",
  joinWaitlist: "Mettiti in lista d'attesa",
  waitlistTitle: "Lista d'attesa",
  waitlistWhen: "Quando vorresti arrivare?",
  anyTime: "Qualsiasi orario",
  waitlistSummary: (party: string, day: string) => `Lista d'attesa · ${party} · ${day}`,
  waitlistSubmit: "Mettimi in lista",
  waitlistDoneTitle: "Sei in lista d'attesa",
  waitlistDone:
    "Se si libera un tavolo ti mandiamo un'email con il link per prenotare: il posto va a chi prenota per primo.",
  waitlistNotBooking: "Non è ancora una prenotazione.",
  waitlistError: "Impossibile metterti in lista ora. Riprova tra poco.",
  // "How was it?" the day after.
  howWasIt: "Com'è andata?",
  yourVisit: (day: string) => `La tua visita di ${day}`,
  outOfFive: (n: number) => `${n} su 5`,
  tapStars: "Tocca le stelle per dare il tuo voto.",
  thanksRating: "Grazie per il tuo giudizio!",
  askPublicReview:
    "Ci fa davvero piacere. Ti va di scriverlo anche in una recensione? Bastano due minuti e aiuta tanto il ristorante.",
  leavePublicReview: "Scrivi una recensione",
  sorry: "Ci dispiace",
  tellUs: "Cosa possiamo migliorare? Lo leggerà solo il ristorante.",
  addComment: "Vuoi aggiungere qualcosa? (facoltativo)",
  feedbackPlaceholder: "Il tuo commento…",
  sendFeedback: "Invia",
  feedbackSent: "Grazie, il ristorante leggerà il tuo messaggio.",
  changeRating: "Puoi cambiare il voto quando vuoi.",
  // Messages for API answers, by code (the API answers in Italian).
  errors: {} as Record<string, string>,
  closedReasons: {} as Record<string, string>,
};

export type GuestText = typeof it;

const en: GuestText = {
  bookATable: "Book a table",
  howMany: "How many people?",
  when: "When?",
  whatTime: "What time?",
  people: (n) => `${n} ${n === 1 ? "person" : "people"}`,
  peopleShort: "People",
  morePeople: (n) => `More than ${n}`,
  onePersonLess: "One person less",
  onePersonMore: "One person more",
  today: "Today",
  tomorrow: "Tomorrow",
  closed: "closed",
  noDates: "No dates available at the moment.",
  noTimes: (party) => `No free times for ${party} on this day. Try another date.`,
  timesError: "Times could not be loaded. Please try again shortly.",
  onlineOff: "Online booking is not available.",
  callRestaurant: "Call the restaurant at",
  largeGroupsCall: (max) => `For groups of more than ${max} people please contact the restaurant directly`,
  largeGroupsRequest: (max) =>
    `Groups of more than ${max} people send a request: the restaurant will get back to you to confirm.`,
  yourDetails: "Your details",
  fullName: "Full name",
  phone: "Phone",
  phoneOptional: "Phone (optional)",
  email: "Email",
  emailOptional: "Email (optional)",
  requests: "Requests (optional)",
  requestsPlaceholder: "Allergies, intolerances, special occasions…",
  consent: ["I have read ", "the privacy notice", (name) => ` of ${name}.`],
  previewDisabled: "Preview: sending disabled",
  sendRequest: "Send request",
  confirmBooking: "Confirm booking",
  bookingError: "The booking could not be sent. Please try again shortly.",
  confirmedTitle: "Booking confirmed",
  requestSentTitle: "Request sent",
  seeYou: (name) => `See you soon, ${name}!`,
  requestPending: "The restaurant will check it and get back to you to confirm.",
  day: "Day",
  time: "Time",
  infoFromRestaurant: "Information from the restaurant",
  summarySentTo: "We sent the details to",
  addToCalendar: "Add to calendar",
  changesByLink: "To change or cancel, use the link in the email or call the restaurant:",
  changesByPhone: "To change or cancel, call the restaurant:",
  bookAgain: "Make another booking",
  thePlace: "The place",
  photo: (i, n) => `Photo ${i} of ${n}`,
  photoAlt: (name, i) => `${name}, photo ${i}`,
  photos: "Photos",
  close: "Close",
  previousPhoto: "Previous photo",
  nextPhoto: "Next photo",
  contacts: "Contacts",
  logoAlt: (name) => `${name} logo`,
  poweredBy: "Online bookings by",
  language: "Language",
  yourBooking: "Your booking",
  hello: (name) => `Hi ${name}`,
  status: {
    confirmed: "Confirmed",
    requested: "Waiting for confirmation",
    cancelled: "Cancelled",
    arrived: "In progress",
    seated: "In progress",
    completed: "Completed",
    no_show: "Completed",
  },
  yourRequests: "Your requests",
  canDo: (modify, cancel, until) =>
    `You can ${modify && cancel ? "change or cancel it" : modify ? "change it" : "cancel it"} online until ${until}.`,
  modify: "Change",
  cancel: "Cancel booking",
  cancelQuestion: "Do you really want to cancel? The table will become available to other guests.",
  yesCancel: "Yes, cancel",
  noKeep: "No, keep it",
  cancelError: "The booking could not be cancelled now. Please try again shortly.",
  cancelledNotice: "Booking cancelled. We sent you a confirmation by email.",
  bookAgainShort: "Book again",
  changeTitle: "Change your booking",
  changedNotice: "Booking changed. We sent you an email with the new details.",
  changeRequestedNotice: "Change sent: the restaurant needs to confirm it. We will email you.",
  largerCall: (max) => `For more than ${max} people please contact the restaurant.`,
  saveError: "Your change could not be saved now. Please try again shortly.",
  confirmChange: (when) => `Confirm: ${when}`,
  chooseTime: "Choose a time",
  back: "Back",
  howWasIt: "How was it?",
  yourVisit: (day) => `Your visit on ${day}`,
  outOfFive: (n) => `${n} out of 5`,
  tapStars: "Tap the stars to rate your visit.",
  thanksRating: "Thank you for your rating!",
  askPublicReview:
    "We're really glad. Would you also write a review? It takes two minutes and means a lot to the restaurant.",
  leavePublicReview: "Write a review",
  sorry: "We're sorry",
  tellUs: "What could we do better? Only the restaurant will read it.",
  addComment: "Anything to add? (optional)",
  feedbackPlaceholder: "Your comment…",
  sendFeedback: "Send",
  feedbackSent: "Thank you, the restaurant will read your message.",
  changeRating: "You can change your rating at any time.",
  waitlistOffer: "Join the waiting list: if a table frees up we'll email you right away.",
  joinWaitlist: "Join the waiting list",
  waitlistTitle: "Waiting list",
  waitlistWhen: "When would you like to arrive?",
  anyTime: "Any time",
  waitlistSummary: (party, day) => `Waiting list · ${party} · ${day}`,
  waitlistSubmit: "Add me to the list",
  waitlistDoneTitle: "You're on the waiting list",
  waitlistDone: "If a table frees up we'll email you a link to book: the table goes to whoever books first.",
  waitlistNotBooking: "This is not a booking yet.",
  waitlistError: "We couldn't add you to the list now. Please try again shortly.",
  errors: {
    waitlist_disabled: "The waiting list is not available: please contact the restaurant.",
    slot_unavailable: "This time is no longer available: please choose another one.",
    large_party: "For groups this large please contact the restaurant directly.",
    not_modifiable: "This booking can no longer be changed online.",
    not_cancellable: "This booking can no longer be cancelled online.",
    validation_error: "Please check the details you entered.",
    not_found: "Booking not found.",
    not_reviewable: "This booking can't be rated.",
    rate_limited: "Too many attempts: please wait a minute and try again.",
  },
  closedReasons: {
    online_disabled: "Online booking is not available: please contact the restaurant.",
    past: "This date has already passed.",
    too_far: "Bookings for this date are not open yet.",
    party_too_small: "The number of people is too small to book online.",
    large_party_phone: "For groups this large please contact the restaurant directly.",
    large_party_request: "Large groups can send a request.",
  },
};

const MESSAGES: Record<GuestLocale, GuestText> = { it, en };

const LocaleContext = createContext<GuestLocale>("it");

export function GuestLocaleProvider({ locale, children }: { locale: GuestLocale; children: ReactNode }) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}

export function useGuestText() {
  const locale = useContext(LocaleContext);
  const t = MESSAGES[locale];
  const tag = locale === "en" ? "en-GB" : "it-IT";
  return {
    locale,
    t,
    /** "sabato 24 ottobre" / "Saturday 24 October" */
    longDate: (date: string) =>
      new Intl.DateTimeFormat(tag, {
        weekday: "long",
        day: "numeric",
        month: "long",
        timeZone: "UTC",
      }).format(new Date(`${date}T12:00:00Z`)),
    weekdayShort: (date: string) =>
      new Intl.DateTimeFormat(tag, { weekday: "short", timeZone: "UTC" }).format(
        new Date(`${date}T12:00:00Z`),
      ),
    monthShort: (date: string) =>
      new Intl.DateTimeFormat(tag, { month: "short", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`)),
    /** "sabato 31 ottobre alle 19:00" in the restaurant's time zone. */
    dateTime: (instant: string, timeZone: string) =>
      new Intl.DateTimeFormat(tag, {
        weekday: "long",
        day: "numeric",
        month: "long",
        hour: "2-digit",
        minute: "2-digit",
        timeZone,
      }).format(new Date(instant)),
    /** The API's message, or its English version when there is one. */
    errorMessage: (error: unknown, fallback: string) => {
      if (!(error instanceof ApiError)) return fallback;
      return locale === "en" ? (t.errors[error.code] ?? fallback) : error.message;
    },
  };
}
