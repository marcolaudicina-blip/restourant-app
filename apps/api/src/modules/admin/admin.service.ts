import {
  auditLog,
  bookingPolicies,
  memberships,
  reservations,
  restaurants,
  users,
  type Database,
} from "@restourant/db";
import { addDays, instantToLocal } from "@restourant/shared";
import { and, count, desc, eq, gte, inArray, max, sql } from "drizzle-orm";
import type { FastifyRequest } from "fastify";
import { recordAudit } from "../../lib/audit.js";
import { inTransaction } from "../../lib/context.js";
import { conflict, notFound } from "../../lib/errors.js";
import { authenticate } from "../../plugins/auth.js";

/*
 * The platform admin: TwentyReserve staff (PLATFORM_ADMIN_EMAILS) see every restaurant on the
 * platform, how much it is used, and can open a restaurant as support. Support access is an ordinary
 * membership flagged `support`, so the restaurant sees it in its team and in its audit log.
 */

/** Free trial shown on the site (keep in sync with apps/web/src/lib/site.ts). */
const TRIAL_DAYS = 30;

export function isPlatformAdmin(admins: readonly string[], email: string) {
  return admins.includes(email.trim().toLowerCase());
}

/** Signed in and listed in PLATFORM_ADMIN_EMAILS; anyone else gets 404, as if /admin didn't exist. */
export async function requirePlatformAdmin(request: FastifyRequest) {
  const { userId } = await authenticate(request);
  const [user] = await request.server.deps.db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user || !isPlatformAdmin(request.server.deps.platformAdmins, user.email)) throw notFound("Pagina");
  return userId;
}

const ACTIVE = ["requested", "confirmed", "arrived", "seated"] as const;

export async function getOverview(db: Database, now: Date) {
  const monthAgo = new Date(now.getTime() - 30 * 86_400_000);
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000);
  const [[r], [rWeek], [u], [b], [bOnline]] = await Promise.all([
    db.select({ n: count() }).from(restaurants),
    db.select({ n: count() }).from(restaurants).where(gte(restaurants.createdAt, weekAgo)),
    db.select({ n: count() }).from(users),
    db.select({ n: count() }).from(reservations).where(gte(reservations.createdAt, monthAgo)),
    db
      .select({ n: count() })
      .from(reservations)
      .where(and(gte(reservations.createdAt, monthAgo), eq(reservations.channel, "online"))),
  ]);
  return {
    restaurants: r!.n,
    newThisWeek: rWeek!.n,
    users: u!.n,
    bookingsLast30Days: b!.n,
    onlineLast30Days: bOnline!.n,
  };
}

export async function listRestaurants(db: Database, now: Date) {
  const monthAgo = new Date(now.getTime() - 30 * 86_400_000);
  const rows = await db
    .select({
      id: restaurants.id,
      name: restaurants.name,
      slug: restaurants.slug,
      city: restaurants.city,
      timezone: restaurants.timezone,
      createdAt: restaurants.createdAt,
      onlineEnabled: bookingPolicies.onlineEnabled,
    })
    .from(restaurants)
    .leftJoin(bookingPolicies, eq(bookingPolicies.restaurantId, restaurants.id))
    .orderBy(desc(restaurants.createdAt));
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);

  const [owners, staff, recent, activity] = await Promise.all([
    db
      .select({ restaurantId: memberships.restaurantId, fullName: users.fullName, email: users.email })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(and(inArray(memberships.restaurantId, ids), eq(memberships.role, "owner"))),
    db
      .select({ restaurantId: memberships.restaurantId, n: count() })
      .from(memberships)
      .where(and(inArray(memberships.restaurantId, ids), eq(memberships.support, false)))
      .groupBy(memberships.restaurantId),
    db
      .select({
        restaurantId: reservations.restaurantId,
        total: count(),
        online: sql<number>`count(*) filter (where ${reservations.channel} = 'online')`.mapWith(Number),
      })
      .from(reservations)
      .where(and(inArray(reservations.restaurantId, ids), gte(reservations.createdAt, monthAgo)))
      .groupBy(reservations.restaurantId),
    db
      .select({ restaurantId: auditLog.restaurantId, at: max(auditLog.createdAt) })
      .from(auditLog)
      .where(inArray(auditLog.restaurantId, ids))
      .groupBy(auditLog.restaurantId),
  ]);
  const byRestaurant = <T extends { restaurantId: string }>(list: T[]) =>
    new Map(list.map((x) => [x.restaurantId, x]));
  const ownerOf = byRestaurant(owners);
  const staffOf = byRestaurant(staff);
  const recentOf = byRestaurant(recent);
  const activityOf = byRestaurant(activity);

  return rows.map((r) => {
    const days = Math.max(0, Math.floor((now.getTime() - r.createdAt.getTime()) / 86_400_000));
    return {
      id: r.id,
      name: r.name,
      slug: r.slug,
      city: r.city,
      createdAt: r.createdAt.toISOString(),
      onlineEnabled: r.onlineEnabled ?? false,
      owner: ownerOf.get(r.id)
        ? { fullName: ownerOf.get(r.id)!.fullName, email: ownerOf.get(r.id)!.email }
        : null,
      members: staffOf.get(r.id)?.n ?? 0,
      bookingsLast30Days: recentOf.get(r.id)?.total ?? 0,
      onlineLast30Days: recentOf.get(r.id)?.online ?? 0,
      lastActivityAt: activityOf.get(r.id)?.at?.toISOString() ?? null,
      /** Days left in the free trial, or a negative number of days since it ended. */
      trialDaysLeft: TRIAL_DAYS - days,
    };
  });
}

export async function getRestaurantDetail(db: Database, id: string, adminUserId: string, now: Date) {
  const [restaurant] = await db.select().from(restaurants).where(eq(restaurants.id, id)).limit(1);
  if (!restaurant) throw notFound("Ristorante");
  const today = instantToLocal(now, restaurant.timezone).date;
  const [members, log, [upcoming]] = await Promise.all([
    db
      .select({
        userId: users.id,
        fullName: users.fullName,
        email: users.email,
        role: memberships.role,
        support: memberships.support,
        since: memberships.createdAt,
      })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(eq(memberships.restaurantId, id)),
    db
      .select({
        entity: auditLog.entity,
        action: auditLog.action,
        createdAt: auditLog.createdAt,
        actor: users.fullName,
      })
      .from(auditLog)
      .leftJoin(users, eq(users.id, auditLog.actorUserId))
      .where(eq(auditLog.restaurantId, id))
      .orderBy(desc(auditLog.createdAt))
      .limit(25),
    db
      .select({ n: count() })
      .from(reservations)
      .where(
        and(
          eq(reservations.restaurantId, id),
          gte(reservations.date, today),
          sql`${reservations.date} <= ${addDays(today, 30)}`,
          inArray(reservations.status, [...ACTIVE]),
        ),
      ),
  ]);
  return {
    id: restaurant.id,
    name: restaurant.name,
    slug: restaurant.slug,
    email: restaurant.email,
    phone: restaurant.phone,
    city: restaurant.city,
    createdAt: restaurant.createdAt.toISOString(),
    upcomingBookings: upcoming!.n,
    members: members.map((m) => ({ ...m, since: m.since.toISOString() })),
    supportActive: members.some((m) => m.userId === adminUserId),
    recentActivity: log.map((e) => ({ ...e, createdAt: e.createdAt.toISOString() })),
  };
}

/**
 * Opens the restaurant to the admin as support: a manager membership flagged `support`, recorded in
 * the restaurant's own audit log. Admins who are already real members keep their role.
 */
export async function startSupport(db: Database, restaurantId: string, adminUserId: string) {
  const [restaurant] = await db
    .select({ id: restaurants.id })
    .from(restaurants)
    .where(eq(restaurants.id, restaurantId))
    .limit(1);
  if (!restaurant) throw notFound("Ristorante");
  const ctx = { db, restaurantId, actorUserId: adminUserId };
  await inTransaction(ctx, async (tx) => {
    const [existing] = await tx.db
      .select({ support: memberships.support })
      .from(memberships)
      .where(and(eq(memberships.restaurantId, restaurantId), eq(memberships.userId, adminUserId)))
      .limit(1);
    if (existing) return;
    await tx.db
      .insert(memberships)
      .values({ userId: adminUserId, restaurantId, role: "manager", support: true });
    await recordAudit(tx, { entity: "support_access", action: "create", changes: { by: "twentyreserve" } });
  });
}

export async function endSupport(db: Database, restaurantId: string, adminUserId: string) {
  const ctx = { db, restaurantId, actorUserId: adminUserId };
  await inTransaction(ctx, async (tx) => {
    const removed = await tx.db
      .delete(memberships)
      .where(
        and(
          eq(memberships.restaurantId, restaurantId),
          eq(memberships.userId, adminUserId),
          eq(memberships.support, true),
        ),
      )
      .returning({ userId: memberships.userId });
    if (removed.length === 0)
      throw conflict("not_support", "Non sei entrato come assistenza in questo ristorante");
    await recordAudit(tx, { entity: "support_access", action: "delete", changes: { by: "twentyreserve" } });
  });
}
