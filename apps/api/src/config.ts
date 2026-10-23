import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32, { message: "JWT_SECRET must be at least 32 characters" }),
  PORT: z.coerce.number().int().positive().default(3001),
  HOST: z.string().default("0.0.0.0"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  CORS_ORIGINS: z
    .string()
    .default("")
    .transform((v) =>
      v
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  TRUST_PROXY: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  /** Apply pending migrations at startup. Production runs `pnpm db:migrate` as a release step instead. */
  AUTO_MIGRATE: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v === "true"),
});

export type AppConfig = {
  env: "development" | "test" | "production";
  databaseUrl: string;
  jwtSecret: string;
  port: number;
  host: string;
  logLevel: string;
  corsOrigins: string[];
  autoMigrate: boolean;
  trustProxy: boolean;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment configuration:\n${details}`);
  }
  const e = parsed.data;
  return {
    env: e.NODE_ENV,
    databaseUrl: e.DATABASE_URL,
    jwtSecret: e.JWT_SECRET,
    port: e.PORT,
    host: e.HOST,
    logLevel: e.LOG_LEVEL,
    corsOrigins: e.CORS_ORIGINS,
    autoMigrate: env.AUTO_MIGRATE === undefined ? e.NODE_ENV !== "production" : e.AUTO_MIGRATE,
    trustProxy: e.TRUST_PROXY,
  };
}
