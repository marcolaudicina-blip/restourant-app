"use client";

import { addDays } from "@restourant/shared";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import { useRestaurant } from "./restaurant";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** The day being viewed, kept in the URL (?data=YYYY-MM-DD) so it survives reloads and can be shared. */
export function useSelectedDate() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { today } = useRestaurant();
  const raw = params.get("data");
  const date = raw && DATE_RE.test(raw) ? raw : today();

  const setDate = useCallback(
    (next: string) => {
      const search = new URLSearchParams(params);
      if (next === today()) search.delete("data");
      else search.set("data", next);
      const query = search.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [params, pathname, router, today],
  );

  return { date, setDate, shift: (days: number) => setDate(addDays(date, days)), isToday: date === today() };
}
