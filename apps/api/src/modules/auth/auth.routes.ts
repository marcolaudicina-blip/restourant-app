import { loginInput, registerInput } from "@restourant/shared";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { authenticate } from "../../plugins/auth.js";
import { getProfile, login, register } from "./auth.service.js";

const AUTH_RATE_LIMIT = { rateLimit: { max: 10, timeWindow: "1 minute" } };

export const authRoutes: FastifyPluginAsyncZod = async (app) => {
  const { db, passwords, tokens } = app.deps;

  app.post(
    "/auth/register",
    { schema: { body: registerInput }, config: AUTH_RATE_LIMIT },
    async (request, reply) => {
      const { user, restaurantId } = await register(db, passwords, request.body);
      reply.code(201);
      return { data: { token: await tokens.sign(user.id), user, restaurantId } };
    },
  );

  app.post("/auth/login", { schema: { body: loginInput }, config: AUTH_RATE_LIMIT }, async (request) => {
    const user = await login(db, passwords, request.body);
    return { data: { token: await tokens.sign(user.id), user } };
  });

  app.get("/auth/me", async (request) => {
    const { userId } = await authenticate(request);
    return { data: await getProfile(db, userId) };
  });
};
