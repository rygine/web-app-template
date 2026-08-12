import { createSerializationAdapter } from "@tanstack/react-router";

export class NotFoundError extends Error {
  constructor(message = "Not found.") {
    super(message);
    this.name = "NotFoundError";
  }
}

export class UnauthorizedError extends Error {
  constructor(message = "Invalid or missing API key.") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export class BadRequestError extends Error {
  constructor(message = "Invalid request.") {
    super(message);
    this.name = "BadRequestError";
  }
}

// The one error whose message is written for a person to read: the server
// function boundary throws it, and the browser is allowed to show it.
export class ReportableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReportableError";
  }
}

// What there is to say when nothing explained the failure.
const RETRY = "Please try again.";

// The two halves of every failure a user reads. The caller's message names the
// action that failed; a `ReportableError` is the server explaining why, and
// nothing else here is addressed to a user — a failed fetch says "Failed to
// fetch". It is shared rather than living in `useAsyncAction` because the undo
// toast reports its own outcome from module scope, outside any hook.
export const failureMessage = (message: string, error: unknown) =>
  `${message} ${error instanceof ReportableError ? error.message : RETRY}`;

// An Error crosses the server function wire as its message alone, class gone,
// so nothing on the client could tell one meant for a user from a fetch
// failure. This adapter is what carries the identity across.
export const reportableErrorAdapter = createSerializationAdapter({
  key: "ReportableError",
  test: (value): value is ReportableError => value instanceof ReportableError,
  toSerializable: ({ message }: ReportableError) => ({ message }),
  fromSerializable: ({ message }: { message: string }) =>
    new ReportableError(message),
});
