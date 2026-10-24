"use client";

import { useId, useState, type FormEvent, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import type { PublicProfile } from "@/lib/types";
import { Spinner } from "../ui/spinner";
import { useGuestText } from "./i18n";
import { useRevealOnMount } from "./pickers";

export type Details = {
  guestName: string;
  guestPhone: string | null;
  guestEmail: string | null;
  guestNote: string | null;
  privacyAccepted: boolean;
  website: string;
};

export function DetailsForm({
  profile,
  summary,
  request,
  preview,
  submitLabel,
  onSubmit,
}: {
  profile: PublicProfile;
  summary: string;
  request: boolean;
  preview: boolean;
  submitLabel?: string;
  onSubmit: (details: Details) => Promise<string | null>;
}) {
  const { booking } = profile;
  const { t, locale } = useGuestText();
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
      <h3 className="text-sm font-semibold">{t.yourDetails}</h3>
      <PublicField label={t.fullName}>
        {(id) => <input id={id} name="name" required autoComplete="name" maxLength={120} className={input} />}
      </PublicField>
      <div className="grid gap-4 @md:grid-cols-2">
        <PublicField label={booking.requirePhone ? t.phone : t.phoneOptional}>
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
        <PublicField label={booking.requireEmail ? t.email : t.emailOptional}>
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
      <PublicField label={t.requests}>
        {(id) => (
          <textarea
            id={id}
            name="note"
            maxLength={1000}
            placeholder={t.requestsPlaceholder}
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
          {t.consent[0]}
          <a
            href={profile.page.privacyUrl ?? `/prenota/${profile.slug}/privacy?lang=${locale}`}
            target="_blank"
            rel="noreferrer"
            className="font-medium text-[var(--brand-strong)] underline underline-offset-2"
          >
            {t.consent[1]}
          </a>
          {t.consent[2](profile.name)}
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
        {preview ? t.previewDisabled : (submitLabel ?? (request ? t.sendRequest : t.confirmBooking))}
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
