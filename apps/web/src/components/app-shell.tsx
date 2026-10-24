"use client";

import { useQuery } from "@tanstack/react-query";
import {
  BarChart3,
  CalendarDays,
  CircleUserRound,
  Contact,
  LayoutGrid,
  LifeBuoy,
  LogOut,
  Settings,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { ROLE_LABELS } from "@/lib/labels";
import { useMe } from "@/lib/queries";
import {
  rememberRestaurant,
  rememberedRestaurant,
  RestaurantProvider,
  useRestaurant,
} from "@/lib/restaurant";
import type { Permission } from "@restourant/shared";
import type { Restaurant } from "@/lib/types";
import { ActivityProvider, usePendingRequests } from "./activity";
import { ProductLogo } from "./product-logo";
import { Button } from "./ui/button";
import { EmptyState } from "./ui/card";
import { PageLoader } from "./ui/spinner";

const NAV: {
  href: string;
  label: string;
  icon: typeof CalendarDays;
  permission?: Permission;
  /** Left out of the phone tab bar (reachable from the account page). */
  desktopOnly?: boolean;
}[] = [
  { href: "/prenotazioni", label: "Prenotazioni", icon: CalendarDays },
  { href: "/sala", label: "Sala", icon: LayoutGrid },
  { href: "/clienti", label: "Clienti", icon: Contact },
  {
    href: "/statistiche",
    label: "Statistiche",
    icon: BarChart3,
    permission: "stats.read",
    desktopOnly: true,
  },
  { href: "/configurazione", label: "Configurazione", icon: Settings },
];
/** On phones there is no sidebar footer: the account gets a tab. */
const MOBILE_EXTRA = [{ href: "/account", label: "Account", icon: CircleUserRound }];

async function logout() {
  await api("/api/session", { method: "DELETE" }).catch(() => undefined);
  window.location.href = "/login";
}

export function AppShell({ children }: { children: ReactNode }) {
  const me = useMe();
  const [selected, setSelected] = useState<string | null>(() =>
    typeof window === "undefined" ? null : rememberedRestaurant(),
  );
  const memberships = me.data?.memberships ?? [];
  const membership = memberships.find((m) => m.restaurantId === selected) ?? memberships[0];

  const restaurant = useQuery({
    queryKey: ["restaurant", membership?.restaurantId],
    queryFn: () => api<Restaurant>(`/restaurants/${membership!.restaurantId}`),
    enabled: Boolean(membership),
  });

  if (me.isPending || (membership && restaurant.isPending)) return <PageLoader />;
  if (!membership || !restaurant.data) {
    return (
      <EmptyState title="Nessun ristorante collegato a questo account">
        <Button variant="secondary" onClick={logout} className="mt-3">
          Esci
        </Button>
      </EmptyState>
    );
  }

  return (
    <RestaurantProvider
      restaurantId={membership.restaurantId}
      name={restaurant.data.name}
      role={membership.role}
      timezone={restaurant.data.timezone}
    >
      <ActivityProvider>
        <div className="min-h-dvh md:pl-60 print:pl-0">
          <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-line bg-surface md:flex print:hidden">
            <ProductLogo className="px-5 pb-4 pt-5" />
            <div className="px-3">
              {memberships.length > 1 ? (
                <select
                  value={membership.restaurantId}
                  onChange={(e) => {
                    rememberRestaurant(e.target.value);
                    setSelected(e.target.value);
                  }}
                  className="w-full rounded-lg border border-line bg-canvas px-2 py-2 text-sm font-medium"
                  aria-label="Ristorante"
                >
                  {memberships.map((m) => (
                    <option key={m.restaurantId} value={m.restaurantId}>
                      {m.restaurantName}
                    </option>
                  ))}
                </select>
              ) : (
                <p className="truncate rounded-lg bg-canvas px-3 py-2 text-sm font-medium">
                  {restaurant.data.name}
                </p>
              )}
            </div>
            <Nav className="mt-4 flex-col px-3" />
            <div className="flex-1 px-3">
              {me.data?.platformAdmin && (
                <Link
                  href="/admin"
                  className="mt-1 flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted hover:bg-black/5 hover:text-ink"
                >
                  <ShieldCheck className="h-5 w-5" /> Admin
                </Link>
              )}
            </div>
            <div className="border-t border-line p-3">
              <Link href="/account" className="block rounded-lg px-2 py-1 hover:bg-black/5">
                <p className="truncate text-sm font-medium">{me.data?.user.fullName}</p>
                <p className="text-xs text-muted">{ROLE_LABELS[membership.role]} · Il mio account</p>
              </Link>
              <Button variant="ghost" size="sm" onClick={logout} className="mt-2 w-full">
                <LogOut className="h-4 w-4" /> Esci
              </Button>
            </div>
          </aside>

          {membership.support && (
            <SupportBanner
              restaurantId={membership.restaurantId}
              name={restaurant.data.name}
              backTo={memberships.find((m) => !m.support)?.restaurantId ?? null}
            />
          )}
          <main className="mx-auto max-w-7xl px-4 pb-24 pt-5 md:px-8 md:pb-10 md:pt-8 print:max-w-none print:p-0">
            {children}
          </main>

          <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface md:hidden print:hidden">
            <Nav className="justify-around px-2 py-1.5" compact />
          </nav>
        </div>
      </ActivityProvider>
    </RestaurantProvider>
  );
}

function Nav({ className, compact = false }: { className?: string; compact?: boolean }) {
  const pathname = usePathname();
  const pending = usePendingRequests().length;
  const { can } = useRestaurant();
  const items = NAV.filter((n) => (!n.permission || can(n.permission)) && !(compact && n.desktopOnly));
  return (
    <div className={cn("flex gap-1", className)}>
      {(compact ? [...items, ...MOBILE_EXTRA] : items).map(({ href, label, icon: Icon }) => {
        const active = pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex items-center rounded-lg text-sm font-medium transition-colors",
              compact ? "flex-1 flex-col gap-0.5 py-1.5 text-xs" : "gap-3 px-3 py-2.5",
              active ? "bg-brand-50 text-brand-700" : "text-muted hover:bg-black/5 hover:text-ink",
            )}
          >
            <span className="relative">
              <Icon className="h-5 w-5" />
              {href === "/prenotazioni" && pending > 0 && (
                <span
                  className="absolute -right-2 -top-1.5 min-w-4 rounded-full bg-violet-600 px-1 text-center text-[10px] font-semibold leading-4 text-white"
                  aria-label={`${pending} richieste da confermare`}
                >
                  {pending}
                </span>
              )}
            </span>
            {label}
          </Link>
        );
      })}
    </div>
  );
}

/** TwentyReserve support working inside a customer's restaurant: always visible, one click to leave. */
function SupportBanner({
  restaurantId,
  name,
  backTo,
}: {
  restaurantId: string;
  name: string;
  backTo: string | null;
}) {
  const [leaving, setLeaving] = useState(false);
  async function leave() {
    setLeaving(true);
    await api(`/admin/restaurants/${restaurantId}/support`, { method: "DELETE" }).catch(() => undefined);
    if (backTo) rememberRestaurant(backTo);
    window.location.href = "/admin";
  }
  return (
    <div className="sticky top-0 z-20 flex flex-wrap items-center justify-center gap-3 bg-amber-100 px-4 py-2 text-sm text-amber-900 print:hidden">
      <LifeBuoy className="h-4 w-4" />
      <span>
        Sei in <strong>{name}</strong> come assistenza TwentyReserve: il ristorante vede il tuo accesso.
      </span>
      <Button size="sm" variant="secondary" onClick={leave} loading={leaving}>
        Esci dall&apos;assistenza
      </Button>
    </div>
  );
}
