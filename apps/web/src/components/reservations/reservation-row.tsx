"use client";

import { RESERVATION_TRANSITIONS, type ReservationStatus } from "@restourant/shared";
import { MessageSquareText, MoreHorizontal, NotebookPen, Phone, Users } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { api, describeError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { STATUS_ACTION_LABELS, STATUS_LABELS, statusColor } from "@/lib/labels";
import { useRestaurantMutation } from "@/lib/queries";
import type { Reservation } from "@/lib/types";
import { Button } from "../ui/button";
import { Badge } from "../ui/card";
import { useToast } from "../ui/toast";

/** The one-tap action shown on each row; everything else is in the menu. */
const NEXT_ACTION: Partial<Record<ReservationStatus, ReservationStatus>> = {
  requested: "confirmed",
  confirmed: "seated",
  arrived: "seated",
  seated: "completed",
};

export function useStatusMutation() {
  const toast = useToast();
  const mutation = useRestaurantMutation(
    (base, vars: { id: string; status: ReservationStatus }) =>
      api<Reservation>(`${base}/reservations/${vars.id}/status`, {
        method: "POST",
        body: { status: vars.status },
      }),
    ["reservations", "availability"],
  );
  return (id: string, status: ReservationStatus) =>
    mutation.mutate(
      { id, status },
      {
        onSuccess: (r) => toast.success(`${r.guestName}: ${STATUS_LABELS[status].toLowerCase()}`),
        onError: (e) => toast.error(describeError(e)),
      },
    );
}

export function ReservationRow({ reservation: r, onEdit }: { reservation: Reservation; onEdit: () => void }) {
  const setStatus = useStatusMutation();
  const next = NEXT_ACTION[r.status];
  const inactive = r.status === "cancelled" || r.status === "no_show" || r.status === "completed";

  return (
    <li
      className={cn(
        "flex items-center gap-3 border-b border-line px-4 py-3 last:border-b-0 sm:gap-4",
        inactive && "opacity-55",
      )}
    >
      <span className="h-10 w-1 shrink-0 rounded-full" style={{ backgroundColor: statusColor(r.status) }} />
      <button onClick={onEdit} className="flex min-w-0 flex-1 items-center gap-3 text-left sm:gap-4">
        <span className="w-12 shrink-0 text-lg font-semibold tabular-nums">{r.time}</span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate font-medium">{r.guestName}</span>
            {r.guestNote && (
              <MessageSquareText className="h-4 w-4 shrink-0 text-amber-600" aria-label="Note del cliente" />
            )}
            {r.internalNote && (
              <NotebookPen className="h-4 w-4 shrink-0 text-muted" aria-label="Note interne" />
            )}
          </span>
          <span className="flex flex-wrap items-center gap-x-3 text-sm text-muted">
            <span className="flex items-center gap-1">
              <Users className="h-3.5 w-3.5" /> {r.partySize}
            </span>
            <span>
              {r.tables.length ? `Tavolo ${r.tables.map((t) => t.name).join("+")}` : "Senza tavolo"}
            </span>
            {r.guestPhone && (
              <span className="hidden items-center gap-1 sm:flex">
                <Phone className="h-3.5 w-3.5" /> {r.guestPhone}
              </span>
            )}
          </span>
        </span>
      </button>
      <Badge color={statusColor(r.status)} className="hidden sm:inline-flex">
        {STATUS_LABELS[r.status]}
      </Badge>
      {next && (
        <Button
          size="sm"
          variant="secondary"
          onClick={() => setStatus(r.id, next)}
          className="hidden sm:inline-flex"
        >
          {STATUS_ACTION_LABELS[next]}
        </Button>
      )}
      <StatusMenu reservation={r} onEdit={onEdit} onStatus={(s) => setStatus(r.id, s)} />
    </li>
  );
}

function StatusMenu({
  reservation,
  onEdit,
  onStatus,
}: {
  reservation: Reservation;
  onEdit: () => void;
  onStatus: (status: ReservationStatus) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setOpen((v) => !v)}
        aria-label="Azioni"
        aria-expanded={open}
      >
        <MoreHorizontal className="h-5 w-5" />
      </Button>
      {open && (
        <div className="absolute right-0 top-11 z-20 w-52 overflow-hidden rounded-xl border border-line bg-surface py-1 shadow-lg">
          <MenuItem
            onClick={() => {
              setOpen(false);
              onEdit();
            }}
          >
            Modifica
          </MenuItem>
          {RESERVATION_TRANSITIONS[reservation.status].map((status) => (
            <MenuItem
              key={status}
              onClick={() => {
                setOpen(false);
                onStatus(status);
              }}
            >
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: statusColor(status) }} />
              {STATUS_ACTION_LABELS[status]}
            </MenuItem>
          ))}
        </div>
      )}
    </div>
  );
}

function MenuItem({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-canvas"
    >
      {children}
    </button>
  );
}
