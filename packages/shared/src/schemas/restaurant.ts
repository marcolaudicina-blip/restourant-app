import { z } from "zod";
import { nonEmptyName, optionalText, timeZone } from "./common.js";

export const SUPPORTED_LOCALES = ["it", "en"] as const;

export const restaurantFields = z.object({
  name: nonEmptyName(120),
  timezone: timeZone,
  locale: z.enum(SUPPORTED_LOCALES),
  currency: z.string().regex(/^[A-Z]{3}$/, { message: "Valuta ISO 4217, es. EUR" }),
  phone: optionalText(40),
  email: z.email().nullable(),
  website: z.url().nullable(),
  addressLine: optionalText(200),
  city: optionalText(100),
  postalCode: optionalText(20),
  country: z.string().regex(/^[A-Z]{2}$/, { message: "Paese ISO 3166-1, es. IT" }),
});

export const restaurantUpdate = restaurantFields.partial();

export type RestaurantFields = z.infer<typeof restaurantFields>;
export type RestaurantUpdate = z.infer<typeof restaurantUpdate>;
