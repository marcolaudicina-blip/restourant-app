import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { callApi, clientIp } from "@/lib/api-server";
import { SESSION_COOKIE, SESSION_MAX_AGE } from "@/lib/server-config";

/** API endpoint for each way of opening a session. */
const ENDPOINTS = {
  login: () => "/v1/auth/login",
  register: () => "/v1/auth/register",
  /** Body: { token, fullName?, password } from the invitation link. */
  "accept-invitation": (token: string) => `/v1/auth/invitations/${encodeURIComponent(token)}/accept`,
  /** Body: { token, password } from the reset link. */
  "reset-password": () => "/v1/auth/password/reset",
  /** Body: { currentPassword, newPassword }; replaces the current session. */
  "change-password": () => "/v1/auth/password/change",
} as const;

type Mode = keyof typeof ENDPOINTS;

/**
 * Everything that opens a session goes through here, so the API token ends up in an httpOnly
 * cookie, out of reach of page scripts. Body: { mode, ...fields }.
 */
export async function POST(request: NextRequest) {
  const { mode = "login", ...fields } = (await request.json()) as { mode?: Mode; token?: string };
  if (!(mode in ENDPOINTS)) return NextResponse.json({ error: { code: "bad_request" } }, { status: 400 });

  const store = await cookies();
  // The invitation token travels in the URL; the reset token in the body.
  const { token: linkToken, ...rest } = fields;
  const body = mode === "accept-invitation" ? rest : fields;
  const upstream = await callApi({
    method: "POST",
    url: ENDPOINTS[mode](linkToken ?? ""),
    body: JSON.stringify(body),
    contentType: "application/json",
    token: mode === "change-password" ? store.get(SESSION_COOKIE)?.value : undefined,
    ip: clientIp(request),
  });
  if (upstream.status >= 400) {
    return new NextResponse(upstream.body, {
      status: upstream.status,
      headers: { "content-type": upstream.contentType },
    });
  }

  const { data } = JSON.parse(upstream.body) as { data: { token: string } & Record<string, unknown> };
  store.set(SESSION_COOKIE, data.token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  const { token: _token, ...result } = data;
  return NextResponse.json({ data: result }, { status: upstream.status });
}

export async function DELETE() {
  (await cookies()).delete(SESSION_COOKIE);
  return new NextResponse(null, { status: 204 });
}
