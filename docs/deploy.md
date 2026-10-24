# Pubblicazione

## Vercel (configurazione attuale)

Un solo progetto Vercel serve gestionale **e** API: senza `API_URL`, il gestionale esegue l'API al
proprio interno (`@restourant/api/embedded`). Adatto a decine di ristoranti; quando servirà, l'API si
sposta su un server dedicato (Railway) impostando `API_URL`, senza toccare il codice.

| Impostazione    | Valore                                          |
| --------------- | ----------------------------------------------- |
| Root Directory  | `apps/web`                                      |
| Build Command   | `pnpm build:vercel` (migrazioni + `next build`) |
| Install Command | predefinito (pnpm, dalla radice del monorepo)   |

### Domini

| Dominio                                                                                  | Uso                            |
| ---------------------------------------------------------------------------------------- | ------------------------------ |
| `app.twentyreserve.com`                                                                  | gestionale e pagine `/prenota` |
| `twentyreserve.com`, `www.twentyreserve.com`, `twentyreserve.it`, `www.twentyreserve.it` | rimandano a `app.`             |

I domini sono registrati su Aruba; i DNS restano su Aruba con questi record:

| Nome  | Tipo  | Valore                                 |
| ----- | ----- | -------------------------------------- |
| `@`   | A     | `216.198.79.1`                         |
| `www` | CNAME | `25a567978521dc94.vercel-dns-017.com.` |
| `app` | CNAME | `25a567978521dc94.vercel-dns-017.com.` |

(gli stessi `@` e `www` per `twentyreserve.it`). Il record A di parcheggio di Aruba (`62.149.189.55`)
va tolto. Quando `twentyreserve.com` diventerà il sito di presentazione basterà togliere il rimando.

### Variabili d'ambiente

| Variabile                               | Da dove                                                                                       |
| --------------------------------------- | --------------------------------------------------------------------------------------------- |
| `DATABASE_URL`, `DATABASE_URL_UNPOOLED` | create dall'integrazione Neon quando colleghi il database                                     |
| `JWT_SECRET`                            | stringa casuale di almeno 32 caratteri (`openssl rand -base64 48`)                            |
| `RESEND_API_KEY`                        | chiave API di [Resend](https://resend.com) per le email ai clienti                            |
| `EMAIL_FROM`                            | mittente su un dominio verificato in Resend: `TwentyReserve <prenotazioni@twentyreserve.com>` |
| `APP_URL`                               | `https://app.twentyreserve.com`: indirizzo per link e logo nelle email                        |
| `PLATFORM_ADMIN_EMAILS`                 | email (separate da virgola) dello staff TwentyReserve che vede il pannello Admin (`admin.md`) |
| `CRON_SECRET`                           | stringa casuale di almeno 16 caratteri: autorizza il job dei promemoria (Vercel Cron)         |

Senza `RESEND_API_KEY` ed `EMAIL_FROM` le email non partono (le prenotazioni funzionano comunque, e il
registro modifiche annota `not_configured`). Mettile solo in Production, così le anteprime non
scrivono mai ai clienti. Senza `CRON_SECRET` il job giornaliero (promemoria e richieste di recensione, `apps/web/vercel.json`, ogni
giorno alle 8:00 UTC) risponde 503 e non manda nulla.

### Anteprime

Ogni ramo pubblicato su GitHub crea un'anteprima su Vercel che usa lo **stesso database** della
produzione. Per questo `scripts/vercel-build.sh` applica le migrazioni e i dati demo **solo nei build
di produzione** (`VERCEL_ENV=production`): una modifica al database non ancora unita a `main` non tocca
mai i dati veri. Le anteprime con modifiche al database possono quindi non funzionare finché il ramo
non è unito.

### Database

PostgreSQL di Neon dal Marketplace di Vercel (regione Europa, es. Francoforte): _Storage → Create
Database → Neon → collega al progetto_. Serve l'estensione `btree_gist`, inclusa in Neon e creata
dalle migrazioni. Le migrazioni girano a ogni build.

## API separata (opzionale, più avanti)

`apps/api` si avvia con `pnpm db:migrate && node apps/api/dist/server.js` (Railway, Docker…).
Variabili: `DATABASE_URL`, `JWT_SECRET`, `TRUST_PROXY=true`, `CORS_ORIGINS`. Sul gestionale si imposta
`API_URL` con l'indirizzo dell'API.

### Sito vetrina

`/sito` è il sito di presentazione (prezzi e contatti in `apps/web/src/lib/site.ts`, schermate in
`apps/web/public/sito/`). Con la variabile `SITE_HOSTS` (es.
`twentyreserve.com,www.twentyreserve.com,twentyreserve.it,www.twentyreserve.it`) quei domini mostrano
il sito in home e mandano ogni altro indirizzo all'app (`APP_URL`). Su Vercel i domini vanno lasciati
collegati al progetto **senza** rimando verso app.twentyreserve.com.

## Backup e monitoraggio

Backup notturno cifrato, ripristino e controlli di funzionamento: vedi [backup.md](backup.md).
