import { fileURLToPath } from "node:url";
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

const MIGRATIONS_DIR = "../drizzle";

/**
 * Absolute path of the SQL migrations. Built from a variable so bundlers (Next.js) don't try to
 * treat the folder as an asset; migrations always run from the sources via `pnpm db:migrate`.
 */
export function migrationsFolder(): string {
  return fileURLToPath(new URL(MIGRATIONS_DIR, import.meta.url));
}

export type DatabaseHandle = {
  db: Database;
  migrate: () => Promise<void>;
  close: () => Promise<void>;
};

export type DatabaseOptions = {
  /** Pool size per process. Keep it small on serverless platforms, where many instances run at once. */
  maxConnections?: number;
};

const PGLITE_PREFIX = "pglite:";

/**
 * Connects to Postgres. `pglite:<dir>` (or `pglite:memory`) runs an embedded Postgres instead,
 * so the API can be started locally without installing a database server. PGlite is loaded only
 * in that case, keeping it out of production bundles.
 */
export async function createDatabase(url: string, options: DatabaseOptions = {}): Promise<DatabaseHandle> {
  if (url.startsWith(PGLITE_PREFIX)) {
    const target = url.slice(PGLITE_PREFIX.length);
    const [{ PGlite }, { btree_gist }, { drizzle: drizzlePglite }, { migrate: migratePglite }] =
      await Promise.all([
        import("@electric-sql/pglite"),
        import("@electric-sql/pglite/contrib/btree_gist"),
        import("drizzle-orm/pglite"),
        import("drizzle-orm/pglite/migrator"),
      ]);
    const client = new PGlite({
      ...(target === "memory" ? {} : { dataDir: target }),
      extensions: { btree_gist },
    });
    const db = drizzlePglite({ client, schema, casing: "snake_case" });
    return {
      // Both drivers expose the same query builder; the cast keeps one Database type across the app.
      db: db as unknown as Database,
      migrate: () => migratePglite(db, { migrationsFolder: migrationsFolder() }),
      close: () => client.close(),
    };
  }

  const pool = new pg.Pool({
    connectionString: url,
    max: options.maxConnections ?? 10,
    idleTimeoutMillis: 30_000,
  });
  const db = drizzlePg({ client: pool, schema, casing: "snake_case" });
  return {
    db,
    migrate: () => migratePg(db, { migrationsFolder: migrationsFolder() }),
    close: () => pool.end(),
  };
}
