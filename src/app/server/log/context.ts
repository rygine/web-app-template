import { AsyncLocalStorage } from "node:async_hooks";

type LogContext = { correlationId: string };

const storage = new AsyncLocalStorage<LogContext>();

export const withCorrelation = <T>(correlationId: string, run: () => T): T =>
  storage.run({ correlationId }, run);

export const currentCorrelationId = (): string | null =>
  storage.getStore()?.correlationId ?? null;
