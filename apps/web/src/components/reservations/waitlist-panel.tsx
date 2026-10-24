"use client";

import { useQuery } from "@tanstack/react-query";
import { BellRing, CalendarPlus, Globe, Hourglass, Mail, Pencil, Phone, X } from "lucide-react";
import { useState, type FormEvent } from "react";
import { api, describeError } from "@/lib/api";
import { keys, useRestaurantMutation } from "@/lib/queries";
import { useRestaurant } from "@/lib/restaurant";
import type { WaitlistEntry } from "@/lib/types";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { Dialog } from "../ui/dialog";
import { Field, Input, Textarea } from "../ui/field";
import { useToast } from "../ui/toast";

/*
 * The waiting list of the selected day. Guests join from the booking page when the day is full, or
 * staff add them; when a booking is cancelled the API emails those whose time window got free.
 * Staff book them (the booking takes them off the list), tell them by email, or remove them.
 */

/** What a new booking from the list starts with. */
export type WaitlistBooking = {
  partySize: number;
  guest: { name: string; phone: string | null; email: string | null };
  locale: "it" | "en";
};

export function useWaitlist(date: string) {
  const { restaurantId, base } = useRestaurant();
  return useQuery({
    queryKey: keys.waitlist(restaurantId, date),
    queryFn: () => api<WaitlistEntry[]>(`${base}/waitlist?date=${date}`),
  });
}

const timeFmt = new Intl.DateTimeFormat("it-IT", { hour: "2-digit", minute: "2-digit" });

const windowLabel = (e: Pick<WaitlistEntry, "timeFrom" | "timeTo">) =>
  e.timeFrom && e.timeTo
    ? `${e.timeFrom}–${e.timeTo}`
    : e.timeFrom
      ? `dalle ${e.timeFrom}`
      : e.timeTo
        ? `fino alle ${e.timeTo}`
        : "qualsiasi orario";

export function WaitlistPanel({
  date,
  adding,
  onAddingChange,
  onBook,
}: {
  date: string;
  adding: boolean;
  onAddingChange: (open: boolean) => void;
  onBook: (booking: WaitlistBooking) => void;
}) {
  const toast = useToast();
  const waitlist = useWaitlist(date);
  const [editing, setEditing] = useState<WaitlistEntry | null>(null);
  const update = useRestaurantMutation(
    (base, { id, ...body }: { id: string; status: "removed" }) =>
      api<WaitlistEntry>(`${base}/waitlist/${id}`, { method: "PATCH", body }),
    ["reservations"],
  );
  const notify = useRestaurantMutation(
    (base, id: string) =>
      api<WaitlistEntry & { emailSent: boolean }>(`${base}/waitlist/${id}/notify`, { method: "POST" }),
    ["reservations"],
  );

  const all = waitlist.data ?? [];
  const open = all.filter((e) => e.status === "waiting" || e.status === "notified");
  const booked = all.filter((e) => e.status === "booked").length;

  return (
    <>
      {open.length > 0 && (
        <Card className="mb-4 border-amber-200">
          <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
            <Hourglass className="h-4 w-4 text-amber-700" />
            <h2 className="font-semibold">Lista d&apos;attesa</h2>
            <span className="rounded-full bg-amber-100 px-2 text-xs font-semibold text-amber-800">
              {open.length}
            </span>
            {booked > 0 && (
              <span className="text-xs text-muted">
                · {booked} {booked === 1 ? "ha prenotato" : "hanno prenotato"}
              </span>
            )}
            <p className="ml-auto hidden text-xs text-muted sm:block">
              Se si libera un tavolo, avvisiamo noi via email chi aspetta
            </p>
          </div>
          <ul className="divide-y divide-line">
            {open.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <p>
                    <span className="font-medium">{e.guestName}</span>{" "}
                    <span className="text-sm text-muted">
                      · {e.partySize} pers. · {windowLabel(e)}
                    </span>
                    {e.channel === "online" && (
                      <Globe className="ml-1.5 inline h-3.5 w-3.5 text-violet-700" aria-label="Dal sito" />
                    )}
                  </p>
                  <p className="flex flex-wrap gap-x-3 text-xs text-muted">
                    {e.guestPhone && (
                      <a href={`tel:${e.guestPhone.replace(/\s/g, "")}`} className="hover:underline">
                        <Phone className="mr-0.5 inline h-3 w-3" /> {e.guestPhone}
                      </a>
                    )}
                    {e.guestEmail && (
                      <span>
                        <Mail className="mr-0.5 inline h-3 w-3" /> {e.guestEmail}
                      </span>
                    )}
                    {e.notifiedAt && (
                      <span className="font-medium text-amber-800">
                        Avvisato alle {timeFmt.format(new Date(e.notifiedAt))}
                      </span>
                    )}
                    {e.note && <span className="italic">“{e.note}”</span>}
                  </p>
                </div>
                <Button
                  size="sm"
                  onClick={() =>
                    onBook({
                      partySize: e.partySize,
                      guest: { name: e.guestName, phone: e.guestPhone, email: e.guestEmail },
                      locale: e.locale,
                    })
                  }
                >
                  <CalendarPlus className="h-4 w-4" /> Prenota
                </Button>
                {e.guestEmail && (
                  <Button
                    size="sm"
                    variant="secondary"
                    loading={notify.isPending && notify.variables === e.id}
                    onClick={() =>
                      notify.mutate(e.id, {
                        onSuccess: (r) =>
                          r.emailSent
                            ? toast.success(`Email inviata a ${e.guestName}`)
                            : toast.error("Email non inviata: controlla la configurazione"),
                        onError: (err) => toast.error(describeError(err)),
                      })
                    }
                    title="Manda l'email «si è liberato un tavolo»"
                  >
                    <BellRing className="h-4 w-4" /> {e.status === "notified" ? "Avvisa di nuovo" : "Avvisa"}
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setEditing(e)}
                  aria-label={`Modifica ${e.guestName}`}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={`Togli ${e.guestName} dalla lista`}
                  onClick={() => {
                    if (window.confirm(`Togliere ${e.guestName} dalla lista d'attesa?`))
                      update.mutate(
                        { id: e.id, status: "removed" },
                        { onError: (err) => toast.error(describeError(err)) },
                      );
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {(adding || editing) && (
        <WaitlistDialog
          key={editing?.id ?? "new"}
          date={date}
          entry={editing}
          onClose={() => {
            setEditing(null);
            onAddingChange(false);
          }}
        />
      )}
    </>
  );
}

function WaitlistDialog({
  date,
  entry,
  onClose,
}: {
  date: string;
  entry: WaitlistEntry | null;
  onClose: () => void;
}) {
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);
  const save = useRestaurantMutation(
    (base, body: Record<string, unknown>) =>
      entry
        ? api<WaitlistEntry>(`${base}/waitlist/${entry.id}`, { method: "PATCH", body })
        : api<WaitlistEntry>(`${base}/waitlist`, { method: "POST", body }),
    ["reservations"],
  );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const form = new FormData(event.currentTarget);
    const text = (name: string) => String(form.get(name) ?? "").trim() || null;
    try {
      await save.mutateAsync({
        date: text("date") ?? date,
        partySize: Number(form.get("partySize")),
        timeFrom: text("timeFrom"),
        timeTo: text("timeTo"),
        guestName: text("guestName") ?? "",
        guestPhone: text("guestPhone"),
        guestEmail: text("guestEmail"),
        note: text("note"),
      });
      toast.success(entry ? "Modifiche salvate" : "Aggiunto alla lista d'attesa");
      onClose();
    } catch (e) {
      setError(describeError(e));
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={entry ? "Modifica lista d'attesa" : "Aggiungi alla lista d'attesa"}
      description="Quando si libera un tavolo nell'orario indicato il cliente riceve un'email per prenotare."
    >
      <form onSubmit={submit} className="flex flex-col gap-4 p-5">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Giorno">
            {(id) => <Input id={id} name="date" type="date" required defaultValue={entry?.date ?? date} />}
          </Field>
          <Field label="Persone">
            {(id) => (
              <Input
                id={id}
                name="partySize"
                type="number"
                min={1}
                max={100}
                required
                defaultValue={entry?.partySize ?? 2}
              />
            )}
          </Field>
          <Field label="Dalle (facoltativo)">
            {(id) => <Input id={id} name="timeFrom" type="time" defaultValue={entry?.timeFrom ?? ""} />}
          </Field>
          <Field label="Alle (facoltativo)">
            {(id) => <Input id={id} name="timeTo" type="time" defaultValue={entry?.timeTo ?? ""} />}
          </Field>
        </div>
        <Field label="Nome">
          {(id) => (
            <Input id={id} name="guestName" required maxLength={120} defaultValue={entry?.guestName ?? ""} />
          )}
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Telefono">
            {(id) => <Input id={id} name="guestPhone" type="tel" defaultValue={entry?.guestPhone ?? ""} />}
          </Field>
          <Field label="Email" hint="Per l'avviso automatico">
            {(id) => <Input id={id} name="guestEmail" type="email" defaultValue={entry?.guestEmail ?? ""} />}
          </Field>
        </div>
        <Field label="Note">
          {(id) => <Textarea id={id} name="note" maxLength={500} rows={2} defaultValue={entry?.note ?? ""} />}
        </Field>
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Annulla
          </Button>
          <Button type="submit" loading={save.isPending}>
            {entry ? "Salva" : "Aggiungi"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
