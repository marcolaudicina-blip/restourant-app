"use client";

import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { BellRing, CalendarCheck, Clock, Minus, Plus, Users } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { api, ApiError } from "@/lib/api";
import type {
  PublicAvailability,
  PublicBooking,
  PublicDay,
  PublicProfile,
  PublicWaitlistEntry,
} from "@/lib/types";
import { Spinner } from "../ui/spinner";
import { useGuestText } from "./i18n";
import { Confirmation } from "./confirmation";
import { DetailsForm } from "./details-form";
import { Chip, DayPicker, MAX_CHIPS, Notice, PhoneLink, Step, StepperButton, TimePicker } from "./pickers";
import { WaitlistConfirmation, WaitlistForm } from "./waitlist-form";

/**
 * The booking widget of the public page: how many, which day, what time, who. Defaults to two
 * people on the first open day, so most guests only pick a time and fill in their details.
 * `?data=YYYY-MM-DD&persone=N` (the link in waiting list emails) preselects day and party.
 */
export function BookingFlow({ profile, preview = false }: { profile: PublicProfile; preview?: boolean }) {
  const { booking, slug } = profile;
  const base = `/public/restaurants/${slug}`;
  const queryClient = useQueryClient();
  const { t, locale, longDate, errorMessage } = useGuestText();

  const chipMax = Math.min(booking.maxParty, MAX_CHIPS);
  const params = useSearchParams();
  const askedParty = preview ? NaN : Number(params.get("persone"));
  const askedDate = preview ? null : params.get("data");
  const [party, setParty] = useState(
    Number.isInteger(askedParty) && askedParty >= booking.minParty && askedParty <= 60
      ? askedParty
      : Math.min(Math.max(2, booking.minParty), booking.maxParty),
  );
  const [date, setDate] = useState<string | null>(
    askedDate && /^\d{4}-\d{2}-\d{2}$/.test(askedDate) ? askedDate : null,
  );
  const [time, setTime] = useState<string | null>(null);
  const [done, setDone] = useState<PublicBooking | null>(null);
  const [waitlistOpen, setWaitlistOpen] = useState(false);
  const [joined, setJoined] = useState<PublicWaitlistEntry | null>(null);

  const large = party > booking.maxParty;
  const phoneOnly = large && booking.largePartyMode === "phone_only";

  const days = useQuery({
    queryKey: ["public", slug, "days"],
    queryFn: () => api<PublicDay[]>(`${base}/days`),
    enabled: booking.enabled,
  });
  const day = date ?? days.data?.find((d) => d.open)?.date ?? null;
  const availability = useQuery({
    queryKey: ["public", slug, "availability", day, party],
    queryFn: () => api<PublicAvailability>(`${base}/availability?date=${day}&partySize=${party}`),
    enabled: booking.enabled && day !== null && !phoneOnly,
    placeholderData: keepPreviousData,
  });

  function choose(next: { party?: number; date?: string }) {
    if (next.party !== undefined) setParty(next.party);
    if (next.date !== undefined) setDate(next.date);
    setTime(null);
    setWaitlistOpen(false);
  }

  if (!booking.enabled) {
    return (
      <Notice>
        {t.onlineOff}
        {profile.phone && (
          <>
            {" "}
            {t.callRestaurant} <PhoneLink phone={profile.phone} />.
          </>
        )}
      </Notice>
    );
  }

  if (done) {
    return (
      <Confirmation
        booking={done}
        profile={profile}
        onAgain={() => {
          setDone(null);
          setTime(null);
        }}
      />
    );
  }

  if (joined) {
    return <WaitlistConfirmation entry={joined} onAgain={() => setJoined(null)} />;
  }

  const request = availability.data?.mode === "request";
  const full =
    availability.data?.mode === "book" &&
    availability.data.waitlist === true &&
    availability.data.services.every((s) => s.times.length === 0);

  return (
    <div className="flex flex-col gap-6">
      <Step icon={<Users className="h-4 w-4" />} title={t.howMany}>
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: chipMax - booking.minParty + 1 }, (_, i) => booking.minParty + i).map((n) => (
            <Chip key={n} selected={party === n} onClick={() => choose({ party: n })} className="w-11">
              {n}
            </Chip>
          ))}
          <Chip
            selected={party > chipMax}
            onClick={() => party <= chipMax && choose({ party: chipMax + 1 })}
            className="px-3"
          >
            {chipMax < booking.maxParty ? t.morePeople(chipMax) : `${booking.maxParty + 1}+`}
          </Chip>
        </div>
        {party > chipMax && (
          <div className="mt-3 flex items-center gap-3">
            <StepperButton
              label={t.onePersonLess}
              disabled={party <= chipMax + 1}
              onClick={() => choose({ party: party - 1 })}
            >
              <Minus className="h-4 w-4" />
            </StepperButton>
            <span className="min-w-24 text-center text-lg font-semibold tabular-nums">{t.people(party)}</span>
            <StepperButton
              label={t.onePersonMore}
              disabled={party >= 60}
              onClick={() => choose({ party: party + 1 })}
            >
              <Plus className="h-4 w-4" />
            </StepperButton>
          </div>
        )}
        {phoneOnly && (
          <Notice className="mt-3">
            {t.largeGroupsCall(booking.maxParty)}
            {profile.phone ? (
              <>
                : <PhoneLink phone={profile.phone} />
              </>
            ) : (
              "."
            )}
          </Notice>
        )}
      </Step>

      {!phoneOnly && (
        <Step icon={<CalendarCheck className="h-4 w-4" />} title={t.when}>
          {days.isPending ? (
            <Spinner className="h-5 w-5 text-muted" />
          ) : (
            <DayPicker
              days={days.data ?? []}
              selected={day}
              today={booking.today}
              onSelect={(d) => choose({ date: d })}
            />
          )}
        </Step>
      )}

      {!phoneOnly && day && (
        <Step icon={<Clock className="h-4 w-4" />} title={t.whatTime}>
          {availability.isPending ? (
            <Spinner className="h-5 w-5 text-muted" />
          ) : availability.isError ? (
            <Notice>{t.timesError}</Notice>
          ) : (
            <TimePicker availability={availability.data!} selected={time} onSelect={setTime} />
          )}
          {request && (
            <p className="mt-3 rounded-lg bg-[var(--brand-soft)] px-3 py-2 text-sm text-[var(--brand-strong)]">
              {t.largeGroupsRequest(booking.maxParty)}
            </p>
          )}
          {full && !waitlistOpen && (
            <div className="mt-3 flex flex-col items-start gap-2">
              <p className="text-sm text-muted">{t.waitlistOffer}</p>
              <button
                type="button"
                onClick={() => setWaitlistOpen(true)}
                className="inline-flex h-11 items-center gap-2 rounded-xl border border-[var(--brand)] px-4 text-sm font-semibold text-[var(--brand-strong)] hover:bg-[var(--brand-soft)]"
              >
                <BellRing className="h-4 w-4" /> {t.joinWaitlist}
              </button>
            </div>
          )}
        </Step>
      )}

      {!phoneOnly && day && full && waitlistOpen && availability.data && (
        <WaitlistForm
          profile={profile}
          day={day}
          party={party}
          availability={availability.data}
          preview={preview}
          onJoined={setJoined}
        />
      )}

      {!phoneOnly && day && time && (
        <DetailsForm
          profile={profile}
          summary={`${t.people(party)} · ${longDate(day)} · ${time}`}
          request={request}
          preview={preview}
          onSubmit={async (details) => {
            try {
              const created = await api<PublicBooking>(`${base}/reservations`, {
                method: "POST",
                body: { date: day, time, partySize: party, ...details, locale },
              });
              setDone(created);
              return null;
            } catch (error) {
              if (error instanceof ApiError && error.status === 409) {
                setTime(null);
                await queryClient.invalidateQueries({ queryKey: ["public", slug, "availability"] });
              }
              return errorMessage(error, t.bookingError);
            }
          }}
        />
      )}
    </div>
  );
}
