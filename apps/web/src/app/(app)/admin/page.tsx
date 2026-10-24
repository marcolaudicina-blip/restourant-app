"use client";

import { useQuery } from "@tanstack/react-query";
import { ExternalLink, LifeBuoy, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/field";
import { PageLoader, Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { api, describeError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { ROLE_LABELS } from "@/lib/labels";
import { useMe } from "@/lib/queries";
import { rememberRestaurant } from "@/lib/restaurant";
import type { AdminOverview, AdminRestaurant, AdminRestaurantDetail } from "@/lib/types";

/*
 * TwentyReserve's own panel (PLATFORM_ADMIN_EMAILS): every restaurant on the platform, how it uses
 * the product, and support access. Other accounts never see the link, and the API answers 404.
 */

const dateTime = new Intl.DateTimeFormat("it-IT", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});
const date = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "short", year: "numeric" });

const ENTITY_LABELS: Record<string, string> = {
  reservation: "Prenotazione",
  email: "Email",
  booking_policy: "Regole",
  booking_page: "Pagina di prenotazione",
  support_access: "Accesso assistenza",
  import: "Importazione",
  table: "Tavolo",
  room: "Sala",
  service: "Servizio",
  guest: "Cliente",
  restaurant: "Dati del locale",
  waitlist: "Lista d'attesa",
  review: "Recensione",
};

export default function AdminPage() {
  const me = useMe();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const overview = useQuery({
    queryKey: ["admin", "overview"],
    queryFn: () => api<AdminOverview>("/admin/overview"),
    enabled: me.data?.platformAdmin === true,
  });
  const restaurants = useQuery({
    queryKey: ["admin", "restaurants"],
    queryFn: () => api<AdminRestaurant[]>("/admin/restaurants"),
    enabled: me.data?.platformAdmin === true,
  });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = restaurants.data ?? [];
    if (!q) return list;
    return list.filter((r) =>
      [r.name, r.city, r.slug, r.owner?.fullName, r.owner?.email].some((v) => v?.toLowerCase().includes(q)),
    );
  }, [restaurants.data, query]);

  if (me.isPending) return <PageLoader />;
  if (!me.data?.platformAdmin) return <p className="text-sm text-muted">Pagina non disponibile.</p>;

  const o = overview.data;
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Admin TwentyReserve</h1>
        <p className="text-sm text-muted">
          Tutti i ristoranti della piattaforma. Visibile solo allo staff TwentyReserve.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Ristoranti"
          value={o?.restaurants}
          hint={o ? `${o.newThisWeek} nuovi questa settimana` : ""}
        />
        <Stat label="Utenti" value={o?.users} />
        <Stat label="Prenotazioni (30 giorni)" value={o?.bookingsLast30Days} />
        <Stat
          label="Online (30 giorni)"
          value={o?.onlineLast30Days}
          hint={
            o && o.bookingsLast30Days
              ? `${Math.round((o.onlineLast30Days / o.bookingsLast30Days) * 100)}% del totale`
              : ""
          }
        />
      </div>

      <Card>
        <div className="flex items-center gap-2 border-b border-line p-3">
          <Search className="ml-1 h-4 w-4 text-muted" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cerca per locale, città, titolare o email"
            aria-label="Cerca ristoranti"
            className="border-0 shadow-none focus:ring-0"
          />
        </div>
        {restaurants.isPending ? (
          <div className="p-6">
            <Spinner className="h-5 w-5 text-muted" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                  <th className="px-4 py-2 font-medium">Ristorante</th>
                  <th className="px-3 py-2 font-medium">Titolare</th>
                  <th className="px-3 py-2 font-medium">Iscritto</th>
                  <th className="px-3 py-2 text-right font-medium">Pren. 30 gg</th>
                  <th className="px-3 py-2 text-right font-medium">Staff</th>
                  <th className="px-3 py-2 font-medium">Ultima attività</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} className="border-b border-line last:border-0 hover:bg-canvas">
                    <td className="px-4 py-2.5">
                      <p className="font-medium">{r.name}</p>
                      <p className="text-xs text-muted">
                        {[r.city, `/${r.slug}`].filter(Boolean).join(" · ")}
                        {!r.onlineEnabled && " · online spento"}
                      </p>
                    </td>
                    <td className="px-3 py-2.5">
                      {r.owner ? (
                        <>
                          <p>{r.owner.fullName}</p>
                          <a
                            href={`mailto:${r.owner.email}`}
                            className="text-xs text-brand-700 hover:underline"
                          >
                            {r.owner.email}
                          </a>
                        </>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <p>{date.format(new Date(r.createdAt))}</p>
                      <TrialBadge days={r.trialDaysLeft} />
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {r.bookingsLast30Days}
                      {r.onlineLast30Days > 0 && (
                        <span className="block text-xs text-muted">{r.onlineLast30Days} online</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{r.members}</td>
                    <td className="px-3 py-2.5 text-muted">
                      {r.lastActivityAt ? dateTime.format(new Date(r.lastActivityAt)) : "mai"}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <Button size="sm" variant="secondary" onClick={() => setOpen(r.id)}>
                        Dettagli
                      </Button>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-6 text-center text-muted">
                      Nessun ristorante trovato.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {open && <DetailPanel id={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: number | undefined; hint?: string }) {
  return (
    <Card className="p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value ?? "–"}</p>
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </Card>
  );
}

function TrialBadge({ days }: { days: number }) {
  return (
    <span
      className={cn(
        "mt-0.5 inline-block rounded-full px-2 py-0.5 text-xs font-medium",
        days > 7
          ? "bg-brand-50 text-brand-700"
          : days >= 0
            ? "bg-amber-100 text-amber-800"
            : "bg-canvas text-muted",
      )}
    >
      {days >= 0 ? `Prova: ${days} gg` : `Prova finita da ${-days} gg`}
    </span>
  );
}

function DetailPanel({ id, onClose }: { id: string; onClose: () => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const detail = useQuery({
    queryKey: ["admin", "restaurants", id],
    queryFn: () => api<AdminRestaurantDetail>(`/admin/restaurants/${id}`),
  });

  async function enter() {
    setBusy(true);
    try {
      if (!detail.data?.supportActive) await api(`/admin/restaurants/${id}/support`, { method: "POST" });
      rememberRestaurant(id);
      window.location.href = "/prenotazioni";
    } catch (e) {
      toast.error(describeError(e));
      setBusy(false);
    }
  }

  const d = detail.data;
  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/30" onClick={onClose}>
      <aside
        role="dialog"
        aria-label="Dettagli ristorante"
        className="flex h-full w-full max-w-md flex-col overflow-y-auto bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-line p-5">
          <div>
            <h2 className="text-lg font-semibold">{d?.name ?? "…"}</h2>
            {d && (
              <p className="text-sm text-muted">
                Iscritto il {date.format(new Date(d.createdAt))} · {d.upcomingBookings} prenotazioni nei
                prossimi 30 giorni
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Chiudi"
            className="rounded p-1 text-muted hover:bg-black/5"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {!d ? (
          <div className="p-5">
            <Spinner className="h-5 w-5 text-muted" />
          </div>
        ) : (
          <div className="flex flex-col gap-6 p-5">
            <div className="flex flex-wrap gap-2">
              <Button onClick={enter} loading={busy}>
                <LifeBuoy className="h-4 w-4" />{" "}
                {d.supportActive ? "Apri il locale" : "Entra come assistenza"}
              </Button>
              <a
                href={`/prenota/${d.slug}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-line px-3 text-sm font-medium hover:bg-canvas"
              >
                <ExternalLink className="h-4 w-4" /> Pagina pubblica
              </a>
            </div>
            <p className="text-xs text-muted">
              Entrando come assistenza diventi manager del locale finché non esci: il ristorante ti vede nel
              Personale come &quot;Assistenza TwentyReserve&quot; e l&apos;accesso resta nel suo registro
              modifiche.
            </p>

            <section>
              <h3 className="mb-2 text-sm font-semibold">Contatti</h3>
              <p className="text-sm">{[d.email, d.phone, d.city].filter(Boolean).join(" · ") || "—"}</p>
            </section>

            <section>
              <h3 className="mb-2 text-sm font-semibold">Persone</h3>
              <ul className="divide-y divide-line rounded-xl border border-line text-sm">
                {d.members.map((m) => (
                  <li key={m.userId} className="flex items-center justify-between gap-3 px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{m.fullName}</p>
                      <p className="truncate text-xs text-muted">{m.email}</p>
                    </div>
                    <span className="shrink-0 text-xs text-muted">
                      {m.support ? "Assistenza" : ROLE_LABELS[m.role]}
                    </span>
                  </li>
                ))}
              </ul>
            </section>

            <section>
              <h3 className="mb-2 text-sm font-semibold">Ultime attività</h3>
              <ul className="flex flex-col gap-1.5 text-sm">
                {d.recentActivity.map((e, i) => (
                  <li key={i} className="flex justify-between gap-3">
                    <span>
                      {ENTITY_LABELS[e.entity] ?? e.entity} · {e.action}
                      {e.actor && <span className="text-muted"> · {e.actor}</span>}
                    </span>
                    <span className="shrink-0 text-xs text-muted">
                      {dateTime.format(new Date(e.createdAt))}
                    </span>
                  </li>
                ))}
                {d.recentActivity.length === 0 && <li className="text-muted">Nessuna attività.</li>}
              </ul>
            </section>
          </div>
        )}
      </aside>
    </div>
  );
}
