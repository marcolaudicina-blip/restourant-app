#!/bin/sh
# Vercel build: apply database migrations, then build the app.
# Neon's Vercel integration provides DATABASE_URL (pooled) and DATABASE_URL_UNPOOLED (direct);
# migrations use the direct connection when available.
set -e
if [ -n "${DATABASE_URL_UNPOOLED:-$DATABASE_URL}" ]; then
  DATABASE_URL="${DATABASE_URL_UNPOOLED:-$DATABASE_URL}" pnpm --filter @restourant/db migrate
else
  echo "DATABASE_URL non impostata: migrazioni saltate. Collega un database al progetto Vercel."
fi
pnpm exec next build
