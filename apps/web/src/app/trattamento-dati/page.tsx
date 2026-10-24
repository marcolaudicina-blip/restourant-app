import type { Metadata } from "next";
import { CompanyDetails, LegalPage } from "@/components/legal";
import { PRODUCT_NAME } from "@/components/product-logo";
import { CONTACT_EMAIL, SUBPROCESSORS } from "@/lib/site";

export const metadata: Metadata = {
  title: { absolute: `Accordo sul trattamento dei dati · ${PRODUCT_NAME}` },
  description: `Accordo ai sensi dell'art. 28 GDPR tra i ristoranti e ${PRODUCT_NAME}.`,
};

/** Data processing agreement (GDPR art. 28): the restaurant is controller, TwentyReserve processor. */
export default function DpaPage() {
  return (
    <LegalPage title="Accordo sul trattamento dei dati (art. 28 GDPR)">
      <p>
        Questo accordo fa parte dei Termini di servizio e si applica ai dati personali che il ristorante
        (&quot;Titolare&quot;) gestisce con {PRODUCT_NAME}. Il fornitore del Servizio, <CompanyDetails />{" "}
        (&quot;Responsabile&quot;), li tratta solo per conto del Titolare.
      </p>

      <h2>1. Oggetto e durata</h2>
      <p>
        Il Responsabile tratta i dati per fornire il Servizio: ricevere e gestire le prenotazioni, tenere le
        schede dei clienti e lo storico delle visite, mandare per conto del ristorante le email di servizio
        (conferme, modifiche, promemoria, lista d&apos;attesa, richiesta di un giudizio) e le altre funzioni
        che il Titolare attiva. L&apos;accordo dura quanto il contratto.
      </p>

      <h2>2. Dati e interessati</h2>
      <ul>
        <li>
          <strong>Interessati</strong>: clienti del ristorante e persone che prenotano; personale del
          ristorante.
        </li>
        <li>
          <strong>Dati</strong>: nome, telefono, email, lingua, data, ora e numero di persone, note e
          richieste (che possono contenere allergie o intolleranze comunicate dal cliente), giudizi lasciati
          dopo la cena, storico di visite e mancate presentazioni, note interne dello staff.
        </li>
      </ul>

      <h2>3. Istruzioni del Titolare</h2>
      <p>
        Il Responsabile tratta i dati solo secondo le istruzioni del Titolare, date con questo accordo e con
        le impostazioni scelte nel Servizio, e non li usa per fini propri. Se ritiene che un&apos;istruzione
        violi la normativa, lo segnala.
      </p>

      <h2>4. Sicurezza</h2>
      <ul>
        <li>connessioni sempre cifrate (HTTPS); password conservate solo come hash;</li>
        <li>
          separazione dei dati di ogni ristorante a livello di database; accessi del personale per ruoli;
        </li>
        <li>link dei clienti firmati crittograficamente, senza dati in chiaro;</li>
        <li>registro delle modifiche; backup giornalieri cifrati conservati 30 giorni;</li>
        <li>accesso del Responsabile ai dati di un ristorante solo per assistenza, visibile al Titolare.</li>
      </ul>
      <p>Le persone autorizzate dal Responsabile sono tenute alla riservatezza.</p>

      <h2>5. Sub-responsabili</h2>
      <p>Il Titolare autorizza il ricorso a questi sub-responsabili:</p>
      <ul>
        {SUBPROCESSORS.map((s) => (
          <li key={s.name}>
            <strong>{s.name}</strong> ({s.country}): {s.role}
          </li>
        ))}
      </ul>
      <p>
        Il Responsabile avvisa via email dei nuovi sub-responsabili (ad esempio per SMS o pagamenti) almeno 15
        giorni prima; il Titolare può opporsi e, se non c&apos;è un&apos;alternativa, recedere. I
        trasferimenti fuori dall&apos;UE avvengono con il Data Privacy Framework UE-USA o le Clausole
        contrattuali standard.
      </p>

      <h2>6. Diritti degli interessati</h2>
      <p>
        Il Servizio permette al Titolare di consultare, correggere, esportare e cancellare (anonimizzare) i
        dati di un cliente, e di stabilire dopo quanti mesi dall&apos;ultima visita i dati vengono
        anonimizzati da soli. Se un interessato scrive al Responsabile, la richiesta viene girata al Titolare.
      </p>

      <h2>7. Violazioni dei dati</h2>
      <p>
        Il Responsabile informa il Titolare senza ingiustificato ritardo, e comunque entro 48 ore da quando ne
        viene a conoscenza, di ogni violazione che riguardi i suoi dati, con le informazioni necessarie per le
        eventuali notifiche al Garante e agli interessati.
      </p>

      <h2>8. Fine del contratto</h2>
      <p>
        Alla cessazione il Titolare può scaricare tutti i dati per 30 giorni; poi il Responsabile li cancella,
        e i backup si esauriscono entro ulteriori 30 giorni, salvo obblighi di legge.
      </p>

      <h2>9. Verifiche</h2>
      <p>
        Il Responsabile mette a disposizione le informazioni necessarie a dimostrare il rispetto di questo
        accordo e collabora alle verifiche ragionevoli richieste dal Titolare, scrivendo a{" "}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>
    </LegalPage>
  );
}
