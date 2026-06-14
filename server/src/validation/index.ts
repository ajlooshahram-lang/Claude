/**
 * Validation utilities for request bodies and path parameters.
 */
import type { FastifyReply } from "fastify";
import { isValidId } from "./schemas.js";

export { isValidId } from "./schemas.js";

/**
 * Validates that a string matches a cuid (alphanumeric, starts with lowercase letter,
 * 20-30 chars) or standard UUID format. Returns 400 response if invalid.
 *
 * @returns true if valid, false if invalid (response already sent)
 */
export function validateId(id: string, reply: FastifyReply): boolean {
  if (!isValidId(id)) {
    void reply.code(400).send({ error: "Invalid ID format" });
    return false;
  }
  return true;
}
