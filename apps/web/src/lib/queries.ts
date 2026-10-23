"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import { useRestaurant } from "./restaurant";
import type { Availability, ConfigSnapshot, Me, Reservation, Template } from "./types";

export const keys = {
  me: ["me"] as const,
  config: (rid: string) => ["config", rid] as const,
  reservations: (rid: string, date: string) => ["reservations", rid, date] as const,
  availability: (rid: string, date: string, partySize: number, channel: string) =>
    ["availability", rid, date, partySize, channel] as const,
};

export function useMe() {
  return useQuery({ queryKey: keys.me, queryFn: () => api<Me>("/auth/me") });
}

export function useConfig() {
  const { restaurantId, base } = useRestaurant();
  return useQuery({
    queryKey: keys.config(restaurantId),
    queryFn: () => api<ConfigSnapshot>(`${base}/config`),
  });
}

/** Reservations of a day. Refreshed every 20 seconds so every device in the room stays in sync. */
export function useReservations(date: string) {
  const { restaurantId, base } = useRestaurant();
  return useQuery({
    queryKey: keys.reservations(restaurantId, date),
    queryFn: () => api<Reservation[]>(`${base}/reservations?date=${date}`),
    refetchInterval: 20_000,
  });
}

export function useAvailability(
  date: string,
  partySize: number,
  channel: "staff" | "online" = "staff",
  enabled = true,
) {
  const { restaurantId, base } = useRestaurant();
  return useQuery({
    queryKey: keys.availability(restaurantId, date, partySize, channel),
    queryFn: () =>
      api<Availability>(`${base}/availability?date=${date}&partySize=${partySize}&channel=${channel}`),
    enabled: enabled && partySize > 0,
    staleTime: 5_000,
  });
}

export function useTemplates() {
  return useQuery({ queryKey: ["templates"], queryFn: () => api<Template[]>("/templates") });
}

/**
 * Mutation against the current restaurant that refreshes what it may have changed.
 * `invalidate` lists the query families to refresh: "config", "reservations", "availability", "restaurant".
 */
export function useRestaurantMutation<TVars, TResult = unknown>(
  request: (base: string, vars: TVars) => Promise<TResult>,
  invalidate: ("config" | "reservations" | "availability" | "restaurant")[] = ["config"],
) {
  const { base, restaurantId } = useRestaurant();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: TVars) => request(base, vars),
    onSettled: () =>
      Promise.all(
        invalidate.map((family) => queryClient.invalidateQueries({ queryKey: [family, restaurantId] })),
      ),
  });
}
