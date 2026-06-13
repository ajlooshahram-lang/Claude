import { test } from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";

const testConfig = loadConfig({
  NODE_ENV: "test",
  PORT: "0",
  CORS_ORIGINS: "http://localhost:5173",
  DATA_REGION: "eu-west",
});

test("GET /health returns ok without a database", async (t) => {
  const app = await buildApp({ config: testConfig });
  t.after(() => app.close());

  const res = await app.inject({ method: "GET", url: "/health" });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.status, "ok");
  assert.equal(body.service, "qi-platform-server");
  assert.equal(body.region, "eu-west");
  assert.ok(typeof body.time === "string");
});

test("GET /ready reports degraded when no database is configured", async (t) => {
  const app = await buildApp({ config: testConfig });
  t.after(() => app.close());

  const res = await app.inject({ method: "GET", url: "/ready" });
  assert.equal(res.statusCode, 503);
  const body = res.json();
  assert.equal(body.status, "degraded");
  assert.equal(body.checks.database.ok, false);
});

test("security headers are applied (helmet)", async (t) => {
  const app = await buildApp({ config: testConfig });
  t.after(() => app.close());

  const res = await app.inject({ method: "GET", url: "/health" });
  assert.ok(res.headers["x-content-type-options"] === "nosniff");
});

test("config rejects wildcard CORS in production", () => {
  assert.throws(
    () =>
      loadConfig({
        NODE_ENV: "production",
        CORS_ORIGINS: "*",
        SESSION_SECRET: "0123456789abcdef0123456789abcdef",
        DATA_ENCRYPTION_KEY: "0123456789abcdef0123456789abcdef",
        DATABASE_URL: "postgresql://localhost/db",
      }),
    /Wildcard CORS origin is forbidden/,
  );
});

test("config requires session secret in production", () => {
  assert.throws(
    () => loadConfig({ NODE_ENV: "production", CORS_ORIGINS: "https://app.example.com" }),
    /SESSION_SECRET is required/,
  );
});
