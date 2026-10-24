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

export type GuestStats = {
  visits: number;
  covers: number;
  noShows: number;
  cancellations: number;
  upcoming: number;
  lastVisit: string | null;
  nextBooking: string | null;
};

export type Guest = {
  id: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  profileNote: string | null;
  tags: string[];
  marketingConsent: boolean;
  createdAt: string;
  updatedAt: string;
  stats: GuestStats;
};

export type GuestDetail = Guest & { reservations: Reservation[] };

/** What the day views show about the guest of a booking. */
export type GuestSummary = {
  id: string;
  fullName: string;
  tags: string[];
  profileNote: string | null;
  visits: number;
  noShows: number;
};

export type Reservation = {
  id: string;
  serviceId: string | null;
  guestId: string | null;
  guest: GuestSummary | null;
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

// Public booking page --------------------------------------------------------------------------

export type BookingPageSettings = {
  slug: string;
  brandColor: string;
  description: string | null;
  /** Shown right after booking and in the confirmation email. */
  confirmationNote: string | null;
  logoId: string | null;
  coverId: string | null;
  photoIds: string[];
};

export type PublicProfile = {
  slug: string;
  name: string;
  phone: string | null;
  email: string | null;
  website: string | null;
  addressLine: string | null;
  city: string | null;
  postalCode: string | null;
  timezone: string;
  page: Omit<BookingPageSettings, "slug">;
  booking: {
    enabled: boolean;
    minParty: number;
    maxParty: number;
    largePartyMode: "request" | "phone_only";
    requirePhone: boolean;
    requireEmail: boolean;
    policyText: string | null;
    today: string;
    lastDate: string;
  };
};

export type PublicDay = { date: string; open: boolean };

export type PublicAvailability = {
  date: string;
  partySize: number;
  /** "request": large groups ask and the restaurant confirms. */
  mode: "book" | "request" | "closed";
  reason: string | null;
  message: string | null;
  services: { serviceId: string; name: string; times: string[] }[];
};

export type PublicBooking = {
  id: string;
  status: "confirmed" | "requested";
  date: string;
  time: string;
  partySize: number;
  durationMinutes: number;
  guestName: string;
  guestEmail: string | null;
  /** The summary email went out. */
  emailSent: boolean;
};

// Team -----------------------------------------------------------------------------------------

export type TeamMember = { userId: string; fullName: string; email: string; role: Role; since: string };
export type PendingInvitation = {
  id: string;
  email: string;
  role: Exclude<Role, "owner">;
  expiresAt: string;
  createdAt: string;
};
export type Team = { members: TeamMember[]; invitations: PendingInvitation[] };
