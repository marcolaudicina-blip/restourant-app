import type { Metadata } from "next";
import { Suspense } from "react";
import { ReservationsView } from "@/components/reservations/reservations-view";

export const metadata: Metadata = { title: "Prenotazioni" };

export default function ReservationsPage() {
  return (
    <Suspense>
      <ReservationsView />
    </Suspense>
  );
}
