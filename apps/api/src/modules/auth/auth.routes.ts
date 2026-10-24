import {
  acceptInvitationInput,
  changePasswordInput,
  forgotPasswordInput,
  loginInput,
  registerInput,
  resetPasswordInput,
} from "@restourant/shared";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { authenticate } from "../../plugins/auth.js";
import {
  acceptInvitation,
  changePassword,
  forgotPassword,
  getInvitation,
  getPasswordReset,
  resetPassword,
} from "./account.service.js";
import { getProfile, login, register } from "./auth.service.js";

const AUTH_RATE_LIMIT = { rateLimit: { max: 10, timeWindow: "1 minute" } };
const LINK_RATE_LIMIT = { rateLimit: { max: 30, timeWindow: "1 minute" } };
const tokenParams = z.object({ token: z.string().min(20).max(200) });

export const authRoutes: FastifyPluginAsyncZod = async (app) => {
  const { db, passwords, tokens } = app.deps;
  const session = async (user: { id: string; email: string; fullName: string; sessionVersion: number }) => {
    const { sessionVersion, ...publicUser } = user;
    return { token: await tokens.sign(user.id, sessionVersion), user: publicUser };
  };

  app.post(
    "/auth/register",
    { schema: { body: registerInput }, config: AUTH_RATE_LIMIT },
    async (request, reply) => {
      const { user, restaurantId } = await register(db, passwords, request.body);
      reply.code(201);
      return { data: { ...(await session({ ...user, sessionVersion: 0 })), restaurantId } };
    },
  );

  app.post("/auth/login", { schema: { body: loginInput }, config: AUTH_RATE_LIMIT }, async (request) => ({
    data: await session(await login(db, passwords, request.body)),
  }));

  app.get("/auth/me", async (request) => {
    const { userId } = await authenticate(request);
    return { data: await getProfile(db, userId) };
  });

  // Invitations: shown and accepted from the link, without being signed in.
  app.get(
    "/auth/invitations/:token",
    { schema: { params: tokenParams }, config: LINK_RATE_LIMIT },
    async (request) => ({
      data: await getInvitation(db, request.params.token, app.deps.now()),
    }),
  );

  app.post(
    "/auth/invitations/:token/accept",
    { schema: { params: tokenParams, body: acceptInvitationInput }, config: AUTH_RATE_LIMIT },
    async (request) => {
      const { user, restaurantId } = await acceptInvitation(
        db,
        passwords,
        request.params.token,
        request.body,
        app.deps.now(),
      );
      return { data: { ...(await session(user)), restaurantId } };
    },
  );

  // Passwords.
  app.post(
    "/auth/password/forgot",
    { schema: { body: forgotPasswordInput }, config: AUTH_RATE_LIMIT },
    async (request) => {
      await forgotPassword(db, app.deps, request.body.email, request.log);
      return { data: { ok: true } };
    },
  );

  app.get(
    "/auth/password/reset/:token",
    { schema: { params: tokenParams }, config: LINK_RATE_LIMIT },
    async (request) => ({
      data: await getPasswordReset(db, request.params.token, app.deps.now()),
    }),
  );

  app.post(
    "/auth/password/reset",
    { schema: { body: resetPasswordInput }, config: AUTH_RATE_LIMIT },
    async (request) => ({
      data: await session(
        await resetPassword(db, passwords, request.body.token, request.body.password, app.deps.now()),
      ),
    }),
  );

  app.post(
    "/auth/password/change",
    { schema: { body: changePasswordInput }, config: AUTH_RATE_LIMIT },
    async (request) => {
      const { userId } = await authenticate(request);
      return { data: await session(await changePassword(db, passwords, userId, request.body)) };
    },
  );
};
