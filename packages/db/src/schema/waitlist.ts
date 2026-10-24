import { sql } from "drizzle-orm";
import {
  check,
  date,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  time,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { primaryId, timestamps } from "./columns.js";
import { localeEnum, waitlistChannelEnum, waitlistStatusEnum } from "./enums.js";
import { users } from "./identity.js";
import { reservations } from "./reservations.js";
import { restaurants } from "./restaurants.js";

/** Guests waiting for a table on a full day (see `waitlistCreateInput` in packages/shared). */
export const waitlistEntries = pgTable(
  "waitlist_entries",
  {
    id: primaryId(),
    restaurantId: uuid()
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    date: date({ mode: "string" }).notNull(),
    partySize: integer().notNull(),
    /** Arrival window that suits the guest; null on both ends means any time. */
    timeFrom: time(),
    timeTo: time(),
    guestName: text().notNull(),
    guestPhone: text(),
    /** `normalizePhone(guestPhone)`: matched against new bookings of the day. */
    phoneNormalized: text(),
    guestEmail: text(),
    note: text(),
    channel: waitlistChannelEnum().notNull(),
    status: waitlistStatusEnum().notNull().default("waiting"),
    locale: localeEnum().notNull().default("it"),
    /** Last "a table is free" email. */
    notifiedAt: timestamp({ withTimezone: true }),
    /** The booking that took the guest off the list. */
    reservationId: uuid(),
    createdByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    foreignKey({
      columns: [t.reservationId, t.restaurantId],
      foreignColumns: [reservations.id, reservations.restaurantId],
    }).onDelete("set null"), // migration 0013 nulls only reservation_id
    index().on(t.restaurantId, t.date),
    index().on(t.restaurantId, t.updatedAt),
    check("waitlist_entries_party_size", sql`${t.partySize} >= 1`),
  ],
);
