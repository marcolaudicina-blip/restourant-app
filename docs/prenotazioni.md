# Prenotazioni e assegnazione dei tavoli

## Come il sistema sceglie il tavolo

Quando una prenotazione viene inserita senza indicare il tavolo, il sistema elenca tutte le
sistemazioni possibili per quel numero di persone e prende la **prima libera** per tutta la durata
della permanenza (non solo all'orario di arrivo).

Le sistemazioni sono di tre tipi, sempre in quest'ordine:

1. **Tavolo singolo**, se i suoi coperti min/max comprendono il gruppo. Non si uniscono mai tavoli
   se basta un tavolo solo.
2. **Combinazione predefinita**: un gruppo di tavoli creato dal ristorante (es. "Tavolata" = T7+T8,
   da 6 a 8 persone).
3. **Tavoli affiancati uniti automaticamente**: se sulla piantina due o tre tavoli sono segnati come
   affiancati, il sistema li unisce da solo. Propone solo unioni "minime": se 6 persone stanno su
   due tavoli, non ne unisce tre.

All'interno di ogni tipo l'ordine è:

| #   | Criterio                      | Esempio                                                    |
| --- | ----------------------------- | ---------------------------------------------------------- |
| 1   | **Priorità** più alta (0–100) | T1 con priorità 10 viene scelto prima di T2 con priorità 5 |
| 2   | Posti più vicini al gruppo    | per 2 persone, un tavolo da 2 prima di uno da 4            |
| 3   | Meno tavoli                   |                                                            |
| 4   | Ordine delle sale             | a parità di tutto, prima la sala principale                |
| 5   | Nome del tavolo               | T2 prima di T10                                            |

La priorità di una combinazione predefinita si imposta sulla combinazione; per i tavoli uniti
automaticamente vale la **media** delle priorità dei tavoli coinvolti.

Una modifica di priorità ha effetto subito sulle prenotazioni successive.

## Scelta manuale

Lo staff può sempre indicare i tavoli. Il sistema controlla che:

- esistano e siano attivi;
- abbiano posti sufficienti (forzabile con `ignoreCapacity`);
- non siano bloccati né occupati in quell'orario.

Da una prenotazione esistente si può **spostare** il gruppo su altri tavoli o **unire** altri tavoli
(`PUT /reservations/:id/tables`).

## Niente doppie prenotazioni

Oltre ai controlli dell'applicazione, il database rifiuta due prenotazioni attive sovrapposte sullo
stesso tavolo (_exclusion constraint_ su PostgreSQL), anche se arrivano nello stesso istante da due
dispositivi. Gli orari sono semiaperti: un tavolo liberato alle 21:00 si può riprenotare alle 21:00.

## Stati

| Stato                    | Occupa il tavolo | Da qui si può passare a                               |
| ------------------------ | ---------------- | ----------------------------------------------------- |
| Richiesta (da approvare) | sì               | confermata, cancellata                                |
| Confermata               | sì               | arrivata, seduta, no-show, cancellata                 |
| Arrivata                 | sì               | seduta, confermata, no-show, cancellata               |
| Seduta                   | sì               | conclusa, arrivata, confermata                        |
| Conclusa                 | no               | seduta (annulla)                                      |
| No-show                  | no               | confermata (annulla)                                  |
| Cancellata               | no               | confermata (ripristina, se il tavolo è ancora libero) |

Quando il gruppo se ne va (conclusa) il tavolo torna subito disponibile.

## Regole del servizio

- L'orario deve cadere in un servizio aperto quel giorno, altrimenti `outside_service_hours`
  (lo staff può forzare indicando il servizio). I **walk-in** possono arrivare a qualsiasi ora.
- **Ritmo**: massimo coperti e massimo prenotazioni per fascia, massimo coperti per servizio.
  Lo staff può superarli con `ignorePacing`, mai sovrapporre due gruppi sullo stesso tavolo.
- **Durata**: dalle regole per numero di persone (più specifiche per servizio o sala), oppure
  indicata a mano. Se il gruppo cresce la durata viene ricalcolata.

## Disponibilità

`GET /availability?date=…&partySize=…&channel=staff|online` restituisce, per ogni servizio, gli
orari con il tavolo che verrebbe assegnato oppure il motivo per cui non è disponibile:

| Motivo                              | Significato                                              |
| ----------------------------------- | -------------------------------------------------------- |
| `tables_taken`                      | i tavoli adatti sono tutti occupati o bloccati           |
| `no_suitable_table`                 | nessun tavolo o combinazione adatta al numero di persone |
| `pacing_covers` / `pacing_bookings` | troppi coperti / prenotazioni in arrivo in quella fascia |
| `service_full`                      | il servizio ha raggiunto i coperti massimi               |
| `too_soon`                          | (online) oltre il preavviso minimo                       |

Per il canale online valgono anche: prenotazione online disattivata, date passate o troppo lontane,
gruppi oltre il limite online (`large_party_request` / `large_party_phone`), tavoli e sale non
prenotabili online, blocchi solo online.

## Vista a griglia

In **Prenotazioni** il pulsante **Griglia** mostra la giornata come una tabella: una riga per tavolo
(divisi per sala), una colonna ogni 15 minuti, una barra per ogni prenotazione colorata secondo lo
stato. Si apre già sull'ora attuale (oggi) o sulla prima prenotazione; si può limitare a un servizio.

- **Trascinare** una barra di lato cambia l'orario (a passi di 15 minuti), in alto o in basso cambia
  tavolo. Se il tavolo è troppo piccolo o la fascia è piena il sistema chiede conferma.
- **Toccare** una barra apre la prenotazione; toccare uno spazio vuoto ne crea una nuova su quel
  tavolo a quell'ora.
- Le prenotazioni senza tavolo (richieste di gruppi) stanno in alto in "Senza tavolo".
- La linea rossa è l'ora attuale. Ogni dispositivo ricorda se preferisce lista o griglia.

## Foglio del servizio

**Stampa** (in Prenotazioni) apre il foglio della giornata per la cucina e l'ingresso: per servizio,
ora, cliente con etichette (VIP…) e visite, persone, tavolo, telefono, note permanenti del cliente,
richieste e note interne, stato. È impaginato per A4 orizzontale.

## Provenienza

Ogni prenotazione ha un canale: `staff` (inserita dal personale), `online` (fatta dal cliente sul
sito) o `walk_in` (arrivato senza prenotazione). Lo staff può creare solo `staff` e `walk_in`; il
canale `online` lo assegna la pagina di prenotazione pubblica.

Nell'app le prenotazioni online hanno il segno viola **Online** (globo) nella lista, in sala sul tavolo
e nella scheda cliente, e i walk-in il segno **Walk-in**. In lista c'è il conteggio delle online del
giorno e il filtro "Solo online"; aprendo una prenotazione si vede da dove è arrivata e quando.

## Storico

Tavoli, sale e servizi con prenotazioni collegate non si possono eliminare (`in_use`): si
disattivano, così lo storico resta intatto. Ogni operazione finisce nello storico modifiche.
