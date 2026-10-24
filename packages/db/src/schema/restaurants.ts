import { sql } from "drizzle-orm";
import { boolean, check, integer, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { primaryId, timestamps } from "./columns.js";
import { confirmationModeEnum, largePartyModeEnum, localeEnum } from "./enums.js";

export const restaurants = pgTable("restaurants", {
  id: primaryId(),
  /** Public identifier used in booking page URLs. */
  slug: text().notNull().unique(),
  name: text().notNull(),
  timezone: text().notNull().default("Europe/Rome"),
  locale: localeEnum().notNull().default("it"),
  currency: text().notNull().default("EUR"),
  phone: text(),
  email: text(),
  website: text(),
  addressLine: text(),
  city: text(),
  postalCode: text(),
  country: text().notNull().default("IT"),
  ...timestamps,
});

/** Online booking rules, one row per restaurant. See `bookingPolicyFields` for semantics. */
export const bookingPolicies = pgTable(
  "booking_policies",
  {
    restaurantId: uuid()
      .primaryKey()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    onlineEnabled: boolean().notNull(),
    minPartyOnline: integer().notNull(),
    maxPartyOnline: integer().notNull(),
    largePartyMode: largePartyModeEnum().notNull(),
    minNoticeMinutes: integer().notNull(),
    maxAdvanceDays: integer().notNull(),
    confirmationMode: confirmationModeEnum().notNull(),
    autoConfirmMaxParty: integer(),
    guestCanCancel: boolean().notNull(),
    guestCanModify: boolean().notNull(),
    cancellationNoticeHours: integer().notNull(),
    slotIntervalMinutes: integer().notNull(),
    defaultDurationMinutes: integer().notNull(),
    requirePhone: boolean().notNull(),
    requireEmail: boolean().notNull(),
    policyText: text(),
    emailStaffBookings: boolean().notNull().default(true),
    sendReminders: boolean().notNull().default(true),
    ...timestamps,
  },
  (t) => [
    check("booking_policies_party_range", sql`${t.minPartyOnline} <= ${t.maxPartyOnline}`),
    check("booking_policies_contact_required", sql`${t.requirePhone} or ${t.requireEmail}`),
  ],
);
