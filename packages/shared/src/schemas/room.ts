import { z } from "zod";
import { nonEmptyName } from "./common.js";

export const roomFields = z.object({
  name: nonEmptyName(60),
  sortOrder: z.number().int().min(0).max(1000),
  /** Inactive rooms (e.g. a terrace in winter) disappear from service and online booking. */
  isActive: z.boolean(),
  /** Tables in this room can be assigned to online bookings. */
  onlineBookable: z.boolean(),
  /** The guest can explicitly ask for this room on the booking page ("Terrazza"). */
  guestSelectable: z.boolean(),
});

export const roomDefaults = {
  sortOrder: 0,
  isActive: true,
  onlineBookable: true,
  guestSelectable: false,
} as const satisfies Partial<z.infer<typeof roomFields>>;

export const roomCreateInput = roomFields.partial({
  sortOrder: true,
  isActive: true,
  onlineBookable: true,
  guestSelectable: true,
});
export const room = roomFields;
export const roomUpdate = roomFields.partial();

export type RoomFields = z.infer<typeof roomFields>;
export type RoomCreateInput = z.infer<typeof roomCreateInput>;
export type RoomUpdate = z.infer<typeof roomUpdate>;
