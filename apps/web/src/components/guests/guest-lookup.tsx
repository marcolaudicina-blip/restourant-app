"use client";

import { normalizePhone } from "@restourant/shared";
import { Star, UserRound, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useGuests } from "@/lib/queries";
import type { Guest, GuestSummary } from "@/lib/types";
import { Badge } from "../ui/card";
import { Field, Input } from "../ui/field";

export type GuestContact = { name: string; phone: string; email: string };
export type LinkedGuest = Pick<
  GuestSummary,
  "id" | "fullName" | "tags" | "profileNote" | "visits" | "noShows"
>;

function useDebounced<T>(value: T, delay = 250): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export const toLinked = (g: Guest): LinkedGuest => ({
  id: g.id,
  fullName: g.fullName,
  tags: g.tags,
  profileNote: g.profileNote,
  visits: g.stats.visits,
  noShows: g.stats.noShows,
});

/**
 * Name / phone / email of a booking with guest recognition: typing a name or a few digits of the
 * phone suggests existing guests; picking one fills the contacts and shows their profile.
 */
export function GuestLookup({
  contact,
  onContactChange,
  linked,
  onLink,
  defaultName,
}: {
  contact: GuestContact;
  onContactChange: (contact: GuestContact) => void;
  linked: LinkedGuest | null;
  onLink: (guest: LinkedGuest | null) => void;
  defaultName?: string;
}) {
  const [focused, setFocused] = useState<"name" | "phone" | null>(null);
  const digits = contact.phone.replace(/\D/g, "");
  const term =
    focused === "phone"
      ? digits.length >= 4
        ? digits
        : ""
      : contact.name.trim().length >= 2
        ? contact.name.trim()
        : "";
  const query = useDebounced(term);
  const suggestions = useGuests(query, query.length > 0 && !linked);
  const matches = (suggestions.data ?? []).slice(0, 5);
  const showSuggestions = focused !== null && !linked && query.length > 0 && matches.length > 0;

  function pick(guest: Guest) {
    onContactChange({
      name: guest.fullName,
      phone: guest.phone ?? contact.phone,
      email: guest.email ?? contact.email,
    });
    onLink(toLinked(guest));
    setFocused(null);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="relative flex flex-col gap-4">
        <Field label="Nome">
          {(id) => (
            <Input
              id={id}
              required
              value={contact.name}
              placeholder={defaultName}
              autoComplete="off"
              onFocus={() => setFocused("name")}
              onBlur={() => setTimeout(() => setFocused(null), 150)}
              onChange={(e) => onContactChange({ ...contact, name: e.target.value })}
            />
          )}
        </Field>
        <Field label="Telefono" hint={linked ? undefined : "Il cliente viene riconosciuto dal numero"}>
          {(id) => (
            <Input
              id={id}
              type="tel"
              value={contact.phone}
              autoComplete="off"
              onFocus={() => setFocused("phone")}
              onBlur={() => setTimeout(() => setFocused(null), 150)}
              onChange={(e) => {
                const phone = e.target.value;
                // A different number belongs to a different guest.
                if (linked && normalizePhone(phone) !== normalizePhone(contact.phone)) onLink(null);
                onContactChange({ ...contact, phone });
              }}
            />
          )}
        </Field>
        {showSuggestions && (
          <ul
            role="listbox"
            aria-label="Clienti trovati"
            className="absolute inset-x-0 top-full z-20 -mt-2 overflow-hidden rounded-xl border border-line bg-surface shadow-lg"
          >
            {matches.map((g) => (
              <li key={g.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={false}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(g)}
                  className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-canvas"
                >
                  <UserRound className="h-4 w-4 shrink-0 text-muted" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{g.fullName}</span>
                    <span className="block truncate text-xs text-muted">
                      {[g.phone, g.email].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  <span className="text-xs text-muted">{g.stats.visits} visite</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {linked && <LinkedGuestCard guest={linked} onUnlink={() => onLink(null)} />}

      <Field label="Email">
        {(id) => (
          <Input
            id={id}
            type="email"
            value={contact.email}
            autoComplete="off"
            onChange={(e) => onContactChange({ ...contact, email: e.target.value })}
          />
        )}
      </Field>
    </div>
  );
}

export function LinkedGuestCard({ guest, onUnlink }: { guest: LinkedGuest; onUnlink?: () => void }) {
  return (
    <div className="rounded-xl border border-brand-200 bg-brand-50/60 px-3 py-2.5 text-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <a
            href={`/clienti/${guest.id}`}
            target="_blank"
            rel="noreferrer"
            className="font-medium hover:underline"
          >
            {guest.fullName}
          </a>
          <p className="text-xs text-muted">
            {guest.visits === 0
              ? "Primo contatto"
              : `${guest.visits} ${guest.visits === 1 ? "visita" : "visite"}`}
            {guest.noShows > 0 && <span className="text-red-600"> · {guest.noShows} no-show</span>}
          </p>
        </div>
        {onUnlink && (
          <button
            type="button"
            onClick={onUnlink}
            className="rounded p-1 text-muted hover:bg-black/5"
            aria-label="Scollega cliente"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      {guest.tags.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {guest.tags.map((tag) => (
            <GuestTag key={tag} tag={tag} />
          ))}
        </div>
      )}
      {guest.profileNote && (
        <p className="mt-1.5 rounded-lg bg-amber-50 px-2 py-1 text-amber-900">{guest.profileNote}</p>
      )}
    </div>
  );
}

export function GuestTag({ tag }: { tag: string }) {
  const vip = tag.toLowerCase() === "vip";
  return (
    <Badge className={vip ? "bg-amber-100 text-amber-800" : "bg-brand-100 text-brand-700"}>
      {vip && <Star className="h-3 w-3" />}
      {tag}
    </Badge>
  );
}
