import type { FastifyInstance, FastifyError } from "fastify";
import fp from "fastify-plugin";

async function errorHandlerPlugin(app: FastifyInstance): Promise<void> {
  app.setErrorHandler((error: FastifyError, request, reply) => {
    const requestId = request.requestId ?? "unknown";

    // Rate limit exceeded
    if (error.statusCode === 429) {
      request.log.warn({ requestId, err: error }, "Rate limit exceeded");
      return reply.code(429).send({
        error: "Too many requests",
        requestId,
      });
    }

    // Validation errors from Fastify schema validation
    if (error.validation) {
      request.log.info({ requestId, err: error }, "Validation error");
      return reply.code(400).send({
        error: "Validation error",
        requestId,
      });
    }

    // Payload too large
    if (error.statusCode === 413) {
      request.log.warn({ requestId, err: error }, "Payload too large");
      return reply.code(413).send({
        error: "Payload too large",
        requestId,
      });
    }

    // Not found
    if (error.statusCode === 404) {
      request.log.info({ requestId, err: error }, "Not found");
      return reply.code(404).send({
        error: "Not found",
        requestId,
      });
    }

    // All other errors: log full details internally, return generic message
    request.log.error({ requestId, err: error }, "Unhandled error");
    return reply.code(error.statusCode ?? 500).send({
      error: "Internal server error",
      requestId,
    });
  });
}

export default fp(errorHandlerPlugin, {
  name: "error-handler",
  dependencies: ["request-id"],
});
