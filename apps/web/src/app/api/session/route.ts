import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { callApi, clientIp } from "@/lib/api-server";
import { SESSION_COOKIE, SESSION_MAX_AGE } from "@/lib/server-config";

/**
 * Login and registration go through here so the API token ends up in an httpOnly cookie,
 * out of reach of page scripts. Body: { mode: "login" | "register", ...credentials }.
 */
export async function POST(request: NextRequest) {
  const { mode, ...credentials } = (await request.json()) as { mode?: string };
  const upstream = await callApi({
    method: "POST",
    url: mode === "register" ? "/v1/auth/register" : "/v1/auth/login",
    body: JSON.stringify(credentials),
    contentType: "application/json",
    ip: clientIp(request),
  });
  if (upstream.status >= 400) {
    return new NextResponse(upstream.body, {
      status: upstream.status,
      headers: { "content-type": upstream.contentType },
    });
  }

  const { data } = JSON.parse(upstream.body) as { data: { token: string } & Record<string, unknown> };
  const store = await cookies();
  store.set(SESSION_COOKIE, data.token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  const { token: _token, ...rest } = data;
  return NextResponse.json({ data: rest }, { status: upstream.status });
}

export async function DELETE() {
  (await cookies()).delete(SESSION_COOKIE);
  return new NextResponse(null, { status: 204 });
}
