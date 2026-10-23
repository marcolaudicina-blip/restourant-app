# Restourant (nome provvisorio)

Gestionale SaaS per ristoranti: prenotazioni online e telefoniche, piantina dei tavoli in tempo reale,
CRM ospiti. Pensato per essere venduto a più ristoranti (multi-tenant), con il nostro ristorante
come primo cliente.

## Stato

**Fase 0: fondamenta e configurazione generica** ✅

- Monorepo TypeScript (API, logica condivisa, database), CI su GitHub
- Account, ristoranti, ruoli (titolare / manager / staff)
- Configurazione completa di un ristorante: sale, tavoli, unione tavoli, servizi e turni,
  durate, capienza e ritmo, chiusure e orari speciali, blocchi, regole della prenotazione online
- Modelli pronti (trattoria, pizzeria a doppio turno, fine dining) per configurare un locale in un clic
- Anteprima orari ("cosa vede il cliente sabato sera?") e storico modifiche

Dettagli funzionali: [docs/configurazione.md](docs/configurazione.md) · Architettura:
[docs/architettura.md](docs/architettura.md) · Piano: [docs/roadmap.md](docs/roadmap.md)

## Avvio rapido

Serve Node 22 e pnpm 10 (`corepack enable`).

```bash
pnpm install
cp apps/api/.env.example apps/api/.env   # usa un database integrato, nessun Postgres da installare
pnpm --filter @restourant/api dev        # API su http://localhost:3001
pnpm test                                # tutti i test
```

Documentazione delle API (OpenAPI): `GET /docs/openapi.json`.

## In produzione

1. `DATABASE_URL` punta a PostgreSQL (consigliato un provider in UE, es. Neon o Supabase)
2. `pnpm install --frozen-lockfile && pnpm build`
3. `pnpm db:migrate` (passo di rilascio)
4. `NODE_ENV=production node apps/api/dist/server.js`
