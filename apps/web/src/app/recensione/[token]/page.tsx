import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { cache } from "react";
import { GuestLocaleProvider } from "@/components/booking/i18n";
import { ReviewPage } from "@/components/booking/review-page";
import { pickGuestLocale } from "@/lib/guest-locale";
import { callApi } from "@/lib/api-server";
import type { ReviewView } from "@/lib/types";

type Props = {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ lang?: string; voto?: string }>;
};

const loadReview = cache(async (token: string): Promise<ReviewView | null> => {
  const response = await callApi({ method: "GET", url: `/v1/public/reviews/${encodeURIComponent(token)}` });
  if (response.status === 404) return null;
  if (response.status !== 200) throw new Error(`Review: ${response.status}`);
  return (JSON.parse(response.body) as { data: ReviewView }).data;
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const view = await loadReview((await params).token);
  return {
    title: {
      absolute: view
        ? view.booking.locale === "en"
          ? `How was it at ${view.restaurant.name}?`
          : `Com'è andata da ${view.restaurant.name}?`
        : "Pagina non trovata",
    },
    robots: { index: false, follow: false },
  };
}

/** Where the stars in the "how was it?" email lead; `?voto=N` is the star the guest clicked. */
export default async function ReviewRoute({ params, searchParams }: Props) {
  const [{ token }, query] = await Promise.all([params, searchParams]);
  const view = await loadReview(token);
  if (!view) notFound();
  const vote = Number(query.voto);
  const locale = pickGuestLocale(query.lang, (await headers()).get("accept-language"), view.booking.locale);
  return (
    <GuestLocaleProvider locale={locale}>
      <ReviewPage
        initial={view}
        token={token}
        vote={Number.isInteger(vote) && vote >= 1 && vote <= 5 ? vote : null}
      />
    </GuestLocaleProvider>
  );
}
