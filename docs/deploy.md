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

| Variabile                               | Da dove                                                            |
| --------------------------------------- | ------------------------------------------------------------------ |
| `DATABASE_URL`, `DATABASE_URL_UNPOOLED` | create dall'integrazione Neon quando colleghi il database          |
| `JWT_SECRET`                            | stringa casuale di almeno 32 caratteri (`openssl rand -base64 48`) |

### Database

PostgreSQL di Neon dal Marketplace di Vercel (regione Europa, es. Francoforte): _Storage → Create
Database → Neon → collega al progetto_. Serve l'estensione `btree_gist`, inclusa in Neon e creata
dalle migrazioni. Le migrazioni girano a ogni build.

## API separata (opzionale, più avanti)

`apps/api` si avvia con `pnpm db:migrate && node apps/api/dist/server.js` (Railway, Docker…).
Variabili: `DATABASE_URL`, `JWT_SECRET`, `TRUST_PROXY=true`, `CORS_ORIGINS`. Sul gestionale si imposta
`API_URL` con l'indirizzo dell'API.
