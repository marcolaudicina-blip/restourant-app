import { RESERVATION_STATUS_COLORS, type ReservationStatus } from "@restourant/shared";

/** Italian copy for codes returned by the API. */

export const STATUS_LABELS: Record<ReservationStatus, string> = {
  requested: "Da confermare",
  confirmed: "Confermata",
  arrived: "Arrivata",
  seated: "Seduta",
  completed: "Conclusa",
  no_show: "No-show",
  cancelled: "Cancellata",
};

export const STATUS_ACTION_LABELS: Record<ReservationStatus, string> = {
  requested: "Rimetti in attesa",
  confirmed: "Conferma",
  arrived: "Arrivati",
  seated: "Fai sedere",
  completed: "Conclusa",
  no_show: "No-show",
  cancelled: "Cancella",
};

export const statusColor = (status: ReservationStatus) => RESERVATION_STATUS_COLORS[status];

export const CLOSED_REASON_LABELS: Record<string, string> = {
  inactive: "Servizio disattivato",
  out_of_season: "Fuori stagione",
  not_scheduled_day: "Chiuso in questo giorno",
  closed_exception: "Chiusura straordinaria",
  online_closed_exception: "Chiuso alle prenotazioni online",
  not_online_bookable: "Non prenotabile online",
  online_disabled: "Prenotazioni online disattivate",
  past: "Data passata",
  too_far: "Troppo in anticipo",
  party_too_small: "Gruppo sotto il minimo online",
  large_party_request: "Gruppo numeroso: serve una richiesta",
  large_party_phone: "Gruppo numeroso: solo per telefono",
};

export const SLOT_REASON_LABELS: Record<string, string> = {
  too_soon: "Troppo vicino",
  no_suitable_table: "Nessun tavolo adatto",
  service_full: "Servizio pieno",
  pacing_covers: "Troppi coperti in arrivo",
  pacing_bookings: "Troppe prenotazioni in arrivo",
  tables_taken: "Tavoli occupati",
};

export const WEEKDAYS = [
  { value: 1, short: "Lun", long: "Lunedì" },
  { value: 2, short: "Mar", long: "Martedì" },
  { value: 3, short: "Mer", long: "Mercoledì" },
  { value: 4, short: "Gio", long: "Giovedì" },
  { value: 5, short: "Ven", long: "Venerdì" },
  { value: 6, short: "Sab", long: "Sabato" },
  { value: 7, short: "Dom", long: "Domenica" },
] as const;

export const ROLE_LABELS = { owner: "Titolare", manager: "Manager", staff: "Staff" } as const;

export function formatDateLong(date: string): string {
  return new Intl.DateTimeFormat("it-IT", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));
}

const collator = new Intl.Collator("it", { numeric: true, sensitivity: "base" });

/** "T2" before "T10": natural order for table and room names. */
export function byName<T extends { name: string }>(a: T, b: T): number {
  return collator.compare(a.name, b.name);
}
