import "server-only";

export const API_URL = process.env.API_URL ?? "http://localhost:3001";
export const SESSION_COOKIE = "rs_session";
/** Matches the API token lifetime. */
export const SESSION_MAX_AGE = 12 * 60 * 60;
