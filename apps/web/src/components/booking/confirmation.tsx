"use client";

import { localToInstant, timeToMinutes } from "@restourant/shared";
import { CalendarPlus, Check } from "lucide-react";
import type { PublicBooking, PublicProfile } from "@/lib/types";
import { useGuestText } from "./i18n";
import { PhoneLink, useRevealOnMount } from "./pickers";

/** An .ics file the guest can add to their calendar. */
function calendarFile(booking: PublicBooking, profile: PublicProfile, party: string): string {
  const start = localToInstant(booking.date, timeToMinutes(booking.time), profile.timezone);
  const end = new Date(start.getTime() + booking.durationMinutes * 60_000);
  const stamp = (d: Date) =>
    d
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}/, "");
  const escape = (s: string) => s.replace(/[\\,;]/g, (c) => `\\${c}`);
  const where = [profile.addressLine, profile.city].filter(Boolean).join(", ");
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//TwentyReserve//Prenotazioni//IT",
    "BEGIN:VEVENT",
    `UID:${booking.id}@twentyreserve.com`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${escape(`${profile.name} · ${party}`)}`,
    ...(where ? [`LOCATION:${escape(where)}`] : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

/** What the guest sees right after booking; also shown as a sample in the settings preview. */
export function Confirmation({
  booking,
  profile,
  onAgain,
  preview = false,
}: {
  booking: PublicBooking;
  profile: PublicProfile;
  onAgain?: () => void;
  preview?: boolean;
}) {
  const { t, longDate } = useGuestText();
  const confirmed = booking.status === "confirmed";
  const note = profile.page.confirmationNote?.trim();
  const ref = useRevealOnMount<HTMLDivElement>(!preview);
  const ics = `data:text/calendar;charset=utf-8,${encodeURIComponent(
    calendarFile(booking, profile, t.people(booking.partySize)),
  )}`;
  return (
    <div ref={ref} className="flex scroll-mt-4 flex-col items-center gap-4 py-4 text-center" role="status">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--brand)] text-[var(--brand-contrast)]">
        <Check className="h-7 w-7" />
      </span>
      <div>
        <h3 className="text-xl font-semibold">{confirmed ? t.confirmedTitle : t.requestSentTitle}</h3>
        <p className="mt-1 text-sm text-muted">
          {confirmed ? t.seeYou(booking.guestName) : t.requestPending}
        </p>
      </div>
      <dl className="w-full divide-y divide-line rounded-xl border border-line text-left text-sm">
        {[
          [t.day, longDate(booking.date)],
          [t.time, booking.time],
          [t.peopleShort, t.people(booking.partySize)],
        ].map(([label, value]) => (
          <div key={label} className="flex justify-between gap-4 px-4 py-2.5">
            <dt className="text-muted">{label}</dt>
            <dd className="font-medium first-letter:uppercase">{value}</dd>
          </div>
        ))}
      </dl>
      {note && (
        <div className="w-full rounded-xl border-l-4 border-[var(--brand)] bg-[var(--brand-soft)] px-4 py-3 text-left">
          <p className="text-xs font-semibold text-[var(--brand-strong)]">{t.infoFromRestaurant}</p>
          <p className="mt-1 whitespace-pre-line text-sm leading-relaxed">{note}</p>
        </div>
      )}
      {booking.emailSent && booking.guestEmail && (
        <p className="text-xs text-muted">
          {t.summarySentTo} <span className="font-medium text-ink">{booking.guestEmail}</span>
        </p>
      )}
      <div className="flex w-full flex-col gap-2">
        {confirmed && (
          <a
            href={ics}
            download="prenotazione.ics"
            className="flex h-11 items-center justify-center gap-2 rounded-xl border border-line bg-surface text-sm font-medium hover:border-[var(--brand)]"
          >
            <CalendarPlus className="h-4 w-4" /> {t.addToCalendar}
          </a>
        )}
        {profile.phone && (
          <p className="text-xs text-muted">
            {booking.emailSent ? t.changesByLink : t.changesByPhone}
            <br />
            <PhoneLink phone={profile.phone} />
          </p>
        )}
        {onAgain && (
          <button
            type="button"
            onClick={onAgain}
            className="text-sm font-medium text-[var(--brand-strong)] hover:underline"
          >
            {t.bookAgain}
          </button>
        )}
      </div>
    </div>
  );
}
