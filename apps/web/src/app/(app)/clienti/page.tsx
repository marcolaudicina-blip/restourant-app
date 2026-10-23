"use client";

import { Contact, Search, UserPlus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { GuestTag } from "@/components/guests/guest-lookup";
import { Button } from "@/components/ui/button";
import { Card, EmptyState, PageHeader } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/field";
import { PageLoader } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { api, describeError } from "@/lib/api";
import { formatDateShort } from "@/lib/labels";
import { useGuests, useRestaurantMutation } from "@/lib/queries";
import type { Guest } from "@/lib/types";

export default function GuestsPage() {
  const [query, setQuery] = useState("");
  const guests = useGuests(query.trim());
  const [creating, setCreating] = useState(false);

  return (
    <>
      <PageHeader
        title="Clienti"
        description="Si creano da soli con le prenotazioni: il cliente viene riconosciuto dal numero di telefono."
        actions={
          <Button onClick={() => setCreating(true)}>
            <UserPlus className="h-4 w-4" /> Nuovo cliente
          </Button>
        }
      />
      <div className="relative mb-4">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Cerca per nome, telefono o email"
          className="pl-9"
          aria-label="Cerca cliente"
        />
      </div>

      {guests.isPending ? (
        <PageLoader />
      ) : !guests.data?.length ? (
        <Card>
          <EmptyState
            icon={<Contact className="h-8 w-8" />}
            title={query ? "Nessun cliente trovato" : "Ancora nessun cliente"}
          >
            {query ? "Prova con un altro nome o numero." : "Compariranno qui con le prime prenotazioni."}
          </EmptyState>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                  <th className="px-4 py-2.5 font-medium">Cliente</th>
                  <th className="px-3 py-2.5 font-medium">Contatti</th>
                  <th className="px-3 py-2.5 text-right font-medium">Visite</th>
                  <th className="px-3 py-2.5 text-right font-medium">No-show</th>
                  <th className="px-3 py-2.5 font-medium">Ultima visita</th>
                  <th className="px-4 py-2.5 font-medium">Prossima</th>
                </tr>
              </thead>
              <tbody>
                {guests.data.map((g) => (
                  <GuestRow key={g.id} guest={g} />
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {creating && <NewGuestDialog onClose={() => setCreating(false)} />}
    </>
  );
}

function GuestRow({ guest: g }: { guest: Guest }) {
  const router = useRouter();
  return (
    <tr
      onClick={() => router.push(`/clienti/${g.id}`)}
      className="cursor-pointer border-b border-line last:border-b-0 hover:bg-canvas"
    >
      <td className="px-4 py-3">
        <Link
          href={`/clienti/${g.id}`}
          className="font-medium hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          {g.fullName}
        </Link>
        {g.tags.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {g.tags.map((tag) => (
              <GuestTag key={tag} tag={tag} />
            ))}
          </div>
        )}
      </td>
      <td className="px-3 py-3 text-muted">
        <div>{g.phone ?? "—"}</div>
        {g.email && <div className="truncate text-xs">{g.email}</div>}
      </td>
      <td className="px-3 py-3 text-right tabular-nums">{g.stats.visits}</td>
      <td className="px-3 py-3 text-right tabular-nums">
        {g.stats.noShows > 0 ? <span className="font-medium text-red-600">{g.stats.noShows}</span> : "0"}
      </td>
      <td className="px-3 py-3 text-muted">{g.stats.lastVisit ? formatDateShort(g.stats.lastVisit) : "—"}</td>
      <td className="px-4 py-3 text-muted">
        {g.stats.nextBooking ? formatDateShort(g.stats.nextBooking) : "—"}
      </td>
    </tr>
  );
}

function NewGuestDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const create = useRestaurantMutation(
    (base, body: Record<string, unknown>) => api<Guest>(`${base}/guests`, { method: "POST", body }),
    ["guests"],
  );
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const text = (name: string) => String(data.get(name) ?? "").trim() || null;
    try {
      const guest = await create.mutateAsync({
        fullName: text("fullName"),
        phone: text("phone"),
        email: text("email"),
        profileNote: text("profileNote"),
      });
      toast.success("Cliente creato");
      router.push(`/clienti/${guest.id}`);
    } catch (e) {
      setError(describeError(e));
    }
  }

  return (
    <Dialog open onClose={onClose} title="Nuovo cliente">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Nome e cognome">
          {(id) => <Input id={id} name="fullName" required autoComplete="off" />}
        </Field>
        <Field label="Telefono">{(id) => <Input id={id} name="phone" type="tel" autoComplete="off" />}</Field>
        <Field label="Email">{(id) => <Input id={id} name="email" type="email" autoComplete="off" />}</Field>
        <Field
          label="Note permanenti"
          hint="Allergie, preferenze, tavolo preferito: compaiono su ogni prenotazione"
        >
          {(id) => <Textarea id={id} name="profileNote" />}
        </Field>
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Annulla
          </Button>
          <Button type="submit" loading={create.isPending}>
            Crea
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
