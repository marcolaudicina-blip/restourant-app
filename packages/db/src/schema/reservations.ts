import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  time,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { primaryId, timestamps } from "./columns.js";
import { reservationChannelEnum, reservationStatusEnum } from "./enums.js";
import { diningTables, rooms } from "./floor.js";
import { users } from "./identity.js";
import { restaurants } from "./restaurants.js";
import { services } from "./scheduling.js";

/**
 * A booking. `date` + `start_time` are the local wall clock the guest booked; `starts_at` / `ends_at`
 * are the same stay as absolute instants, used for overlap checks.
 *
 * Services and tables referenced by reservations cannot be deleted (no cascade): history is kept and
 * the restaurant deactivates them instead.
 */
export const reservations = pgTable(
  "reservations",
  {
    id: primaryId(),
    restaurantId: uuid()
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    serviceId: uuid(),
    date: date({ mode: "string" }).notNull(),
    startTime: time().notNull(),
    startsAt: timestamp({ withTimezone: true }).notNull(),
    endsAt: timestamp({ withTimezone: true }).notNull(),
    durationMinutes: integer().notNull(),
    partySize: integer().notNull(),
    status: reservationStatusEnum().notNull(),
    channel: reservationChannelEnum().notNull(),
    guestName: text().notNull(),
    guestPhone: text(),
    guestEmail: text(),
    guestNote: text(),
    internalNote: text(),
    requestedRoomId: uuid().references(() => rooms.id, { onDelete: "set null" }),
    createdByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    seatedAt: timestamp({ withTimezone: true }),
    completedAt: timestamp({ withTimezone: true }),
    cancelledAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    unique("reservations_id_restaurant_key").on(t.id, t.restaurantId),
    foreignKey({
      columns: [t.serviceId, t.restaurantId],
      foreignColumns: [services.id, services.restaurantId],
    }),
    index().on(t.restaurantId, t.date),
    index().on(t.restaurantId, t.startsAt),
    check("reservations_party_size", sql`${t.partySize} >= 1`),
    check("reservations_window", sql`${t.endsAt} > ${t.startsAt}`),
  ],
);

/**
 * Tables held by a reservation. The stay window and `blocking` are copied from the reservation so
 * Postgres can enforce, with an exclusion constraint (see migration 0002), that no table is ever
 * held by two overlapping blocking reservations, even under concurrent writes.
 */
export const reservationTables = pgTable(
  "reservation_tables",
  {
    restaurantId: uuid()
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    reservationId: uuid().notNull(),
    tableId: uuid().notNull(),
    startsAt: timestamp({ withTimezone: true }).notNull(),
    endsAt: timestamp({ withTimezone: true }).notNull(),
    blocking: boolean().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.reservationId, t.tableId] }),
    foreignKey({
      columns: [t.reservationId, t.restaurantId],
      foreignColumns: [reservations.id, reservations.restaurantId],
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.tableId, t.restaurantId],
      foreignColumns: [diningTables.id, diningTables.restaurantId],
    }),
    index().on(t.tableId, t.startsAt),
  ],
);
