import type { Role } from "./schemas/auth.js";

export const PERMISSIONS = {
  /** Read rooms, tables, services and every other setting. */
  "config.read": ["owner", "manager", "staff"],
  /** Change the restaurant setup. */
  "config.write": ["owner", "manager"],
  /** See and manage reservations: everyone working the floor. */
  "reservations.read": ["owner", "manager", "staff"],
  "reservations.write": ["owner", "manager", "staff"],
  /** History of who changed what. */
  "audit.read": ["owner", "manager"],
  /** Restaurant profile, billing-relevant data. */
  "restaurant.write": ["owner"],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export function can(role: Role, permission: Permission): boolean {
  return (PERMISSIONS[permission] as readonly Role[]).includes(role);
}
