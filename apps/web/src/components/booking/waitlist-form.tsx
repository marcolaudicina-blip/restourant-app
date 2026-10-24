"use client";

import { BellRing } from "lucide-react";
import { useState } from "react";
import { api } from "@/lib/api";
import type { PublicAvailability, PublicProfile, PublicWaitlistEntry } from "@/lib/types";
import { useGuestText } from "./i18n";
import { DetailsForm } from "./details-form";
import { Chip, Step, useRevealOnMount } from "./pickers";

/** A full day: the guest picks a time window (a service, or any time) and leaves their details. */
export function WaitlistForm({
  profile,
  day,
  party,
  availability,
  preview,
  onJoined,
}: {
  profile: PublicProfile;
  day: string;
  party: number;
  availability: PublicAvailability;
  preview: boolean;
  onJoined: (entry: PublicWaitlistEntry) => void;
}) {
  const { t, locale, longDate, errorMessage } = useGuestText();
  const windows = availability.services.filter((s) => s.firstTime && s.lastTime);
  const [serviceId, setServiceId] = useState<string | null>(null);
  const chosen = windows.find((s) => s.serviceId === serviceId) ?? null;
  return (
    <div className="flex flex-col gap-6">
      <Step icon={<BellRing className="h-4 w-4" />} title={t.waitlistWhen}>
        <div className="flex flex-wrap gap-2">
          <Chip selected={serviceId === null} onClick={() => setServiceId(null)} className="px-3">
            {t.anyTime}
          </Chip>
          {windows.length > 1 &&
            windows.map((s) => (
              <Chip
                key={s.serviceId}
                selected={serviceId === s.serviceId}
                onClick={() => setServiceId(s.serviceId)}
                className="px-3 tabular-nums"
              >
                {s.name} · {s.firstTime}–{s.lastTime}
              </Chip>
            ))}
        </div>
      </Step>
      <DetailsForm
        profile={profile}
        summary={t.waitlistSummary(t.people(party), longDate(day))}
        request={false}
        preview={preview}
        submitLabel={t.waitlistSubmit}
        onSubmit={async ({ guestNote, ...details }) => {
          try {
            onJoined(
              await api<PublicWaitlistEntry>(`/public/restaurants/${profile.slug}/waitlist`, {
                method: "POST",
                body: {
                  date: day,
                  partySize: party,
                  timeFrom: chosen?.firstTime ?? null,
                  timeTo: chosen?.lastTime ?? null,
                  note: guestNote,
                  ...details,
                  locale,
                },
              }),
            );
            return null;
          } catch (error) {
            return errorMessage(error, t.waitlistError);
          }
        }}
      />
    </div>
  );
}

export function WaitlistConfirmation({
  entry,
  onAgain,
}: {
  entry: PublicWaitlistEntry;
  onAgain: () => void;
}) {
  const { t, longDate } = useGuestText();
  const ref = useRevealOnMount<HTMLDivElement>(true);
  return (
    <div ref={ref} className="flex scroll-mt-4 flex-col items-center gap-4 py-4 text-center" role="status">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--brand)] text-[var(--brand-contrast)]">
        <BellRing className="h-7 w-7" />
      </span>
      <div>
        <h3 className="text-xl font-semibold">{t.waitlistDoneTitle}</h3>
        <p className="mt-1 text-sm text-muted first-letter:uppercase">
          {t.people(entry.partySize)} · {longDate(entry.date)}
          {entry.timeFrom && entry.timeTo ? ` · ${entry.timeFrom}–${entry.timeTo}` : ""}
        </p>
      </div>
      <p className="text-sm">
        {t.waitlistNotBooking} {t.waitlistDone}
      </p>
      {entry.emailSent && entry.guestEmail && (
        <p className="text-xs text-muted">
          {t.summarySentTo} <span className="font-medium text-ink">{entry.guestEmail}</span>
        </p>
      )}
      <button
        type="button"
        onClick={onAgain}
        className="text-sm font-medium text-[var(--brand-strong)] hover:underline"
      >
        {t.bookAgain}
      </button>
    </div>
  );
}
