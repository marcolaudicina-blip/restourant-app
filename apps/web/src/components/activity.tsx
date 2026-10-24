"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BellOff, BellRing, CalendarClock, CalendarX, Globe, Hourglass, X } from "lucide-react";
import Link from "next/link";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { api } from "@/lib/api";
import { formatDateShort } from "@/lib/labels";
import { useRestaurant } from "@/lib/restaurant";
import type { Activity, ActivityBrief } from "@/lib/types";

/*
 * Keeps every device in the room in sync without websockets: every few seconds it asks the API
 * whether anything changed (then the lists refresh at once), and announces with a banner and a
 * chime bookings that just arrived from the public page, and those guests moved or cancelled.
 */

type Alert = ActivityBrief & {
  kind: "new" | "cancelled" | "updated" | "waitlist";
  key: string;
  tables?: string | null;
  room?: string | null;
  previousTables?: string | null;
};

const ALERT_COPY = {
  new: { icon: Globe, tone: "border-violet-200", badge: "bg-violet-100 text-violet-700" },
  cancelled: { icon: CalendarX, tone: "border-red-200", badge: "bg-red-100 text-red-700" },
  updated: { icon: CalendarClock, tone: "border-amber-200", badge: "bg-amber-100 text-amber-800" },
  waitlist: { icon: Hourglass, tone: "border-amber-200", badge: "bg-amber-100 text-amber-800" },
};

function alertTitle(a: Alert) {
  if (a.kind === "cancelled") return "Prenotazione disdetta dal cliente";
  if (a.kind === "updated") return "Prenotazione modificata dal cliente";
  if (a.kind === "waitlist") return "Nuova richiesta in lista d'attesa";
  return a.status === "requested" ? "Nuova richiesta online" : "Nuova prenotazione online";
}

const POLL_MS = 10_000;
const SOUND_KEY = "rs_sound";

const ActivityContext = createContext<{ pendingRequests: ActivityBrief[] }>({ pendingRequests: [] });

/** Requests from the booking page waiting for the restaurant's answer (today and later). */
export function usePendingRequests(): ActivityBrief[] {
  return useContext(ActivityContext).pendingRequests;
}

function readSound(): boolean {
  try {
    return window.localStorage.getItem(SOUND_KEY) !== "off";
  } catch {
    return true;
  }
}

/** Browsers only allow sound after the user touched the page: the context is unlocked then. */
let audio: AudioContext | null = null;
function unlockAudio() {
  try {
    audio ??= new AudioContext();
    void audio.resume();
  } catch {
    audio = null;
  }
}

function chime() {
  if (!audio || audio.state !== "running") return;
  const start = audio.currentTime;
  for (const [i, frequency] of [880, 1320].entries()) {
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, start + i * 0.18);
    gain.gain.exponentialRampToValueAtTime(0.25, start + i * 0.18 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + i * 0.18 + 0.35);
    osc.connect(gain).connect(audio.destination);
    osc.start(start + i * 0.18);
    osc.stop(start + i * 0.18 + 0.4);
  }
}

export function ActivityProvider({ children }: { children: ReactNode }) {
  const { restaurantId, base } = useRestaurant();
  const queryClient = useQueryClient();
  const since = useRef<string | null>(null);
  const lastChange = useRef<string | null | undefined>(undefined);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [sound, setSound] = useState(true);

  useEffect(() => {
    setSound(readSound());
    window.addEventListener("pointerdown", unlockAudio, { once: true });
    return () => window.removeEventListener("pointerdown", unlockAudio);
  }, []);

  const activity = useQuery({
    queryKey: ["activity", restaurantId],
    queryFn: () =>
      api<Activity>(
        `${base}/reservations/activity${since.current ? `?since=${encodeURIComponent(since.current)}` : ""}`,
      ),
    refetchInterval: POLL_MS,
    refetchIntervalInBackground: true,
  });

  useEffect(() => {
    const data = activity.data;
    if (!data) return;
    since.current = data.serverTime;
    if (lastChange.current !== undefined && data.lastChangeAt !== lastChange.current) {
      for (const family of ["reservations", "availability", "guests"]) {
        void queryClient.invalidateQueries({ queryKey: [family, restaurantId] });
      }
    }
    lastChange.current = data.lastChangeAt;
    const incoming: Alert[] = [
      ...data.newOnline.map((n) => ({ ...n, kind: "new" as const, key: n.id })),
      ...data.guestChanges.map((c) => ({
        ...c,
        key: `${c.id}:${c.kind}:${c.date}:${c.time}:${c.partySize}`,
      })),
      ...(data.newWaitlist ?? []).map((w) => ({
        ...w,
        time: "",
        status: "requested" as const,
        kind: "waitlist" as const,
        key: `waitlist:${w.id}`,
      })),
    ];
    if (incoming.length > 0) {
      setAlerts((current) => [...current, ...incoming.filter((n) => !current.some((c) => c.key === n.key))]);
      if (readSound()) chime();
    }
  }, [activity.data, queryClient, restaurantId]);

  // The tab title shows waiting alerts, for whoever is looking at another tab.
  useEffect(() => {
    const base = document.title.replace(/^\(\d+\) /, "");
    document.title = alerts.length > 0 ? `(${alerts.length}) ${base}` : base;
  }, [alerts.length]);

  const dismiss = (key: string) => setAlerts((current) => current.filter((a) => a.key !== key));
  const toggleSound = () => {
    const next = !sound;
    setSound(next);
    unlockAudio();
    try {
      window.localStorage.setItem(SOUND_KEY, next ? "on" : "off");
    } catch {
      // Private mode: the choice lasts until reload.
    }
  };

  return (
    <ActivityContext.Provider value={{ pendingRequests: activity.data?.pendingRequests ?? [] }}>
      {children}
      {alerts.length > 0 && (
        <div
          className="fixed inset-x-2 top-2 z-50 flex flex-col gap-2 sm:inset-x-auto sm:right-4 sm:top-4 sm:w-96"
          role="status"
          aria-live="polite"
        >
          {alerts.slice(-3).map((a) => {
            const { icon: Icon, tone, badge } = ALERT_COPY[a.kind];
            return (
              <div key={a.key} className={`rounded-xl border ${tone} bg-surface p-3 shadow-xl`}>
                <div className="flex items-start gap-3">
                  <span className={`rounded-full p-2 ${badge}`}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">{alertTitle(a)}</p>
                    <p className="truncate text-sm text-muted">
                      {a.guestName} · {a.partySize} pers. · {formatDateShort(a.date)}
                      {a.time && ` ore ${a.time}`}
                    </p>
                    {a.kind === "updated" && a.tables && (
                      <p className="text-sm">
                        Tavolo <span className="font-semibold">{a.tables}</span>
                        {a.room && ` · ${a.room}`}
                        {a.previousTables && <span className="text-muted"> (prima {a.previousTables})</span>}
                      </p>
                    )}
                    <Link
                      href={`/prenotazioni?data=${a.date}`}
                      onClick={() => dismiss(a.key)}
                      className="mt-1 inline-block text-sm font-medium text-brand-700 hover:underline"
                    >
                      {a.kind === "new" && a.status === "requested"
                        ? "Conferma o rifiuta"
                        : "Apri la giornata"}
                    </Link>
                  </div>
                  <button
                    type="button"
                    onClick={() => dismiss(a.key)}
                    aria-label="Chiudi avviso"
                    className="rounded p-1 text-muted hover:bg-black/5"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            );
          })}
          <button
            type="button"
            onClick={toggleSound}
            className="flex items-center gap-1.5 self-end rounded-full bg-surface px-3 py-1 text-xs text-muted shadow"
          >
            {sound ? <BellRing className="h-3.5 w-3.5" /> : <BellOff className="h-3.5 w-3.5" />}
            {sound ? "Suono attivo" : "Suono disattivato"}
          </button>
        </div>
      )}
    </ActivityContext.Provider>
  );
}
