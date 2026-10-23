import { sql } from "drizzle-orm";
import {
  customType,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { primaryId, timestamps } from "./columns.js";
import { restaurants } from "./restaurants.js";

const bytea = customType<{ data: Uint8Array; driverData: Uint8Array }>({ dataType: () => "bytea" });

/**
 * Pictures uploaded by a restaurant (logo, cover, gallery). They are small, already resized by the
 * web app, and served with long-lived cache headers: a new upload always gets a new id.
 */
export const media = pgTable(
  "media",
  {
    id: primaryId(),
    restaurantId: uuid()
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    contentType: text().notNull(),
    byteSize: integer().notNull(),
    data: bytea().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("media_id_restaurant_key").on(t.id, t.restaurantId), index().on(t.restaurantId)],
);

/** How the public booking page looks. Restaurants without a row use the defaults. */
export const bookingPages = pgTable(
  "booking_pages",
  {
    restaurantId: uuid()
      .primaryKey()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    brandColor: text().notNull(),
    description: text(),
    logoId: uuid(),
    coverId: uuid(),
    /** Gallery, in display order. Checked against `media` by the service. */
    photoIds: uuid()
      .array()
      .notNull()
      .default(sql`'{}'::uuid[]`),
    ...timestamps,
  },
  (t) => [
    foreignKey({ columns: [t.logoId, t.restaurantId], foreignColumns: [media.id, media.restaurantId] }),
    foreignKey({ columns: [t.coverId, t.restaurantId], foreignColumns: [media.id, media.restaurantId] }),
  ],
);
