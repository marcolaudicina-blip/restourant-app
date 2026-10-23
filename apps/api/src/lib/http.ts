import { z } from "zod";

export const idParams = z.object({ id: z.uuid() });

/** Removes tenant plumbing from rows before they leave the API. */
export function withoutTenant<T extends { restaurantId: string }>(row: T): Omit<T, "restaurantId"> {
  const { restaurantId: _restaurantId, ...rest } = row;
  return rest;
}

/** Drops keys whose value is `undefined`, so a PATCH body never overwrites with "missing". */
export function definedOnly<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as Partial<T>;
}
