import {
  addDays,
  buildSeatingOptions,
  computeSlotAvailability,
  indexBusy,
  instantToLocal,
  type Channel,
  type SeatingOption,
  type SlotUnavailableReason,
} from "@restourant/shared";
import type { TenantContext } from "../../lib/context.js";
import type { Service } from "../services/services.service.js";
import { loadFloorContext, type FloorContext } from "./floor-context.js";

export type AvailabilityQuery = {
  date: string;
  partySize: number;
  channel: Channel;
  roomId?: string;
};

/** Reasons that close a whole day for online guests, before looking at tables. */
export type OnlineDayReason =
  "online_disabled" | "past" | "too_far" | "party_too_small" | "large_party_request" | "large_party_phone";

export function seatingOptions(
  floor: FloorContext,
  service: Service | null,
  partySize: number,
  channel: Channel,
  roomId?: string | null,
): SeatingOption[] {
  return buildSeatingOptions({
    partySize,
    channel,
    tables: floor.tables,
    rooms: floor.rooms,
    adjacencies: floor.adjacencies,
    combinations: floor.combinations,
    allowedRoomIds: service?.roomIds ?? [],
    roomId: roomId ?? null,
  });
}

function onlineDayReason(floor: FloorContext, query: AvailabilityQuery, now: Date): OnlineDayReason | null {
  const policy = floor.policy;
  if (!policy.onlineEnabled) return "online_disabled";
  const today = instantToLocal(now, floor.timezone).date;
  if (query.date < today) return "past";
  if (query.date > addDays(today, policy.maxAdvanceDays)) return "too_far";
  if (query.partySize < policy.minPartyOnline) return "party_too_small";
  if (query.partySize > policy.maxPartyOnline) {
    return policy.largePartyMode === "request" ? "large_party_request" : "large_party_phone";
  }
  return null;
}

export function computeAvailability(floor: FloorContext, query: AvailabilityQuery, now: Date) {
  const dayReason = query.channel === "online" ? onlineDayReason(floor, query, now) : null;
  const busy = indexBusy(floor.busy, query.channel);
  const notBefore =
    query.channel === "online"
      ? floor.toMinutes(new Date(now.getTime() + floor.policy.minNoticeMinutes * 60_000))
      : null;

  const services = floor.schedule(query.channel).map((day) => {
    const base = {
      serviceId: day.serviceId,
      name: day.name,
      firstArrival: day.firstArrival,
      lastArrival: day.lastArrival,
    };
    // For guests, "bookings for this date aren't open" explains more than "closed on Mondays".
    if (dayReason) return { ...base, status: "closed" as const, reason: dayReason, note: null, slots: [] };
    if (day.status === "closed")
      return { ...base, status: "closed" as const, reason: day.reason, note: day.note, slots: [] };

    const service = floor.serviceById(day.serviceId)!;
    const slots = computeSlotAvailability({
      slots: day.slots,
      options: seatingOptions(floor, service, query.partySize, query.channel, query.roomId),
      partySize: query.partySize,
      durationFor: floor.durationFor(query.partySize, service.id),
      busy,
      load: floor.loadByService.get(service.id) ?? [],
      pacing: service,
      slotIntervalMinutes: service.slotIntervalMinutes ?? floor.policy.slotIntervalMinutes,
      notBefore,
    });
    return { ...base, status: "open" as const, reason: null, note: null, slots };
  });

  return { date: query.date, partySize: query.partySize, channel: query.channel, services };
}

export async function getAvailability(ctx: TenantContext, query: AvailabilityQuery, now: Date) {
  return computeAvailability(await loadFloorContext(ctx, query.date), query, now);
}

export const SLOT_REASON_MESSAGES: Record<SlotUnavailableReason, string> = {
  too_soon: "Troppo vicino all'orario attuale",
  no_suitable_table: "Nessun tavolo adatto a questo numero di persone",
  service_full: "Il servizio ha raggiunto il numero massimo di coperti",
  pacing_covers: "Troppi coperti in arrivo in questa fascia oraria",
  pacing_bookings: "Troppe prenotazioni in arrivo in questa fascia oraria",
  tables_taken: "Tutti i tavoli adatti sono occupati",
};
