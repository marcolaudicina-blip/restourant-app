import {
  ArrowRight,
  BellRing,
  CalendarClock,
  Check,
  FileSpreadsheet,
  Globe,
  LayoutGrid,
  Link2,
  Mail,
  MousePointerClick,
  Palette,
  QrCode,
  ShieldCheck,
  Sparkles,
  Users,
  UtensilsCrossed,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { PRODUCT_NAME, ProductLogo } from "@/components/product-logo";
import { cn } from "@/lib/cn";
import { CONTACT_EMAIL, PLANS, TRIAL_DAYS } from "@/lib/site";

/*
 * The showcase site, served at twentyreserve.com (the middleware rewrites "/" there) and at /sito on
 * the app domain. Static: prices and contacts come from lib/site.ts.
 */

export const metadata: Metadata = {
  title: { absolute: `${PRODUCT_NAME} · Prenotazioni e sala per ristoranti, senza commissioni` },
  description:
    "Pagina di prenotazione con il tuo marchio, gestione della sala e dei tavoli, promemoria e schede clienti. Prezzo fisso al mese, nessuna commissione per coperto.",
  openGraph: {
    title: `${PRODUCT_NAME} · Le prenotazioni del tuo ristorante, senza commissioni`,
    description:
      "Prenotazioni online, sala, tavoli e clienti in un'unica app. Prezzo fisso, zero commissioni.",
    images: ["/sito/lista.webp"],
  },
};

const FEATURES: { icon: ReactNode; title: string; text: string }[] = [
  {
    icon: <Palette className="h-5 w-5" />,
    title: "La tua pagina di prenotazione",
    text: "Con logo, colori e foto del locale. Un link per Instagram, Google e il sito, oppure il modulo direttamente nelle tue pagine.",
  },
  {
    icon: <LayoutGrid className="h-5 w-5" />,
    title: "Sala e tavoli",
    text: "Disegni la sala com'è davvero. Unisci e sposti i tavoli con un tocco: il sistema non accetta mai due prenotazioni sullo stesso tavolo.",
  },
  {
    icon: <CalendarClock className="h-5 w-5" />,
    title: "Orari, turni e ritmo",
    text: "Turni fissi o arrivi continui, durata del tavolo per numero di persone, coperti massimi per fascia e limiti per i gruppi.",
  },
  {
    icon: <BellRing className="h-5 w-5" />,
    title: "Avvisi in tempo reale",
    text: "Ogni nuova prenotazione online, modifica o disdetta compare su tutti i tablet e i telefoni del locale, con un suono.",
  },
  {
    icon: <Mail className="h-5 w-5" />,
    title: "Email e promemoria",
    text: "Conferma con le tue regole, promemoria il giorno prima e un link con cui il cliente modifica o disdice da solo. Meno telefonate, meno no-show.",
  },
  {
    icon: <Users className="h-5 w-5" />,
    title: "Schede clienti",
    text: "Ogni cliente riconosciuto dal telefono: visite, no-show, allergie, preferenze ed etichette come VIP, sempre sotto gli occhi in sala.",
  },
  {
    icon: <Globe className="h-5 w-5" />,
    title: "Italiano e inglese",
    text: "La pagina e le email parlano la lingua del cliente: i turisti prenotano in inglese senza che tu faccia nulla.",
  },
  {
    icon: <FileSpreadsheet className="h-5 w-5" />,
    title: "Porti con te i tuoi dati",
    text: "Importi clienti e prenotazioni future da Superb, TheFork o da un foglio Excel in pochi minuti.",
  },
];

const FAQ: { q: string; a: string }[] = [
  {
    q: "Ci sono commissioni sulle prenotazioni?",
    a: "No. Paghi un prezzo fisso al mese, qualunque sia il numero di prenotazioni o di coperti. I clienti che prenotano dalla tua pagina restano tuoi.",
  },
  {
    q: "Quanto ci vuole per iniziare?",
    a: "Una quindicina di minuti: scegli un modello (trattoria, pizzeria, fine dining…), sistemi tavoli e orari, e la tua pagina di prenotazione è già online.",
  },
  {
    q: "Posso importare i dati da Superb o TheFork?",
    a: "Sì. Esporti clienti e prenotazioni in CSV o Excel e li importi in Configurazione → Importa: le colonne vengono riconosciute da sole e i doppioni evitati.",
  },
  {
    q: "Serve installare qualcosa?",
    a: "No. Funziona dal browser su tablet, computer e telefono, e si può aggiungere alla schermata Home come un'app.",
  },
  {
    q: "Cosa succede se un cliente vuole cambiare o disdire?",
    a: "Lo fa da solo dal link nell'email, entro il limite che decidi tu (per esempio fino a 2 ore prima). Il tavolo si libera e lo staff riceve subito un avviso.",
  },
  {
    q: "I miei dati e quelli dei clienti sono al sicuro?",
    a: "Sì: connessioni cifrate, copie di sicurezza automatiche del database, ogni locale vede solo i propri dati e ogni modifica viene registrata.",
  },
  {
    q: "Posso disdire quando voglio?",
    a: `Sì, senza vincoli. I primi ${TRIAL_DAYS} giorni sono gratuiti e non serve la carta di credito per provarlo.`,
  },
];

const container = "mx-auto w-full max-w-6xl px-5";
const primaryCta =
  "inline-flex h-12 items-center justify-center gap-2 rounded-full bg-brand-600 px-6 text-base font-semibold text-white shadow-lg shadow-brand-600/20 transition hover:bg-brand-700";
const secondaryCta =
  "inline-flex h-12 items-center justify-center gap-2 rounded-full border border-line bg-surface px-6 text-base font-semibold text-ink transition hover:border-brand-600";

export default function SitePage() {
  return (
    <div className="bg-canvas text-ink">
      <Header />
      <main>
        <Hero />
        <Strip />
        <Features />
        <Showcase />
        <ForGuests />
        <Pricing />
        <Steps />
        <Faq />
        <FinalCta />
      </main>
      <Footer />
    </div>
  );
}

function Header() {
  return (
    <header className="sticky top-0 z-30 border-b border-line/70 bg-canvas/85 backdrop-blur">
      <div className={cn(container, "flex h-16 items-center justify-between gap-4")}>
        <Link href="/sito" aria-label={PRODUCT_NAME}>
          <ProductLogo />
        </Link>
        <nav className="hidden items-center gap-7 text-sm font-medium text-ink/80 md:flex">
          <a href="#funzioni" className="hover:text-brand-700">
            Funzioni
          </a>
          <a href="#prezzi" className="hover:text-brand-700">
            Prezzi
          </a>
          <a href="#domande" className="hover:text-brand-700">
            Domande
          </a>
        </nav>
        <div className="flex items-center gap-2">
          <Link
            href="/login"
            className="hidden px-3 text-sm font-semibold text-ink/80 hover:text-brand-700 sm:block"
          >
            Accedi
          </Link>
          <Link
            href="/registrati"
            className="inline-flex h-10 items-center rounded-full bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700"
          >
            Prova gratis
          </Link>
        </div>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="overflow-hidden">
      <div
        className={cn(
          container,
          "grid gap-12 pb-16 pt-14 md:pt-20 lg:grid-cols-[1fr_1.15fr] lg:items-center",
        )}
      >
        <div>
          <p className="mb-5 inline-flex items-center gap-2 rounded-full bg-brand-50 px-3 py-1 text-sm font-medium text-brand-700">
            <UtensilsCrossed className="h-4 w-4" /> Fatto da un ristoratore, per i ristoratori
          </p>
          <h1 className="text-4xl font-semibold leading-[1.1] tracking-tight [text-wrap:balance] md:text-6xl">
            Le prenotazioni del tuo ristorante. <span className="text-brand-600">Senza commissioni.</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink/75">
            Pagina di prenotazione con il tuo marchio, sala e tavoli, promemoria e schede clienti in
            un&apos;unica app. Un prezzo fisso al mese, da {PLANS[0]!.price} €: niente costi a coperto, i
            clienti restano tuoi.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/registrati" className={primaryCta}>
              Prova gratis {TRIAL_DAYS} giorni <ArrowRight className="h-5 w-5" />
            </Link>
            <a href="#funzioni" className={secondaryCta}>
              Guarda come funziona
            </a>
          </div>
          <p className="mt-4 text-sm text-muted">
            Nessuna carta di credito · Pronto in 15 minuti · Disdici quando vuoi
          </p>
        </div>
        <div className="relative">
          <BrowserFrame src="/sito/lista.webp" alt="La lista delle prenotazioni della serata" priority />
          <PhoneFrame
            src="/sito/telefono.webp"
            alt="La pagina di prenotazione vista da un cliente sul telefono"
            className="absolute -bottom-10 -left-4 w-32 sm:w-40 md:-left-10 md:w-44"
          />
        </div>
      </div>
    </section>
  );
}

function Strip() {
  const items = [
    "Zero commissioni per coperto",
    "Pronto in 15 minuti",
    "Importi i dati da Superb e TheFork",
    "Italiano e inglese",
    "Su tablet, computer e telefono",
  ];
  return (
    <div className="border-y border-line bg-surface">
      <ul
        className={cn(
          container,
          "flex flex-wrap justify-center gap-x-8 gap-y-2 py-5 text-sm font-medium text-ink/75",
        )}
      >
        {items.map((item) => (
          <li key={item} className="flex items-center gap-2">
            <Check className="h-4 w-4 text-brand-600" /> {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function SectionTitle({ eyebrow, title, text }: { eyebrow: string; title: string; text?: string }) {
  return (
    <div className="mx-auto mb-12 max-w-2xl text-center">
      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-brand-600">{eyebrow}</p>
      <h2 className="mt-3 text-3xl font-semibold tracking-tight [text-wrap:balance] md:text-4xl">{title}</h2>
      {text && <p className="mt-4 text-lg leading-relaxed text-ink/70">{text}</p>}
    </div>
  );
}

function Features() {
  return (
    <section id="funzioni" className="scroll-mt-20 py-20 md:py-28">
      <div className={container}>
        <SectionTitle
          eyebrow="Funzioni"
          title="Tutto quello che serve in sala, niente di superfluo"
          text="Pensato per chi lavora davvero il sabato sera: veloce sul tablet, chiaro anche nel pieno del servizio."
        />
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-2xl border border-line bg-surface p-6">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
                {f.icon}
              </span>
              <h3 className="mt-4 font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink/70">{f.text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Showcase() {
  const rows: { title: string; text: string; points: string[]; image: string; alt: string }[] = [
    {
      title: "La serata a colpo d'occhio",
      text: "Una riga per tavolo, una colonna ogni quarto d'ora. Trascini una prenotazione per cambiare orario o tavolo, e vedi subito dove c'è posto per un walk-in.",
      points: ["Griglia tavoli × orari", "Walk-in in due tocchi", "Foglio del servizio da stampare"],
      image: "/sito/griglia.webp",
      alt: "La griglia tavoli per orari",
    },
    {
      title: "La sala com'è davvero",
      text: "Disegni sale e dehors, tavoli tondi e quadrati. Durante il servizio vedi chi è seduto, chi sta arrivando e quali tavoli si liberano.",
      points: ["Unione e spostamento dei tavoli", "Più sale e dehors", "Stato dei tavoli ora per ora"],
      image: "/sito/sala.webp",
      alt: "La mappa della sala durante il servizio",
    },
    {
      title: "La tua pagina, i tuoi colori",
      text: "Logo, copertina e foto del locale, i tuoi colori e le tue regole. Il cliente sceglie persone, giorno e ora tra quelli davvero liberi, e riceve subito la conferma.",
      points: [
        "Link per Instagram, Google e WhatsApp",
        "Modulo da inserire nel tuo sito",
        "QR code da stampare",
      ],
      image: "/sito/pagina.webp",
      alt: "La pagina di prenotazione di un ristorante",
    },
  ];
  return (
    <section className="bg-surface py-20 md:py-28">
      <div className={cn(container, "flex flex-col gap-20 md:gap-28")}>
        {rows.map((row, i) => (
          <div key={row.title} className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
            <div className={cn(i % 2 === 1 && "lg:order-2")}>
              <h2 className="text-3xl font-semibold tracking-tight [text-wrap:balance]">{row.title}</h2>
              <p className="mt-4 text-lg leading-relaxed text-ink/70">{row.text}</p>
              <ul className="mt-6 flex flex-col gap-2.5">
                {row.points.map((p) => (
                  <li key={p} className="flex items-center gap-2.5 font-medium">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-50 text-brand-700">
                      <Check className="h-3.5 w-3.5" />
                    </span>
                    {p}
                  </li>
                ))}
              </ul>
            </div>
            <BrowserFrame src={row.image} alt={row.alt} />
          </div>
        ))}
      </div>
    </section>
  );
}

function ForGuests() {
  const items: { icon: ReactNode; title: string; text: string }[] = [
    {
      icon: <MousePointerClick className="h-5 w-5" />,
      title: "Prenota in 30 secondi",
      text: "Persone, giorno, ora, nome: niente account da creare.",
    },
    {
      icon: <Mail className="h-5 w-5" />,
      title: "Conferma con le tue regole",
      text: "Ritardi, caparra, allergie: le scrivi una volta, arrivano a tutti.",
    },
    {
      icon: <Link2 className="h-5 w-5" />,
      title: "Modifica o disdice da solo",
      text: "Dal link nell'email, entro il limite che decidi tu.",
    },
    {
      icon: <BellRing className="h-5 w-5" />,
      title: "Promemoria il giorno prima",
      text: "Il modo più semplice per ridurre i tavoli vuoti.",
    },
    {
      icon: <QrCode className="h-5 w-5" />,
      title: "QR sui tavoli e in vetrina",
      text: "Chi passa davanti prenota per la prossima volta.",
    },
    {
      icon: <ShieldCheck className="h-5 w-5" />,
      title: "Privacy in regola",
      text: "Consenso raccolto e dati gestiti secondo il GDPR.",
    },
  ];
  return (
    <section className="py-20 md:py-28">
      <div className={container}>
        <SectionTitle
          eyebrow="Per i tuoi clienti"
          title="Un'esperienza da grande ristorante, anche per il locale di quartiere"
        />
        <div className="grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <div key={item.title} className="flex gap-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white">
                {item.icon}
              </span>
              <div>
                <h3 className="font-semibold">{item.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-ink/70">{item.text}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Pricing() {
  return (
    <section id="prezzi" className="scroll-mt-20 bg-surface py-20 md:py-28">
      <div className={container}>
        <SectionTitle
          eyebrow="Prezzi"
          title="Un prezzo fisso. Nessuna commissione."
          text={`Prenotazioni e coperti illimitati. ${TRIAL_DAYS} giorni gratis, senza carta di credito.`}
        />
        <div className="grid gap-5 lg:grid-cols-3">
          {PLANS.map((plan) => (
            <div
              key={plan.name}
              className={cn(
                "relative flex flex-col rounded-3xl border p-7",
                plan.highlighted
                  ? "border-brand-600 bg-brand-600 text-white shadow-xl shadow-brand-600/20"
                  : "border-line bg-canvas",
              )}
            >
              {plan.highlighted && (
                <span className="absolute -top-3 left-7 inline-flex items-center gap-1 rounded-full bg-white px-3 py-1 text-xs font-semibold text-brand-700 shadow">
                  <Sparkles className="h-3.5 w-3.5" /> Il più scelto
                </span>
              )}
              <h3 className="text-lg font-semibold">{plan.name}</h3>
              <p className={cn("mt-1 text-sm", plan.highlighted ? "text-white/80" : "text-ink/70")}>
                {plan.description}
              </p>
              <p className="mt-6 flex items-baseline gap-1">
                {plan.price === null ? (
                  <span className="text-3xl font-semibold">Su misura</span>
                ) : (
                  <>
                    <span className="text-5xl font-semibold tracking-tight">{plan.price} €</span>
                    <span className={cn("text-sm", plan.highlighted ? "text-white/80" : "text-muted")}>
                      /mese + IVA
                    </span>
                  </>
                )}
              </p>
              <ul className="mt-6 flex flex-1 flex-col gap-2.5 text-sm">
                {plan.features.map((f) => (
                  <li key={f} className="flex gap-2.5">
                    <Check
                      className={cn(
                        "mt-0.5 h-4 w-4 shrink-0",
                        plan.highlighted ? "text-white" : "text-brand-600",
                      )}
                    />
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                href={
                  plan.price === null
                    ? `mailto:${CONTACT_EMAIL}?subject=TwentyReserve per più locali`
                    : "/registrati"
                }
                className={cn(
                  "mt-8 inline-flex h-12 items-center justify-center rounded-full font-semibold transition",
                  plan.highlighted
                    ? "bg-white text-brand-700 hover:bg-brand-50"
                    : "bg-brand-600 text-white hover:bg-brand-700",
                )}
              >
                {plan.price === null ? "Scrivici" : `Prova gratis ${TRIAL_DAYS} giorni`}
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Steps() {
  const steps = [
    { title: "Crea l'account", text: "Nome del locale e la tua email: nient'altro." },
    {
      title: "Scegli un modello",
      text: "Trattoria, pizzeria, fine dining: tavoli e orari sono già pronti, li adatti in pochi minuti.",
    },
    {
      title: "Condividi il link",
      text: "Sul sito, su Instagram, su Google e col QR sui tavoli. Le prenotazioni arrivano da sole.",
    },
  ];
  return (
    <section className="py-20 md:py-28">
      <div className={container}>
        <SectionTitle eyebrow="Come si parte" title="Online stasera, non tra un mese" />
        <ol className="grid gap-5 md:grid-cols-3">
          {steps.map((s, i) => (
            <li key={s.title} className="rounded-2xl border border-line bg-surface p-6">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-600 font-semibold text-white">
                {i + 1}
              </span>
              <h3 className="mt-4 font-semibold">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink/70">{s.text}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function Faq() {
  return (
    <section id="domande" className="scroll-mt-20 bg-surface py-20 md:py-28">
      <div className="mx-auto w-full max-w-3xl px-5">
        <SectionTitle eyebrow="Domande" title="Le domande che ci fanno più spesso" />
        <div className="divide-y divide-line rounded-2xl border border-line bg-canvas">
          {FAQ.map((item) => (
            <details key={item.q} className="group px-6 py-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold">
                {item.q}
                <span className="text-xl leading-none text-brand-600 transition group-open:rotate-45">+</span>
              </summary>
              <p className="mt-3 leading-relaxed text-ink/75">{item.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="py-20 md:py-28">
      <div className={container}>
        <div className="rounded-3xl bg-brand-600 px-6 py-14 text-center text-white md:px-16">
          <h2 className="text-3xl font-semibold tracking-tight [text-wrap:balance] md:text-4xl">
            Il prossimo sabato, le prenotazioni le gestisci tu.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-lg text-white/85">
            Prova {PRODUCT_NAME} gratis per {TRIAL_DAYS} giorni. Se vuoi, ti aiutiamo noi a configurare il
            locale.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link
              href="/registrati"
              className="inline-flex h-12 items-center gap-2 rounded-full bg-white px-6 font-semibold text-brand-700 hover:bg-brand-50"
            >
              Inizia ora <ArrowRight className="h-5 w-5" />
            </Link>
            <a
              href={`mailto:${CONTACT_EMAIL}?subject=Vorrei una demo di TwentyReserve`}
              className="inline-flex h-12 items-center rounded-full border border-white/40 px-6 font-semibold text-white hover:bg-white/10"
            >
              Chiedi una demo
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-line">
      <div
        className={cn(
          container,
          "flex flex-col items-center justify-between gap-4 py-10 text-sm text-muted md:flex-row",
        )}
      >
        <ProductLogo />
        <nav className="flex flex-wrap justify-center gap-x-6 gap-y-2">
          <a href={`mailto:${CONTACT_EMAIL}`} className="hover:text-brand-700">
            {CONTACT_EMAIL}
          </a>
          <Link href="/login" className="hover:text-brand-700">
            Accedi
          </Link>
        </nav>
        <p>
          © {new Date().getFullYear()} {PRODUCT_NAME}
        </p>
      </div>
    </footer>
  );
}

function BrowserFrame({ src, alt, priority = false }: { src: string; alt: string; priority?: boolean }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl shadow-black/10">
      <div className="flex items-center gap-1.5 border-b border-line bg-canvas px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
      </div>
      <img
        src={src}
        alt={alt}
        width={1600}
        height={1000}
        loading={priority ? "eager" : "lazy"}
        className="block h-auto w-full"
      />
    </div>
  );
}

function PhoneFrame({ src, alt, className }: { src: string; alt: string; className?: string }) {
  return (
    <div
      className={cn("overflow-hidden rounded-[1.6rem] border-[6px] border-ink bg-ink shadow-2xl", className)}
    >
      <img
        src={src}
        alt={alt}
        width={600}
        height={1298}
        loading="eager"
        className="block h-auto w-full rounded-[1.1rem]"
      />
    </div>
  );
}
