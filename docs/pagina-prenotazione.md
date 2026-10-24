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
- **Avviso dopo la prenotazione** (max 2000 caratteri): le regole del ristorante e le informazioni
  utili (ritardi, disdette, caparra, parcheggio, allergie…). Compare subito dopo la prenotazione e
  nell'email di conferma; nell'anteprima si vede con la scheda **Conferma**. C'è un esempio da cui
  partire.

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

## QR code

Nella stessa schermata c'è il **QR code** della pagina (libreria `qrcode`, generato nel browser), nel
colore del ristorante se è abbastanza scuro, altrimenti quasi nero perché le fotocamere lo leggano:

- **Stampa cartoncino**: un cartoncino con nome del locale, "Prenota il tuo tavolo", il QR e il link;
- **Scarica PNG** (1200 px, per tipografie e social) e **Scarica SVG** (vettoriale, per il grafico).

Il QR contiene l'indirizzo della pagina: se si cambia l'indirizzo va ristampato.

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

Il tavolo viene scelto considerando il **max persone online** di ogni tavolo (Sale e tavoli), se
impostato.

## Email al cliente

Se il cliente ha lasciato l'email, riceve:

| Quando                                              | Email                                              |
| --------------------------------------------------- | -------------------------------------------------- |
| Prenotazione online confermata subito               | "Prenotazione confermata" con giorno, ora, persone |
| Richiesta (conferma manuale o gruppo numeroso)      | "Richiesta di prenotazione ricevuta"               |
| Lo staff conferma una richiesta online              | "Prenotazione confermata"                          |
| Lo staff inserisce una prenotazione (¹)             | "Prenotazione confermata"                          |
| Cambiano giorno, ora o persone (staff o cliente)(¹) | "Prenotazione modificata"                          |
| Cancellata dallo staff (¹) o dal cliente            | "Prenotazione cancellata"                          |
| Il giorno prima, prenotazioni confermate (²)        | "Promemoria: …, domani alle 20:00"                 |

(¹) Con **Avvisa delle prenotazioni gestite dallo staff** (Regole → Email ai clienti, attivo di
default). Walk-in, note, tavoli e importazioni non mandano email.
(²) Con **Promemoria il giorno prima** (attivo di default): parte ogni mattina alle 8:00 UTC (9 o 10
in Italia) da un job pianificato di Vercel (`apps/web/vercel.json` → `/api/cron/reminders` →
`POST /v1/internal/reminders`, protetto da `CRON_SECRET`). Ogni prenotazione riceve un solo
promemoria (`reservations.reminder_sent_at`); se viene spostata a un altro giorno, ne riceverà uno
nuovo.

Ogni email ha i colori e il logo del ristorante, le richieste del cliente, l'**avviso dopo la
prenotazione** (non nella cancellazione), indirizzo e telefono. Il mittente mostra il nome del
ristorante e le risposte arrivano all'email del ristorante (Dati del locale). L'esito di ogni invio
(`sent`, `failed`, `not_configured`) resta nel registro modifiche. Configurazione: vedi `deploy.md`.

## Gestire la prenotazione dal link

Se le regole lo permettono (**Il cliente può cancellare / modificare**, **Fino a quante ore prima**),
le email hanno il pulsante **Gestisci la prenotazione**: porta a `/prenotazione/<codice>`, una pagina
con i colori del ristorante dove il cliente vede la prenotazione e può:

- **modificarla**: persone, giorno e ora tra quelli liberi online (il suo tavolo conta come libero). Se
  le nuove persone richiedono la conferma manuale torna "in attesa"; i gruppi oltre il massimo online
  devono chiamare;
- **disdirla**: il tavolo torna libero.

Dopo il termine (es. 2 ore prima) la pagina dice di contattare il ristorante. Il codice è l'id della
prenotazione con una firma (HMAC con `JWT_SECRET`): non si indovina e non serve salvarlo. Lo staff
riceve subito un avviso ("Prenotazione modificata/disdetta dal cliente") su tutti i dispositivi, e il
registro modifiche annota `by: "guest"`.

## API

Senza autenticazione, sotto `/v1/public`, con limiti per IP (120 letture e 10 prenotazioni al minuto):

- `GET /restaurants/:slug`: dati, aspetto e regole della pagina
- `GET /restaurants/:slug/days`: giorni aperti online
- `GET /restaurants/:slug/availability?date&partySize`: orari liberi (`mode`: `book`, `request`,
  `closed` con il motivo)
- `POST /restaurants/:slug/reservations`: prenota
- `GET /media/:id`: immagini
- `GET /bookings/:token`, `GET /bookings/:token/availability?date&partySize`,
  `POST /bookings/:token/change` (`{ date, time, partySize }`), `POST /bookings/:token/cancel`: la
  prenotazione del cliente dal link nelle email

Per lo staff: `GET`/`PATCH /restaurants/:id/booking-page` e `POST /restaurants/:id/media`
(`{ dataUrl }`).

## Da fare

Pagina ed email in inglese, dominio personalizzato del ristorante, orario del promemoria scelto dal
ristorante.
