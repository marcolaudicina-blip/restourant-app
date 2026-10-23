import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { callApi, clientIp } from "@/lib/api-server";
import { SESSION_COOKIE } from "@/lib/server-config";

/** Forwards /api/v1/* to the API, adding the session token from the httpOnly cookie. */
async function forward(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const method = request.method as "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  const upstream = await callApi({
    method,
    url: `/v1/${path.map(encodeURIComponent).join("/")}${request.nextUrl.search}`,
    token: (await cookies()).get(SESSION_COOKIE)?.value,
    body: method === "GET" ? undefined : await request.text(),
    contentType: request.headers.get("content-type"),
    ip: clientIp(request),
  });

  const response = new NextResponse(upstream.status === 204 ? null : upstream.body, {
    status: upstream.status,
    headers: { "content-type": upstream.contentType },
  });
  if (upstream.status === 401) response.cookies.delete(SESSION_COOKIE);
  return response;
}

export { forward as GET, forward as POST, forward as PATCH, forward as PUT, forward as DELETE };
