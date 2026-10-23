import { sql } from "drizzle-orm";
import { index, pgTable, primaryKey, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { primaryId, timestamps } from "./columns.js";
import { roleEnum } from "./enums.js";
import { restaurants } from "./restaurants.js";

export const users = pgTable(
  "users",
  {
    id: primaryId(),
    email: text().notNull(),
    passwordHash: text().notNull(),
    fullName: text().notNull(),
    ...timestamps,
  },
  (t) => [uniqueIndex("users_email_lower_idx").on(sql`lower(${t.email})`)],
);

/** A user's role in a restaurant. One account can work in several restaurants. */
export const memberships = pgTable(
  "memberships",
  {
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    restaurantId: uuid()
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    role: roleEnum().notNull(),
    ...timestamps,
  },
  (t) => [primaryKey({ columns: [t.userId, t.restaurantId] }), index().on(t.restaurantId)],
);
