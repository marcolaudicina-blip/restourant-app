import { z } from "zod";
import { nonEmptyName, optionalText } from "./common.js";

export const guestTag = z.string().trim().min(1).max(30);

export const guestFields = z.object({
  fullName: nonEmptyName(120),
  phone: z.string().trim().min(5).max(40).nullable(),
  email: z.email().nullable(),
  /** Permanent notes shown on every booking: allergies, preferences, favourite table. */
  profileNote: optionalText(2000),
  tags: z
    .array(guestTag)
    .max(20)
    .refine((tags) => new Set(tags.map((t) => t.toLowerCase())).size === tags.length, {
      message: "Etichette duplicate",
    }),
  marketingConsent: z.boolean(),
});

export const guestDefaults = {
  phone: null,
  email: null,
  profileNote: null,
  tags: [],
  marketingConsent: false,
} as const satisfies Partial<z.infer<typeof guestFields>>;

export const guestCreateInput = guestFields.partial({
  phone: true,
  email: true,
  profileNote: true,
  tags: true,
  marketingConsent: true,
});
export const guest = guestFields;
export const guestUpdate = guestFields.partial();

/** Suggested labels in the UI; restaurants can type their own. */
export const SUGGESTED_GUEST_TAGS = [
  "VIP",
  "Abituale",
  "Allergie",
  "Celiaco",
  "Vegetariano",
  "Compleanno",
] as const;

export type GuestFields = z.infer<typeof guestFields>;
export type GuestCreateInput = z.infer<typeof guestCreateInput>;
export type GuestUpdate = z.infer<typeof guestUpdate>;
