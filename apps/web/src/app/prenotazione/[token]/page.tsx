import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { ManageBooking } from "@/components/booking/manage-booking";
import { callApi } from "@/lib/api-server";
import type { GuestBookingView } from "@/lib/types";

type Props = { params: Promise<{ token: string }> };

const loadBooking = cache(async (token: string): Promise<GuestBookingView | null> => {
  const response = await callApi({ method: "GET", url: `/v1/public/bookings/${encodeURIComponent(token)}` });
  if (response.status === 404) return null;
  if (response.status !== 200) throw new Error(`Guest booking: ${response.status}`);
  return (JSON.parse(response.body) as { data: GuestBookingView }).data;
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const view = await loadBooking((await params).token);
  return {
    title: { absolute: view ? `La tua prenotazione da ${view.restaurant.name}` : "Prenotazione non trovata" },
    robots: { index: false, follow: false },
  };
}

/** Where the "Gestisci la prenotazione" button in guests' emails leads. No login: the link is the key. */
export default async function GuestBookingPage({ params }: Props) {
  const { token } = await params;
  const view = await loadBooking(token);
  if (!view) notFound();
  return <ManageBooking initial={view} token={token} />;
}
