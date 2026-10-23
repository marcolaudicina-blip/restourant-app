import type {
  BookingPolicy,
  CalendarExceptionFields,
  CombinationFields,
  DurationRuleFields,
  ReservationChannel,
  ReservationStatus,
  RestaurantFields,
  Role,
  RoomFields,
  SeatingOption,
  ServiceFields,
  SlotUnavailableReason,
  TableFields,
} from "@restourant/shared";

/* Shapes returned by the API. Field definitions come from @restourant/shared. */

type Row = { id: string; createdAt: string; updatedAt: string };

export type Me = {
  user: { id: string; email: string; fullName: string };
  memberships: { restaurantId: string; restaurantName: string; slug: string; role: Role }[];
};

export type Restaurant = RestaurantFields & Row & { slug: string };
export type Room = RoomFields & Row;
export type Table = TableFields & Row;
export type Combination = CombinationFields & Row;
export type Service = ServiceFields & Row;
export type DurationRule = DurationRuleFields & Row;
export type CalendarException = CalendarExceptionFields & Row;
export type { BookingPolicy };

export type ConfigSnapshot = {
  restaurant: Restaurant;
  bookingPolicy: BookingPolicy & { updatedAt: string };
  rooms: Room[];
  tables: Table[];
  tableAdjacencies: { tableAId: string; tableBId: string }[];
  combinations: Combination[];
  services: Service[];
  durationRules: DurationRule[];
  calendarExceptions: CalendarException[];
};

export type Reservation = {
  id: string;
  serviceId: string | null;
  date: string;
  time: string;
  startsAt: string;
  endsAt: string;
  durationMinutes: number;
  partySize: number;
  status: ReservationStatus;
  channel: ReservationChannel;
  guestName: string;
  guestPhone: string | null;
  guestEmail: string | null;
  guestNote: string | null;
  internalNote: string | null;
  requestedRoomId: string | null;
  tables: { id: string; name: string }[];
  tableIds: string[];
  seatedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
};

export type SlotAvailability = {
  time: string;
  available: boolean;
  reason: SlotUnavailableReason | null;
  option: SeatingOption | null;
  durationMinutes: number | null;
};

export type ServiceAvailability = {
  serviceId: string;
  name: string;
  firstArrival: string;
  lastArrival: string;
  status: "open" | "closed";
  reason: string | null;
  note: string | null;
  slots: SlotAvailability[];
};

export type Availability = { date: string; partySize: number; services: ServiceAvailability[] };

export type Template = {
  key: string;
  name: string;
  description: string;
  summary: { rooms: number; tables: number; covers: number; services: string[] };
};
