import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  primaryKey,
  real,
  text,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { primaryId, timestamps } from "./columns.js";
import { tableShapeEnum } from "./enums.js";
import { restaurants } from "./restaurants.js";

/*
 * Every child row carries `restaurant_id` and references its parent through a composite
 * (id, restaurant_id) foreign key, so the database itself refuses links across tenants
 * (e.g. a table of restaurant A placed in a room of restaurant B).
 */

const restaurantRef = () =>
  uuid()
    .notNull()
    .references(() => restaurants.id, { onDelete: "cascade" });

export const rooms = pgTable(
  "rooms",
  {
    id: primaryId(),
    restaurantId: restaurantRef(),
    name: text().notNull(),
    sortOrder: integer().notNull().default(0),
    isActive: boolean().notNull().default(true),
    onlineBookable: boolean().notNull().default(true),
    guestSelectable: boolean().notNull().default(false),
    ...timestamps,
  },
  (t) => [unique().on(t.restaurantId, t.name), unique("rooms_id_restaurant_key").on(t.id, t.restaurantId)],
);

export const diningTables = pgTable(
  "tables",
  {
    id: primaryId(),
    restaurantId: restaurantRef(),
    roomId: uuid().notNull(),
    name: text().notNull(),
    minCovers: integer().notNull(),
    maxCovers: integer().notNull(),
    priority: integer().notNull().default(0),
    onlineBookable: boolean().notNull().default(true),
    /** Largest party online guests may book on this table; null: up to `maxCovers`. */
    onlineMaxCovers: integer(),
    combinationOnly: boolean().notNull().default(false),
    isActive: boolean().notNull().default(true),
    shape: tableShapeEnum().notNull().default("square"),
    posX: real().notNull().default(0),
    posY: real().notNull().default(0),
    width: real().notNull().default(2),
    height: real().notNull().default(2),
    rotation: real().notNull().default(0),
    ...timestamps,
  },
  (t) => [
    unique().on(t.restaurantId, t.name),
    unique("tables_id_restaurant_key").on(t.id, t.restaurantId),
    foreignKey({
      columns: [t.roomId, t.restaurantId],
      foreignColumns: [rooms.id, rooms.restaurantId],
    }).onDelete("cascade"),
    index().on(t.roomId),
    check("tables_covers_range", sql`${t.minCovers} >= 1 and ${t.minCovers} <= ${t.maxCovers}`),
    check(
      "tables_online_covers_range",
      sql`${t.onlineMaxCovers} is null or ${t.onlineMaxCovers} between ${t.minCovers} and ${t.maxCovers}`,
    ),
  ],
);

/** Undirected edge between two tables that can be pushed together. Stored with table_a_id < table_b_id. */
export const tableAdjacencies = pgTable(
  "table_adjacencies",
  {
    restaurantId: restaurantRef(),
    tableAId: uuid().notNull(),
    tableBId: uuid().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.tableAId, t.tableBId] }),
    foreignKey({
      columns: [t.tableAId, t.restaurantId],
      foreignColumns: [diningTables.id, diningTables.restaurantId],
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.tableBId, t.restaurantId],
      foreignColumns: [diningTables.id, diningTables.restaurantId],
    }).onDelete("cascade"),
    index().on(t.restaurantId),
    check("table_adjacencies_ordered", sql`${t.tableAId} < ${t.tableBId}`),
  ],
);

/** A predefined group of tables sold as one unit (e.g. "T7+T8" for 6-8 covers). */
export const tableCombinations = pgTable(
  "table_combinations",
  {
    id: primaryId(),
    restaurantId: restaurantRef(),
    name: text().notNull(),
    minCovers: integer().notNull(),
    maxCovers: integer().notNull(),
    priority: integer().notNull().default(0),
    onlineBookable: boolean().notNull().default(true),
    isActive: boolean().notNull().default(true),
    ...timestamps,
  },
  (t) => [
    unique().on(t.restaurantId, t.name),
    unique("table_combinations_id_restaurant_key").on(t.id, t.restaurantId),
    check("table_combinations_covers_range", sql`${t.minCovers} >= 1 and ${t.minCovers} <= ${t.maxCovers}`),
  ],
);

export const tableCombinationMembers = pgTable(
  "table_combination_members",
  {
    restaurantId: restaurantRef(),
    combinationId: uuid().notNull(),
    tableId: uuid().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.combinationId, t.tableId] }),
    foreignKey({
      columns: [t.combinationId, t.restaurantId],
      foreignColumns: [tableCombinations.id, tableCombinations.restaurantId],
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.tableId, t.restaurantId],
      foreignColumns: [diningTables.id, diningTables.restaurantId],
    }).onDelete("cascade"),
    index().on(t.tableId),
  ],
);
