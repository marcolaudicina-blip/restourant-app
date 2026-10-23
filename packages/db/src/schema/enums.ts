import {
  CONFIRMATION_MODES,
  EXCEPTION_KINDS,
  EXCEPTION_SCOPES,
  LARGE_PARTY_MODES,
  RESERVATION_CHANNELS,
  RESERVATION_STATUSES,
  ROLES,
  SEATING_MODES,
  SUPPORTED_LOCALES,
  TABLE_SHAPES,
} from "@restourant/shared";
import { pgEnum } from "drizzle-orm/pg-core";

export const roleEnum = pgEnum("role", ROLES);
export const localeEnum = pgEnum("locale", SUPPORTED_LOCALES);
export const confirmationModeEnum = pgEnum("confirmation_mode", CONFIRMATION_MODES);
export const largePartyModeEnum = pgEnum("large_party_mode", LARGE_PARTY_MODES);
export const tableShapeEnum = pgEnum("table_shape", TABLE_SHAPES);
export const seatingModeEnum = pgEnum("seating_mode", SEATING_MODES);
export const exceptionKindEnum = pgEnum("exception_kind", EXCEPTION_KINDS);
export const exceptionScopeEnum = pgEnum("exception_scope", EXCEPTION_SCOPES);
export const reservationStatusEnum = pgEnum("reservation_status", RESERVATION_STATUSES);
export const reservationChannelEnum = pgEnum("reservation_channel", RESERVATION_CHANNELS);
