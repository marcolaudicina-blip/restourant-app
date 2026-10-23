# CLAUDE.md

Guidance for Claude Code when working in this repository.

## What this is

A multi-tenant SaaS for restaurant reservations and table management (a Superb / Zenchef alternative).
Product docs are in Italian (`docs/`), code and code comments in English.

## Layout

```
apps/api          Fastify REST API (TypeScript, ESM)
packages/shared   Zod schemas + pure domain logic, shared by API and future web/mobile apps
packages/db       Drizzle ORM schema, SQL migrations, Postgres/PGlite client
docs/             Functional spec and architecture notes (Italian)
```

Internal packages export TypeScript sources directly (`"exports": "./src/index.ts"`); the API build
(tsup) bundles them.

## Commands

```bash
pnpm install
pnpm test            # all packages (PGlite in-memory Postgres, no server needed)
pnpm lint && pnpm typecheck && pnpm format:check
pnpm build
pnpm --filter @restourant/api dev       # API on :3001, needs apps/api/.env (see .env.example)
pnpm db:generate     # after changing packages/db/src/schema → creates a new SQL migration
pnpm db:migrate      # applies migrations to $DATABASE_URL
```

## Conventions

- **Multi-tenancy**: every tenant-owned table has `restaurant_id`; child rows reference parents through
  composite `(id, restaurant_id)` foreign keys so cross-tenant links are impossible at DB level.
  Every query in a service filters by `ctx.restaurantId`.
- **Routes** under `/v1/restaurants/:restaurantId/*` are guarded by `restaurantScope` (plugins/auth.ts):
  auth + membership + permission. GET defaults to `config.read`, writes to `config.write`; override with
  `config: { permission }`. Non-members get 404, not 403.
- **Validation** happens twice on purpose: Fastify validates the request shape with the `*CreateInput` /
  `*Update` schemas, then services merge defaults or the stored row with the patch and validate the
  result with the refined entity schema (`validateEntity`). Cross-field rules live in `check*` functions
  in `packages/shared/src/schemas`.
- **Modules**: `apps/api/src/modules/<name>/<name>.service.ts` (DB + rules, takes a `TenantContext`) and
  `<name>.routes.ts` (HTTP only). Every write records an `audit_log` entry in the same transaction.
- **Responses**: `{ data }` on success, `{ error: { code, message, issues? } }` on failure. User-facing
  messages are Italian.
- Times are local wall-clock `HH:MM` strings, dates `YYYY-MM-DD`, weekdays ISO (1 = Monday).
  Postgres returns `time` as `HH:MM:SS`; normalize with `normalizeTime` when mapping rows.
- **Seating and availability** are pure functions in `packages/shared` (`seating.ts`, `availability.ts`,
  `schedule.ts`). The API loads a `FloorContext` (modules/reservations/floor-context.ts) and feeds them.
  Inside the engine, times are wall-clock minutes from local midnight of the service date
  (`wallMinutesFrom`), so stays past midnight exceed 1440.
- **No double booking** is enforced by an exclusion constraint on `reservation_tables`
  (migration 0002, needs `btree_gist`); keep `starts_at`/`ends_at`/`blocking` there in sync with the
  reservation via `writeTables` / status updates.
- Reservation routes use the `reservations.read` / `reservations.write` permissions (staff included).
- Drizzle uses `casing: "snake_case"`: write camelCase in TypeScript, columns are snake_case.

## Testing

- Pure logic: unit tests in `packages/shared/test`.
- API: `apps/api/test` builds the real app on an in-memory PGlite database via `createTestApp()`
  and drives it with `app.inject`. Prefer adding API tests for new endpoints.
