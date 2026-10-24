"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, MessageSquare, Star } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Card, EmptyState, PageHeader } from "@/components/ui/card";
import { PageLoader } from "@/components/ui/spinner";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { formatDateShort } from "@/lib/labels";
import { useConfig } from "@/lib/queries";
import { useRestaurant } from "@/lib/restaurant";
import type { ReviewSummary } from "@/lib/types";

/** What guests answered to the "how was it?" email the day after (Configurazione → Regole). */
export default function ReviewsPage() {
  const { restaurantId, base } = useRestaurant();
  const config = useConfig();
  const [filter, setFilter] = useState<"all" | "low" | "comments">("all");
  const reviews = useQuery({
    queryKey: ["reservations", restaurantId, "reviews"],
    queryFn: () => api<ReviewSummary>(`${base}/reviews`),
  });
  const enabled = config.data?.bookingPolicy.reviewRequests;

  const data = reviews.data;
  const list = (data?.reviews ?? []).filter((r) =>
    filter === "low" ? r.rating <= 3 : filter === "comments" ? Boolean(r.feedback) : true,
  );
  return (
    <>
      <Link href="/clienti" className="mb-2 inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> Clienti
      </Link>
      <PageHeader
        title="Recensioni"
        description="Il giorno dopo la cena chiediamo ai clienti com'è andata: chi è contento viene invitato a scrivere una recensione pubblica, gli altri scrivono solo a voi."
      />
      {enabled === false && (
        <Card className="mb-4 border-amber-200 px-4 py-3 text-sm">
          La richiesta di giudizio è spenta. Attivala in{" "}
          <Link href="/configurazione/regole" className="font-medium text-brand-700 hover:underline">
            Configurazione → Regole
          </Link>{" "}
          e aggiungi il link delle recensioni Google.
        </Card>
      )}
      {reviews.isPending || !data ? (
        <PageLoader />
      ) : (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-3">
            <Card className="px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted">Media</p>
              <p className="mt-1 flex items-center gap-1.5 text-2xl font-semibold tabular-nums">
                {data.average === null ? "–" : data.average.toFixed(1).replace(".", ",")}
                <Star className="h-5 w-5 fill-amber-400 text-amber-400" />
              </p>
              <p className="text-xs text-muted">
                {data.count} {data.count === 1 ? "giudizio" : "giudizi"}
                {data.requested > 0 && ` · risponde il ${Math.round((data.count / data.requested) * 100)}%`}
              </p>
            </Card>
            <Card className="px-4 py-3 sm:col-span-2">
              <ul className="flex flex-col gap-1">
                {[5, 4, 3, 2, 1].map((n) => {
                  const count = data.byRating[n - 1] ?? 0;
                  return (
                    <li key={n} className="flex items-center gap-2 text-xs">
                      <span className="w-6 tabular-nums text-muted">{n} ★</span>
                      <span className="h-2 flex-1 overflow-hidden rounded-full bg-canvas">
                        <span
                          className={cn(
                            "block h-full rounded-full",
                            n >= 4 ? "bg-brand-500" : "bg-amber-400",
                          )}
                          style={{ width: `${data.count ? (count / data.count) * 100 : 0}%` }}
                        />
                      </span>
                      <span className="w-8 text-right tabular-nums">{count}</span>
                    </li>
                  );
                })}
              </ul>
            </Card>
          </div>

          <div className="mb-3 flex rounded-lg border border-line bg-surface p-0.5 text-sm sm:w-fit">
            {(
              [
                ["all", "Tutte"],
                ["low", "Da 1 a 3 stelle"],
                ["comments", "Con commento"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={filter === value}
                onClick={() => setFilter(value)}
                className={cn(
                  "flex-1 whitespace-nowrap rounded-md px-3 py-1.5 font-medium",
                  filter === value ? "bg-brand-600 text-white" : "text-muted hover:text-ink",
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {list.length === 0 ? (
            <Card>
              <EmptyState icon={<MessageSquare className="h-8 w-8" />} title="Ancora nessun giudizio">
                Compariranno qui man mano che i clienti rispondono all&apos;email.
              </EmptyState>
            </Card>
          ) : (
            <Card>
              <ul className="divide-y divide-line">
                {list.map((r) => (
                  <li key={r.reservationId} className="flex flex-col gap-1 px-4 py-3">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span
                        className={cn(
                          "text-base tracking-tight",
                          r.rating >= 4 ? "text-brand-600" : "text-amber-500",
                        )}
                        aria-label={`${r.rating} su 5`}
                      >
                        {"★".repeat(r.rating)}
                        <span className="text-line">{"★".repeat(5 - r.rating)}</span>
                      </span>
                      {r.guestId ? (
                        <Link href={`/clienti/${r.guestId}`} className="font-medium hover:underline">
                          {r.guestName}
                        </Link>
                      ) : (
                        <span className="font-medium">{r.guestName}</span>
                      )}
                      <span className="text-sm text-muted">
                        · {r.partySize} pers. · cena del {formatDateShort(r.date)}
                      </span>
                    </div>
                    {r.feedback && <p className="whitespace-pre-line text-sm">{r.feedback}</p>}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </>
      )}
    </>
  );
}
