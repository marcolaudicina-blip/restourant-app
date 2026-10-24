"use client";

import { CircleCheck, Monitor, Smartphone } from "lucide-react";
import { Confirmation } from "@/components/booking/confirmation";
import { BookingPage } from "@/components/booking/booking-page";
import { brandStyle } from "@/lib/brand";
import { cn } from "@/lib/cn";
import { useRestaurant } from "@/lib/restaurant";
import type { PublicBooking, PublicProfile } from "@/lib/types";

/** Live preview of the booking page while it is being edited (phone, desktop, embed). */

export type PreviewMode = "page" | "embed" | "confirmation";

export const NOTE_EXAMPLE = `Il tavolo è garantito per 15 minuti dall'orario prenotato: in caso di ritardo avvisaci.
Per disdire o cambiare la prenotazione chiamaci almeno 2 ore prima.
Segnalaci allergie o intolleranze: ne terremo conto in cucina.`;

export function Preview({
  profile,
  mode,
  onMode,
}: {
  profile: PublicProfile;
  mode: PreviewMode;
  onMode: (mode: PreviewMode) => void;
}) {
  const { today } = useRestaurant();
  const sample: PublicBooking = {
    id: "anteprima",
    status: "confirmed",
    date: today(),
    time: "20:00",
    partySize: 2,
    durationMinutes: 120,
    guestName: "Mario Rossi",
    guestEmail: "mario.rossi@example.com",
    emailSent: true,
  };
  return (
    <div className="xl:sticky xl:top-4 xl:self-start">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Anteprima</h2>
        <div className="flex rounded-lg border border-line bg-surface p-0.5 text-xs">
          {(
            [
              ["page", "Pagina", Smartphone],
              ["embed", "Nel tuo sito", Monitor],
              ["confirmation", "Conferma", CircleCheck],
            ] as const
          ).map(([value, label, Icon]) => (
            <button
              key={value}
              type="button"
              onClick={() => onMode(value)}
              aria-pressed={mode === value}
              className={cn(
                "flex items-center gap-1 rounded-md px-2 py-1 font-medium",
                mode === value ? "bg-brand-600 text-white" : "text-muted hover:text-ink",
              )}
            >
              <Icon className="h-3.5 w-3.5" /> {label}
            </button>
          ))}
        </div>
      </div>
      <div
        className="mx-auto h-[720px] max-w-[400px] overflow-y-auto rounded-[2rem] border-[10px] border-ink bg-canvas shadow-xl"
        data-testid="booking-preview"
      >
        {mode === "confirmation" ? (
          <div style={brandStyle(profile.page.brandColor)} className="@container p-4">
            <div className="rounded-2xl border border-line bg-surface p-5">
              <Confirmation booking={sample} profile={profile} preview />
            </div>
          </div>
        ) : (
          <BookingPage profile={profile} embed={mode === "embed"} preview />
        )}
      </div>
    </div>
  );
}
