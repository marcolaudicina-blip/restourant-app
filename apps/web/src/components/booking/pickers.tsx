"use client";

import { Phone } from "lucide-react";
import { useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import type { PublicAvailability, PublicDay } from "@/lib/types";
import { useGuestText } from "./i18n";

/** Pieces of the guest booking pages: steps, chips, day and time pickers, notices. */

/** Party sizes offered as buttons; bigger groups use the stepper. */
export const MAX_CHIPS = 10;

/** Brings a newly shown part of the flow into view, which matters on phones. Not in previews. */
export function useRevealOnMount<T extends HTMLElement>(enabled: boolean) {
  const ref = useRef<T>(null);
  useEffect(() => {
    if (enabled) ref.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [enabled]);
  return ref;
}

export function Step({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
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

export function Chip({
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

export function StepperButton({
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

export function DayPicker({
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
  const { t, longDate, weekdayShort, monthShort } = useGuestText();
  if (!days.some((d) => d.open)) return <Notice>{t.noDates}</Notice>;
  return (
    <div className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-2 [scrollbar-width:thin]">
      {days.map((d, i) => {
        const at = new Date(`${d.date}T12:00:00Z`);
        const label =
          d.date === today ? t.today : i === 1 && days[0]?.date === today ? t.tomorrow : weekdayShort(d.date);
        return (
          <button
            key={d.date}
            type="button"
            disabled={!d.open}
            aria-pressed={selected === d.date}
            aria-label={`${longDate(d.date)}${d.open ? "" : `, ${t.closed}`}`}
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
            <span className="text-[11px] leading-tight">{d.open ? monthShort(d.date) : t.closed}</span>
          </button>
        );
      })}
    </div>
  );
}

export function TimePicker({
  availability,
  selected,
  onSelect,
}: {
  availability: PublicAvailability;
  selected: string | null;
  onSelect: (time: string) => void;
}) {
  const { t, locale } = useGuestText();
  if (availability.mode === "closed") {
    const english = locale === "en" && availability.reason ? t.closedReasons[availability.reason] : null;
    return <Notice>{english ?? availability.message}</Notice>;
  }
  const services = availability.services.filter((s) => s.times.length > 0);
  if (services.length === 0) {
    return <Notice>{t.noTimes(t.people(availability.partySize))}</Notice>;
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

export function PhoneLink({ phone }: { phone: string }) {
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

export function Notice({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("rounded-xl bg-canvas px-3 py-2.5 text-sm text-muted", className)}>{children}</p>;
}
