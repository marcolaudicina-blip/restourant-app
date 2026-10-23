import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { BookingPage } from "@/components/booking/booking-page";
import { callApi } from "@/lib/api-server";
import { mediaUrl } from "@/lib/media";
import type { PublicProfile } from "@/lib/types";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ embed?: string }>;
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

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const profile = await loadProfile((await params).slug);
  if (!profile) return { title: "Ristorante non trovato" };
  const description =
    profile.page.description?.slice(0, 160) ??
    `Prenota un tavolo da ${profile.name}${profile.city ? ` a ${profile.city}` : ""}.`;
  return {
    title: { absolute: `Prenota da ${profile.name}` },
    description,
    openGraph: {
      title: `Prenota da ${profile.name}`,
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
  return <BookingPage profile={profile} embed={embed === "1"} className={embed === "1" ? "" : "min-h-dvh"} />;
}
