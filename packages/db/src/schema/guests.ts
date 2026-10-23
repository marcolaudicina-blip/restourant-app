import { sql } from "drizzle-orm";
import { boolean, index, pgTable, text, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { primaryId, timestamps } from "./columns.js";
import { restaurants } from "./restaurants.js";

/**
 * A guest of one restaurant (guests are never shared between restaurants). Reservations are matched
 * to guests by normalized phone number, so the history builds up on its own as bookings come in.
 */
export const guests = pgTable(
  "guests",
  {
    id: primaryId(),
    restaurantId: uuid()
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    fullName: text().notNull(),
    phone: text(),
    /** `normalizePhone(phone)`: the matching key. */
    phoneNormalized: text(),
    email: text(),
    profileNote: text(),
    tags: text()
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    marketingConsent: boolean().notNull().default(false),
    ...timestamps,
  },
  (t) => [
    unique("guests_id_restaurant_key").on(t.id, t.restaurantId),
    uniqueIndex("guests_restaurant_phone_idx")
      .on(t.restaurantId, t.phoneNormalized)
      .where(sql`${t.phoneNormalized} is not null`),
    index("guests_restaurant_email_idx").on(t.restaurantId, sql`lower(${t.email})`),
    index("guests_restaurant_name_idx").on(t.restaurantId, sql`lower(${t.fullName})`),
  ],
);
