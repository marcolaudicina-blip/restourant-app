import type { Metadata } from "next";
import { Suspense } from "react";
import { ServiceSheet } from "@/components/reservations/service-sheet";

export const metadata: Metadata = { title: "Foglio del servizio" };

export default function ServiceSheetPage() {
  return (
    <Suspense>
      <ServiceSheet />
    </Suspense>
  );
}
