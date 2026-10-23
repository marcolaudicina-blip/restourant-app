"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { PageHeader } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import { useRestaurant } from "@/lib/restaurant";

const SECTIONS = [
  { href: "/configurazione", label: "Panoramica" },
  { href: "/configurazione/orari", label: "Orari e servizi" },
  { href: "/configurazione/durate", label: "Durata dei tavoli" },
  { href: "/configurazione/regole", label: "Regole di prenotazione" },
  { href: "/configurazione/pagina", label: "Pagina di prenotazione" },
  { href: "/configurazione/tavoli", label: "Sale e tavoli" },
  { href: "/configurazione/combinazioni", label: "Combinazioni" },
  { href: "/configurazione/chiusure", label: "Chiusure" },
  { href: "/configurazione/locale", label: "Dati del locale" },
];

export default function ConfigLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { can } = useRestaurant();
  return (
    <>
      <PageHeader
        title="Configurazione"
        description={
          can("config.write")
            ? undefined
            : "Puoi consultare la configurazione; le modifiche spettano a titolare e manager."
        }
      />
      <nav className="-mx-4 mb-5 flex gap-1 overflow-x-auto border-b border-line px-4 md:mx-0 md:px-0">
        {SECTIONS.map((s) => {
          const active = s.href === "/configurazione" ? pathname === s.href : pathname.startsWith(s.href);
          return (
            <Link
              key={s.href}
              href={s.href}
              className={cn(
                "-mb-px whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium",
                active ? "border-brand-600 text-brand-700" : "border-transparent text-muted hover:text-ink",
              )}
            >
              {s.label}
            </Link>
          );
        })}
      </nav>
      {children}
    </>
  );
}
