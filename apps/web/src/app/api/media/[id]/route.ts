import { NextResponse } from "next/server";
import { callApiBinary } from "@/lib/api-server";

/** Pictures of the booking pages. Ids never change content, so browsers and the CDN keep them. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const upstream = await callApiBinary(`/v1/public/media/${encodeURIComponent(id)}`);
  if (upstream.status !== 200) return new NextResponse(null, { status: upstream.status });
  return new NextResponse(upstream.body as BodyInit, {
    headers: {
      "content-type": upstream.contentType,
      "cache-control": upstream.cacheControl ?? "public, max-age=3600",
      "x-content-type-options": "nosniff",
    },
  });
}
