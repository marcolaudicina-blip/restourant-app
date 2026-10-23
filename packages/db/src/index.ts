import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { drizzle as drizzlePg, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { migrate as migratePg } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import * as schema from "./schema/index.js";

export { schema };
export * from "./schema/index.js";

export type Database = NodePgDatabase<typeof schema>;
/** The callback argument of `db.transaction`. Repositories accept either. */
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
export type Executor = Database | Transaction;

export const MIGRATIONS_FOLDER = fileURLToPath(new URL("../drizzle", import.meta.url));

export type DatabaseHandle = {
  db: Database;
  migrate: () => Promise<void>;
  close: () => Promise<void>;
};

const PGLITE_PREFIX = "pglite:";

/**
 * Connects to Postgres. `pglite:<dir>` (or `pglite:memory`) runs an embedded Postgres instead,
 * so the API can be started locally without installing a database server.
 */
export function createDatabase(url: string): DatabaseHandle {
  if (url.startsWith(PGLITE_PREFIX)) {
    const target = url.slice(PGLITE_PREFIX.length);
    const client = new PGlite(target === "memory" ? undefined : target);
    const db = drizzlePglite({ client, schema, casing: "snake_case" });
    return {
      // Both drivers expose the same query builder; the cast keeps one Database type across the app.
      db: db as unknown as Database,
      migrate: () => migratePglite(db, { migrationsFolder: MIGRATIONS_FOLDER }),
      close: () => client.close(),
    };
  }

  const pool = new pg.Pool({ connectionString: url, max: 10 });
  const db = drizzlePg({ client: pool, schema, casing: "snake_case" });
  return {
    db,
    migrate: () => migratePg(db, { migrationsFolder: MIGRATIONS_FOLDER }),
    close: () => pool.end(),
  };
}
