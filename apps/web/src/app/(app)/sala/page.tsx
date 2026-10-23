import type { Metadata } from "next";
import { Suspense } from "react";
import { SalaView } from "@/components/floor/sala-view";

export const metadata: Metadata = { title: "Sala" };

export default function SalaPage() {
  return (
    <Suspense>
      <SalaView />
    </Suspense>
  );
}
