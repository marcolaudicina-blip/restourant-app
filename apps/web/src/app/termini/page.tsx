import type { Metadata } from "next";
import Link from "next/link";
import { CompanyDetails, LegalPage } from "@/components/legal";
import { PRODUCT_NAME } from "@/components/product-logo";
import { CONTACT_EMAIL, TRIAL_DAYS } from "@/lib/site";

export const metadata: Metadata = {
  title: { absolute: `Termini di servizio · ${PRODUCT_NAME}` },
  description: `Le condizioni d'uso di ${PRODUCT_NAME} per i ristoranti.`,
};

/** Terms of service for restaurants (business customers). */
export default function TermsPage() {
  return (
    <LegalPage title="Termini di servizio">
      <p>
        Questi termini regolano l&apos;uso di {PRODUCT_NAME} (&quot;il Servizio&quot;), il software online per
        gestire prenotazioni, sala e clienti di un ristorante, fornito da <CompanyDetails /> (&quot;il
        Fornitore&quot;) a chi lo usa per la propria attività (&quot;il Cliente&quot;). Il Servizio è rivolto
        solo a imprese e professionisti, non a consumatori.
      </p>

      <h2>1. Account</h2>
      <p>
        Per usare il Servizio crei un account con dati veri e aggiornati. Sei responsabile delle credenziali,
        delle persone del tuo staff che inviti e di ciò che fanno con il loro accesso. Avvisaci subito se
        sospetti un accesso non autorizzato.
      </p>

      <h2>2. Prova gratuita</h2>
      <p>
        I primi {TRIAL_DAYS} giorni sono gratuiti e senza carta di credito. Alla fine della prova, per
        continuare serve un abbonamento a pagamento; altrimenti l&apos;account viene sospeso e i dati restano
        esportabili per 30 giorni.
      </p>

      <h2>3. Prezzi e pagamenti</h2>
      <p>
        I prezzi sono quelli indicati sul sito al momento dell&apos;attivazione, IVA esclusa, con pagamento
        anticipato mensile o annuale. Le prenotazioni online non hanno commissioni. Possiamo cambiare i prezzi
        con almeno 30 giorni di preavviso via email: se non sei d&apos;accordo puoi recedere prima che il
        cambiamento si applichi. In caso di mancato pagamento, dopo un sollecito, possiamo sospendere
        l&apos;account.
      </p>

      <h2>4. Durata e recesso</h2>
      <p>
        L&apos;abbonamento dura finché non lo disdici: puoi farlo in ogni momento, con effetto alla fine del
        periodo già pagato, senza penali. Possiamo recedere con 30 giorni di preavviso, o subito in caso di
        grave violazione di questi termini. Alla cessazione puoi scaricare tutti i tuoi dati (Configurazione →
        Dati del locale) per 30 giorni; poi li cancelliamo, backup compresi entro ulteriori 30 giorni.
      </p>

      <h2>5. I dati dei tuoi clienti</h2>
      <p>
        I dati dei clienti che prenotano restano tuoi: ne sei il titolare del trattamento e noi li trattiamo
        solo per tuo conto, secondo l&apos;
        <Link href="/trattamento-dati">accordo sul trattamento dei dati</Link> che fa parte di questi termini.
        Spetta a te informare i clienti (ogni pagina di prenotazione ha un&apos;informativa pronta che puoi
        sostituire con la tua) e usare i dati in modo lecito.
      </p>

      <h2>6. Uso corretto</h2>
      <p>
        Non puoi usare il Servizio per inviare comunicazioni non richieste, caricare contenuti illeciti o dati
        di altri senza titolo, tentare di accedere a dati di altri ristoranti, sovraccaricare o aggirare le
        protezioni del sistema.
      </p>

      <h2>7. Disponibilità e assistenza</h2>
      <p>
        Facciamo il possibile perché il Servizio sia sempre disponibile e facciamo backup ogni giorno, ma
        possono esserci interruzioni per manutenzione o guasti, anche di fornitori terzi (hosting, email,
        SMS). Ti assistiamo via email a <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>

      <h2>8. Limitazione di responsabilità</h2>
      <p>
        Salvo dolo o colpa grave, il Fornitore risponde dei danni diretti fino all&apos;importo pagato dal
        Cliente nei 12 mesi precedenti al fatto, e non risponde di danni indiretti, mancati guadagni,
        prenotazioni perse, no-show o mancata consegna di email e messaggi dovuta a terzi. Il Cliente
        controlla le prenotazioni e la configurazione del proprio locale.
      </p>

      <h2>9. Proprietà intellettuale</h2>
      <p>
        Il software, il marchio {PRODUCT_NAME} e i contenuti del sito sono del Fornitore. Ti concediamo un
        diritto d&apos;uso non esclusivo e non cedibile per la durata dell&apos;abbonamento. I contenuti che
        carichi (logo, foto, testi) restano tuoi: ci autorizzi a usarli solo per mostrarli nel Servizio.
      </p>

      <h2>10. Modifiche ai termini</h2>
      <p>
        Possiamo aggiornare questi termini avvisandoti via email almeno 30 giorni prima: se non li accetti
        puoi recedere senza costi prima che entrino in vigore.
      </p>

      <h2>11. Legge applicabile e foro</h2>
      <p>
        Si applica la legge italiana. Per ogni controversia è competente in via esclusiva il foro del luogo in
        cui ha sede il Fornitore.
      </p>

      <h2>12. Approvazione specifica</h2>
      <p>
        Ai sensi degli artt. 1341 e 1342 del Codice civile, con la registrazione il Cliente approva
        specificamente i punti 3 (variazioni di prezzo e sospensione), 4 (recesso del Fornitore), 8
        (limitazione di responsabilità), 10 (modifiche) e 11 (foro competente).
      </p>
    </LegalPage>
  );
}
