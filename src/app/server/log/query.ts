import { createLogger } from "@/app/server/log/logger";
import type { LogRow } from "@/app/server/log/logger";
import { prisma } from "@/app/server/utils/prisma";
import { LOG_RANK, isLogLevel } from "@/app/shared/utils/log";
import type { EmittedLevel, LogLevel } from "@/app/shared/utils/log";
import { Prisma } from "@/generated/prisma/client";

const log = createLogger("log");

export const LOG_PAGE_SIZE = 100;

export type LogEntry = {
  time: Date;
  level: EmittedLevel;
  namespace: string;
  message: string;
  fields?: Record<string, string>;
  errors?: string[];
  requestId?: string;
};

export type LogQuery = {
  from?: Date;
  to?: Date;
  level?: LogLevel;
  namespace?: string;
  requestId?: string;
  search?: string;
  page?: number;
  pageSize?: number;
};

export type LogQueryResult = {
  entries: LogEntry[];
  total: number;
  pageCount: number;
};

const EMPTY: LogQueryResult = { entries: [], total: 0, pageCount: 0 };

// Every level that produces a record, from the ranking rather than a hand list.
const EMITTED = Object.keys(LOG_RANK)
  .filter(isLogLevel)
  .filter((level): level is EmittedLevel => level !== "off");

const atOrAbove = (level: LogLevel) =>
  EMITTED.filter((candidate) => LOG_RANK[candidate] >= LOG_RANK[level]);

const literal = (search: string) =>
  search.replaceAll(/[\\%_]/g, (match) => `\\${match}`);

const isStringMap = (value: unknown): value is Record<string, string> =>
  typeof value === "object" &&
  value !== null &&
  Object.values(value).every((entry) => typeof entry === "string");

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((entry) => typeof entry === "string");

const decode = <T>(
  value: string | null,
  guard: (candidate: unknown) => candidate is T,
): T | undefined => {
  if (value === null) {
    return undefined;
  }
  try {
    const parsed: unknown = JSON.parse(value);
    return guard(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
};

const toEntry = (row: LogRow): LogEntry | undefined => {
  const time = new Date(row.time);
  if (
    Number.isNaN(time.getTime()) ||
    !isLogLevel(row.level) ||
    row.level === "off"
  ) {
    return undefined;
  }
  return {
    time,
    level: row.level,
    namespace: row.namespace,
    message: row.message,
    fields: decode(row.fields, isStringMap),
    errors: decode(row.errors, isStringArray),
    requestId: row.requestId ?? undefined,
  };
};

export const queryLogs = async (
  query: LogQuery = {},
): Promise<LogQueryResult> => {
  const page = Math.max(query.page ?? 1, 1);
  const pageSize = Math.max(query.pageSize ?? LOG_PAGE_SIZE, 1);
  const levels = atOrAbove(query.level ?? "trace");
  if (levels.length === 0) {
    return EMPTY;
  }

  const conditions: Prisma.Sql[] = [
    Prisma.sql`level IN (${Prisma.join(levels)})`,
  ];
  if (query.from) {
    conditions.push(Prisma.sql`time >= ${query.from.toISOString()}`);
  }
  if (query.to) {
    conditions.push(Prisma.sql`time <= ${query.to.toISOString()}`);
  }
  if (query.namespace) {
    conditions.push(Prisma.sql`namespace = ${query.namespace}`);
  }
  if (query.requestId) {
    conditions.push(Prisma.sql`requestId = ${query.requestId}`);
  }
  if (query.search) {
    conditions.push(
      Prisma.sql`message LIKE ${`%${literal(query.search)}%`} ESCAPE '\\'`,
    );
  }
  const where = Prisma.sql`WHERE ${Prisma.join(conditions, " AND ")}`;

  const counted = await prisma.$queryRaw<{ total: number | bigint }[]>`
    SELECT COUNT(*) AS total FROM logs ${where}
  `;
  const total = Number(counted.at(0)?.total ?? 0);

  const rows = await prisma.$queryRaw<LogRow[]>`
    SELECT time, level, namespace, message, fields, errors, requestId FROM logs
    ${where} ORDER BY time DESC, id DESC LIMIT ${pageSize} OFFSET ${
      (page - 1) * pageSize
    }
  `;

  log.trace("queryLogs: query resolved", {
    levels: levels.join(","),
    page,
    pageSize,
    returned: rows.length,
    total,
  });

  return {
    entries: rows.map(toEntry).filter((entry) => entry !== undefined),
    total,
    pageCount: Math.ceil(total / pageSize),
  };
};
