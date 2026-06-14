import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import fp from "fastify-plugin";

declare module "fastify" {
  interface FastifyRequest {
    requestId: string;
  }
}

async function requestIdPlugin(app: FastifyInstance): Promise<void> {
  app.decorateRequest("requestId", "");

  app.addHook("onRequest", async (request) => {
    request.requestId = randomUUID();
  });

  app.addHook("onSend", async (_request, reply, payload) => {
    void reply.header("X-Request-Id", _request.requestId);
    return payload;
  });
}

export default fp(requestIdPlugin, { name: "request-id" });
