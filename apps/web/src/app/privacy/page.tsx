import type { Metadata } from "next";
import Link from "next/link";
import { CompanyDetails, LegalPage } from "@/components/legal";
import { PRODUCT_NAME } from "@/components/product-logo";
import { CONTACT_EMAIL, SUBPROCESSORS } from "@/lib/site";

export const metadata: Metadata = {
  title: { absolute: `Privacy e cookie · ${PRODUCT_NAME}` },
  description: `Come ${PRODUCT_NAME} tratta i dati personali di ristoratori e visitatori del sito.`,
};

/** Privacy policy (GDPR art. 13) for restaurant owners, their staff and visitors of the site. */
export default function PrivacyPage() {
  return (
    <LegalPage title="Informativa sulla privacy e sui cookie">
      <p>
        Questa informativa spiega come trattiamo i dati personali di chi visita il sito e di chi usa{" "}
        {PRODUCT_NAME} per gestire un ristorante (titolari e personale), ai sensi del Regolamento (UE)
        2016/679 (&quot;GDPR&quot;).
      </p>
      <p>
        I dati dei <strong>clienti dei ristoranti</strong> (chi prenota un tavolo) sono trattati da ogni
        ristorante come titolare: {PRODUCT_NAME} li tratta solo per suo conto, come responsabile del
        trattamento (vedi l&apos;<Link href="/trattamento-dati">accordo sul trattamento dei dati</Link>). Ogni
        pagina di prenotazione ha la sua informativa per i clienti.
      </p>

      <h2>1. Titolare del trattamento</h2>
      <p>
        <CompanyDetails />.
      </p>

      <h2>2. Quali dati trattiamo</h2>
      <ul>
        <li>
          <strong>Account</strong>: nome, email, password (conservata solo in forma cifrata con hash), ruolo
          nel ristorante, data di accettazione dei termini.
        </li>
        <li>
          <strong>Dati del ristorante</strong>: nome, indirizzo, contatti, configurazione di sale, tavoli e
          servizi.
        </li>
        <li>
          <strong>Dati tecnici</strong>: indirizzo IP, browser e registri delle richieste, per far funzionare
          il servizio e proteggerlo da abusi; il registro delle modifiche (chi ha fatto cosa e quando).
        </li>
        <li>
          <strong>Comunicazioni</strong>: i messaggi che ci mandi per assistenza.
        </li>
      </ul>

      <h2>3. Perché e su quale base</h2>
      <ul>
        <li>
          Fornire il servizio, gestire l&apos;account, l&apos;assistenza e le comunicazioni di servizio:
          esecuzione del contratto (art. 6.1.b GDPR).
        </li>
        <li>Sicurezza, prevenzione di abusi e frodi, backup: legittimo interesse (art. 6.1.f).</li>
        <li>
          Adempimenti fiscali e contabili, quando il servizio è a pagamento: obbligo di legge (art. 6.1.c).
        </li>
      </ul>
      <p>Non vendiamo i dati e non li usiamo per pubblicità o profilazione.</p>

      <h2>4. A chi li affidiamo</h2>
      <p>Ci avvaliamo di questi fornitori, nominati responsabili del trattamento:</p>
      <ul>
        {SUBPROCESSORS.map((s) => (
          <li key={s.name}>
            <strong>{s.name}</strong>: {s.role}
          </li>
        ))}
      </ul>
      <p>
        Alcuni hanno sede negli Stati Uniti: i trasferimenti avvengono sulla base del Data Privacy Framework
        UE-USA o delle Clausole contrattuali standard approvate dalla Commissione europea.
      </p>

      <h2>5. Per quanto tempo</h2>
      <ul>
        <li>
          Dati dell&apos;account e del ristorante: per tutta la durata del contratto; poi li cancelliamo entro
          30 giorni (dopo averti permesso di esportarli), salvo quanto serve per obblighi di legge.
        </li>
        <li>Documenti fiscali: 10 anni, come previsto dalla legge.</li>
        <li>Registri tecnici: al massimo 30 giorni. Backup cifrati: 30 giorni.</li>
      </ul>

      <h2>6. Cookie e memoria del browser</h2>
      <p>
        Usiamo solo strumenti <strong>tecnici</strong>, necessari al funzionamento, per i quali non serve il
        consenso: il cookie <code>rs_session</code> (mantiene l&apos;accesso, dura al massimo 12 ore) e la
        memoria locale del browser per le preferenze (ristorante selezionato, vista lista o griglia, suono
        degli avvisi). Non usiamo cookie di profilazione né strumenti di analisi di terze parti.
      </p>

      <h2>7. I tuoi diritti</h2>
      <p>
        Puoi chiedere accesso, rettifica, cancellazione, limitazione, portabilità dei dati e opporti al
        trattamento (artt. 15-22 GDPR) scrivendo a <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. Il
        titolare di un ristorante può scaricare in ogni momento tutti i dati del locale da Configurazione →
        Dati del locale. Hai anche diritto di proporre reclamo al Garante per la protezione dei dati personali
        (<a href="https://www.garanteprivacy.it">www.garanteprivacy.it</a>).
      </p>

      <h2>8. Modifiche</h2>
      <p>
        Se cambiamo questa informativa aggiorniamo la data in alto; per i cambiamenti importanti avvisiamo i
        titolari via email.
      </p>
    </LegalPage>
  );
}
