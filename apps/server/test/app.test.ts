import { describe, expect, it } from "vitest";

import { buildApp } from "../src/app";
import { AppError, errorBody, validationParams } from "../src/errors";
import { readEnv } from "../src/env";
import { z } from "zod";

const env = readEnv({
  NODE_ENV: "test",
  DATABASE_URL: "postgres://user:pass@localhost:5432/low_stress",
  SESSION_SECRET: "01234567890123456789012345678901",
});

describe("health endpoints", () => {
  it("answers /healthz without touching the database", async () => {
    const app = await buildApp({ env, checkDatabase: async () => false });
    const res = await app.inject({ method: "GET", url: "/healthz" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
    await app.close();
  });

  it("answers /readyz 200 when the database is reachable", async () => {
    const app = await buildApp({ env, checkDatabase: async () => true });
    const res = await app.inject({ method: "GET", url: "/readyz" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
    await app.close();
  });

  it("answers /readyz 503 when the database is down", async () => {
    const app = await buildApp({ env, checkDatabase: async () => false });
    const res = await app.inject({ method: "GET", url: "/readyz" });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({ ok: false });
    await app.close();
  });

  it("answers /readyz 503 when the check throws", async () => {
    const app = await buildApp({
      env,
      checkDatabase: async () => {
        throw new Error("connection refused");
      },
    });
    const res = await app.inject({ method: "GET", url: "/readyz" });
    expect(res.statusCode).toBe(503);
    await app.close();
  });
});

describe("error envelope", () => {
  it("uses a coded envelope for unknown routes", async () => {
    const app = await buildApp({ env, checkDatabase: async () => true });
    const res = await app.inject({ method: "GET", url: "/tidak-ada" });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ error: { code: "NOT_FOUND" } });
    await app.close();
  });

  it("serializes AppError with its status and params", async () => {
    const app = await buildApp({ env, checkDatabase: async () => true });
    app.get("/boom", async () => {
      throw new AppError("CONFLICT", 409, { reason: "test" });
    });
    const res = await app.inject({ method: "GET", url: "/boom" });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual(errorBody("CONFLICT", { reason: "test" }));
    await app.close();
  });

  it("maps Zod errors to VALIDATION_FAILED fields", () => {
    const result = z.object({ name: z.string() }).safeParse({ name: 1 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(validationParams(result.error)).toEqual({ name: "invalid_type" });
    }
  });

  it("handles client 4xx errors with their code or BAD_REQUEST", async () => {
    const app = await buildApp({ env, checkDatabase: async () => true });
    app.post("/bad-payload", async () => {
      const err = new Error("bad request") as Error & { statusCode: number };
      err.statusCode = 400;
      throw err;
    });
    const res = await app.inject({ method: "POST", url: "/bad-payload" });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual(errorBody("BAD_REQUEST"));
    await app.close();
  });
});
