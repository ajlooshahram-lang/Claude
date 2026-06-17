/**
 * Zod validation schemas for the invitation system.
 */
import { z } from "zod";

const RoleEnum = z.enum(["ADMIN", "MANAGER", "VIEWER"]);

export const CreateInviteSchema = z.object({
  email: z.string().email().max(255),
  role: RoleEnum,
});

export const AcceptInviteSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(1),
  displayName: z.string().min(1).max(100),
});
