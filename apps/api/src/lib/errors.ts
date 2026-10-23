import type { z } from "zod";

export type ErrorIssue = { path: string; message: string };

/** An error that is safe to show to API clients. Anything else becomes a generic 500. */
export class AppError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
    readonly issues?: ErrorIssue[],
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const notFound = (what = "Risorsa") => new AppError(404, "not_found", `${what} non trovata`);
export const unauthorized = (message = "Autenticazione richiesta") =>
  new AppError(401, "unauthorized", message);
export const forbidden = (message = "Non hai i permessi per questa operazione") =>
  new AppError(403, "forbidden", message);
export const conflict = (code: string, message: string) => new AppError(409, code, message);
export const invalid = (message: string, issues?: ErrorIssue[]) =>
  new AppError(400, "validation_error", message, issues);

export function issuesFromZod(error: z.ZodError): ErrorIssue[] {
  return error.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
}

/** Validates a fully merged entity (defaults + stored row + patch) against its business rules. */
export function validateEntity<T extends z.ZodType>(schema: T, value: unknown): z.infer<T> {
  const result = schema.safeParse(value);
  if (!result.success) throw invalid("Dati non validi", issuesFromZod(result.error));
  return result.data;
}

/** Postgres SQLSTATE of a driver error, unwrapping Drizzle's query error. */
export function pgErrorCode(error: unknown): string | undefined {
  for (let e = error as { code?: unknown; cause?: unknown } | undefined; e; e = e.cause as typeof e) {
    if (typeof e.code === "string" && /^[0-9A-Z]{5}$/.test(e.code)) return e.code;
  }
  return undefined;
}

/** Name of the violated constraint, when the driver reports one. */
export function pgConstraint(error: unknown): string | undefined {
  for (let e = error as { constraint?: unknown; cause?: unknown } | undefined; e; e = e.cause as typeof e) {
    if (typeof e.constraint === "string") return e.constraint;
  }
  return undefined;
}

export const PG_UNIQUE_VIOLATION = "23505";
export const PG_FOREIGN_KEY_VIOLATION = "23503";
export const PG_CHECK_VIOLATION = "23514";
export const PG_EXCLUSION_VIOLATION = "23P01";

/**
 * Runs a delete and turns "still referenced" into a clear 409: things with reservation history
 * (tables, services, rooms) must be deactivated rather than deleted.
 */
export async function deleteOrExplain<T>(what: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (pgErrorCode(error) === PG_FOREIGN_KEY_VIOLATION) {
      throw conflict("in_use", `${what} ha prenotazioni collegate: disattivalo invece di eliminarlo`);
    }
    throw error;
  }
}
