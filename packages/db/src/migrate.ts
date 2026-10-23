import { createDatabase } from "./index.js";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const handle = createDatabase(url);
try {
  await handle.migrate();
  console.log("Migrations applied");
} finally {
  await handle.close();
}
