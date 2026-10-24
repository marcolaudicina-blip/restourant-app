"use client";

import { localToInstant, timeToMinutes } from "@restourant/shared";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarCheck, CalendarPlus, Check, Clock, Minus, Phone, Plus, Users } from "lucide-react";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type FormEvent,
  type ReactNode,
} from "react";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { formatDateLong } from "@/lib/labels";
import type { PublicAvailability, PublicBooking, PublicDay, PublicProfile } from "@/lib/types";
import { Spinner } from "../ui/spinner";

/** Party sizes offered as buttons; bigger groups use the stepper. */
const MAX_CHIPS = 10;

const people = (n: number) => `${n} ${n === 1 ? "persona" : "persone"}`;

/**
 * The booking widget of the public page: how many, which day, what time, who. Defaults to two
 * people on the first open day, so most guests only pick a time and fill in their details.
 */
export function BookingFlow({ profile, preview = false }: { profile: PublicProfile; preview?: boolean }) {
  const { booking, slug } = profile;
  const base = `/public/restaurants/${slug}`;
  const queryClient = useQueryClient();

  const chipMax = Math.min(booking.maxParty, MAX_CHIPS);
  const [party, setParty] = useState(Math.min(Math.max(2, booking.minParty), booking.maxParty));
  const [date, setDate] = useState<string | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const [done, setDone] = useState<PublicBooking | null>(null);

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
  }

  if (!booking.enabled) {
    return (
      <Notice>
        Le prenotazioni online non sono attive.
        {profile.phone && (
          <>
            {" "}
            Chiama il ristorante al <PhoneLink phone={profile.phone} />.
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

  const request = availability.data?.mode === "request";

  return (
    <div className="flex flex-col gap-6">
      <Step icon={<Users className="h-4 w-4" />} title="Quante persone?">
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
            {chipMax < booking.maxParty ? `Più di ${chipMax}` : `${booking.maxParty + 1}+`}
          </Chip>
        </div>
        {party > chipMax && (
          <div className="mt-3 flex items-center gap-3">
            <StepperButton
              label="Una persona in meno"
              disabled={party <= chipMax + 1}
              onClick={() => choose({ party: party - 1 })}
            >
              <Minus className="h-4 w-4" />
            </StepperButton>
            <span className="min-w-24 text-center text-lg font-semibold tabular-nums">{people(party)}</span>
            <StepperButton
              label="Una persona in più"
              disabled={party >= 60}
              onClick={() => choose({ party: party + 1 })}
            >
              <Plus className="h-4 w-4" />
            </StepperButton>
          </div>
        )}
        {phoneOnly && (
          <Notice className="mt-3">
            Per gruppi di più di {booking.maxParty} persone contatta direttamente il ristorante
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
        <Step icon={<CalendarCheck className="h-4 w-4" />} title="Quando?">
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
        <Step icon={<Clock className="h-4 w-4" />} title="A che ora?">
          {availability.isPending ? (
            <Spinner className="h-5 w-5 text-muted" />
          ) : availability.isError ? (
            <Notice>Impossibile caricare gli orari. Riprova tra poco.</Notice>
          ) : (
            <TimePicker availability={availability.data!} selected={time} onSelect={setTime} />
          )}
          {request && (
            <p className="mt-3 rounded-lg bg-[var(--brand-soft)] px-3 py-2 text-sm text-[var(--brand-strong)]">
              Per i gruppi di più di {booking.maxParty} persone invii una richiesta: il ristorante ti
              ricontatta per confermare.
            </p>
          )}
        </Step>
      )}

      {!phoneOnly && day && time && (
        <DetailsForm
          profile={profile}
          summary={`${people(party)} · ${formatDateLong(day)} · ${time}`}
          request={request}
          preview={preview}
          onSubmit={async (details) => {
            try {
              const created = await api<PublicBooking>(`${base}/reservations`, {
                method: "POST",
                body: { date: day, time, partySize: party, ...details },
              });
              setDone(created);
              return null;
            } catch (error) {
              if (error instanceof ApiError && error.status === 409) {
                setTime(null);
                await queryClient.invalidateQueries({ queryKey: ["public", slug, "availability"] });
              }
              return error instanceof ApiError
                ? error.message
                : "Impossibile inviare la prenotazione. Riprova tra poco.";
            }
          }}
        />
      )}
    </div>
  );
}

/** Brings a newly shown part of the flow into view, which matters on phones. Not in previews. */
function useRevealOnMount<T extends HTMLElement>(enabled: boolean) {
  const ref = useRef<T>(null);
  useEffect(() => {
    if (enabled) ref.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [enabled]);
  return ref;
}

function Step({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <span className="text-[var(--brand-strong)]">{icon}</span>
        {title}
      </h3>
      {children}
    </section>
  );
}

function Chip({
  selected,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { selected: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cn(
        "flex h-11 items-center justify-center rounded-xl border text-sm font-medium transition-colors",
        "disabled:cursor-not-allowed disabled:opacity-40",
        selected
          ? "border-[var(--brand)] bg-[var(--brand)] text-[var(--brand-contrast)]"
          : "border-line bg-surface hover:border-[var(--brand)]",
        className,
      )}
      {...props}
    />
  );
}

function StepperButton({
  label,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      className="flex h-10 w-10 items-center justify-center rounded-full border border-line bg-surface hover:border-[var(--brand)] disabled:opacity-40"
      {...props}
    >
      {children}
    </button>
  );
}

const weekday = new Intl.DateTimeFormat("it-IT", { weekday: "short", timeZone: "UTC" });
const month = new Intl.DateTimeFormat("it-IT", { month: "short", timeZone: "UTC" });

function DayPicker({
  days,
  selected,
  today,
  onSelect,
}: {
  days: PublicDay[];
  selected: string | null;
  today: string;
  onSelect: (date: string) => void;
}) {
  if (!days.some((d) => d.open)) return <Notice>Nessuna data disponibile al momento.</Notice>;
  return (
    <div className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-2 [scrollbar-width:thin]">
      {days.map((d, i) => {
        const at = new Date(`${d.date}T12:00:00Z`);
        const label =
          d.date === today ? "Oggi" : i === 1 && days[0]?.date === today ? "Domani" : weekday.format(at);
        return (
          <button
            key={d.date}
            type="button"
            disabled={!d.open}
            aria-pressed={selected === d.date}
            aria-label={`${formatDateLong(d.date)}${d.open ? "" : ", chiuso"}`}
            onClick={() => onSelect(d.date)}
            className={cn(
              "flex w-16 shrink-0 snap-start flex-col items-center rounded-xl border py-2 transition-colors",
              selected === d.date
                ? "border-[var(--brand)] bg-[var(--brand)] text-[var(--brand-contrast)]"
                : "border-line bg-surface hover:border-[var(--brand)]",
              !d.open && "cursor-not-allowed opacity-40 hover:border-line",
            )}
          >
            <span className="text-[11px] font-medium capitalize leading-tight">{label}</span>
            <span className="text-xl font-semibold leading-tight tabular-nums">{at.getUTCDate()}</span>
            <span className="text-[11px] leading-tight">{d.open ? month.format(at) : "chiuso"}</span>
          </button>
        );
      })}
    </div>
  );
}

function TimePicker({
  availability,
  selected,
  onSelect,
}: {
  availability: PublicAvailability;
  selected: string | null;
  onSelect: (time: string) => void;
}) {
  if (availability.mode === "closed") return <Notice>{availability.message}</Notice>;
  const services = availability.services.filter((s) => s.times.length > 0);
  if (services.length === 0) {
    return (
      <Notice>
        Nessun orario libero per {people(availability.partySize)} in questo giorno. Prova un'altra data.
      </Notice>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      {services.map((s) => (
        <div key={s.serviceId}>
          {services.length > 1 && (
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">{s.name}</p>
          )}
          <div className="grid grid-cols-4 gap-2 @md:grid-cols-5">
            {s.times.map((t) => (
              <Chip key={t} selected={selected === t} onClick={() => onSelect(t)} className="tabular-nums">
                {t}
              </Chip>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

type Details = {
  guestName: string;
  guestPhone: string | null;
  guestEmail: string | null;
  guestNote: string | null;
  privacyAccepted: boolean;
  website: string;
};

function DetailsForm({
  profile,
  summary,
  request,
  preview,
  onSubmit,
}: {
  profile: PublicProfile;
  summary: string;
  request: boolean;
  preview: boolean;
  onSubmit: (details: Details) => Promise<string | null>;
}) {
  const { booking } = profile;
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const ref = useRevealOnMount<HTMLFormElement>(!preview);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (preview) return;
    const data = new FormData(event.currentTarget);
    const text = (name: string) => String(data.get(name) ?? "").trim() || null;
    setSending(true);
    setError(
      await onSubmit({
        guestName: text("name") ?? "",
        guestPhone: text("phone"),
        guestEmail: text("email"),
        guestNote: text("note"),
        privacyAccepted: data.get("privacy") === "on",
        website: String(data.get("website") ?? ""),
      }),
    );
    setSending(false);
  }

  const input =
    "h-11 w-full rounded-xl border border-line bg-surface px-3 text-base text-ink placeholder:text-muted/70 focus:border-[var(--brand)] focus:outline-none focus:ring-2 focus:ring-[var(--brand)]/20 @md:text-sm";

  return (
    <form ref={ref} onSubmit={submit} className="flex scroll-mt-4 flex-col gap-4 border-t border-line pt-6">
      <h3 className="text-sm font-semibold">I tuoi dati</h3>
      <PublicField label="Nome e cognome">
        {(id) => <input id={id} name="name" required autoComplete="name" maxLength={120} className={input} />}
      </PublicField>
      <div className="grid gap-4 @md:grid-cols-2">
        <PublicField label={booking.requirePhone ? "Telefono" : "Telefono (facoltativo)"}>
          {(id) => (
            <input
              id={id}
              name="phone"
              type="tel"
              required={booking.requirePhone}
              autoComplete="tel"
              maxLength={40}
              className={input}
            />
          )}
        </PublicField>
        <PublicField label={booking.requireEmail ? "Email" : "Email (facoltativa)"}>
          {(id) => (
            <input
              id={id}
              name="email"
              type="email"
              required={booking.requireEmail}
              autoComplete="email"
              className={input}
            />
          )}
        </PublicField>
      </div>
      <PublicField label="Richieste (facoltativo)">
        {(id) => (
          <textarea
            id={id}
            name="note"
            maxLength={1000}
            placeholder="Allergie, intolleranze, occasioni speciali…"
            className={cn(input, "h-auto min-h-20 py-2")}
          />
        )}
      </PublicField>
      {/* Hidden from people; bots fill it in. */}
      <input
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden
        className="absolute -left-[9999px] h-0 w-0 opacity-0"
      />
      {booking.policyText && (
        <p className="whitespace-pre-line rounded-xl bg-canvas px-3 py-2 text-xs text-muted">
          {booking.policyText}
        </p>
      )}
      <label className="flex items-start gap-2.5 text-sm">
        <input type="checkbox" name="privacy" required className="mt-0.5 h-4 w-4 accent-[var(--brand)]" />
        <span>
          Acconsento al trattamento dei miei dati da parte di {profile.name} per gestire la prenotazione.
        </span>
      </label>
      {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <div className="rounded-xl bg-[var(--brand-soft)] px-3 py-2 text-sm font-medium first-letter:uppercase text-[var(--brand-strong)]">
        {summary}
      </div>
      <button
        type="submit"
        disabled={sending || preview}
        className="flex h-12 items-center justify-center gap-2 rounded-xl bg-[var(--brand)] text-base font-semibold text-[var(--brand-contrast)] transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        {sending && <Spinner className="h-4 w-4" />}
        {preview ? "Anteprima: invio disattivato" : request ? "Invia richiesta" : "Conferma prenotazione"}
      </button>
    </form>
  );
}

function PublicField({ label, children }: { label: string; children: (id: string) => ReactNode }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {children(id)}
    </div>
  );
}

/** An .ics file the guest can add to their calendar. */
function calendarFile(booking: PublicBooking, profile: PublicProfile): string {
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
    "PRODID:-//Restourant//Prenotazioni//IT",
    "BEGIN:VEVENT",
    `UID:${booking.id}@restourant`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${escape(`${profile.name} · ${people(booking.partySize)}`)}`,
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
  const confirmed = booking.status === "confirmed";
  const note = profile.page.confirmationNote?.trim();
  const ref = useRevealOnMount<HTMLDivElement>(!preview);
  const ics = `data:text/calendar;charset=utf-8,${encodeURIComponent(calendarFile(booking, profile))}`;
  return (
    <div ref={ref} className="flex scroll-mt-4 flex-col items-center gap-4 py-4 text-center" role="status">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--brand)] text-[var(--brand-contrast)]">
        <Check className="h-7 w-7" />
      </span>
      <div>
        <h3 className="text-xl font-semibold">
          {confirmed ? "Prenotazione confermata" : "Richiesta inviata"}
        </h3>
        <p className="mt-1 text-sm text-muted">
          {confirmed
            ? `Ti aspettiamo, ${booking.guestName}!`
            : "Il ristorante la controllerà e ti contatterà per confermarla."}
        </p>
      </div>
      <dl className="w-full divide-y divide-line rounded-xl border border-line text-left text-sm">
        {[
          ["Giorno", formatDateLong(booking.date)],
          ["Ora", booking.time],
          ["Persone", people(booking.partySize)],
        ].map(([label, value]) => (
          <div key={label} className="flex justify-between gap-4 px-4 py-2.5">
            <dt className="text-muted">{label}</dt>
            <dd className="font-medium first-letter:uppercase">{value}</dd>
          </div>
        ))}
      </dl>
      {note && (
        <div className="w-full rounded-xl border-l-4 border-[var(--brand)] bg-[var(--brand-soft)] px-4 py-3 text-left">
          <p className="text-xs font-semibold text-[var(--brand-strong)]">Informazioni dal ristorante</p>
          <p className="mt-1 whitespace-pre-line text-sm leading-relaxed">{note}</p>
        </div>
      )}
      {booking.emailSent && booking.guestEmail && (
        <p className="text-xs text-muted">
          Ti abbiamo inviato il riepilogo a <span className="font-medium text-ink">{booking.guestEmail}</span>
        </p>
      )}
      <div className="flex w-full flex-col gap-2">
        {confirmed && (
          <a
            href={ics}
            download="prenotazione.ics"
            className="flex h-11 items-center justify-center gap-2 rounded-xl border border-line bg-surface text-sm font-medium hover:border-[var(--brand)]"
          >
            <CalendarPlus className="h-4 w-4" /> Aggiungi al calendario
          </a>
        )}
        {profile.phone && (
          <p className="text-xs text-muted">
            Per modifiche o disdette chiama il ristorante:
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
            Fai un'altra prenotazione
          </button>
        )}
      </div>
    </div>
  );
}

function PhoneLink({ phone }: { phone: string }) {
  return (
    <a
      href={`tel:${phone.replace(/\s/g, "")}`}
      className="inline-flex items-center gap-1 whitespace-nowrap font-medium text-[var(--brand-strong)] underline-offset-2 hover:underline"
    >
      <Phone className="h-3.5 w-3.5" />
      {phone}
    </a>
  );
}

function Notice({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("rounded-xl bg-canvas px-3 py-2.5 text-sm text-muted", className)}>{children}</p>;
}
