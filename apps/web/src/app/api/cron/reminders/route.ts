import { NextResponse, type NextRequest } from "next/server";
import { callApi } from "@/lib/api-server";

/**
 * Daily job (see vercel.json): emails tomorrow's guests a reminder. Vercel Cron sends
 * `Authorization: Bearer $CRON_SECRET`; the API checks it.
 */
export async function GET(request: NextRequest) {
  const upstream = await callApi({
    method: "POST",
    url: "/v1/internal/reminders",
    token: request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "",
  });
  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers: { "content-type": upstream.contentType },
  });
}

export const dynamic = "force-dynamic";
