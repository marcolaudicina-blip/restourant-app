import { bookingPageUpdate, MAX_MEDIA_BYTES, mediaUpload } from "@restourant/shared";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { tenant } from "../../lib/context.js";
import { getBookingPage, updateBookingPage, uploadMedia } from "./booking-page.service.js";

export const bookingPageRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get("/booking-page", async (request) => ({ data: await getBookingPage(tenant(request)) }));

  app.patch("/booking-page", { schema: { body: bookingPageUpdate } }, async (request) => ({
    data: await updateBookingPage(tenant(request), request.body, request.server.deps.now()),
  }));

  app.post(
    "/media",
    // Base64 makes the body a third bigger than the picture.
    { schema: { body: mediaUpload }, bodyLimit: Math.ceil(MAX_MEDIA_BYTES * 1.4) + 1024 },
    async (request, reply) => {
      reply.code(201);
      return { data: await uploadMedia(tenant(request), request.body) };
    },
  );
};
