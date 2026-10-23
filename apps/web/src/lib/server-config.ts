import "server-only";

/**
 * Where the API runs. With API_URL set the web app proxies to a standalone API server (local
 * development, Railway…). Without it the API runs embedded in this app (single Vercel deployment).
 */
export const API_URL = process.env.API_URL || null;
export const SESSION_COOKIE = "rs_session";
/** Matches the API token lifetime. */
export const SESSION_MAX_AGE = 12 * 60 * 60;
