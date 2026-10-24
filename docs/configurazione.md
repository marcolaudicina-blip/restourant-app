# Configurazione del ristorante

Specifica funzionale della configurazione generica, valida per qualsiasi locale. Nasce dall'analisi
di Superb (centro assistenza pubblico) e dei principali concorrenti (Zenchef, Resy, SevenRooms,
OpenTable, Tablein, EasyTable), con l'obiettivo di coprire le stesse funzioni in modo più semplice.

## 1. Locale

Nome, indirizzo, contatti, sito, fuso orario (default `Europe/Rome`), lingua (it/en), valuta, paese.
Il nome pubblico genera lo _slug_ usato negli indirizzi della pagina di prenotazione.

## 2. Sale

| Campo              | Significato                                                             |
| ------------------ | ----------------------------------------------------------------------- |
| Nome, ordine       | Come appare nel gestionale                                              |
| Attiva             | Una sala stagionale (terrazza d'inverno) si disattiva senza cancellarla |
| Prenotabile online | I suoi tavoli possono essere assegnati a prenotazioni online            |
| Scelta dal cliente | Il cliente può chiedere esplicitamente questa sala ("Terrazza")         |

## 3. Tavoli

Nome/numero (unico nel locale), sala, **coperti min e max**, **priorità** (i tavoli con priorità più
alta vengono proposti per primi), prenotabile online, **max persone online** (facoltativo: es. un
tavolo da 6 che online si prenota solo fino a 4; lo staff può comunque riempirlo, e quando i tavoli si
uniscono online conta questo valore), **solo in combinazione** (mai da solo), attivo, forma e
posizione sulla piantina (x, y, larghezza, altezza, rotazione).

## 4. Unione dei tavoli

Due modi, come Superb ma più semplici da gestire:

- **Tavoli affiancati**: sulla piantina si indica quali tavoli si toccano. Il motore di disponibilità
  calcolerà da solo le unioni possibili (tavoli adiacenti), senza elencarle a mano.
- **Combinazioni fisse**: gruppi con nome, coperti min/max e **priorità** propri (es. "7+8" da 6 a
  8 persone), per le unioni che il personale vuole controllare esplicitamente.

Come il sistema sceglie tra tavoli singoli, combinazioni e tavoli uniti: vedi
[prenotazioni](prenotazioni.md).

## 5. Servizi (turni)

| Campo                 | Significato                                                                                        |
| --------------------- | -------------------------------------------------------------------------------------------------- |
| Nome                  | Pranzo, Cena, Brunch…                                                                              |
| Giorni                | Lunedì–domenica (anche solo alcuni)                                                                |
| Primo e ultimo arrivo | Finestra in cui il cliente può arrivare                                                            |
| Modalità              | **Continua**: arrivi ogni N minuti · **Turni fissi**: solo agli orari indicati (es. 19:30 e 21:30) |
| Intervallo            | 5/10/15/20/30/60 minuti; se vuoto vale quello del locale                                           |
| Validità              | Dal/al, per servizi stagionali                                                                     |
| Sale                  | Limita il servizio ad alcune sale (vuoto = tutte)                                                  |
| Prenotabile online    | Un servizio può essere solo telefonico                                                             |

## 6. Capienza e ritmo

Per ogni servizio, tutti facoltativi:

- **massimo coperti** totali del servizio;
- **massimo coperti per fascia** (es. 20 coperti ogni 15 minuti): protegge la cucina;
- **massimo prenotazioni per fascia**: protegge l'accoglienza.

## 7. Durata del tavolo

Regole per numero di persone (es. 1–2: 90', 3–4: 105', 5–8: 120', 9+: 150'), restringibili a un
servizio e/o a una sala (es. terrazza +15'). Vince la regola più specifica:
servizio+sala › servizio › sala › generica; a parità, quella con l'intervallo di persone più stretto.
Se nessuna regola corrisponde vale la durata predefinita del locale.

## 8. Calendario eccezioni

- **Chiusura**: ferie, un giorno, un solo servizio. Può valere per tutto o **solo online**
  (il telefono resta aperto, es. serata con evento privato parziale).
- **Orario speciale**: un servizio con orari diversi in certe date (Capodanno), anche in un giorno in
  cui normalmente è chiuso.

Precedenza: servizio disattivo › fuori stagione › chiusura › orario speciale › giorno della settimana ›
canale online.

## 9. Blocchi di tavoli e sale

Un tavolo o un'intera sala fuori servizio per una fascia oraria (evento, manutenzione), anche solo per
l'online.

## 10. Regole della prenotazione online

| Regola                               | Default                                            |
| ------------------------------------ | -------------------------------------------------- |
| Prenotazione online attiva           | sì                                                 |
| Coperti min / max online             | 1 / 8                                              |
| Gruppi più grandi                    | richiesta da approvare _oppure_ solo per telefono  |
| Preavviso minimo                     | 60 minuti                                          |
| Prenotabile fino a                   | 90 giorni prima                                    |
| Conferma                             | automatica · manuale · automatica fino a N coperti |
| Cancellazione e modifica dal cliente | sì, fino a 2 ore prima                             |
| Contatti obbligatori                 | telefono ed email (almeno uno)                     |
| Testo della policy                   | libero                                             |
| Persone per fascia oraria            | nessun limite                                      |
| Email per prenotazioni dello staff   | sì                                                 |
| Promemoria il giorno prima           | sì                                                 |

**Persone per fascia oraria**: righe del tipo "sab e dom, arrivi dalle 19:00 alle 20:00 (compreso),
online al massimo 6 persone" (`onlinePartyLimits`, fino a 30). In quegli orari i gruppi più grandi non
vedono gli orari sulla pagina pubblica, non possono prenotarli né spostarci la loro prenotazione;
negli altri orari vale il massimo online generale. Se più fasce si sovrappongono vale la più
restrittiva. Lo staff può sempre inserirli (motivo `party_size_limit` nella disponibilità online).

## 11. Utenti e ruoli

| Ruolo    | Vede la configurazione | Modifica la configurazione | Modifica dati del locale | Storico modifiche |
| -------- | ---------------------- | -------------------------- | ------------------------ | ----------------- |
| Titolare | ✓                      | ✓                          | ✓                        | ✓                 |
| Manager  | ✓                      | ✓                          | –                        | ✓                 |
| Staff    | ✓                      | –                          | –                        | –                 |

## 12. Modelli pronti

Per configurare un locale nuovo in pochi minuti: **Trattoria** (sala + dehors, pranzo e cena),
**Pizzeria a doppio turno** (19:30 e 21:30), **Fine dining** (sola cena, ritmo controllato, conferma
automatica fino a 4 persone). Si applicano solo a un locale ancora vuoto, poi si personalizzano.

## 13. Anteprima orari e storico

- **Anteprima**: per una data e un canale (staff/online) mostra i servizi aperti con gli orari di
  arrivo, oppure il motivo della chiusura (`not_scheduled_day`, `closed_exception`,
  `online_closed_exception`, `out_of_season`, `inactive`, `not_online_bookable`). Con le prenotazioni
  si aggiungeranno i motivi di capienza ("nessun tavolo da 6 libero", "ritmo pieno alle 21:00").
- **Storico modifiche**: ogni modifica alla configurazione registra chi, cosa e quando.

## Da fare nelle prossime fasi

Stati della prenotazione e colori, tre tipi di note (ospite, profilo, interne), notifiche email/SMS,
garanzia con carta e caparre: vedi [roadmap](roadmap.md). La lista d'attesa (interruttore in Regole) è
descritta in [pagina-prenotazione](pagina-prenotazione.md#lista-dattesa).
