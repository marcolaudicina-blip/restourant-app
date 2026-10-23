"use client";

import { can, instantToLocal, type Permission, type Role } from "@restourant/shared";
import { createContext, useContext, type ReactNode } from "react";

export type RestaurantContextValue = {
  restaurantId: string;
  name: string;
  role: Role;
  timezone: string;
  /** API path prefix for this restaurant, e.g. "/restaurants/<id>". */
  base: string;
  can: (permission: Permission) => boolean;
  /** Today's date in the restaurant's time zone. */
  today: () => string;
};

const RestaurantContext = createContext<RestaurantContextValue | null>(null);

export function RestaurantProvider({
  restaurantId,
  name,
  role,
  timezone,
  children,
}: {
  restaurantId: string;
  name: string;
  role: Role;
  timezone: string;
  children: ReactNode;
}) {
  const value: RestaurantContextValue = {
    restaurantId,
    name,
    role,
    timezone,
    base: `/restaurants/${restaurantId}`,
    can: (permission) => can(role, permission),
    today: () => instantToLocal(new Date(), timezone).date,
  };
  return <RestaurantContext.Provider value={value}>{children}</RestaurantContext.Provider>;
}

export function useRestaurant(): RestaurantContextValue {
  const ctx = useContext(RestaurantContext);
  if (!ctx) throw new Error("useRestaurant must be used inside RestaurantProvider");
  return ctx;
}

const STORAGE_KEY = "rs_restaurant";

export function rememberedRestaurant(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function rememberRestaurant(id: string) {
  try {
    window.localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // Private mode or blocked storage: the first restaurant is used next time.
  }
}
