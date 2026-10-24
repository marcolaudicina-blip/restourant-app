"use client";

import { ExternalLink, Star } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { api } from "@/lib/api";
import { brandStyle } from "@/lib/brand";
import { cn } from "@/lib/cn";
import type { ReviewView } from "@/lib/types";
import { Spinner } from "../ui/spinner";
import { Footer, LanguageSwitch, Logo } from "./booking-page";
import { useGuestText } from "./i18n";

/** Ratings from this one up are invited to review publicly (same as the API's HAPPY_RATING). */
const HAPPY = 4;

/**
 * "How was it?": the star clicked in the email is saved as soon as the page opens. Happy guests are
 * invited to write a public review (the restaurant's Google link); the others can tell the
 * restaurant privately what went wrong.
 */
export function ReviewPage({
  initial,
  token,
  vote,
}: {
  initial: ReviewView;
  token: string;
  vote: number | null;
}) {
  const [view, setView] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [sent, setSent] = useState(false);
  const { t, locale, longDate, errorMessage } = useGuestText();
  const { restaurant, booking } = view;

  async function save(body: { rating: number; feedback?: string | null }) {
    setSaving(true);
    setError(null);
    try {
      setView(await api<ReviewView>(`/public/reviews/${token}`, { method: "POST", body }));
      return true;
    } catch (e) {
      setError(errorMessage(e, t.saveError));
      return false;
    } finally {
      setSaving(false);
    }
  }

  // The star clicked in the email counts right away.
  const saved = useRef(false);
  useEffect(() => {
    if (saved.current || vote === null || vote === initial.rating) return;
    saved.current = true;
    void save({ rating: vote });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function sendFeedback(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const feedback = String(new FormData(event.currentTarget).get("feedback") ?? "").trim() || null;
    if (view.rating && (await save({ rating: view.rating, feedback }))) setSent(true);
  }

  const rating = view.rating;
  const happy = rating !== null && rating >= HAPPY;
  return (
    <div lang={locale} style={brandStyle(restaurant.brandColor)} className="@container min-h-dvh bg-canvas">
      <header className="bg-[var(--brand)] text-[var(--brand-contrast)]">
        <div className="mx-auto flex max-w-xl items-center gap-3 px-4 py-5">
          <Logo profile={{ name: restaurant.name, page: { logoId: restaurant.logoId } }} size="sm" />
          <p className="min-w-0 flex-1 truncate text-lg font-semibold">{restaurant.name}</p>
          <LanguageSwitch dark />
        </div>
      </header>

      <main className="mx-auto flex max-w-xl flex-col gap-4 px-4 py-6">
        <section className="flex flex-col items-center gap-5 rounded-2xl border border-line bg-surface p-6 text-center">
          <div>
            <h1 className="text-xl font-semibold">{t.howWasIt}</h1>
            <p className="mt-1 text-sm text-muted first-letter:uppercase">
              {t.yourVisit(longDate(booking.date))} · {t.people(booking.partySize)}
            </p>
          </div>
          <div className="flex gap-1.5" role="group" aria-label={t.howWasIt}>
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                disabled={saving}
                aria-label={t.outOfFive(n)}
                aria-pressed={rating === n}
                onClick={() => {
                  setSent(false);
                  void save({ rating: n });
                }}
                className="rounded-xl p-1.5 transition-transform hover:scale-110 disabled:opacity-60"
              >
                <Star
                  className={cn(
                    "h-10 w-10",
                    rating !== null && n <= rating ? "fill-[var(--brand)] text-[var(--brand)]" : "text-line",
                  )}
                />
              </button>
            ))}
          </div>
          {saving && <Spinner className="h-5 w-5 text-muted" />}
          {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          {rating === null && <p className="text-sm text-muted">{t.tapStars}</p>}

          {rating !== null && (
            <div className="flex w-full flex-col gap-4">
              <p className="text-lg font-semibold">{happy ? t.thanksRating : t.sorry}</p>
              {happy && view.publicReviewUrl && (
                <>
                  <p className="text-sm text-muted">{t.askPublicReview}</p>
                  <a
                    href={view.publicReviewUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex h-12 items-center justify-center gap-2 rounded-xl bg-[var(--brand)] px-5 text-base font-semibold text-[var(--brand-contrast)] hover:opacity-90"
                  >
                    <ExternalLink className="h-5 w-5" /> {t.leavePublicReview}
                  </a>
                </>
              )}
              {sent ? (
                <p
                  role="status"
                  className="rounded-xl bg-[var(--brand-soft)] px-4 py-3 text-sm font-medium text-[var(--brand-strong)]"
                >
                  {t.feedbackSent}
                </p>
              ) : (
                <form onSubmit={sendFeedback} className="flex flex-col gap-2 text-left">
                  <label htmlFor="feedback" className="text-sm font-medium">
                    {happy ? t.addComment : t.tellUs}
                  </label>
                  <textarea
                    id="feedback"
                    name="feedback"
                    maxLength={2000}
                    defaultValue={view.feedback ?? ""}
                    placeholder={t.feedbackPlaceholder}
                    className="min-h-24 w-full rounded-xl border border-line bg-surface px-3 py-2 text-base focus:border-[var(--brand)] focus:outline-none focus:ring-2 focus:ring-[var(--brand)]/20 @md:text-sm"
                  />
                  <button
                    type="submit"
                    disabled={saving}
                    className={cn(
                      "flex h-11 items-center justify-center rounded-xl px-5 text-sm font-semibold disabled:opacity-60",
                      happy && view.publicReviewUrl
                        ? "border border-line bg-surface hover:border-[var(--brand)]"
                        : "bg-[var(--brand)] text-[var(--brand-contrast)] hover:opacity-90",
                    )}
                  >
                    {t.sendFeedback}
                  </button>
                </form>
              )}
              <p className="text-xs text-muted">{t.changeRating}</p>
            </div>
          )}
        </section>
        <Footer />
      </main>
    </div>
  );
}
