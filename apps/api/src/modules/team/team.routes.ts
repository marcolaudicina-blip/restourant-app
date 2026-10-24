import { invitationInput, memberRoleInput } from "@restourant/shared";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { tenant } from "../../lib/context.js";
import { idParams } from "../../lib/http.js";
import {
  changeMemberRole,
  createInvitation,
  createMemberResetLink,
  listTeam,
  removeMember,
  revokeInvitation,
} from "./team.service.js";

const TEAM = { permission: "team.manage" } as const;
const memberParams = z.object({ userId: z.uuid() });

export const teamRoutes: FastifyPluginAsyncZod = async (app) => {
  const role = (request: { membership: { role: "owner" | "manager" | "staff" } | null }) =>
    request.membership!.role;

  app.get("/team", { config: TEAM }, async (request) => ({
    data: await listTeam(tenant(request), app.deps.now()),
  }));

  app.post(
    "/team/invitations",
    { schema: { body: invitationInput }, config: TEAM },
    async (request, reply) => {
      reply.code(201);
      return {
        data: await createInvitation(tenant(request), role(request), request.body, app.deps, request.log),
      };
    },
  );

  app.delete(
    "/team/invitations/:id",
    { schema: { params: idParams }, config: TEAM },
    async (request, reply) => {
      await revokeInvitation(tenant(request), request.params.id);
      return reply.code(204).send();
    },
  );

  app.patch(
    "/team/members/:userId",
    { schema: { params: memberParams, body: memberRoleInput }, config: TEAM },
    async (request, reply) => {
      await changeMemberRole(tenant(request), role(request), request.params.userId, request.body.role);
      return reply.code(204).send();
    },
  );

  app.delete(
    "/team/members/:userId",
    { schema: { params: memberParams }, config: TEAM },
    async (request, reply) => {
      await removeMember(tenant(request), role(request), request.params.userId);
      return reply.code(204).send();
    },
  );

  app.post(
    "/team/members/:userId/reset-link",
    { schema: { params: memberParams }, config: TEAM },
    async (request) => ({
      data: await createMemberResetLink(
        tenant(request),
        role(request),
        request.params.userId,
        app.deps.now(),
      ),
    }),
  );
};
