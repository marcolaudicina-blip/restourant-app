"use client";

import { SUGGESTED_GUEST_TAGS } from "@restourant/shared";
import {
  ArrowLeft,
  CalendarPlus,
  Mail,
  MessageSquareText,
  Phone,
  Plus,
  Trash2,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { GuestTag, toLinked } from "@/components/guests/guest-lookup";
import { ChannelBadge } from "@/components/reservations/channel-badge";
import { ReservationDialog } from "@/components/reservations/reservation-dialog";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardHeader, EmptyState } from "@/components/ui/card";
import { Field, Input, Switch, Textarea } from "@/components/ui/field";
import { PageLoader } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { api, describeError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { formatDateShort, STATUS_LABELS, statusColor } from "@/lib/labels";
import { useGuest, useRestaurantMutation } from "@/lib/queries";
import { useRestaurant } from "@/lib/restaurant";
import type { GuestDetail, Reservation } from "@/lib/types";

export default function GuestPage() {
  const { id } = useParams<{ id: string }>();
  const guest = useGuest(id);
  if (guest.isPending) return <PageLoader />;
  if (!guest.data) {
    return (
      <Card>
        <EmptyState title="Cliente non trovato">
          <Link href="/clienti" className="text-brand-700 hover:underline">
            Torna ai clienti
          </Link>
        </EmptyState>
      </Card>
    );
  }
  return <GuestProfile key={guest.data.updatedAt} guest={guest.data} />;
}

function GuestProfile({ guest }: { guest: GuestDetail }) {
  const router = useRouter();
  const toast = useToast();
  const { can, today } = useRestaurant();
  const [booking, setBooking] = useState(false);
  const [editing, setEditing] = useState<Reservation | null>(null);

  const save = useRestaurantMutation(
    (base, body: Record<string, unknown>) => api(`${base}/guests/${guest.id}`, { method: "PATCH", body }),
    ["guests", "reservations"],
  );
  const remove = useRestaurantMutation(
    (base) => api(`${base}/guests/${guest.id}`, { method: "DELETE" }),
    ["guests", "reservations"],
  );
  const update = (body: Record<string, unknown>, message = "Scheda aggiornata") =>
    save.mutate(body, {
      onSuccess: () => toast.success(message),
      onError: (e) => toast.error(describeError(e)),
    });

  const upcoming = guest.reservations.filter(
    (r) => r.date >= today() && ["requested", "confirmed"].includes(r.status),
  );
  const past = guest.reservations.filter((r) => !upcoming.includes(r));

  return (
    <>
      <Link href="/clienti" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> Clienti
      </Link>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{guest.fullName}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
            {guest.phone && (
              <a href={`tel:${guest.phone}`} className="flex items-center gap-1 hover:text-ink">
                <Phone className="h-3.5 w-3.5" /> {guest.phone}
              </a>
            )}
            {guest.email && (
              <a href={`mailto:${guest.email}`} className="flex items-center gap-1 hover:text-ink">
                <Mail className="h-3.5 w-3.5" /> {guest.email}
              </a>
            )}
            <span>Cliente dal {formatDateShort(guest.createdAt.slice(0, 10))}</span>
          </div>
        </div>
        <Button onClick={() => setBooking(true)}>
          <CalendarPlus className="h-4 w-4" /> Nuova prenotazione
        </Button>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Stat label="Visite" value={guest.stats.visits} />
        <Stat label="Coperti" value={guest.stats.covers} />
        <Stat label="No-show" value={guest.stats.noShows} alert={guest.stats.noShows > 0} />
        <Stat label="Cancellazioni" value={guest.stats.cancellations} />
        <Stat
          label="Ultima visita"
          value={guest.stats.lastVisit ? formatDateShort(guest.stats.lastVisit) : "—"}
          small
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex flex-col gap-5">
          {upcoming.length > 0 && (
            <Card>
              <CardHeader title="Prossime prenotazioni" />
              <History reservations={upcoming} onOpen={setEditing} />
            </Card>
          )}
          <Card>
            <CardHeader
              title="Storico"
              description={`${past.length} ${past.length === 1 ? "prenotazione" : "prenotazioni"}`}
            />
            {past.length === 0 ? (
              <EmptyState title="Nessuna prenotazione passata" />
            ) : (
              <History reservations={past} onOpen={setEditing} />
            )}
          </Card>
        </div>

        <div className="flex flex-col gap-5">
          <NotesCard guest={guest} onSave={(profileNote) => update({ profileNote }, "Note salvate")} />
          <TagsCard guest={guest} onSave={(tags) => update({ tags })} />
          <ContactCard guest={guest} onSave={(body) => update(body)} />
          {can("guests.delete") && (
            <Button
              variant="ghost"
              className="self-start text-red-600 hover:bg-red-50"
              onClick={() => {
                if (
                  !confirm(
                    `Eliminare ${guest.fullName}? Le sue prenotazioni passate restano, ma senza dati personali.`,
                  )
                ) {
                  return;
                }
                remove.mutate(undefined, {
                  onSuccess: () => {
                    toast.success("Cliente eliminato e dati anonimizzati");
                    router.replace("/clienti");
                  },
                  onError: (e) => toast.error(describeError(e)),
                });
              }}
            >
              <Trash2 className="h-4 w-4" /> Elimina cliente (privacy)
            </Button>
          )}
        </div>
      </div>

      {booking && (
        <ReservationDialog
          open
          onClose={() => setBooking(false)}
          mode={{ kind: "create" }}
          date={today()}
          guest={{ linked: toLinked(guest), phone: guest.phone, email: guest.email }}
        />
      )}
      {editing && (
        <ReservationDialog
          open
          onClose={() => setEditing(null)}
          mode={{ kind: "edit", reservation: editing }}
          date={editing.date}
        />
      )}
    </>
  );
}

function Stat({
  label,
  value,
  alert = false,
  small = false,
}: {
  label: string;
  value: number | string;
  alert?: boolean;
  small?: boolean;
}) {
  return (
    <Card className="px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
      <p
        className={cn(
          "mt-1 font-semibold tabular-nums",
          small ? "text-base" : "text-2xl",
          alert && "text-red-600",
        )}
      >
        {value}
      </p>
    </Card>
  );
}

function History({
  reservations,
  onOpen,
}: {
  reservations: Reservation[];
  onOpen: (r: Reservation) => void;
}) {
  return (
    <ul>
      {reservations.map((r) => (
        <li key={r.id}>
          <button
            onClick={() => onOpen(r)}
            className="flex w-full items-center gap-3 border-b border-line px-5 py-3 text-left last:border-b-0 hover:bg-canvas"
          >
            <span className="w-28 shrink-0">
              <span className="block text-sm font-medium">{formatDateShort(r.date)}</span>
              <span className="text-xs text-muted">{r.time}</span>
            </span>
            <span className="min-w-0 flex-1 text-sm">
              <span className="flex items-center gap-2 text-muted">
                <Users className="h-3.5 w-3.5" /> {r.partySize}
                <span>
                  · {r.tables.length ? `Tavolo ${r.tables.map((t) => t.name).join("+")}` : "Senza tavolo"}
                </span>
              </span>
              {r.guestNote && (
                <span className="mt-0.5 flex items-center gap-1 truncate text-amber-700">
                  <MessageSquareText className="h-3.5 w-3.5 shrink-0" /> {r.guestNote}
                </span>
              )}
            </span>
            <ChannelBadge channel={r.channel} />
            <Badge color={statusColor(r.status)}>{STATUS_LABELS[r.status]}</Badge>
          </button>
        </li>
      ))}
    </ul>
  );
}

function NotesCard({ guest, onSave }: { guest: GuestDetail; onSave: (note: string | null) => void }) {
  const [note, setNote] = useState(guest.profileNote ?? "");
  const changed = note.trim() !== (guest.profileNote ?? "");
  return (
    <Card>
      <CardHeader
        title="Note permanenti"
        description="Allergie, preferenze, tavolo preferito: compaiono su ogni prenotazione."
      />
      <div className="flex flex-col gap-2 p-4">
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={4}
          aria-label="Note permanenti"
          placeholder="Es. celiaco, preferisce il dehors"
        />
        {changed && (
          <Button size="sm" className="self-end" onClick={() => onSave(note.trim() || null)}>
            Salva note
          </Button>
        )}
      </div>
    </Card>
  );
}

function TagsCard({ guest, onSave }: { guest: GuestDetail; onSave: (tags: string[]) => void }) {
  const [custom, setCustom] = useState("");
  const has = (tag: string) => guest.tags.some((t) => t.toLowerCase() === tag.toLowerCase());
  const add = (tag: string) => {
    const value = tag.trim();
    if (value && !has(value)) onSave([...guest.tags, value]);
  };
  return (
    <Card>
      <CardHeader title="Etichette" />
      <div className="flex flex-col gap-3 p-4">
        <div className="flex flex-wrap gap-1.5">
          {guest.tags.length === 0 && <span className="text-sm text-muted">Nessuna etichetta</span>}
          {guest.tags.map((tag) => (
            <button
              key={tag}
              onClick={() => onSave(guest.tags.filter((t) => t !== tag))}
              className="group"
              aria-label={`Rimuovi ${tag}`}
            >
              <GuestTag tag={tag} />
              <X className="-ml-1 inline h-3 w-3 text-muted opacity-0 group-hover:opacity-100" />
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {SUGGESTED_GUEST_TAGS.filter((t) => !has(t)).map((tag) => (
            <button
              key={tag}
              onClick={() => add(tag)}
              className="rounded-full border border-dashed border-line px-2 py-0.5 text-xs text-muted hover:border-brand-500 hover:text-brand-700"
            >
              + {tag}
            </button>
          ))}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            add(custom);
            setCustom("");
          }}
          className="flex gap-2"
        >
          <Input
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            placeholder="Altra etichetta"
            maxLength={30}
            aria-label="Nuova etichetta"
          />
          <Button type="submit" variant="secondary" size="icon" aria-label="Aggiungi etichetta">
            <Plus className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </Card>
  );
}

function ContactCard({
  guest,
  onSave,
}: {
  guest: GuestDetail;
  onSave: (body: Record<string, unknown>) => void;
}) {
  const [consent, setConsent] = useState(guest.marketingConsent);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const text = (name: string) => String(data.get(name) ?? "").trim() || null;
    onSave({
      fullName: text("fullName"),
      phone: text("phone"),
      email: text("email"),
      marketingConsent: consent,
    });
  }
  return (
    <Card>
      <CardHeader title="Dati di contatto" />
      <form onSubmit={submit} className="flex flex-col gap-3 p-4">
        <Field label="Nome e cognome">
          {(id) => <Input id={id} name="fullName" required defaultValue={guest.fullName} />}
        </Field>
        <Field label="Telefono">
          {(id) => <Input id={id} name="phone" type="tel" defaultValue={guest.phone ?? ""} />}
        </Field>
        <Field label="Email">
          {(id) => <Input id={id} name="email" type="email" defaultValue={guest.email ?? ""} />}
        </Field>
        <Switch
          label="Consenso marketing"
          description="Può ricevere newsletter e offerte"
          checked={consent}
          onChange={setConsent}
        />
        <Button type="submit" variant="secondary" size="sm" className="self-end">
          Salva contatti
        </Button>
      </form>
    </Card>
  );
}
