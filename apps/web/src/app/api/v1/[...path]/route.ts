import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { API_URL, SESSION_COOKIE } from "@/lib/server-config";

/** Forwards /api/v1/* to the API, adding the session token from the httpOnly cookie. */
async function forward(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const headers = new Headers();
  const contentType = request.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);
  if (token) headers.set("authorization", `Bearer ${token}`);

  const hasBody = !["GET", "HEAD"].includes(request.method);
  let upstream: Response;
  try {
    upstream = await fetch(
      `${API_URL}/v1/${path.map(encodeURIComponent).join("/")}${request.nextUrl.search}`,
      {
        method: request.method,
        headers,
        body: hasBody ? await request.text() : undefined,
        cache: "no-store",
      },
    );
  } catch {
    return NextResponse.json(
      { error: { code: "api_unreachable", message: "Il server non risponde, riprova tra poco" } },
      { status: 502 },
    );
  }

  const response = new NextResponse(upstream.status === 204 ? null : await upstream.text(), {
    status: upstream.status,
    headers: { "content-type": upstream.headers.get("content-type") ?? "application/json" },
  });
  if (upstream.status === 401) response.cookies.delete(SESSION_COOKIE);
  return response;
}

export { forward as GET, forward as POST, forward as PATCH, forward as PUT, forward as DELETE };
