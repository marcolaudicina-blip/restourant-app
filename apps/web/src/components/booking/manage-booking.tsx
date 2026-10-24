"use client";

import type { ReservationStatus } from "@restourant/shared";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarCheck, CalendarX, Clock, MapPin, Minus, Plus, Users } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { api, ApiError } from "@/lib/api";
import { brandStyle } from "@/lib/brand";
import { cn } from "@/lib/cn";
import type { GuestBookingView, PublicAvailability, PublicDay } from "@/lib/types";
import { Spinner } from "../ui/spinner";
import { Chip, DayPicker, MAX_CHIPS, Notice, PhoneLink, Step, StepperButton, TimePicker } from "./pickers";
import { Footer, LanguageSwitch, Logo } from "./booking-page";
import { useGuestText, type GuestText } from "./i18n";

const STATUS_STYLE: Record<ReservationStatus, string> = {
  confirmed: "bg-[var(--brand-soft)] text-[var(--brand-strong)]",
  requested: "bg-amber-100 text-amber-800",
  cancelled: "bg-red-100 text-red-700",
  arrived: "bg-canvas text-muted",
  seated: "bg-canvas text-muted",
  completed: "bg-canvas text-muted",
  no_show: "bg-canvas text-muted",
};

/** Why the guest can't act online, in their language (the API sends Italian text and a code). */
function reasonText(t: GuestText, locale: string, view: GuestBookingView): string | null {
  if (!view.message) return null;
  if (locale !== "en") return view.message;
  const english: Record<NonNullable<GuestBookingView["reason"]>, string> = {
    cancelled: "This booking has been cancelled",
    over: "This booking is in the past",
    contact: "To change or cancel, please contact the restaurant",
    too_late: "It can no longer be changed online: please contact the restaurant",
  };
  return view.reason ? english[view.reason] : t.changesByPhone;
}

const primaryButton =
  "flex h-12 items-center justify-center gap-2 rounded-xl bg-[var(--brand)] px-5 text-base font-semibold text-[var(--brand-contrast)] transition-opacity hover:opacity-90 disabled:opacity-60";
const secondaryButton =
  "flex h-12 items-center justify-center gap-2 rounded-xl border border-line bg-surface px-5 text-base font-medium hover:border-[var(--brand)] disabled:opacity-60";

/**
 * The page behind the link in a guest's emails: their booking in the restaurant's colors, and the
 * changes the restaurant allows online (move it, cancel it) until the deadline.
 */
export function ManageBooking({ initial, token }: { initial: GuestBookingView; token: string }) {
  const [view, setView] = useState(initial);
  const [mode, setMode] = useState<"view" | "change" | "cancel">("view");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { restaurant, booking } = view;
  const { t, locale, longDate, dateTime, errorMessage } = useGuestText();
  const deadline = dateTime(view.deadline, restaurant.timezone);
  const message = reasonText(t, locale, view);

  async function cancel() {
    setBusy(true);
    setError(null);
    try {
      setView(await api<GuestBookingView>(`/public/bookings/${token}/cancel`, { method: "POST" }));
      setMode("view");
      setNotice(t.cancelledNotice);
    } catch (e) {
      setError(errorMessage(e, t.cancelError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      lang={locale}
      style={brandStyle(restaurant.page.brandColor)}
      className="@container min-h-dvh bg-canvas"
    >
      <header className="bg-[var(--brand)] text-[var(--brand-contrast)]">
        <div className="mx-auto flex max-w-xl items-center gap-3 px-4 py-5">
          <Logo profile={restaurant} size="sm" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-lg font-semibold">{restaurant.name}</p>
            <p className="text-sm opacity-85">{t.yourBooking}</p>
          </div>
          <LanguageSwitch dark />
        </div>
      </header>

      <main className="mx-auto flex max-w-xl flex-col gap-4 px-4 py-6">
        {notice && (
          <p
            role="status"
            className="rounded-xl bg-[var(--brand-soft)] px-4 py-3 text-sm font-medium text-[var(--brand-strong)]"
          >
            {notice}
          </p>
        )}

        <section className="rounded-2xl border border-line bg-surface p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h1 className="text-lg font-semibold">{t.hello(booking.guestName.split(/\s+/)[0]!)}</h1>
            <span
              className={cn("rounded-full px-3 py-1 text-xs font-semibold", STATUS_STYLE[booking.status])}
            >
              {t.status[booking.status]}
            </span>
          </div>
          <dl
            className={cn(
              "divide-y divide-line rounded-xl border border-line text-sm",
              booking.status === "cancelled" && "text-muted line-through",
            )}
          >
            {[
              [t.day, longDate(booking.date)],
              [t.time, booking.time],
              [t.peopleShort, t.people(booking.partySize)],
              ...(booking.guestNote ? [[t.yourRequests, booking.guestNote]] : []),
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between gap-4 px-4 py-2.5">
                <dt className="text-muted">{label}</dt>
                <dd className="text-right font-medium first-letter:uppercase">{value}</dd>
              </div>
            ))}
          </dl>

          {message && (
            <Notice className="mt-4">
              {message}
              {restaurant.phone && booking.status !== "cancelled" && (
                <>
                  : <PhoneLink phone={restaurant.phone} />
                </>
              )}
            </Notice>
          )}

          {mode === "view" && (view.canModify || view.canCancel) && (
            <div className="mt-5 flex flex-col gap-3">
              <p className="text-sm text-muted">{t.canDo(view.canModify, view.canCancel, deadline)}</p>
              <div className="grid gap-2 @sm:grid-cols-2">
                {view.canModify && (
                  <button type="button" className={primaryButton} onClick={() => setMode("change")}>
                    <CalendarCheck className="h-5 w-5" /> {t.modify}
                  </button>
                )}
                {view.canCancel && (
                  <button type="button" className={secondaryButton} onClick={() => setMode("cancel")}>
                    <CalendarX className="h-5 w-5" /> {t.cancel}
                  </button>
                )}
              </div>
            </div>
          )}

          {mode === "cancel" && (
            <div className="mt-5 flex flex-col gap-3 rounded-xl border border-red-200 bg-red-50 p-4">
              <p className="text-sm font-medium text-red-800">{t.cancelQuestion}</p>
              {error && <p className="text-sm text-red-700">{error}</p>}
              <div className="grid gap-2 @sm:grid-cols-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={cancel}
                  className="flex h-12 items-center justify-center gap-2 rounded-xl bg-red-600 px-5 font-semibold text-white hover:bg-red-700 disabled:opacity-60"
                >
                  {busy && <Spinner className="h-4 w-4" />} {t.yesCancel}
                </button>
                <button
                  type="button"
                  className={secondaryButton}
                  onClick={() => {
                    setMode("view");
                    setError(null);
                  }}
                >
                  {t.noKeep}
                </button>
              </div>
            </div>
          )}

          {booking.status === "cancelled" && (
            <Link href={`/prenota/${restaurant.slug}?lang=${locale}`} className={cn(primaryButton, "mt-5")}>
              {t.bookAgainShort}
            </Link>
          )}
        </section>

        {mode === "change" && (
          <section className="rounded-2xl border border-line bg-surface p-5">
            <h2 className="mb-5 text-lg font-semibold">{t.changeTitle}</h2>
            <ChangeForm
              view={view}
              token={token}
              onCancel={() => setMode("view")}
              onSaved={(next) => {
                setView(next);
                setMode("view");
                setNotice(next.booking.status === "requested" ? t.changeRequestedNotice : t.changedNotice);
              }}
            />
          </section>
        )}

        {(restaurant.addressLine || restaurant.city || restaurant.phone) && (
          <section className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-5 text-sm">
            {(restaurant.addressLine || restaurant.city) && (
              <p className="flex items-center gap-2">
                <MapPin className="h-4 w-4 shrink-0 text-[var(--brand-strong)]" />
                {[restaurant.addressLine, restaurant.city].filter(Boolean).join(", ")}
              </p>
            )}
            {restaurant.phone && (
              <p>
                <PhoneLink phone={restaurant.phone} />
              </p>
            )}
          </section>
        )}
      </main>
      <Footer />
    </div>
  );
}

/** New party size, day and time, among what the restaurant can offer online (own tables count as free). */
function ChangeForm({
  view,
  token,
  onCancel,
  onSaved,
}: {
  view: GuestBookingView;
  token: string;
  onCancel: () => void;
  onSaved: (view: GuestBookingView) => void;
}) {
  const { restaurant, booking } = view;
  const rules = restaurant.booking;
  const queryClient = useQueryClient();
  const { t, locale, longDate, errorMessage } = useGuestText();
  const chipMax = Math.min(rules.maxParty, MAX_CHIPS);
  const [party, setParty] = useState(booking.partySize);
  const [date, setDate] = useState(booking.date);
  const [time, setTime] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const days = useQuery({
    queryKey: ["public", restaurant.slug, "days"],
    queryFn: () => api<PublicDay[]>(`/public/restaurants/${restaurant.slug}/days`),
  });
  const availability = useQuery({
    queryKey: ["guest-booking", token, "availability", date, party],
    queryFn: () =>
      api<PublicAvailability>(`/public/bookings/${token}/availability?date=${date}&partySize=${party}`),
    placeholderData: keepPreviousData,
  });

  function choose(next: { party?: number; date?: string }) {
    if (next.party !== undefined) setParty(next.party);
    if (next.date !== undefined) setDate(next.date);
    setTime(null);
    setError(null);
  }

  async function save() {
    if (!time) return;
    setBusy(true);
    setError(null);
    try {
      onSaved(
        await api<GuestBookingView>(`/public/bookings/${token}/change`, {
          method: "POST",
          body: { date, time, partySize: party, locale },
        }),
      );
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setTime(null);
        await queryClient.invalidateQueries({ queryKey: ["guest-booking", token, "availability"] });
      }
      setError(errorMessage(e, t.saveError));
    } finally {
      setBusy(false);
    }
  }

  const unchanged = date === booking.date && time === booking.time && party === booking.partySize;

  return (
    <div className="flex flex-col gap-6">
      <Step icon={<Users className="h-4 w-4" />} title={t.howMany}>
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: chipMax - rules.minParty + 1 }, (_, i) => rules.minParty + i).map((n) => (
            <Chip key={n} selected={party === n} onClick={() => choose({ party: n })} className="w-11">
              {n}
            </Chip>
          ))}
        </div>
        {rules.maxParty > chipMax && (
          <div className="mt-3 flex items-center gap-3">
            <StepperButton
              label={t.onePersonLess}
              disabled={party <= rules.minParty}
              onClick={() => choose({ party: party - 1 })}
            >
              <Minus className="h-4 w-4" />
            </StepperButton>
            <span className="min-w-24 text-center text-lg font-semibold tabular-nums">{t.people(party)}</span>
            <StepperButton
              label={t.onePersonMore}
              disabled={party >= rules.maxParty}
              onClick={() => choose({ party: party + 1 })}
            >
              <Plus className="h-4 w-4" />
            </StepperButton>
          </div>
        )}
        <p className="mt-2 text-xs text-muted">{t.largerCall(rules.maxParty)}</p>
      </Step>

      <Step icon={<CalendarCheck className="h-4 w-4" />} title={t.when}>
        {days.isPending ? (
          <Spinner className="h-5 w-5 text-muted" />
        ) : (
          <DayPicker
            days={days.data ?? []}
            selected={date}
            today={rules.today}
            onSelect={(d) => choose({ date: d })}
          />
        )}
      </Step>

      <Step icon={<Clock className="h-4 w-4" />} title={t.whatTime}>
        {availability.isPending ? (
          <Spinner className="h-5 w-5 text-muted" />
        ) : availability.isError ? (
          <Notice>{errorMessage(availability.error, t.timesError)}</Notice>
        ) : (
          <TimePicker availability={availability.data!} selected={time} onSelect={setTime} />
        )}
      </Step>

      {error && <p className="rounded-xl bg-red-50 px-3 py-2.5 text-sm text-red-700">{error}</p>}

      <div className="grid gap-2 border-t border-line pt-5 @sm:grid-cols-2">
        <button type="button" disabled={!time || unchanged || busy} onClick={save} className={primaryButton}>
          {busy && <Spinner className="h-4 w-4" />}
          {time ? t.confirmChange(`${longDate(date)}, ${time}`) : t.chooseTime}
        </button>
        <button type="button" className={secondaryButton} onClick={onCancel}>
          {t.back}
        </button>
      </div>
    </div>
  );
}
