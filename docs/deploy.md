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

### Variabili d'ambiente

| Variabile                               | Da dove                                                                                             |
| --------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`, `DATABASE_URL_UNPOOLED` | create dall'integrazione Neon quando colleghi il database                                           |
| `JWT_SECRET`                            | stringa casuale di almeno 32 caratteri (`openssl rand -base64 48`)                                  |
| `RESEND_API_KEY`                        | chiave API di [Resend](https://resend.com) per le email ai clienti                                  |
| `EMAIL_FROM`                            | mittente su un dominio verificato in Resend, es. `Prenotazioni <prenotazioni@tuodominio.it>`        |
| `APP_URL` (facoltativa)                 | indirizzo pubblico dell'app per link e logo nelle email; di default il dominio di produzione Vercel |

Senza `RESEND_API_KEY` ed `EMAIL_FROM` le email non partono (le prenotazioni funzionano comunque, e il
registro modifiche annota `not_configured`). Mettile solo in Production, così le anteprime non
scrivono mai ai clienti.

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
