import { roomCreateInput, roomUpdate } from "@restourant/shared";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { tenant } from "../../lib/context.js";
import { idParams } from "../../lib/http.js";
import { createRoom, deleteRoom, getRoom, listRooms, toRoom, updateRoom } from "./rooms.service.js";

export const roomRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get("/rooms", async (request) => ({ data: (await listRooms(tenant(request))).map(toRoom) }));

  app.post("/rooms", { schema: { body: roomCreateInput } }, async (request, reply) => {
    reply.code(201);
    return { data: toRoom(await createRoom(tenant(request), request.body)) };
  });

  app.get("/rooms/:id", { schema: { params: idParams } }, async (request) => ({
    data: toRoom(await getRoom(tenant(request), request.params.id)),
  }));

  app.patch("/rooms/:id", { schema: { params: idParams, body: roomUpdate } }, async (request) => ({
    data: toRoom(await updateRoom(tenant(request), request.params.id, request.body)),
  }));

  app.delete("/rooms/:id", { schema: { params: idParams } }, async (request, reply) => {
    await deleteRoom(tenant(request), request.params.id);
    return reply.code(204).send();
  });
};
