import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { GuestLocaleProvider } from "@/components/booking/i18n";
import { RestaurantPrivacy } from "@/components/booking/restaurant-privacy";
import { callApi } from "@/lib/api-server";
import { pickGuestLocale } from "@/lib/guest-locale";
import type { PublicProfile } from "@/lib/types";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ lang?: string }> };

async function loadProfile(slug: string): Promise<PublicProfile | null> {
  const response = await callApi({
    method: "GET",
    url: `/v1/public/restaurants/${encodeURIComponent(slug)}`,
  });
  if (response.status === 404) return null;
  if (response.status !== 200) throw new Error(`Privacy ${slug}: ${response.status}`);
  return (JSON.parse(response.body) as { data: PublicProfile }).data;
}

export const metadata: Metadata = { title: { absolute: "Informativa privacy" }, robots: { index: false } };

/** The privacy notice guests read before booking, written from the restaurant's own details. */
export default async function RestaurantPrivacyPage({ params, searchParams }: Props) {
  const [{ slug }, { lang }] = await Promise.all([params, searchParams]);
  const profile = await loadProfile(slug);
  if (!profile) notFound();
  return (
    <GuestLocaleProvider locale={pickGuestLocale(lang, (await headers()).get("accept-language"))}>
      <RestaurantPrivacy profile={profile} />
    </GuestLocaleProvider>
  );
}
