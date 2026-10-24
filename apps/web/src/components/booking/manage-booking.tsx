"use client";

import type { ReservationStatus } from "@restourant/shared";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarCheck, CalendarX, Clock, MapPin, Minus, Plus, Users } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { api, ApiError } from "@/lib/api";
import { brandStyle } from "@/lib/brand";
import { cn } from "@/lib/cn";
import { formatDateLong } from "@/lib/labels";
import type { GuestBookingView, PublicAvailability, PublicDay } from "@/lib/types";
import { Spinner } from "../ui/spinner";
import {
  Chip,
  DayPicker,
  MAX_CHIPS,
  Notice,
  people,
  PhoneLink,
  Step,
  StepperButton,
  TimePicker,
} from "./booking-flow";
import { Footer, Logo } from "./booking-page";

const STATUS: Record<ReservationStatus, { label: string; className: string }> = {
  confirmed: { label: "Confermata", className: "bg-[var(--brand-soft)] text-[var(--brand-strong)]" },
  requested: { label: "In attesa di conferma", className: "bg-amber-100 text-amber-800" },
  cancelled: { label: "Cancellata", className: "bg-red-100 text-red-700" },
  arrived: { label: "In corso", className: "bg-canvas text-muted" },
  seated: { label: "In corso", className: "bg-canvas text-muted" },
  completed: { label: "Conclusa", className: "bg-canvas text-muted" },
  no_show: { label: "Conclusa", className: "bg-canvas text-muted" },
};

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
  const status = STATUS[booking.status];
  const deadline = new Intl.DateTimeFormat("it-IT", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: restaurant.timezone,
  }).format(new Date(view.deadline));

  async function cancel() {
    setBusy(true);
    setError(null);
    try {
      setView(await api<GuestBookingView>(`/public/bookings/${token}/cancel`, { method: "POST" }));
      setMode("view");
      setNotice("Prenotazione cancellata. Ti abbiamo inviato una conferma via email.");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Impossibile cancellare ora. Riprova tra poco.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={brandStyle(restaurant.page.brandColor)} className="@container min-h-dvh bg-canvas">
      <header className="bg-[var(--brand)] text-[var(--brand-contrast)]">
        <div className="mx-auto flex max-w-xl items-center gap-3 px-4 py-5">
          <Logo profile={restaurant} size="sm" />
          <div className="min-w-0">
            <p className="truncate text-lg font-semibold">{restaurant.name}</p>
            <p className="text-sm opacity-85">La tua prenotazione</p>
          </div>
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
            <h1 className="text-lg font-semibold">Ciao {booking.guestName.split(/\s+/)[0]}</h1>
            <span className={cn("rounded-full px-3 py-1 text-xs font-semibold", status.className)}>
              {status.label}
            </span>
          </div>
          <dl
            className={cn(
              "divide-y divide-line rounded-xl border border-line text-sm",
              booking.status === "cancelled" && "text-muted line-through",
            )}
          >
            {[
              ["Giorno", formatDateLong(booking.date)],
              ["Ora", booking.time],
              ["Persone", people(booking.partySize)],
              ...(booking.guestNote ? [["Le tue richieste", booking.guestNote]] : []),
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between gap-4 px-4 py-2.5">
                <dt className="text-muted">{label}</dt>
                <dd className="text-right font-medium first-letter:uppercase">{value}</dd>
              </div>
            ))}
          </dl>

          {view.message && (
            <Notice className="mt-4">
              {view.message}
              {restaurant.phone && booking.status !== "cancelled" && (
                <>
                  : <PhoneLink phone={restaurant.phone} />
                </>
              )}
            </Notice>
          )}

          {mode === "view" && (view.canModify || view.canCancel) && (
            <div className="mt-5 flex flex-col gap-3">
              <p className="text-sm text-muted">
                Puoi{" "}
                {view.canModify && view.canCancel
                  ? "modificarla o disdirla"
                  : view.canModify
                    ? "modificarla"
                    : "disdirla"}{" "}
                online fino a {deadline}.
              </p>
              <div className="grid gap-2 @sm:grid-cols-2">
                {view.canModify && (
                  <button type="button" className={primaryButton} onClick={() => setMode("change")}>
                    <CalendarCheck className="h-5 w-5" /> Modifica
                  </button>
                )}
                {view.canCancel && (
                  <button type="button" className={secondaryButton} onClick={() => setMode("cancel")}>
                    <CalendarX className="h-5 w-5" /> Disdici
                  </button>
                )}
              </div>
            </div>
          )}

          {mode === "cancel" && (
            <div className="mt-5 flex flex-col gap-3 rounded-xl border border-red-200 bg-red-50 p-4">
              <p className="text-sm font-medium text-red-800">
                Vuoi davvero disdire la prenotazione? Il tavolo tornerà disponibile per altri clienti.
              </p>
              {error && <p className="text-sm text-red-700">{error}</p>}
              <div className="grid gap-2 @sm:grid-cols-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={cancel}
                  className="flex h-12 items-center justify-center gap-2 rounded-xl bg-red-600 px-5 font-semibold text-white hover:bg-red-700 disabled:opacity-60"
                >
                  {busy && <Spinner className="h-4 w-4" />} Sì, disdici
                </button>
                <button
                  type="button"
                  className={secondaryButton}
                  onClick={() => {
                    setMode("view");
                    setError(null);
                  }}
                >
                  No, tienila
                </button>
              </div>
            </div>
          )}

          {booking.status === "cancelled" && (
            <Link href={`/prenota/${restaurant.slug}`} className={cn(primaryButton, "mt-5")}>
              Prenota di nuovo
            </Link>
          )}
        </section>

        {mode === "change" && (
          <section className="rounded-2xl border border-line bg-surface p-5">
            <h2 className="mb-5 text-lg font-semibold">Modifica la prenotazione</h2>
            <ChangeForm
              view={view}
              token={token}
              onCancel={() => setMode("view")}
              onSaved={(next) => {
                setView(next);
                setMode("view");
                setNotice(
                  next.booking.status === "requested"
                    ? "Modifica inviata: il ristorante deve confermarla. Ti scriveremo via email."
                    : "Prenotazione modificata. Ti abbiamo inviato un'email con i nuovi dettagli.",
                );
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
          body: { date, time, partySize: party },
        }),
      );
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setTime(null);
        await queryClient.invalidateQueries({ queryKey: ["guest-booking", token, "availability"] });
      }
      setError(e instanceof ApiError ? e.message : "Impossibile salvare ora. Riprova tra poco.");
    } finally {
      setBusy(false);
    }
  }

  const unchanged = date === booking.date && time === booking.time && party === booking.partySize;

  return (
    <div className="flex flex-col gap-6">
      <Step icon={<Users className="h-4 w-4" />} title="Quante persone?">
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
              label="Una persona in meno"
              disabled={party <= rules.minParty}
              onClick={() => choose({ party: party - 1 })}
            >
              <Minus className="h-4 w-4" />
            </StepperButton>
            <span className="min-w-24 text-center text-lg font-semibold tabular-nums">{people(party)}</span>
            <StepperButton
              label="Una persona in più"
              disabled={party >= rules.maxParty}
              onClick={() => choose({ party: party + 1 })}
            >
              <Plus className="h-4 w-4" />
            </StepperButton>
          </div>
        )}
        <p className="mt-2 text-xs text-muted">Per più di {rules.maxParty} persone contatta il ristorante.</p>
      </Step>

      <Step icon={<CalendarCheck className="h-4 w-4" />} title="Quando?">
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

      <Step icon={<Clock className="h-4 w-4" />} title="A che ora?">
        {availability.isPending ? (
          <Spinner className="h-5 w-5 text-muted" />
        ) : availability.isError ? (
          <Notice>
            {availability.error instanceof ApiError
              ? availability.error.message
              : "Impossibile caricare gli orari. Riprova tra poco."}
          </Notice>
        ) : (
          <TimePicker availability={availability.data!} selected={time} onSelect={setTime} />
        )}
      </Step>

      {error && <p className="rounded-xl bg-red-50 px-3 py-2.5 text-sm text-red-700">{error}</p>}

      <div className="grid gap-2 border-t border-line pt-5 @sm:grid-cols-2">
        <button type="button" disabled={!time || unchanged || busy} onClick={save} className={primaryButton}>
          {busy && <Spinner className="h-4 w-4" />}
          {time ? `Conferma: ${formatDateLong(date)}, ${time}` : "Scegli un orario"}
        </button>
        <button type="button" className={secondaryButton} onClick={onCancel}>
          Annulla
        </button>
      </div>
    </div>
  );
}
