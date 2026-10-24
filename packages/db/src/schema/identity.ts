import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
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
    /** Bumped when the password changes or is reset: sessions carrying an older version are refused. */
    sessionVersion: integer().notNull().default(0),
    /** Owners: when they accepted the Terms of service, and which version (TERMS_VERSION). */
    termsAcceptedAt: timestamp({ withTimezone: true }),
    termsVersion: text(),
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
    /** Temporary access of TwentyReserve support (platform admins), visible to the restaurant. */
    support: boolean().notNull().default(false),
    ...timestamps,
  },
  (t) => [primaryKey({ columns: [t.userId, t.restaurantId] }), index().on(t.restaurantId)],
);

/** An invitation to join a restaurant, accepted through a one-time link (only its hash is stored). */
export const invitations = pgTable(
  "invitations",
  {
    id: primaryId(),
    restaurantId: uuid()
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    email: text().notNull(),
    role: roleEnum().notNull(),
    tokenHash: text().notNull().unique(),
    invitedByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    acceptedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index().on(t.restaurantId)],
);

/** One-time links to choose a new password (only the hash is stored). */
export const passwordResets = pgTable(
  "password_resets",
  {
    id: primaryId(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text().notNull().unique(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    usedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index().on(t.userId)],
);
