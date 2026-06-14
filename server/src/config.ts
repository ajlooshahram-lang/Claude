import { z } from "zod";

/**
 * Centralised, validated configuration. The process refuses to boot with an
 * invalid environment so misconfiguration can never silently weaken security
 * (e.g. a missing session secret or a wildcard CORS origin in production).
 */
const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(0).max(65535).default(8080),
  CORS_ORIGINS: z
    .string()
    .default("")
    .transform((s) => s.split(",").map((o) => o.trim()).filter(Boolean)),
  DATABASE_URL: z.string().min(1).optional(),
  SESSION_SECRET: z.string().min(16).default("dev-session-secret-min-16-chars"),
  DATA_ENCRYPTION_KEY: z.string().min(16).optional(),
  DATA_REGION: z.string().default("eu-west"),
});

export type AppConfig = {
  nodeEnv: "development" | "test" | "production";
  port: number;
  corsOrigins: string[];
  databaseUrl: string | undefined;
  sessionSecret: string;
  dataEncryptionKey: string | undefined;
  dataRegion: string;
  isProd: boolean;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid environment configuration: ${issues}`);
  }
  const e = parsed.data;
  const isProd = e.NODE_ENV === "production";

  // Production hardening: these are fatal in prod but tolerated in dev/test so
  // the app (and CI health test) can boot without a full secret set.
  if (isProd) {
    if (e.SESSION_SECRET === "dev-session-secret-min-16-chars")
      throw new Error("SESSION_SECRET is required in production");
    if (!e.DATA_ENCRYPTION_KEY) throw new Error("DATA_ENCRYPTION_KEY is required in production");
    if (!e.DATABASE_URL) throw new Error("DATABASE_URL is required in production");
    if (e.CORS_ORIGINS.includes("*")) throw new Error("Wildcard CORS origin is forbidden in production");
  }

  return {
    nodeEnv: e.NODE_ENV,
    port: e.PORT,
    corsOrigins: e.CORS_ORIGINS,
    databaseUrl: e.DATABASE_URL,
    sessionSecret: e.SESSION_SECRET,
    dataEncryptionKey: e.DATA_ENCRYPTION_KEY,
    dataRegion: e.DATA_REGION,
    isProd,
  };
}
