/*
 * What the showcase site (twentyreserve.com, see app/sito) says about prices and contacts. Change
 * them here: the site is static and picks them up at the next deploy.
 */

export const CONTACT_EMAIL = "info@twentyreserve.com";

export const TRIAL_DAYS = 30;

export type Plan = {
  name: string;
  /** Euro per month, VAT excluded; null for "on request". */
  price: number | null;
  description: string;
  features: string[];
  highlighted?: boolean;
};

export const PLANS: Plan[] = [
  {
    name: "Essenziale",
    price: 49,
    description: "Per trattorie e locali che vogliono smettere di pagare a coperto.",
    features: [
      "Prenotazioni online illimitate, zero commissioni",
      "Pagina di prenotazione con il tuo marchio e QR code",
      "Sala, tavoli uniti e spostamenti",
      "Email di conferma, promemoria e link per disdire",
      "Schede clienti e storico",
      "Fino a 3 utenti dello staff",
    ],
  },
  {
    name: "Pro",
    price: 79,
    description: "Per chi lavora con più turni, più sale e tanto staff.",
    features: [
      "Tutto di Essenziale",
      "Griglia tavoli × orari con trascinamento",
      "Limiti per fascia oraria, ritmo degli arrivi, combinazioni",
      "Utenti illimitati con ruoli",
      "Importazione da Superb, TheFork e fogli Excel",
      "Assistenza prioritaria su WhatsApp",
    ],
    highlighted: true,
  },
  {
    name: "Gruppi",
    price: null,
    description: "Per più locali sotto lo stesso marchio.",
    features: [
      "Tutto di Pro, per ogni locale",
      "Un solo accesso per tutti i locali",
      "Configurazione iniziale fatta da noi",
      "Prezzo su misura",
    ],
  },
];
