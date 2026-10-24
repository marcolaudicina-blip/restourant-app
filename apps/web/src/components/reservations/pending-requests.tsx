"use client";

import { Check, Globe, X } from "lucide-react";
import Link from "next/link";
import { formatDateShort } from "@/lib/labels";
import { usePendingRequests } from "../activity";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { useStatusMutation } from "./reservation-row";

/** Requests from the booking page (manual confirmation, large groups) waiting for an answer. */
export function PendingRequests() {
  const pending = usePendingRequests();
  const setStatus = useStatusMutation();
  if (pending.length === 0) return null;
  return (
    <Card className="mb-4 border-violet-200">
      <div className="flex items-center gap-2 border-b border-line px-4 py-3">
        <Globe className="h-4 w-4 text-violet-700" />
        <h2 className="font-semibold">Da confermare</h2>
        <span className="rounded-full bg-violet-100 px-2 text-xs font-semibold text-violet-700">
          {pending.length}
        </span>
        <p className="ml-auto hidden text-xs text-muted sm:block">
          Il cliente riceve un&apos;email quando confermi
        </p>
      </div>
      <ul className="divide-y divide-line">
        {pending.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5">
            <Link href={`/prenotazioni?data=${r.date}`} className="min-w-0 flex-1 hover:underline">
              <span className="font-medium">{r.guestName}</span>{" "}
              <span className="text-sm text-muted">
                · {r.partySize} pers. · {formatDateShort(r.date)} ore {r.time}
              </span>
            </Link>
            <Button size="sm" onClick={() => setStatus(r.id, "confirmed")}>
              <Check className="h-4 w-4" /> Conferma
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                if (
                  window.confirm(
                    `Rifiutare la richiesta di ${r.guestName}? La prenotazione viene cancellata.`,
                  )
                )
                  setStatus(r.id, "cancelled");
              }}
            >
              <X className="h-4 w-4" /> Rifiuta
            </Button>
          </li>
        ))}
      </ul>
    </Card>
  );
}
