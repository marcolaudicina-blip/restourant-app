import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { API_URL, SESSION_COOKIE, SESSION_MAX_AGE } from "@/lib/server-config";

/**
 * Login and registration go through here so the API token ends up in an httpOnly cookie,
 * out of reach of page scripts. Body: { mode: "login" | "register", ...credentials }.
 */
export async function POST(request: NextRequest) {
  const { mode, ...credentials } = (await request.json()) as { mode?: string };
  const path = mode === "register" ? "/v1/auth/register" : "/v1/auth/login";
  let upstream: Response;
  try {
    upstream = await fetch(`${API_URL}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(credentials),
    });
  } catch {
    return NextResponse.json(
      { error: { code: "api_unreachable", message: "Il server non risponde, riprova tra poco" } },
      { status: 502 },
    );
  }
  const body = await upstream.json();
  if (!upstream.ok) return NextResponse.json(body, { status: upstream.status });

  const store = await cookies();
  store.set(SESSION_COOKIE, body.data.token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  const { token: _token, ...rest } = body.data;
  return NextResponse.json({ data: rest }, { status: upstream.status });
}

export async function DELETE() {
  (await cookies()).delete(SESSION_COOKIE);
  return new NextResponse(null, { status: 204 });
}
