import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { cache } from "react";
import { GuestLocaleProvider } from "@/components/booking/i18n";
import { ManageBooking } from "@/components/booking/manage-booking";
import { pickGuestLocale } from "@/lib/guest-locale";
import { callApi } from "@/lib/api-server";
import type { GuestBookingView } from "@/lib/types";

type Props = { params: Promise<{ token: string }>; searchParams: Promise<{ lang?: string }> };

const loadBooking = cache(async (token: string): Promise<GuestBookingView | null> => {
  const response = await callApi({ method: "GET", url: `/v1/public/bookings/${encodeURIComponent(token)}` });
  if (response.status === 404) return null;
  if (response.status !== 200) throw new Error(`Guest booking: ${response.status}`);
  return (JSON.parse(response.body) as { data: GuestBookingView }).data;
});

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const view = await loadBooking((await params).token);
  const en = view && pickGuestLocale((await searchParams).lang, null, view.booking.locale) === "en";
  return {
    title: {
      absolute: view
        ? en
          ? `Your booking at ${view.restaurant.name}`
          : `La tua prenotazione da ${view.restaurant.name}`
        : "Prenotazione non trovata",
    },
    robots: { index: false, follow: false },
  };
}

/** Where the "Gestisci la prenotazione" button in guests' emails leads. No login: the link is the key. */
export default async function GuestBookingPage({ params, searchParams }: Props) {
  const { token } = await params;
  const view = await loadBooking(token);
  if (!view) notFound();
  // The language the guest booked in, unless they switch.
  const locale = pickGuestLocale(
    (await searchParams).lang,
    (await headers()).get("accept-language"),
    view.booking.locale,
  );
  return (
    <GuestLocaleProvider locale={locale}>
      <ManageBooking initial={view} token={token} />
    </GuestLocaleProvider>
  );
}
