#!/bin/sh
# Vercel build: apply database migrations, then build the app.
# Neon's Vercel integration provides DATABASE_URL (pooled) and DATABASE_URL_UNPOOLED (direct);
# migrations use the direct connection when available.
#
# Only production builds touch the database: preview deployments of feature branches share it, and
# must never apply migrations that are not merged yet.
set -e
if [ "$VERCEL_ENV" != "production" ]; then
  echo "Build di anteprima ($VERCEL_ENV): migrazioni e dati demo saltati."
elif [ -n "${DATABASE_URL_UNPOOLED:-$DATABASE_URL}" ]; then
  DATABASE_URL="${DATABASE_URL_UNPOOLED:-$DATABASE_URL}" pnpm --filter @restourant/db migrate
  # Optional demo restaurant, created once when DEMO_EMAIL and DEMO_PASSWORD are set.
  if [ -n "$DEMO_EMAIL" ] && [ -n "$DEMO_PASSWORD" ]; then
    DATABASE_URL="${DATABASE_URL_UNPOOLED:-$DATABASE_URL}" pnpm --filter @restourant/api seed:demo
  fi
else
  echo "DATABASE_URL non impostata: migrazioni saltate. Collega un database al progetto Vercel."
fi
pnpm exec next build
