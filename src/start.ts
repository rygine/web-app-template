import {
  createCsrfMiddleware,
  createMiddleware,
  createStart,
} from "@tanstack/react-start";

import { createLogger, loadLogLevel } from "@/app/server/log/logger";
import { toClientError } from "@/app/server/utils/http";
import { reportableErrorAdapter } from "@/app/shared/utils/errors";

const log = createLogger("http");

// Every API version, not just v1: a feature can ship /api/v2 beside /api/v1,
// and CORS plus request tracing must cover it without an edit here.
const API_PREFIX = "/api/";
const SERVER_FN_PREFIX = "/_serverFn";

const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === "serverFn",
});

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Api-Key",
  "Access-Control-Expose-Headers": "X-Request-Id",
  "Access-Control-Max-Age": "86400",
};

const isApiRequest = (pathname: string) => pathname.startsWith(API_PREFIX);

const isDataRequest = (pathname: string) =>
  isApiRequest(pathname) || pathname.startsWith(SERVER_FN_PREFIX);

const requestContext = createMiddleware({ type: "request" }).server(
  async ({ request, pathname, next }) => {
    await loadLogLevel();

    const requestId =
      request.headers.get("x-request-id") ?? crypto.randomUUID();

    if (isApiRequest(pathname) && request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const traced = isDataRequest(pathname);
    const startedAt = Date.now();
    if (traced) {
      log.trace("requestContext: request received", {
        requestId,
        method: request.method,
        path: pathname,
      });
    }

    const result = await next({ context: { requestId } });

    if (traced) {
      log.trace("requestContext: request completed", {
        requestId,
        method: request.method,
        path: pathname,
        status: result.response.status,
        ms: Date.now() - startedAt,
      });
    }

    result.response.headers.set("X-Request-Id", requestId);

    if (isApiRequest(pathname)) {
      for (const [header, value] of Object.entries(CORS_HEADERS)) {
        result.response.headers.set(header, value);
      }
    }

    return result;
  },
);

// The server function counterpart of `withErrorHandling` on a REST route: it
// wraps the validator and the handler alike, so nothing a server function
// throws reaches the browser unmapped.
const serverFnErrors = createMiddleware({ type: "function" }).server(
  async ({ next }) => {
    try {
      return await next();
    } catch (error) {
      throw toClientError(error);
    }
  },
);

export const startInstance = createStart(() => ({
  requestMiddleware: [requestContext, csrfMiddleware],
  functionMiddleware: [serverFnErrors],
  serializationAdapters: [reportableErrorAdapter],
}));
