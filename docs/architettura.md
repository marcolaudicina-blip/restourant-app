# Architettura

## Scelte

| Area       | Scelta             | Perché                                                                                                                       |
| ---------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| Linguaggio | TypeScript ovunque | Un solo linguaggio per API, web e app; i tipi condivisi evitano errori tra frontend e backend                                |
| Database   | PostgreSQL         | Dati relazionali (sale, tavoli, turni); vincoli e, nelle prossime fasi, _exclusion constraint_ contro le doppie prenotazioni |
| ORM        | Drizzle            | SQL esplicito, migrazioni versionate in `packages/db/drizzle`                                                                |
| API        | Fastify + Zod      | Veloce, validazione e documentazione OpenAPI dagli stessi schemi                                                             |
| Test       | Vitest + PGlite    | Postgres vero in memoria: i test girano ovunque senza installare nulla                                                       |
| Monorepo   | pnpm + Turborepo   | Pacchetti separati con build e test incrementali                                                                             |

## Pacchetti

- `packages/shared`: schemi di validazione e logica pura (calcolo orari, durate, permessi, modelli).
  Nessuna dipendenza da database o HTTP: la useranno anche il gestionale web e l'app.
- `packages/db`: schema delle tabelle, migrazioni, connessione (Postgres in produzione, PGlite in
  sviluppo e test).
- `apps/api`: un modulo per area (`rooms`, `tables`, `services`, …), ognuno con `service`
  (regole e accesso ai dati) e `routes` (solo HTTP).

## Multi-ristorante (multi-tenant)

Ogni riga appartiene a un ristorante (`restaurant_id`). Le relazioni tra righe usano chiavi esterne
composte `(id, restaurant_id)`: il database stesso impedisce, per esempio, di mettere un tavolo del
ristorante A in una sala del ristorante B. In più ogni richiesta passa dal controllo
`restaurantScope`: utente autenticato, membro di quel ristorante, con il permesso richiesto.

## Sicurezza

- Password con scrypt (parametri OWASP), token JWT firmati (12 ore)
- Limite di tentativi su login e registrazione, header di sicurezza (helmet), CORS esplicito
- Chi non è membro di un ristorante riceve 404: gli id dei ristoranti non si possono sondare
- Storico modifiche (`audit_log`) scritto nella stessa transazione della modifica
