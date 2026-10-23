import { createDatabase, type DatabaseHandle } from "./index.js";

/** A fresh, migrated, in-memory Postgres for tests. */
export async function createTestDatabase(): Promise<DatabaseHandle> {
  const handle = createDatabase("pglite:memory");
  await handle.migrate();
  return handle;
}
