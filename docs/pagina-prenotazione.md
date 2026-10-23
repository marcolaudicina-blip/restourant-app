# Pagina di prenotazione pubblica

Ogni ristorante ha una pagina dove i clienti prenotano da soli: `https://<dominio>/prenota/<indirizzo>`.
Non serve nessun accesso. Il link si mette sul sito, nella bio di Instagram, su Facebook e nella
scheda Google del locale.

## Personalizzazione

Da **Configurazione → Pagina di prenotazione** (titolare e manager):

- **Indirizzo** della pagina (es. `trattoria-da-marco`): lettere minuscole, numeri e trattini, unico
  tra tutti i ristoranti. Se si cambia, il vecchio link smette di funzionare.
- **Colore del marchio**: otto colori pronti o uno qualsiasi. La pagina ricava da solo il colore del
  testo sui pulsanti (bianco o scuro), uno sfondo tenue e una tonalità più scura per i link, così
  resta leggibile anche con colori chiari.
- **Logo**, **copertina** e fino a **8 foto** del locale, nell'ordine scelto.
- **Presentazione**: qualche riga sul locale (max 600 caratteri).

L'anteprima a destra mostra la pagina mentre la modifichi, sia intera sia come modulo nel sito.
Nome, indirizzo, telefono, email e sito vengono da **Dati del locale**; le regole (persone min/max,
preavviso, giorni prenotabili, conferma automatica o manuale, contatti obbligatori, testo delle
condizioni) da **Regole di prenotazione**.

### Immagini

Il browser riduce le foto prima di caricarle (logo 512 px, copertina 2000 px, foto 1600 px, formato
WebP), quindi anche le foto del telefono pesano poche centinaia di KB. Il server accetta solo JPG,
PNG e WebP veri (controlla i primi byte del file), max 3 MB, e al massimo 40 immagini per ristorante.
Ogni immagine caricata ha un id nuovo e non cambia mai: viene servita da `/api/media/<id>` con cache
di un anno. Le immagini tolte dalla pagina vengono cancellate al salvataggio; quelle caricate e mai
salvate dopo un giorno.

## Inserimento nel sito

Due codici da copiare, sempre nella stessa schermata:

- **Pulsante**: un link "Prenota un tavolo" con il colore del ristorante, che apre la pagina.
- **Modulo nella pagina**: un `iframe` con `?embed=1` (solo il modulo, senza copertina) e un piccolo
  script che ne adatta l'altezza al contenuto (la pagina invia `restourant:height` con
  `postMessage`).

Solo le pagine `/prenota/*` possono stare dentro un iframe; il gestionale lo vieta
(`frame-ancestors 'none'`).

## Come prenota il cliente

1. **Persone**: già impostato su 2. Oltre il massimo online, a seconda delle regole il cliente invia
   una **richiesta** oppure vede il telefono del ristorante.
2. **Giorno**: i prossimi giorni (fino a 92) con quelli chiusi disattivati; parte dal primo giorno
   aperto.
3. **Orario**: solo gli orari con un tavolo libero davvero, divisi per servizio, già filtrati per
   preavviso minimo, ritmo e tavoli prenotabili online. Il cliente non vede mai i tavoli.
4. **Dati**: nome, telefono ed email (obbligatori secondo le regole), richieste, consenso al
   trattamento dei dati. Un campo nascosto ferma i bot.
5. **Conferma**: "Prenotazione confermata" (con file per il calendario) o "Richiesta inviata".

La prenotazione nasce con canale `online` (segno viola "Online" nel gestionale) e stato:

| Regola di conferma         | Stato                                                           |
| -------------------------- | --------------------------------------------------------------- |
| Automatica                 | `confirmed`                                                     |
| Manuale                    | `requested`                                                     |
| Automatica fino a N        | `confirmed` fino a N persone, poi `requested`                   |
| Gruppo oltre il max online | sempre `requested`; tavoli tenuti se liberi, altrimenti nessuno |

Il tavolo è quello che l'assegnazione automatica sceglie per priorità tra i tavoli prenotabili online.
Se nel frattempo qualcuno prende l'ultimo tavolo, il cliente vede "Questo orario è appena stato
prenotato" e sceglie un altro orario (il database impedisce comunque le doppie prenotazioni).
Il cliente viene riconosciuto o creato in **Clienti** dal numero di telefono, come per le
prenotazioni inserite dallo staff.

## API

Senza autenticazione, sotto `/v1/public`, con limiti per IP (120 letture e 10 prenotazioni al minuto):

- `GET /restaurants/:slug`: dati, aspetto e regole della pagina
- `GET /restaurants/:slug/days`: giorni aperti online
- `GET /restaurants/:slug/availability?date&partySize`: orari liberi (`mode`: `book`, `request`,
  `closed` con il motivo)
- `POST /restaurants/:slug/reservations`: prenota
- `GET /media/:id`: immagini

Per lo staff: `GET`/`PATCH /restaurants/:id/booking-page` e `POST /restaurants/:id/media`
(`{ dataUrl }`).

## Da fare

Email di conferma con link per modificare o disdire, pagina in inglese, dominio personalizzato del
ristorante, QR code da stampare.
