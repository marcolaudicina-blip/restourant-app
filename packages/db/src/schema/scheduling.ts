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
  smallint,
  text,
  time,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { primaryId, timestamps } from "./columns.js";
import { exceptionKindEnum, exceptionScopeEnum, seatingModeEnum } from "./enums.js";
import { diningTables, rooms } from "./floor.js";
import { restaurants } from "./restaurants.js";

const restaurantRef = () =>
  uuid()
    .notNull()
    .references(() => restaurants.id, { onDelete: "cascade" });

/** A bookable period such as "Pranzo" or "Cena". See `serviceFields` for semantics. */
export const services = pgTable(
  "services",
  {
    id: primaryId(),
    restaurantId: restaurantRef(),
    name: text().notNull(),
    daysOfWeek: smallint().array().notNull(),
    firstArrival: time().notNull(),
    lastArrival: time().notNull(),
    seatingMode: seatingModeEnum().notNull().default("continuous"),
    slotIntervalMinutes: integer(),
    fixedSeatings: time()
      .array()
      .notNull()
      .default(sql`'{}'::time[]`),
    validFrom: date({ mode: "string" }),
    validTo: date({ mode: "string" }),
    maxCovers: integer(),
    maxCoversPerSlot: integer(),
    maxBookingsPerSlot: integer(),
    onlineBookable: boolean().notNull().default(true),
    isActive: boolean().notNull().default(true),
    sortOrder: integer().notNull().default(0),
    ...timestamps,
  },
  (t) => [
    unique().on(t.restaurantId, t.name),
    unique("services_id_restaurant_key").on(t.id, t.restaurantId),
    check("services_arrival_window", sql`${t.lastArrival} >= ${t.firstArrival}`),
    check(
      "services_days_of_week",
      sql`cardinality(${t.daysOfWeek}) >= 1 and ${t.daysOfWeek} <@ array[1,2,3,4,5,6,7]::smallint[]`,
    ),
    check(
      "services_season",
      sql`${t.validFrom} is null or ${t.validTo} is null or ${t.validFrom} <= ${t.validTo}`,
    ),
  ],
);

/** Rooms a service is limited to. No rows means the service uses every room. */
export const serviceRooms = pgTable(
  "service_rooms",
  {
    restaurantId: restaurantRef(),
    serviceId: uuid().notNull(),
    roomId: uuid().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.serviceId, t.roomId] }),
    foreignKey({
      columns: [t.serviceId, t.restaurantId],
      foreignColumns: [services.id, services.restaurantId],
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.roomId, t.restaurantId],
      foreignColumns: [rooms.id, rooms.restaurantId],
    }).onDelete("cascade"),
  ],
);

export const durationRules = pgTable(
  "duration_rules",
  {
    id: primaryId(),
    restaurantId: restaurantRef(),
    serviceId: uuid(),
    roomId: uuid(),
    minParty: integer().notNull(),
    maxParty: integer().notNull(),
    durationMinutes: integer().notNull(),
    ...timestamps,
  },
  (t) => [
    index().on(t.restaurantId),
    foreignKey({
      columns: [t.serviceId, t.restaurantId],
      foreignColumns: [services.id, services.restaurantId],
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.roomId, t.restaurantId],
      foreignColumns: [rooms.id, rooms.restaurantId],
    }).onDelete("cascade"),
    check("duration_rules_party_range", sql`${t.minParty} >= 1 and ${t.minParty} <= ${t.maxParty}`),
    check("duration_rules_duration", sql`${t.durationMinutes} between 15 and 600`),
  ],
);

/** Holidays, closed services and special opening hours. See `calendarExceptionFields`. */
export const calendarExceptions = pgTable(
  "calendar_exceptions",
  {
    id: primaryId(),
    restaurantId: restaurantRef(),
    kind: exceptionKindEnum().notNull(),
    scope: exceptionScopeEnum().notNull().default("all"),
    dateFrom: date({ mode: "string" }).notNull(),
    dateTo: date({ mode: "string" }).notNull(),
    serviceId: uuid(),
    firstArrival: time(),
    lastArrival: time(),
    note: text(),
    ...timestamps,
  },
  (t) => [
    index().on(t.restaurantId, t.dateFrom, t.dateTo),
    foreignKey({
      columns: [t.serviceId, t.restaurantId],
      foreignColumns: [services.id, services.restaurantId],
    }).onDelete("cascade"),
    check("calendar_exceptions_dates", sql`${t.dateFrom} <= ${t.dateTo}`),
    check(
      "calendar_exceptions_special_hours",
      sql`${t.kind} <> 'special_hours' or (${t.serviceId} is not null and ${t.firstArrival} is not null and ${t.lastArrival} >= ${t.firstArrival})`,
    ),
  ],
);

/** Takes a table or a whole room out of service for a time window. */
export const tableBlocks = pgTable(
  "table_blocks",
  {
    id: primaryId(),
    restaurantId: restaurantRef(),
    tableId: uuid(),
    roomId: uuid(),
    startsAt: timestamp({ withTimezone: true }).notNull(),
    endsAt: timestamp({ withTimezone: true }).notNull(),
    onlineOnly: boolean().notNull().default(false),
    reason: text(),
    ...timestamps,
  },
  (t) => [
    index().on(t.restaurantId, t.startsAt),
    foreignKey({
      columns: [t.tableId, t.restaurantId],
      foreignColumns: [diningTables.id, diningTables.restaurantId],
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.roomId, t.restaurantId],
      foreignColumns: [rooms.id, rooms.restaurantId],
    }).onDelete("cascade"),
    check("table_blocks_target", sql`num_nonnulls(${t.tableId}, ${t.roomId}) = 1`),
    check("table_blocks_window", sql`${t.endsAt} > ${t.startsAt}`),
  ],
);
