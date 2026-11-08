import { describe, expect, it, vi } from "vitest";
import type { FastifyReply, FastifyRequest } from "fastify";
import { AppError, createErrorHandler } from "../src/errors";

function mockReqReply() {
  const request = {
    log: { error: vi.fn() },
    url: "/api/games",
  } as unknown as FastifyRequest;
  const state = { statusCode: 0, body: undefined as unknown };
  const reply = {
    status(code: number) {
      state.statusCode = code;
      return this;
    },
    send(body: unknown) {
      state.body = body;
      return this;
    },
  } as unknown as FastifyReply;
  return { request, reply, state };
}

describe("createErrorHandler: error rate-limit Fastify", () => {
  it("memetakan error { statusCode:429, code, params } dari plugin menjadi 429 RATE_LIMITED", () => {
    const handler = createErrorHandler();
    const { request, reply, state } = mockReqReply();
    const err = {
      statusCode: 429,
      code: "RATE_LIMITED",
      params: { retryAfterSec: 19 },
    };
    // Bentuk error yang dilempar plugin rate-limit Fastify.
    handler(err as unknown as Parameters<typeof handler>[0], request, reply);
    expect(state.statusCode).toBe(429);
    expect(state.body).toEqual({
      error: { code: "RATE_LIMITED", params: { retryAfterSec: 19 } },
    });
  });

  it("tetap memetakan AppError seperti sebelumnya", () => {
    const handler = createErrorHandler();
    const { request, reply, state } = mockReqReply();
    handler(new AppError("SCORE_INVALID", 400), request, reply);
    expect(state.statusCode).toBe(400);
    expect(state.body).toEqual({ error: { code: "SCORE_INVALID", params: {} } });
  });
});
