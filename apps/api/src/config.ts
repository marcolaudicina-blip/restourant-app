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
  /** Sending email (Resend). Both are needed; without them emails are skipped. */
  RESEND_API_KEY: z.string().min(1).optional(),
  /** Sender, e.g. "Prenotazioni <prenotazioni@example.com>", on a domain verified in Resend. */
  EMAIL_FROM: z.string().min(3).optional(),
  /** Public address of the web app, for links and pictures in emails. */
  APP_URL: z.url().optional(),
  /** Set by Vercel: the production domain, used when APP_URL is missing. */
  VERCEL_PROJECT_PRODUCTION_URL: z.string().optional(),
  /** Emails of the platform admins (TwentyReserve staff), comma separated: they see /admin. */
  PLATFORM_ADMIN_EMAILS: z.string().default(""),
  /** Authorizes scheduled jobs (Vercel Cron sends it as a bearer token). */
  CRON_SECRET: z.string().min(16).optional(),
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
  email: { apiKey: string; from: string } | null;
  /** e.g. https://app.example.com, without a trailing slash; null when unknown. */
  publicUrl: string | null;
  cronSecret: string | null;
  platformAdmins: string[];
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
    email: e.RESEND_API_KEY && e.EMAIL_FROM ? { apiKey: e.RESEND_API_KEY, from: e.EMAIL_FROM } : null,
    publicUrl:
      e.APP_URL?.replace(/\/$/, "") ??
      (e.VERCEL_PROJECT_PRODUCTION_URL ? `https://${e.VERCEL_PROJECT_PRODUCTION_URL}` : null),
    cronSecret: e.CRON_SECRET ?? null,
    platformAdmins: e.PLATFORM_ADMIN_EMAILS.split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  };
}
