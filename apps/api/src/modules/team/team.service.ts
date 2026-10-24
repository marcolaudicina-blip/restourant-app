import { invitations, memberships, passwordResets, restaurants, users } from "@restourant/db";
import type { InvitationInput, InvitableRole, Role } from "@restourant/shared";
import { and, asc, eq, gt, isNull, sql } from "drizzle-orm";
import type { FastifyBaseLogger } from "fastify";
import { recordAudit } from "../../lib/audit.js";
import { inTransaction, type TenantContext } from "../../lib/context.js";
import { conflict, forbidden, notFound } from "../../lib/errors.js";
import { newOneTimeToken } from "../../lib/one-time-token.js";
import type { AppDeps } from "../../types.js";
import { renderInvitationEmail } from "../notifications/account-email.template.js";

/*
 * The people working in a restaurant. The owner manages everyone else; managers manage the floor
 * staff only. Nobody changes their own role, and the owner can't be removed.
 */

export const INVITATION_DAYS = 7;
/** Reset links handed over by a manager live longer than the ones sent by email. */
export const STAFF_RESET_HOURS = 24;

type Deps = Pick<AppDeps, "mailer" | "publicUrl" | "now">;

const RANK: Record<Role, number> = { owner: 0, manager: 1, staff: 2 };

function assertManages(actor: Role, target: Role) {
  if (target === "owner") throw forbidden("Il titolare non si può modificare");
  if (actor === "manager" && target !== "staff")
    throw forbidden("I manager gestiscono solo il personale di sala");
  if (actor === "staff") throw forbidden();
}

function assertCanGive(actor: Role, role: InvitableRole) {
  if (actor === "manager" && role !== "staff")
    throw forbidden("I manager possono aggiungere solo personale di sala");
}

export async function listTeam(ctx: TenantContext, now: Date) {
  const [members, pending] = await Promise.all([
    ctx.db
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
      .where(eq(memberships.restaurantId, ctx.restaurantId))
      .orderBy(asc(users.fullName)),
    ctx.db
      .select({
        id: invitations.id,
        email: invitations.email,
        role: invitations.role,
        expiresAt: invitations.expiresAt,
        createdAt: invitations.createdAt,
      })
      .from(invitations)
      .where(
        and(
          eq(invitations.restaurantId, ctx.restaurantId),
          isNull(invitations.acceptedAt),
          gt(invitations.expiresAt, now),
        ),
      )
      .orderBy(asc(invitations.createdAt)),
  ]);
  return { members: members.sort((a, b) => RANK[a.role] - RANK[b.role]), invitations: pending };
}

async function membershipOf(ctx: TenantContext, userId: string) {
  const [row] = await ctx.db
    .select({ role: memberships.role })
    .from(memberships)
    .where(and(eq(memberships.restaurantId, ctx.restaurantId), eq(memberships.userId, userId)))
    .limit(1);
  if (!row) throw notFound("Persona");
  return row;
}

/**
 * Invites a colleague. Returns the link path so it can also be shared by hand (WhatsApp...) when
 * email isn't set up; the email goes out when it is.
 */
export async function createInvitation(
  ctx: TenantContext,
  actorRole: Role,
  input: InvitationInput,
  deps: Deps,
  log: FastifyBaseLogger,
) {
  assertCanGive(actorRole, input.role);
  const [member] = await ctx.db
    .select({ userId: users.id })
    .from(users)
    .innerJoin(memberships, eq(memberships.userId, users.id))
    .where(and(eq(memberships.restaurantId, ctx.restaurantId), sql`lower(${users.email}) = ${input.email}`))
    .limit(1);
  if (member) throw conflict("already_member", "Questa persona fa già parte del locale");

  const { token, hash } = newOneTimeToken();
  const expiresAt = new Date(deps.now().getTime() + INVITATION_DAYS * 86_400_000);
  const invitation = await inTransaction(ctx, async (tx) => {
    // A new invitation replaces any pending one for the same address.
    await tx.db
      .delete(invitations)
      .where(
        and(
          eq(invitations.restaurantId, ctx.restaurantId),
          eq(invitations.email, input.email),
          isNull(invitations.acceptedAt),
        ),
      );
    const [row] = await tx.db
      .insert(invitations)
      .values({
        restaurantId: ctx.restaurantId,
        email: input.email,
        role: input.role,
        tokenHash: hash,
        invitedByUserId: ctx.actorUserId,
        expiresAt,
      })
      .returning({
        id: invitations.id,
        email: invitations.email,
        role: invitations.role,
        expiresAt: invitations.expiresAt,
      });
    await recordAudit(tx, { entity: "invitation", entityId: row!.id, action: "create", changes: input });
    return row!;
  });

  const path = `/invito/${token}`;
  let emailSent = false;
  if (deps.mailer.enabled && deps.publicUrl) {
    const [[restaurant], [inviter]] = await Promise.all([
      ctx.db.select({ name: restaurants.name }).from(restaurants).where(eq(restaurants.id, ctx.restaurantId)),
      ctx.actorUserId
        ? ctx.db.select({ fullName: users.fullName }).from(users).where(eq(users.id, ctx.actorUserId))
        : Promise.resolve([]),
    ]);
    try {
      await deps.mailer.send({
        to: input.email,
        ...renderInvitationEmail({
          restaurantName: restaurant!.name,
          inviterName: inviter?.fullName ?? null,
          role: input.role,
          url: `${deps.publicUrl}${path}`,
        }),
        fromName: restaurant!.name,
      });
      emailSent = true;
    } catch (error) {
      log.warn({ err: error }, "Invitation email not sent");
    }
  }
  return { invitation, path, emailSent };
}

export async function revokeInvitation(ctx: TenantContext, id: string) {
  await inTransaction(ctx, async (tx) => {
    const deleted = await tx.db
      .delete(invitations)
      .where(and(eq(invitations.id, id), eq(invitations.restaurantId, ctx.restaurantId)))
      .returning({ id: invitations.id });
    if (deleted.length === 0) throw notFound("Invito");
    await recordAudit(tx, { entity: "invitation", entityId: id, action: "delete" });
  });
}

export async function changeMemberRole(
  ctx: TenantContext,
  actorRole: Role,
  userId: string,
  role: InvitableRole,
) {
  if (userId === ctx.actorUserId) throw forbidden("Non puoi cambiare il tuo ruolo");
  const current = await membershipOf(ctx, userId);
  assertManages(actorRole, current.role);
  assertCanGive(actorRole, role);
  await inTransaction(ctx, async (tx) => {
    await tx.db
      .update(memberships)
      .set({ role })
      .where(and(eq(memberships.restaurantId, ctx.restaurantId), eq(memberships.userId, userId)));
    await recordAudit(tx, {
      entity: "membership",
      entityId: userId,
      action: "update",
      changes: { role: { from: current.role, to: role } },
    });
  });
}

export async function removeMember(ctx: TenantContext, actorRole: Role, userId: string) {
  if (userId === ctx.actorUserId) throw forbidden("Non puoi rimuovere te stesso");
  const current = await membershipOf(ctx, userId);
  assertManages(actorRole, current.role);
  await inTransaction(ctx, async (tx) => {
    await tx.db
      .delete(memberships)
      .where(and(eq(memberships.restaurantId, ctx.restaurantId), eq(memberships.userId, userId)));
    await recordAudit(tx, {
      entity: "membership",
      entityId: userId,
      action: "delete",
      changes: { role: current.role },
    });
  });
}

/** A one-time link for a colleague who forgot their password, to hand over in person. */
export async function createMemberResetLink(ctx: TenantContext, actorRole: Role, userId: string, now: Date) {
  if (userId === ctx.actorUserId) throw forbidden('Per la tua password usa "Cambia password"');
  const current = await membershipOf(ctx, userId);
  assertManages(actorRole, current.role);
  const { token, hash } = newOneTimeToken();
  await inTransaction(ctx, async (tx) => {
    await tx.db.insert(passwordResets).values({
      userId,
      tokenHash: hash,
      expiresAt: new Date(now.getTime() + STAFF_RESET_HOURS * 3_600_000),
    });
    await recordAudit(tx, { entity: "password_reset", entityId: userId, action: "create" });
  });
  return { path: `/reimposta-password/${token}`, hours: STAFF_RESET_HOURS };
}
