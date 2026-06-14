import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";

const MAX_URL_LENGTH = 2048;

async function limitsPlugin(app: FastifyInstance): Promise<void> {
  // URL length check
  app.addHook("onRequest", async (request, reply) => {
    const url = request.raw.url ?? "";
    if (url.length > MAX_URL_LENGTH) {
      return reply.code(414).send({ error: "URI too long" });
    }
  });
}

export default fp(limitsPlugin, { name: "limits" });
