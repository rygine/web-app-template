import { isNotFound, isRedirect } from "@tanstack/react-router";
import { ZodError } from "zod";

import { createLogger } from "@/app/server/log/logger";
import { verifyApiKey } from "@/app/server/services/apiKey";
import {
  BadRequestError,
  NotFoundError,
  ReportableError,
  UnauthorizedError,
} from "@/app/shared/utils/errors";

const log = createLogger("http");

export const readJson = async (request: Request): Promise<unknown> => {
  try {
    return await request.json();
  } catch {
    throw new BadRequestError("Request body must be valid JSON.");
  }
};

const errorResponse = (
  status: number,
  code: string,
  message: string,
  details?: unknown,
  headers?: HeadersInit,
) =>
  Response.json(
    {
      error:
        details === undefined ? { code, message } : { code, message, details },
    },
    { status, headers },
  );

export const methodNotAllowed = (...allow: string[]) => {
  log.debug("methodNotAllowed: method not allowed", {
    allow: allow.join(", "),
  });
  return errorResponse(
    405,
    "method_not_allowed",
    "Method not allowed.",
    undefined,
    { Allow: allow.join(", ") },
  );
};

type Failure = {
  status: number;
  code: string;
  message: string;
  issues?: ZodError["issues"];
  // False for the catch-all: its message describes nothing and the real error
  // has been logged instead.
  reportable: boolean;
};

// The one taxonomy, rendered two ways: REST turns it into a response body,
// server functions into the message a browser is allowed to see. It logs here
// so both transports report a failure identically.
const classify = (error: unknown): Failure => {
  if (error instanceof ZodError) {
    log.debug("classify: validation failed", { issues: error.issues.length });
    return {
      status: 400,
      code: "validation_failed",
      message: "Invalid request.",
      issues: error.issues,
      reportable: true,
    };
  }
  if (error instanceof BadRequestError) {
    log.debug("classify: bad request", { reason: error.message });
    return {
      status: 400,
      code: "validation_failed",
      message: error.message,
      reportable: true,
    };
  }
  if (error instanceof NotFoundError) {
    log.debug("classify: not found", { reason: error.message });
    return {
      status: 404,
      code: "not_found",
      message: error.message,
      reportable: true,
    };
  }
  if (error instanceof UnauthorizedError) {
    log.warn("classify: unauthorized", { reason: error.message });
    return {
      status: 401,
      code: "unauthorized",
      message: error.message,
      reportable: true,
    };
  }
  log.error("classify: unhandled request error", { error });
  return {
    status: 500,
    code: "internal",
    message: "Something went wrong.",
    reportable: false,
  };
};

export const withErrorHandling = async (
  fn: () => Promise<Response> | Response,
): Promise<Response> => {
  try {
    return await fn();
  } catch (error) {
    const { status, code, message, issues } = classify(error);
    return errorResponse(status, code, message, issues);
  }
};

// The server function counterpart of `withErrorHandling`: the error a browser
// may receive. A validation failure reports its first issue, since that is the
// one sentence the field it names can be fixed by.
export const toClientError = (error: unknown): unknown => {
  // Router control flow, not a failure — swallowing these would strand the
  // navigation they exist to perform.
  if (isRedirect(error) || isNotFound(error)) {
    return error;
  }
  const { message, issues, reportable } = classify(error);
  if (!reportable) {
    return new Error(message);
  }
  return new ReportableError(issues?.[0]?.message ?? message);
};

const readApiKey = (request: Request) => request.headers.get("x-api-key");

export const withApiRoute = (
  request: Request,
  fn: () => Promise<Response> | Response,
): Promise<Response> =>
  withErrorHandling(async () => {
    const apiKey = readApiKey(request);
    if (apiKey === null) {
      log.trace("withApiRoute: no api key header");
      throw new UnauthorizedError();
    }
    if (!(await verifyApiKey(apiKey))) {
      log.trace("withApiRoute: api key rejected");
      throw new UnauthorizedError();
    }
    log.trace("withApiRoute: api key accepted");
    return fn();
  });
