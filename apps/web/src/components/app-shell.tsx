"use client";

import { useQuery } from "@tanstack/react-query";
import { CalendarDays, Contact, LayoutGrid, LogOut, Settings, UtensilsCrossed } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { ROLE_LABELS } from "@/lib/labels";
import { useMe } from "@/lib/queries";
import { rememberRestaurant, rememberedRestaurant, RestaurantProvider } from "@/lib/restaurant";
import type { Restaurant } from "@/lib/types";
import { Button } from "./ui/button";
import { EmptyState } from "./ui/card";
import { PageLoader } from "./ui/spinner";

const NAV = [
  { href: "/prenotazioni", label: "Prenotazioni", icon: CalendarDays },
  { href: "/sala", label: "Sala", icon: LayoutGrid },
  { href: "/clienti", label: "Clienti", icon: Contact },
  { href: "/configurazione", label: "Configurazione", icon: Settings },
];

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
      <div className="min-h-dvh md:pl-60">
        <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-line bg-surface md:flex">
          <div className="flex items-center gap-2 px-5 py-5 text-brand-700">
            <UtensilsCrossed className="h-6 w-6" />
            <span className="text-lg font-semibold tracking-tight">Restourant</span>
          </div>
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
          <Nav className="mt-4 flex-1 flex-col px-3" />
          <div className="border-t border-line p-3">
            <p className="truncate px-2 text-sm font-medium">{me.data?.user.fullName}</p>
            <p className="px-2 text-xs text-muted">{ROLE_LABELS[membership.role]}</p>
            <Button variant="ghost" size="sm" onClick={logout} className="mt-2 w-full">
              <LogOut className="h-4 w-4" /> Esci
            </Button>
          </div>
        </aside>

        <main className="mx-auto max-w-7xl px-4 pb-24 pt-5 md:px-8 md:pb-10 md:pt-8">{children}</main>

        <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface md:hidden">
          <Nav className="justify-around px-2 py-1.5" compact />
        </nav>
      </div>
    </RestaurantProvider>
  );
}

function Nav({ className, compact = false }: { className?: string; compact?: boolean }) {
  const pathname = usePathname();
  return (
    <div className={cn("flex gap-1", className)}>
      {NAV.map(({ href, label, icon: Icon }) => {
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
            <Icon className="h-5 w-5" />
            {label}
          </Link>
        );
      })}
    </div>
  );
}
