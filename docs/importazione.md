# Importare da Superb o da un altro gestionale

Da **Configurazione → Importa** (titolare e manager) si caricano file **CSV** esportati da Superb, da un
altro gestionale o da un foglio Excel salvato come CSV.

## Clienti

Colonne riconosciute (in italiano o in inglese): nome e cognome (oppure nome + cognome separati),
telefono / cellulare, email, note, etichette (separate da virgola), consenso marketing (sì/no).

- Il cliente viene riconosciuto dal **telefono** (in qualunque formato) o dall'**email**: se esiste già
  viene completato (contatti mancanti, note nuove, etichette aggiunte), non duplicato.
- Le righe senza nome o senza né telefono né email non vengono importate: sono indicate con il
  numero di riga del file.
- Reimportare lo stesso file non cambia nulla.

## Prenotazioni future

Colonne: data, ora (anche insieme: `31/10/2026 20:30`), persone / coperti, cliente (o nome +
cognome), telefono, email, richieste del cliente, note interne, tavolo (`T7` o `T10+T11`), stato.

- Date accettate: `31/10/2026`, `31-10-26`, `31.10.2026`, `2026-10-31`; ore `20:30`, `20.30`,
  `8:30 PM`.
- Si importano solo le prenotazioni **da oggi in poi**; quelle cancellate o no-show si saltano.
- Se il tavolo indicato esiste viene usato (anche se le persone non corrispondono esattamente),
  altrimenti il sistema assegna il tavolo come per una nuova prenotazione. I limiti di ritmo del
  servizio non si applicano (erano già state accettate), ma le doppie prenotazioni restano
  impossibili: le righe in conflitto vengono segnalate.
- Una prenotazione con stessa data, ora e nome già presente viene saltata, quindi il file si può
  reimportare.
- Il cliente di ogni prenotazione viene riconosciuto o creato come sempre.

## Come funziona

Il file viene letto nel browser (separatore `;`, `,` o tab, virgolette, BOM di Excel): si vedono le
colonne riconosciute, modificabili, e un'anteprima con le righe da sistemare. All'importazione le righe
partono a blocchi (500 clienti o 25 prenotazioni per volta) e l'API le controlla di nuovo una per una.
Il riepilogo indica aggiunti, aggiornati, saltati e gli errori con il numero di riga.
