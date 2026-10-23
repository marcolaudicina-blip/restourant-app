import "server-only";
import type { NextRequest } from "next/server";
import { API_URL } from "./server-config";

export type UpstreamResponse = { status: number; contentType: string; body: string };

type Method = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

const UNREACHABLE: UpstreamResponse = {
  status: 502,
  contentType: "application/json",
  body: JSON.stringify({
    error: { code: "api_unreachable", message: "Il server non risponde, riprova tra poco" },
  }),
};

/** The visitor's IP as seen by the hosting platform, forwarded so the API rate-limits per client. */
export function clientIp(request: NextRequest): string | undefined {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    undefined
  );
}

/** Calls the API (standalone over HTTP, or embedded in-process) on behalf of a browser request. */
export async function callApi(args: {
  method: Method;
  /** API path with query string, e.g. "/v1/auth/me?x=1". */
  url: string;
  token?: string;
  body?: string;
  contentType?: string | null;
  ip?: string;
}): Promise<UpstreamResponse> {
  const headers: Record<string, string> = {};
  if (args.contentType) headers["content-type"] = args.contentType;
  if (args.token) headers.authorization = `Bearer ${args.token}`;

  try {
    if (API_URL) {
      if (args.ip) headers["x-forwarded-for"] = args.ip;
      const response = await fetch(`${API_URL}${args.url}`, {
        method: args.method,
        headers,
        body: args.body,
        cache: "no-store",
      });
      return {
        status: response.status,
        contentType: response.headers.get("content-type") ?? "application/json",
        body: response.status === 204 ? "" : await response.text(),
      };
    }

    const { callEmbeddedApi } = await import("@restourant/api/embedded");
    const response = await callEmbeddedApi({
      method: args.method,
      url: args.url,
      headers,
      body: args.body,
      clientIp: args.ip,
    });
    return {
      status: response.status,
      contentType: response.contentType ?? "application/json",
      body: response.body,
    };
  } catch (error) {
    console.error("API call failed", error);
    return UNREACHABLE;
  }
}
