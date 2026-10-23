export type ApiIssue = { path: string; message: string };

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly issues: ApiIssue[] = [],
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type Method = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

/** Calls the API through this app's /api proxy. Resolves to the `data` field of the response. */
export async function api<T>(path: string, options: { method?: Method; body?: unknown } = {}): Promise<T> {
  const url = path.startsWith("/api/") ? path : `/api/v1${path}`;
  let response: Response;
  try {
    response = await fetch(url, {
      method: options.method ?? "GET",
      headers: options.body === undefined ? undefined : { "content-type": "application/json" },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch {
    throw new ApiError(0, "network_error", "Impossibile contattare il server. Controlla la connessione.");
  }
  if (response.status === 204) return undefined as T;
  const json = await response.json().catch(() => null);
  if (!response.ok) {
    const error = json?.error ?? {};
    if (response.status === 401 && typeof window !== "undefined" && !url.startsWith("/api/session")) {
      window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
    }
    throw new ApiError(
      response.status,
      error.code ?? "error",
      error.message ?? "Errore imprevisto",
      error.issues,
    );
  }
  return json.data as T;
}

/** "Messaggio (campo: dettaglio)" for toasts and form errors. */
export function describeError(error: unknown): string {
  if (error instanceof ApiError) {
    const details = error.issues.map((i) => (i.path ? `${i.path}: ${i.message}` : i.message)).join(" · ");
    return details ? `${error.message} (${details})` : error.message;
  }
  return "Si è verificato un errore imprevisto";
}
