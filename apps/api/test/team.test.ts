import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { client, clock, createTestApp, registerOwner, type TestContext } from "./helpers.js";

let ctx: TestContext;
let owner: Awaited<ReturnType<typeof registerOwner>>;
let counter = 0;

beforeAll(async () => {
  ctx = await createTestApp();
});
afterAll(() => ctx.close());
beforeEach(async () => {
  owner = await registerOwner(ctx.app, "Trattoria Squadra");
});

const anon = () => client(ctx.app);
const newEmail = (name: string) => `${name}${++counter}-${Date.now()}@example.com`;
const tokenOf = (path: string) => path.split("/").at(-1)!;

/** Invites someone and accepts as a new account; returns their authenticated client. */
async function join(role: "manager" | "staff", inviter = owner) {
  const email = newEmail(role);
  const invite = await inviter.api.post(`${owner.base}/team/invitations`, { email, role });
  expect(invite.status).toBe(201);
  const accepted = await anon().post(`/v1/auth/invitations/${tokenOf(invite.body.data.path)}/accept`, {
    fullName: `Persona ${role}`,
    password: "password-sicura-1",
  });
  expect(accepted.status).toBe(200);
  return { email, api: client(ctx.app, accepted.body.data.token), userId: accepted.body.data.user.id };
}

describe("invitations", () => {
  it("lets a colleague join with the link", async () => {
    const email = newEmail("mario");
    const invite = await owner.api.post(`${owner.base}/team/invitations`, { email, role: "staff" });
    expect(invite.status).toBe(201);
    expect(invite.body.data).toMatchObject({ invitation: { email, role: "staff" }, emailSent: true });
    const token = tokenOf(invite.body.data.path);

    // The invitee gets an email with the link.
    const mail = ctx.sentEmails.at(-1)!;
    expect(mail).toMatchObject({ to: email, subject: "Invito a lavorare con Trattoria Squadra" });
    expect(mail.text).toContain(`https://app.test/invito/${token}`);
    expect(mail.html).toContain('src="https://app.test/brand/email-logo.png"');

    const team = (await owner.api.get(`${owner.base}/team`)).body.data;
    expect(team.invitations.map((i: { email: string }) => i.email)).toEqual([email]);

    const info = await anon().get(`/v1/auth/invitations/${token}`);
    expect(info.body.data).toMatchObject({
      restaurantName: "Trattoria Squadra",
      role: "staff",
      accountExists: false,
    });

    expect(
      (await anon().post(`/v1/auth/invitations/${token}/accept`, { fullName: "Mario", password: "corta" }))
        .status,
    ).toBe(400);
    const accepted = await anon().post(`/v1/auth/invitations/${token}/accept`, {
      fullName: "Mario Bianchi",
      password: "password-sicura-1",
    });
    expect(accepted.status).toBe(200);
    expect(accepted.body.data.restaurantId).toBe(owner.restaurantId);

    const mario = client(ctx.app, accepted.body.data.token);
    const me = (await mario.get("/v1/auth/me")).body.data;
    expect(me.memberships).toMatchObject([{ restaurantId: owner.restaurantId, role: "staff" }]);
    // Staff work the floor but don't manage the team.
    expect((await mario.get(`${owner.base}/reservations?date=2026-10-24`)).status).toBe(200);
    expect((await mario.get(`${owner.base}/team`)).status).toBe(403);

    // The link works once.
    expect((await anon().get(`/v1/auth/invitations/${token}`)).status).toBe(410);
    const members = (await owner.api.get(`${owner.base}/team`)).body.data.members;
    expect(members.map((m: { fullName: string; role: string }) => [m.fullName, m.role])).toEqual([
      [expect.any(String), "owner"],
      ["Mario Bianchi", "staff"],
    ]);
  });

  it("expires after a week and refuses people already in the team", async () => {
    const staff = await join("staff");
    const again = await owner.api.post(`${owner.base}/team/invitations`, {
      email: staff.email,
      role: "staff",
    });
    expect(again.status).toBe(409);

    const invite = await owner.api.post(`${owner.base}/team/invitations`, {
      email: newEmail("late"),
      role: "staff",
    });
    const saved = clock.now;
    clock.now = new Date(saved.getTime() + 8 * 86_400_000);
    try {
      expect((await anon().get(`/v1/auth/invitations/${tokenOf(invite.body.data.path)}`)).status).toBe(410);
    } finally {
      clock.now = saved;
    }
  });

  it("can be revoked", async () => {
    const invite = await owner.api.post(`${owner.base}/team/invitations`, {
      email: newEmail("x"),
      role: "staff",
    });
    const id = invite.body.data.invitation.id;
    expect((await owner.api.delete(`${owner.base}/team/invitations/${id}`)).status).toBe(204);
    expect((await anon().get(`/v1/auth/invitations/${tokenOf(invite.body.data.path)}`)).status).toBe(410);
  });

  it("adds the restaurant to an existing account after checking its password", async () => {
    const other = await registerOwner(ctx.app, "Altro Locale");
    const invite = await owner.api.post(`${owner.base}/team/invitations`, {
      email: other.email,
      role: "manager",
    });
    const token = tokenOf(invite.body.data.path);
    expect((await anon().get(`/v1/auth/invitations/${token}`)).body.data.accountExists).toBe(true);
    expect(
      (await anon().post(`/v1/auth/invitations/${token}/accept`, { password: "sbagliata" })).status,
    ).toBe(401);
    const ok = await anon().post(`/v1/auth/invitations/${token}/accept`, {
      password: "correct-horse-battery",
    });
    expect(ok.status).toBe(200);
    const me = (await other.api.get("/v1/auth/me")).body.data;
    expect(me.memberships.map((m: { role: string }) => m.role).sort()).toEqual(["manager", "owner"]);
  });
});

describe("roles", () => {
  it("lets managers handle floor staff only", async () => {
    const manager = await join("manager");
    const asManager = { ...owner, api: manager.api };
    expect(
      (await manager.api.post(`${owner.base}/team/invitations`, { email: newEmail("m"), role: "manager" }))
        .status,
    ).toBe(403);
    const staff = await join("staff", asManager);

    const other = await join("manager");
    expect(
      (await manager.api.patch(`${owner.base}/team/members/${other.userId}`, { role: "staff" })).status,
    ).toBe(403);
    expect(
      (await manager.api.patch(`${owner.base}/team/members/${manager.userId}`, { role: "staff" })).status,
    ).toBe(403);
    expect((await manager.api.delete(`${owner.base}/team/members/${owner.userId}`)).status).toBe(403);
    expect((await manager.api.delete(`${owner.base}/team/members/${staff.userId}`)).status).toBe(204);
    // Removed people lose access at once.
    expect((await staff.api.get(`${owner.base}/reservations?date=2026-10-24`)).status).toBe(404);
  });

  it("lets the owner promote and demote", async () => {
    const staff = await join("staff");
    expect(
      (await owner.api.patch(`${owner.base}/team/members/${staff.userId}`, { role: "manager" })).status,
    ).toBe(204);
    expect((await staff.api.get(`${owner.base}/team`)).status).toBe(200);
    expect(
      (await owner.api.patch(`${owner.base}/team/members/${owner.userId}`, { role: "staff" })).status,
    ).toBe(403);
  });
});

describe("passwords", () => {
  it("resets with a link from the owner and signs out old sessions", async () => {
    const staff = await join("staff");
    const link = await owner.api.post(`${owner.base}/team/members/${staff.userId}/reset-link`);
    expect(link.status).toBe(200);
    const token = tokenOf(link.body.data.path);
    expect((await anon().get(`/v1/auth/password/reset/${token}`)).body.data.email).toBe(staff.email);

    const reset = await anon().post("/v1/auth/password/reset", { token, password: "nuova-password-2" });
    expect(reset.status).toBe(200);
    expect((await staff.api.get("/v1/auth/me")).status).toBe(401);
    expect((await client(ctx.app, reset.body.data.token).get("/v1/auth/me")).status).toBe(200);
    expect(
      (await anon().post("/v1/auth/password/reset", { token, password: "altra-password-3" })).status,
    ).toBe(410);

    const login = await anon().post("/v1/auth/login", { email: staff.email, password: "nuova-password-2" });
    expect(login.status).toBe(200);
  });

  it("emails a link to who forgot it, without telling who has an account", async () => {
    const before = ctx.sentEmails.length;
    expect((await anon().post("/v1/auth/password/forgot", { email: "nessuno@example.com" })).status).toBe(
      200,
    );
    expect(ctx.sentEmails).toHaveLength(before);

    expect((await anon().post("/v1/auth/password/forgot", { email: owner.email.toUpperCase() })).status).toBe(
      200,
    );
    const mail = ctx.sentEmails.at(-1)!;
    expect(mail).toMatchObject({ to: owner.email, subject: "Reimposta la password" });
    const token = /reimposta-password\/([\w-]+)/.exec(mail.text)![1]!;
    expect(
      (await anon().post("/v1/auth/password/reset", { token, password: "nuova-password-2" })).status,
    ).toBe(200);
  });

  it("changes the password from the account", async () => {
    const wrong = await owner.api.post("/v1/auth/password/change", {
      currentPassword: "sbagliata",
      newPassword: "nuova-password-2",
    });
    expect(wrong.status).toBe(400);
    const ok = await owner.api.post("/v1/auth/password/change", {
      currentPassword: "correct-horse-battery",
      newPassword: "nuova-password-2",
    });
    expect(ok.status).toBe(200);
    expect((await owner.api.get("/v1/auth/me")).status).toBe(401);
    expect((await client(ctx.app, ok.body.data.token).get("/v1/auth/me")).status).toBe(200);
  });
});
