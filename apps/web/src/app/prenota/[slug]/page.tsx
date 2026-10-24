import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { cache } from "react";
import { BookingPage } from "@/components/booking/booking-page";
import { GuestLocaleProvider } from "@/components/booking/i18n";
import { pickGuestLocale } from "@/lib/guest-locale";
import { callApi } from "@/lib/api-server";
import { mediaUrl } from "@/lib/media";
import type { PublicProfile } from "@/lib/types";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ embed?: string; lang?: string }>;
};

const loadProfile = cache(async (slug: string): Promise<PublicProfile | null> => {
  const response = await callApi({
    method: "GET",
    url: `/v1/public/restaurants/${encodeURIComponent(slug)}`,
  });
  if (response.status === 404) return null;
  if (response.status !== 200) throw new Error(`Booking page ${slug}: ${response.status}`);
  return (JSON.parse(response.body) as { data: PublicProfile }).data;
});

async function localeFor(searchParams: Props["searchParams"]) {
  return pickGuestLocale((await searchParams).lang, (await headers()).get("accept-language"));
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const profile = await loadProfile((await params).slug);
  if (!profile) return { title: "Ristorante non trovato" };
  const en = (await localeFor(searchParams)) === "en";
  const title = en ? `Book a table at ${profile.name}` : `Prenota da ${profile.name}`;
  const description =
    profile.page.description?.slice(0, 160) ??
    (en
      ? `Book a table at ${profile.name}${profile.city ? ` in ${profile.city}` : ""}.`
      : `Prenota un tavolo da ${profile.name}${profile.city ? ` a ${profile.city}` : ""}.`);
  return {
    title: { absolute: title },
    description,
    openGraph: {
      title,
      description,
      ...(profile.page.coverId ? { images: [mediaUrl(profile.page.coverId)] } : {}),
    },
  };
}

/** The public booking page of a restaurant: the link restaurants put on their site and socials. */
export default async function PublicBookingPage({ params, searchParams }: Props) {
  const [{ slug }, { embed }] = await Promise.all([params, searchParams]);
  const profile = await loadProfile(slug);
  if (!profile) notFound();
  return (
    <GuestLocaleProvider locale={await localeFor(searchParams)}>
      <BookingPage profile={profile} embed={embed === "1"} className={embed === "1" ? "" : "min-h-dvh"} />
    </GuestLocaleProvider>
  );
}
