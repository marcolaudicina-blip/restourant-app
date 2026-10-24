import { z } from "zod";
import { dateString, id, nonEmptyName, optionalText, timeString, uniqueIds } from "./common.js";
import { partySize } from "./reservation.js";

/** The public booking page of a restaurant: its look and the address of the link. */

export const DEFAULT_BRAND_COLOR = "#1f7466";
export const MAX_GALLERY_PHOTOS = 8;

export const hexColor = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, { message: "Colore non valido, usa il formato #1F7466" })
  .transform((v) => v.toLowerCase());

/** Last part of the booking link, e.g. `trattoria-da-marco` in /prenota/trattoria-da-marco. */
export const slug = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, { message: "Almeno 3 caratteri" })
  .max(60)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: "Usa solo lettere minuscole, numeri e trattini (es. trattoria-da-marco)",
  });

export const bookingPageFields = z.object({
  slug,
  brandColor: hexColor,
  /** A few lines shown under the restaurant's name. */
  description: optionalText(600),
  /**
   * The restaurant's own words for guests who just booked (rules, delays, parking, deposit...):
   * shown on the confirmation screen and in the confirmation email.
   */
  confirmationNote: optionalText(2000),
  logoId: id.nullable(),
  coverId: id.nullable(),
  photoIds: uniqueIds.max(MAX_GALLERY_PHOTOS, { message: `Al massimo ${MAX_GALLERY_PHOTOS} foto` }),
});

export const bookingPageUpdate = bookingPageFields.partial();

export type BookingPageFields = z.infer<typeof bookingPageFields>;
export type BookingPageUpdate = z.infer<typeof bookingPageUpdate>;

// ---------------------------------------------------------------------------------------------
// Images
// ---------------------------------------------------------------------------------------------

export const MEDIA_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type MediaType = (typeof MEDIA_TYPES)[number];
/** The web app shrinks pictures before uploading them; this only stops oversized files. */
export const MAX_MEDIA_BYTES = 3 * 1024 * 1024;

/** An image as a data URL (`data:image/webp;base64,...`), so it travels as plain JSON. */
export const mediaUpload = z.object({
  dataUrl: z
    .string()
    .max(Math.ceil((MAX_MEDIA_BYTES * 4) / 3) + 100, { message: "Immagine troppo grande (max 3 MB)" })
    .regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/, {
      message: "Formato non supportato: usa JPG, PNG o WebP",
    }),
});

export type MediaUpload = z.infer<typeof mediaUpload>;

// ---------------------------------------------------------------------------------------------
// Bookings made by guests on the public page
// ---------------------------------------------------------------------------------------------

export const onlineReservationInput = z.object({
  date: dateString,
  time: timeString,
  partySize,
  guestName: nonEmptyName(120),
  guestPhone: z.string().trim().min(5, { message: "Numero di telefono non valido" }).max(40).nullable(),
  guestEmail: z.email({ message: "Email non valida" }).nullable(),
  guestNote: optionalText(1000),
  privacyAccepted: z.literal(true, { message: "Serve il consenso al trattamento dei dati" }),
  /** Hidden field that people never fill in: bots do, and their bookings are dropped. */
  website: z.string().max(200).optional(),
});

export type OnlineReservationInput = z.infer<typeof onlineReservationInput>;

/** A guest moving their own booking from the link in their email. */
export const guestBookingChangeInput = z.object({ date: dateString, time: timeString, partySize });

export type GuestBookingChangeInput = z.infer<typeof guestBookingChangeInput>;
