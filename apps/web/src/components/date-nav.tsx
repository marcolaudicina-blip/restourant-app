"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { formatDateLong } from "@/lib/labels";
import { useRestaurant } from "@/lib/restaurant";
import { useSelectedDate } from "@/lib/use-date";
import { Button } from "./ui/button";

export function DateNav() {
  const { date, setDate, shift, isToday } = useSelectedDate();
  const { today } = useRestaurant();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center rounded-lg border border-line bg-surface">
        <Button variant="ghost" size="icon" onClick={() => shift(-1)} aria-label="Giorno precedente">
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <label className="relative cursor-pointer px-2 text-sm font-medium capitalize">
          {formatDateLong(date)}
          <input
            type="date"
            value={date}
            onChange={(e) => e.target.value && setDate(e.target.value)}
            className="absolute inset-0 cursor-pointer opacity-0"
            aria-label="Scegli la data"
          />
        </label>
        <Button variant="ghost" size="icon" onClick={() => shift(1)} aria-label="Giorno successivo">
          <ChevronRight className="h-5 w-5" />
        </Button>
      </div>
      {!isToday && (
        <Button variant="secondary" size="sm" onClick={() => setDate(today())}>
          Oggi
        </Button>
      )}
    </div>
  );
}
