import { createDatabase } from "@restourant/db";
import { buildApp, type App } from "./app.js";
import { loadConfig } from "./config.js";
import { createPasswordHasher } from "./lib/passwords.js";
import { createTokenService } from "./lib/tokens.js";

/*
 * Runs the API inside another Node.js process instead of its own HTTP server: the Next.js app on
 * Vercel calls it in-process through `callEmbeddedApi`, so one deployment serves both.
 * Migrations are not applied here; they run as a build step (`pnpm db:migrate`).
 */

let appPromise: Promise<App> | null = null;

function getApp(): Promise<App> {
  appPromise ??= (async () => {
    const config = loadConfig({ ...process.env, AUTO_MIGRATE: "false" });
    // Serverless platforms run many small instances: keep each pool small.
    const database = await createDatabase(config.databaseUrl, { maxConnections: 3 });
    const app = await buildApp({
      deps: {
        db: database.db,
        tokens: createTokenService(config.jwtSecret),
        passwords: createPasswordHasher(),
        now: () => new Date(),
      },
      logger: { level: config.logLevel },
    });
    await app.ready();
    return app;
  })().catch((error) => {
    appPromise = null;
    throw error;
  });
  return appPromise;
}

export type EmbeddedRequest = {
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  /** Path including the query string, e.g. "/v1/auth/me". */
  url: string;
  headers: Record<string, string>;
  body?: string;
  /** The end user's IP, so rate limits apply per client and not per server. */
  clientIp?: string;
};

export type EmbeddedResponse = { status: number; contentType: string | undefined; body: string };

export async function callEmbeddedApi(request: EmbeddedRequest): Promise<EmbeddedResponse> {
  const app = await getApp();
  const response = await app.inject({
    method: request.method,
    url: request.url,
    headers: request.headers,
    ...(request.body ? { payload: request.body } : {}),
    remoteAddress: request.clientIp ?? "127.0.0.1",
  });
  const contentType = response.headers["content-type"];
  return {
    status: response.statusCode,
    contentType: typeof contentType === "string" ? contentType : undefined,
    body: response.body,
  };
}

/** GET returning raw bytes, for pictures. */
export async function callEmbeddedApiBinary(url: string) {
  const app = await getApp();
  const response = await app.inject({ method: "GET", url });
  const header = (name: string) => {
    const value = response.headers[name];
    return typeof value === "string" ? value : null;
  };
  return {
    status: response.statusCode,
    contentType: header("content-type") ?? "application/octet-stream",
    cacheControl: header("cache-control"),
    body: new Uint8Array(response.rawPayload),
  };
}
