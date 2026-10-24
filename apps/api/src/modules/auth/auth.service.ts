import { bookingPolicies, memberships, restaurants, users, type Database } from "@restourant/db";
import { DEFAULT_BOOKING_POLICY, type LoginInput, type RegisterInput, type Role } from "@restourant/shared";
import { eq, sql } from "drizzle-orm";
import { conflict, pgConstraint, pgErrorCode, PG_UNIQUE_VIOLATION, unauthorized } from "../../lib/errors.js";
import type { PasswordHasher } from "../../lib/passwords.js";
import { slugify } from "../../lib/slug.js";

export type PublicUser = { id: string; email: string; fullName: string };
export type MembershipSummary = {
  restaurantId: string;
  restaurantName: string;
  slug: string;
  role: Role;
  /** Temporary access of TwentyReserve support. */
  support: boolean;
};

const toPublicUser = (u: typeof users.$inferSelect): PublicUser => ({
  id: u.id,
  email: u.email,
  fullName: u.fullName,
});

async function uniqueSlug(db: Database, name: string): Promise<string> {
  const base = slugify(name);
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = attempt === 0 ? base : `${base}-${Math.random().toString(36).slice(2, 6)}`;
    const [taken] = await db
      .select({ id: restaurants.id })
      .from(restaurants)
      .where(eq(restaurants.slug, candidate))
      .limit(1);
    if (!taken) return candidate;
  }
  return `${base}-${crypto.randomUUID().slice(0, 8)}`;
}

/** Creates the owner account together with its first restaurant and default booking rules. */
export async function register(db: Database, passwords: PasswordHasher, input: RegisterInput) {
  const passwordHash = await passwords.hash(input.password);
  const slug = await uniqueSlug(db, input.restaurantName);

  try {
    return await db.transaction(async (tx) => {
      const [user] = await tx
        .insert(users)
        .values({ email: input.email, passwordHash, fullName: input.fullName })
        .returning();
      const [restaurant] = await tx
        .insert(restaurants)
        .values({ slug, name: input.restaurantName })
        .returning();
      await tx.insert(bookingPolicies).values({ restaurantId: restaurant!.id, ...DEFAULT_BOOKING_POLICY });
      await tx.insert(memberships).values({ userId: user!.id, restaurantId: restaurant!.id, role: "owner" });
      return { user: toPublicUser(user!), restaurantId: restaurant!.id };
    });
  } catch (error) {
    if (pgErrorCode(error) === PG_UNIQUE_VIOLATION && pgConstraint(error) === "users_email_lower_idx") {
      throw conflict("email_taken", "Esiste già un account con questa email");
    }
    throw error;
  }
}

export async function login(
  db: Database,
  passwords: PasswordHasher,
  input: LoginInput,
): Promise<PublicUser & { sessionVersion: number }> {
  const [user] = await db
    .select()
    .from(users)
    .where(sql`lower(${users.email}) = ${input.email}`)
    .limit(1);
  const ok = await passwords.verify(input.password, user?.passwordHash ?? passwords.dummyHash);
  if (!user || !ok) throw unauthorized("Email o password non corretti");
  return { ...toPublicUser(user), sessionVersion: user.sessionVersion };
}

export async function getProfile(db: Database, userId: string) {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw unauthorized("Account non più esistente");
  const rows = await db
    .select({
      restaurantId: memberships.restaurantId,
      role: memberships.role,
      support: memberships.support,
      restaurantName: restaurants.name,
      slug: restaurants.slug,
    })
    .from(memberships)
    .innerJoin(restaurants, eq(restaurants.id, memberships.restaurantId))
    .where(eq(memberships.userId, userId))
    .orderBy(restaurants.name);
  return { user: toPublicUser(user), memberships: rows satisfies MembershipSummary[] };
}
