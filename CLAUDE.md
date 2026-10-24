# CLAUDE.md

Guidance for Claude Code when working in this repository.

## What this is

**TwentyReserve** (app.twentyreserve.com): a multi-tenant SaaS for restaurant reservations and table
management (a Superb / Zenchef alternative). The product name lives in
`apps/web/src/components/product-logo.tsx`; package names (`@restourant/*`) keep the old working name.
Product docs are in Italian (`docs/`), code and code comments in English.

## Layout

```
apps/api          Fastify REST API (TypeScript, ESM)
apps/web          Next.js 15 staff app (App Router, Tailwind 4, TanStack Query), Italian UI
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
pnpm --filter @restourant/web dev       # web on :3000, talks to API_URL (default http://localhost:3001)
pnpm --filter @restourant/web build && pnpm --filter @restourant/web e2e   # Playwright, starts API + web itself
# In this container Playwright's bundled Chromium revision is missing: set
# PW_CHROMIUM_PATH=/opt/pw-browsers/chromium-1243/chrome-linux64/chrome
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
- **Guests** (modules/guests): every booking is matched to a guest profile by `normalizePhone()` (then
  email) in `matchGuest`, inside the reservation transaction; profiles are created on first contact.
  Stats (visits, no-shows…) are computed from reservations, never stored. Deleting a guest anonymizes
  their reservations. Migration 0004 backfilled profiles with SQL mirroring `normalizePhone`.
- **Public booking page** (modules/public, no auth, `/v1/public/*`, found by restaurant `slug`):
  profile, open days, availability and booking for guests. Online bookings go through the same
  engine with `channel: "online"`; `insertReservation` is shared with staff bookings. Only what a guest
  may see leaves these routes (no tables). Page look and pictures are in modules/booking-page;
  pictures are `bytea` rows in `media`, uploaded as data URLs and served immutable by id.
- **Email** goes through `deps.mailer` (lib/mailer.ts: Resend when `RESEND_API_KEY` + `EMAIL_FROM`
  are set, otherwise disabled; tests use the memory mailer, `ctx.sentEmails`). Booking emails are in
  modules/notifications: `sendBookingEmail` never throws and records the outcome in the audit log.
- **Team and accounts** (modules/team, modules/auth/account.service.ts): owners/managers invite by
  one-time link (`invitations`, only SHA-256 of tokens stored), managers handle staff only. Password
  reset by email (1 h) or by a manager's link (24 h). `users.session_version` is in every JWT
  (`ver`); bumping it on password change/reset rejects older sessions in `authenticate`.
- **Import** (modules/import): CSV is parsed and mapped in the browser with `packages/shared/src/csv.ts`
  (`parseCsv`, `detectColumns`, `mapRows`); the API validates each row (`guestImportRow`,
  `reservationImportRow`) and reports errors by row. Re-importing is idempotent.
- Tables may have `onlineMaxCovers`: online seating treats it as the table's capacity (alone and joined).
- Drizzle uses `casing: "snake_case"`: write camelCase in TypeScript, columns are snake_case.

## Web app

- **Two runtime modes**: with `API_URL` set, `src/lib/api-server.ts` proxies to a standalone API; without
  it the API runs embedded in the Next.js server (`@restourant/api/embedded`, uses `DATABASE_URL` and
  `JWT_SECRET`). Production on Vercel uses the embedded mode; see `docs/deploy.md`.
- The browser never sees the API token: `/api/session` (login/register/logout) stores it in the
  httpOnly `rs_session` cookie, and `/api/v1/*` is a proxy that adds `Authorization`. Client code calls
  `api()` from `src/lib/api.ts` with API paths (`/restaurants/...`).
- `RestaurantProvider` (src/lib/restaurant.tsx) exposes the current restaurant, its time zone and
  `can(permission)`. Queries live in `src/lib/queries.ts`; mutations go through `useRestaurantMutation`
  (or `useConfigSave` on configuration screens), which invalidates the affected query families.
- The selected day is in the URL (`?data=YYYY-MM-DD`, `useSelectedDate`). Devices stay in sync through
  `ActivityProvider` (components/activity.tsx): it polls `GET /reservations/activity` every 10 s,
  refreshes reservation queries when `lastChangeAt` moves, alerts (banner + chime) on new online
  bookings and exposes the requests waiting for confirmation (no websockets: serverless-friendly).
- `/api/session` opens every session (login, register, accept-invitation, reset-password,
  change-password) so the token only lives in the httpOnly cookie.
- `/prenota/[slug]` is the public booking page (`components/booking`), open to everyone and the only
  route that may be framed (`?embed=1`). It lays out with container queries (`@3xl:`), so the
  settings preview can render it at phone width. Pictures go through `/api/media/[id]`
  (`callApiBinary`).
- UI primitives are in `src/components/ui`; copy is Italian, labels for API codes in `src/lib/labels.ts`.

## Testing

- Pure logic: unit tests in `packages/shared/test`.
- API: `apps/api/test` builds the real app on an in-memory PGlite database via `createTestApp()`
  and drives it with `app.inject`. Prefer adding API tests for new endpoints.
- Web: `apps/web/e2e` (Playwright, desktop + tablet viewports) runs the full flow against a real API on
  PGlite. With `E2E_DATABASE_URL` (a migrated Postgres) it runs the embedded mode instead, as in CI's
  `e2e-postgres` job. Screenshots of each step land in `apps/web/test-results/`.
