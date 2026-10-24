import { invitations, memberships, passwordResets, restaurants, users, type Database } from "@restourant/db";
import { password as passwordRule, type AcceptInvitationInput } from "@restourant/shared";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import type { FastifyBaseLogger } from "fastify";
import { recordAudit } from "../../lib/audit.js";
import { AppError, invalid, unauthorized } from "../../lib/errors.js";
import { hashOneTimeToken, newOneTimeToken } from "../../lib/one-time-token.js";
import type { PasswordHasher } from "../../lib/passwords.js";
import type { AppDeps } from "../../types.js";
import { renderPasswordResetEmail } from "../notifications/account-email.template.js";

/** Reset links sent by email expire quickly. */
export const EMAIL_RESET_HOURS = 1;

const gone = (message: string) => new AppError(410, "link_expired", message);

type SessionUser = { id: string; email: string; fullName: string; sessionVersion: number };

const sessionUser = (u: typeof users.$inferSelect): SessionUser => ({
  id: u.id,
  email: u.email,
  fullName: u.fullName,
  sessionVersion: u.sessionVersion,
});

async function userByEmail(db: Database, email: string) {
  const [user] = await db
    .select()
    .from(users)
    .where(sql`lower(${users.email}) = ${email.toLowerCase()}`)
    .limit(1);
  return user;
}

function checkNewPassword(value: string) {
  const parsed = passwordRule.safeParse(value);
  if (!parsed.success) {
    throw invalid(parsed.error.issues[0]!.message, [
      { path: "password", message: parsed.error.issues[0]!.message },
    ]);
  }
}

// ---------------------------------------------------------------------------------------------
// Invitations
// ---------------------------------------------------------------------------------------------

async function findInvitation(db: Database, token: string) {
  const [row] = await db
    .select({
      id: invitations.id,
      restaurantId: invitations.restaurantId,
      restaurantName: restaurants.name,
      email: invitations.email,
      role: invitations.role,
      expiresAt: invitations.expiresAt,
      acceptedAt: invitations.acceptedAt,
    })
    .from(invitations)
    .innerJoin(restaurants, eq(restaurants.id, invitations.restaurantId))
    .where(eq(invitations.tokenHash, hashOneTimeToken(token)))
    .limit(1);
  return row;
}

/** What the invitation page shows before accepting. */
export async function getInvitation(db: Database, token: string, now: Date) {
  const invitation = await findInvitation(db, token);
  if (!invitation || invitation.acceptedAt || invitation.expiresAt <= now) {
    throw gone("Invito non valido o scaduto: chiedi un nuovo invito");
  }
  return {
    restaurantName: invitation.restaurantName,
    email: invitation.email,
    role: invitation.role,
    accountExists: Boolean(await userByEmail(db, invitation.email)),
  };
}

/**
 * Joins the restaurant. Someone new chooses name and password; someone who already has an account
 * (they work in another restaurant too) confirms with their password.
 */
export async function acceptInvitation(
  db: Database,
  passwords: PasswordHasher,
  token: string,
  input: AcceptInvitationInput,
  now: Date,
): Promise<{ user: SessionUser; restaurantId: string }> {
  const invitation = await findInvitation(db, token);
  if (!invitation || invitation.acceptedAt || invitation.expiresAt <= now) {
    throw gone("Invito non valido o scaduto: chiedi un nuovo invito");
  }

  const existing = await userByEmail(db, invitation.email);
  if (existing) {
    if (!(await passwords.verify(input.password, existing.passwordHash))) {
      throw unauthorized("Password non corretta: usa quella con cui accedi già");
    }
  } else {
    checkNewPassword(input.password);
    if (!input.fullName) throw invalid("Scrivi il tuo nome", [{ path: "fullName", message: "Obbligatorio" }]);
  }
  const passwordHash = existing ? null : await passwords.hash(input.password);

  const user = await db.transaction(async (tx) => {
    const [claimed] = await tx
      .update(invitations)
      .set({ acceptedAt: now })
      .where(and(eq(invitations.id, invitation.id), isNull(invitations.acceptedAt)))
      .returning({ id: invitations.id });
    if (!claimed) throw gone("Invito già usato");
    let account = existing;
    if (!account) {
      [account] = await tx
        .insert(users)
        .values({ email: invitation.email, passwordHash: passwordHash!, fullName: input.fullName! })
        .returning();
    }
    if (!account) throw new Error("User not created");
    await tx
      .insert(memberships)
      .values({ userId: account.id, restaurantId: invitation.restaurantId, role: invitation.role })
      .onConflictDoNothing();
    await recordAudit(
      { db: tx, restaurantId: invitation.restaurantId, actorUserId: account.id },
      { entity: "membership", entityId: account.id, action: "create", changes: { role: invitation.role } },
    );
    return account;
  });
  return { user: sessionUser(user), restaurantId: invitation.restaurantId };
}

// ---------------------------------------------------------------------------------------------
// Passwords
// ---------------------------------------------------------------------------------------------

/**
 * Emails a reset link when the address belongs to an account. The answer is the same either way, so
 * the form can't be used to find out who has an account.
 */
export async function forgotPassword(
  db: Database,
  deps: Pick<AppDeps, "mailer" | "publicUrl" | "now">,
  email: string,
  log: FastifyBaseLogger,
): Promise<void> {
  const user = await userByEmail(db, email);
  if (!user || !deps.mailer.enabled || !deps.publicUrl) return;
  const { token, hash } = newOneTimeToken();
  await db.insert(passwordResets).values({
    userId: user.id,
    tokenHash: hash,
    expiresAt: new Date(deps.now().getTime() + EMAIL_RESET_HOURS * 3_600_000),
  });
  try {
    await deps.mailer.send({
      to: user.email,
      ...renderPasswordResetEmail({
        fullName: user.fullName,
        url: `${deps.publicUrl}/reimposta-password/${token}`,
        hours: EMAIL_RESET_HOURS,
      }),
    });
  } catch (error) {
    log.warn({ err: error }, "Password reset email not sent");
  }
}

async function findReset(db: Database, token: string, now: Date) {
  const [row] = await db
    .select({ id: passwordResets.id, userId: passwordResets.userId, email: users.email })
    .from(passwordResets)
    .innerJoin(users, eq(users.id, passwordResets.userId))
    .where(
      and(
        eq(passwordResets.tokenHash, hashOneTimeToken(token)),
        isNull(passwordResets.usedAt),
        gt(passwordResets.expiresAt, now),
      ),
    )
    .limit(1);
  if (!row) throw gone("Link non valido o scaduto: chiedine uno nuovo");
  return row;
}

export async function getPasswordReset(db: Database, token: string, now: Date) {
  const reset = await findReset(db, token, now);
  return { email: reset.email };
}

/** Sets the new password and signs out every other session. */
export async function resetPassword(
  db: Database,
  passwords: PasswordHasher,
  token: string,
  newPassword: string,
  now: Date,
): Promise<SessionUser> {
  const reset = await findReset(db, token, now);
  const passwordHash = await passwords.hash(newPassword);
  return db.transaction(async (tx) => {
    const [used] = await tx
      .update(passwordResets)
      .set({ usedAt: now })
      .where(and(eq(passwordResets.id, reset.id), isNull(passwordResets.usedAt)))
      .returning({ id: passwordResets.id });
    if (!used) throw gone("Link già usato");
    const [user] = await tx
      .update(users)
      .set({ passwordHash, sessionVersion: sql`${users.sessionVersion} + 1` })
      .where(eq(users.id, reset.userId))
      .returning();
    return sessionUser(user!);
  });
}

export async function changePassword(
  db: Database,
  passwords: PasswordHasher,
  userId: string,
  input: { currentPassword: string; newPassword: string },
): Promise<SessionUser> {
  const [current] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!current || !(await passwords.verify(input.currentPassword, current.passwordHash))) {
    throw invalid("La password attuale non è corretta", [
      { path: "currentPassword", message: "Non corretta" },
    ]);
  }
  const [user] = await db
    .update(users)
    .set({
      passwordHash: await passwords.hash(input.newPassword),
      sessionVersion: sql`${users.sessionVersion} + 1`,
    })
    .where(eq(users.id, userId))
    .returning();
  return sessionUser(user!);
}
