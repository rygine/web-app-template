import { getGlobalStartContext } from "@tanstack/react-start";

import { currentCorrelationId } from "@/app/server/log/context";
import { prisma } from "@/app/server/utils/prisma";
import { SETTINGS_ID } from "@/app/shared/schemas/settings";
import {
  consoleLogHandler,
  createLogger as createBaseLogger,
  formatFields,
  isLogLevel,
  setLogLevel,
} from "@/app/shared/utils/log";
import type { LogFields, LogHandler, Logger } from "@/app/shared/utils/log";

let loading: Promise<void> | undefined;

export const refreshLogLevel = (): Promise<void> => {
  loading = undefined;
  return loadLogLevel();
};

export const loadLogLevel = (): Promise<void> => {
  loading ??= (async () => {
    try {
      const row = await prisma.setting.findUnique({
        where: { id: SETTINGS_ID },
        select: { logLevel: true },
      });
      const level = row?.logLevel;
      if (isLogLevel(level)) {
        setLogLevel(level);
      }
    } catch (error) {
      console.error("log: could not read the configured level", error);
    }
  })();
  return loading;
};

// The columns as stored; the query and the archive read them back by this shape.
export type LogRow = {
  time: string;
  level: string;
  namespace: string;
  message: string;
  fields: string | null;
  errors: string | null;
  requestId: string | null;
};

const currentRequestId = (): string | null => {
  const fromJob = currentCorrelationId();
  if (fromJob !== null) {
    return fromJob;
  }
  try {
    return getGlobalStartContext()?.requestId ?? null;
  } catch {
    return null;
  }
};

const explicitRequestId = (fields?: LogFields): string | null => {
  const value = fields?.requestId;
  return typeof value === "string" ? value : null;
};

const prismaLogHandler: LogHandler = (record) => {
  const data: LogRow = {
    time: record.time.toISOString(),
    level: record.level,
    namespace: record.namespace,
    message: record.message,
    fields: record.fields ? JSON.stringify(formatFields(record.fields)) : null,
    errors:
      record.errors.length > 0
        ? JSON.stringify(
            record.errors.map((error) => error.stack ?? error.message),
          )
        : null,
    requestId: currentRequestId() ?? explicitRequestId(record.fields),
  };
  void prisma.log.create({ data }).catch((error: unknown) => {
    console.error("log: database write failed", error);
  });
};

export const createLogger = (namespace: string): Logger =>
  createBaseLogger(namespace, consoleLogHandler, prismaLogHandler);
