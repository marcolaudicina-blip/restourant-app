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
  memberships: { restaurantId: string; restaurantName: string; slug: string; role: Role; support: boolean }[];
  /** TwentyReserve staff: sees /admin. */
  platformAdmin: boolean;
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
  locale: "it" | "en";
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
  services: {
    serviceId: string;
    name: string;
    times: string[];
    firstTime?: string | null;
    lastTime?: string | null;
  }[];
  /** The day is full and guests may join its waiting list. */
  waitlist?: boolean;
};

export type PublicWaitlistEntry = {
  id: string;
  date: string;
  partySize: number;
  timeFrom: string | null;
  timeTo: string | null;
  guestEmail: string | null;
  emailSent: boolean;
};

export type WaitlistEntry = {
  id: string;
  date: string;
  partySize: number;
  timeFrom: string | null;
  timeTo: string | null;
  guestName: string;
  guestPhone: string | null;
  guestEmail: string | null;
  note: string | null;
  channel: "staff" | "online";
  status: "waiting" | "notified" | "booked" | "removed";
  locale: "it" | "en";
  notifiedAt: string | null;
  reservationId: string | null;
  createdAt: string;
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

/** A guest's own booking, opened from the link in their emails. */
export type GuestBookingView = {
  restaurant: PublicProfile;
  booking: {
    date: string;
    time: string;
    partySize: number;
    durationMinutes: number;
    guestName: string;
    guestNote: string | null;
    status: ReservationStatus;
    locale: "it" | "en";
  };
  canCancel: boolean;
  canModify: boolean;
  /** Until when changes are possible online (ISO instant). */
  deadline: string;
  /** Why nothing can be done online, when that is the case. */
  message: string | null;
  reason: "cancelled" | "over" | "contact" | "too_late" | null;
};

// Team -----------------------------------------------------------------------------------------

export type TeamMember = {
  userId: string;
  fullName: string;
  email: string;
  role: Role;
  /** TwentyReserve support, in for assistance. */
  support: boolean;
  since: string;
};
export type PendingInvitation = {
  id: string;
  email: string;
  role: Exclude<Role, "owner">;
  expiresAt: string;
  createdAt: string;
};
export type Team = { members: TeamMember[]; invitations: PendingInvitation[] };

// Activity -------------------------------------------------------------------------------------

export type ActivityBrief = {
  id: string;
  guestName: string;
  partySize: number;
  date: string;
  time: string;
  status: ReservationStatus;
};

export type Activity = {
  serverTime: string;
  lastChangeAt: string | null;
  newOnline: ActivityBrief[];
  pendingRequests: ActivityBrief[];
  /** Bookings guests moved or cancelled themselves from the link in their emails. */
  guestChanges: (ActivityBrief & { kind: "cancelled" | "updated" })[];
  /** Guests who joined a waiting list from the booking page. */
  newWaitlist?: { id: string; guestName: string; partySize: number; date: string }[];
};

// Platform admin ----------------------------------------------------------------------------------

export type AdminOverview = {
  restaurants: number;
  newThisWeek: number;
  users: number;
  bookingsLast30Days: number;
  onlineLast30Days: number;
};

export type AdminRestaurant = {
  id: string;
  name: string;
  slug: string;
  city: string | null;
  createdAt: string;
  onlineEnabled: boolean;
  owner: { fullName: string; email: string } | null;
  members: number;
  bookingsLast30Days: number;
  onlineLast30Days: number;
  lastActivityAt: string | null;
  trialDaysLeft: number;
};

export type AdminRestaurantDetail = {
  id: string;
  name: string;
  slug: string;
  email: string | null;
  phone: string | null;
  city: string | null;
  createdAt: string;
  upcomingBookings: number;
  members: { userId: string; fullName: string; email: string; role: Role; support: boolean; since: string }[];
  supportActive: boolean;
  recentActivity: { entity: string; action: string; createdAt: string; actor: string | null }[];
};
