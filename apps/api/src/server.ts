import { createDatabase } from "@restourant/db";
import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createPasswordHasher } from "./lib/passwords.js";
import { createTokenService } from "./lib/tokens.js";

const config = loadConfig();
const database = await createDatabase(config.databaseUrl);
if (config.autoMigrate) await database.migrate();

const app = await buildApp({
  deps: {
    db: database.db,
    tokens: createTokenService(config.jwtSecret),
    passwords: createPasswordHasher(),
    now: () => new Date(),
  },
  corsOrigins: config.corsOrigins,
  trustProxy: config.trustProxy,
  logger:
    config.env === "development"
      ? { level: config.logLevel, transport: { target: "pino-pretty" } }
      : { level: config.logLevel },
});

const shutdown = async (signal: string) => {
  app.log.info({ signal }, "Shutting down");
  await app.close();
  await database.close();
  process.exit(0);
};
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

await app.listen({ port: config.port, host: config.host });
