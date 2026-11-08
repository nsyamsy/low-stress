import type { FastifyError, FastifyReply, FastifyRequest } from "fastify";
import { ZodError } from "zod";

export interface ErrorBody {
  error: {
    code: string;
    params: Record<string, unknown>;
  };
}

export class AppError extends Error {
  constructor(
    public readonly code: string,
    public readonly statusCode: number,
    public readonly params: Record<string, unknown> = {},
  ) {
    super(code);
    this.name = "AppError";
  }
}

export function errorBody(
  code: string,
  params: Record<string, unknown> = {},
): ErrorBody {
  return { error: { code, params } };
}

/** Ubah ZodError menjadi peta kolom -> kode masalah. */
export function validationParams(error: ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_";
    if (!(key in fields)) fields[key] = issue.code;
  }
  return fields;
}

export function createErrorHandler() {
  return function errorHandler(
    error: FastifyError | AppError | ZodError,
    request: FastifyRequest,
    reply: FastifyReply,
  ): void {
    if (error instanceof AppError) {
      void reply.status(error.statusCode).send(errorBody(error.code, error.params));
      return;
    }

    if (error instanceof ZodError) {
      void reply
        .status(400)
        .send(errorBody("VALIDATION_FAILED", { fields: validationParams(error) }));
      return;
    }

    const statusCode = error.statusCode ?? 500;
    if (statusCode >= 500) {
      request.log.error({ err: error }, "unhandled error");
      void reply.status(500).send(errorBody("INTERNAL"));
      return;
    }

    const code =
      "code" in error && typeof error.code === "string" && error.code.length > 0
        ? error.code
        : statusCode === 400
          ? "BAD_REQUEST"
          : "INTERNAL";
    // Pembangun error rate-limit Fastify melempar { statusCode, code, params };
    // teruskan params-nya agar retryAfterSec sampai ke klien.
    const params =
      "params" in error &&
      typeof error.params === "object" &&
      error.params !== null
        ? (error.params as Record<string, unknown>)
        : {};
    void reply.status(statusCode).send(errorBody(code, params));
  };
}

export function notFoundHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): void {
  void reply.status(404).send(errorBody("NOT_FOUND", { path: request.url }));
}
