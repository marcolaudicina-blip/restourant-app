import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { primaryId } from "./columns.js";
import { users } from "./identity.js";
import { restaurants } from "./restaurants.js";

/** Who changed what and when. Written by the API for every configuration change. */
export const auditLog = pgTable(
  "audit_log",
  {
    id: primaryId(),
    restaurantId: uuid()
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    actorUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    entity: text().notNull(),
    entityId: uuid(),
    action: text().notNull(),
    changes: jsonb(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index().on(t.restaurantId, t.createdAt)],
);
