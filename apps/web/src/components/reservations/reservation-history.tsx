"use client";

import { useQuery } from "@tanstack/react-query";
import { Bot, ChevronDown, History, User, UserRound } from "lucide-react";
import { useState } from "react";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { useRestaurant } from "@/lib/restaurant";
import type { ReservationHistoryEntry } from "@/lib/types";
import { Spinner } from "../ui/spinner";

const ACTOR_ICON = { staff: User, guest: UserRound, system: Bot };

/** Who did what to a booking (GET /reservations/:id/history), folded until staff open it. */
export function ReservationHistory({ id }: { id: string }) {
  const { restaurantId, base, timezone } = useRestaurant();
  const [open, setOpen] = useState(false);
  const history = useQuery({
    // Under "reservations": refreshed whenever the booking changes.
    queryKey: ["reservations", restaurantId, "history", id],
    queryFn: () => api<ReservationHistoryEntry[]>(`${base}/reservations/${id}/history`),
    enabled: open,
  });
  const when = new Intl.DateTimeFormat("it-IT", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: timezone,
  });

  return (
    <section className="rounded-xl border border-line md:col-span-2">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-semibold"
      >
        <History className="h-4 w-4 text-muted" /> Storico delle modifiche
        <ChevronDown
          className={cn("ml-auto h-4 w-4 text-muted transition-transform", open && "rotate-180")}
        />
      </button>
      {open && (
        <div className="border-t border-line px-4 py-3">
          {history.isPending ? (
            <Spinner className="h-4 w-4 text-muted" />
          ) : history.isError ? (
            <p className="text-sm text-red-700">Impossibile caricare lo storico.</p>
          ) : (
            <ol className="flex flex-col gap-3">
              {history.data.map((entry, i) => {
                const Icon = ACTOR_ICON[entry.actor.kind];
                return (
                  <li key={i} className="flex gap-3 text-sm">
                    <span className="mt-0.5 h-fit shrink-0 self-start rounded-full bg-canvas p-1.5 text-muted">
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p>
                        <span className="font-medium">{entry.title}</span>
                        <span className="text-muted">
                          {" "}
                          · {entry.actor.name} · {when.format(new Date(entry.at))}
                        </span>
                      </p>
                      {entry.lines.map((line) => (
                        <p key={line} className="text-muted">
                          {line}
                        </p>
                      ))}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      )}
    </section>
  );
}
