import { redirect } from "@tanstack/react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import {
  readJson,
  toClientError,
  withErrorHandling,
} from "@/app/server/utils/http";
import {
  BadRequestError,
  NotFoundError,
  ReportableError,
} from "@/app/shared/utils/errors";

const messageOf = (error: unknown) =>
  error instanceof Error ? error.message : null;

const rejectedBy = (schema: z.ZodType, value: unknown) => {
  try {
    schema.parse(value);
  } catch (error) {
    return error;
  }
  throw new Error("expected the schema to reject");
};

type ErrorBody = {
  error: { code: string; message: string; details?: unknown };
};

const bodyOf = async (response: Response): Promise<ErrorBody> =>
  response.json();

afterEach(() => {
  vi.restoreAllMocks();
});

describe("withErrorHandling", () => {
  it("passes a successful response through", async () => {
    const response = await withErrorHandling(() =>
      Response.json({ ok: true }, { status: 201 }),
    );

    expect(response.status).toBe(201);
  });

  it("maps a ZodError to 400 with issue details", async () => {
    const response = await withErrorHandling(() => {
      z.object({ name: z.string() }).parse({});
      return new Response();
    });

    expect(response.status).toBe(400);

    const body = await bodyOf(response);

    expect(body.error.code).toBe("validation_failed");
    expect(body.error.details).toBeDefined();
  });

  it("maps a BadRequestError to 400 and keeps its message", async () => {
    const response = await withErrorHandling(() => {
      throw new BadRequestError("Body must be valid JSON.");
    });

    expect(response.status).toBe(400);

    const body = await bodyOf(response);

    expect(body.error.code).toBe("validation_failed");
    expect(body.error.message).toBe("Body must be valid JSON.");
  });

  it("maps a NotFoundError to 404", async () => {
    const response = await withErrorHandling(() => {
      throw new NotFoundError();
    });

    expect(response.status).toBe(404);

    const body = await bodyOf(response);

    expect(body.error.code).toBe("not_found");
    expect(body.error.message).toBe("Not found.");
  });

  it("maps an unknown error to 500 without leaking its message", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await withErrorHandling(() => {
      throw new Error("connection string leaked");
    });

    expect(response.status).toBe(500);

    const body = await bodyOf(response);

    expect(body.error.code).toBe("internal");
    expect(body.error.message).toBe("Something went wrong.");
    expect(JSON.stringify(body)).not.toContain("connection string leaked");
    expect(logged).toHaveBeenCalled();
  });
});

// The server function half of the same taxonomy: `withErrorHandling` renders it
// as a response body, this renders it as the error a browser receives.
describe("toClientError", () => {
  it("reports the first issue of a validation failure", () => {
    const schema = z.object({
      name: z.string().max(2, "Name must be 2 characters or fewer."),
    });

    const error = toClientError(rejectedBy(schema, { name: "abc" }));

    expect(error).toBeInstanceOf(ReportableError);
    expect(messageOf(error)).toBe("Name must be 2 characters or fewer.");
  });

  it("keeps the message of an expected failure", () => {
    const error = toClientError(new NotFoundError());

    expect(error).toBeInstanceOf(ReportableError);
    expect(messageOf(error)).toBe("Not found.");
  });

  // Only a ReportableError reaches a user, so an unexpected failure must not be
  // one: a Prisma fault names columns and paths.
  it("replaces an unexpected failure with a generic message", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    const error = toClientError(
      new Error("Invalid `prisma.item.create()` invocation in /app/src/…"),
    );

    expect(error).not.toBeInstanceOf(ReportableError);
    expect(messageOf(error)).toBe("Something went wrong.");
  });

  // Router control flow, not a failure: mapping it would strand the navigation
  // instead of performing it.
  it("passes a redirect through untouched", () => {
    const thrown = redirect({ to: "/items" });

    expect(toClientError(thrown)).toBe(thrown);
  });
});

describe("readJson", () => {
  it("parses a JSON body", async () => {
    const request = new Request("http://localhost/api/v1/items", {
      method: "POST",
      body: JSON.stringify({ name: "Parsed" }),
    });

    expect(await readJson(request)).toEqual({ name: "Parsed" });
  });

  it("throws BadRequestError on malformed JSON", async () => {
    const request = new Request("http://localhost/api/v1/items", {
      method: "POST",
      body: "{not json",
    });

    await expect(readJson(request)).rejects.toThrow(BadRequestError);
  });
});
