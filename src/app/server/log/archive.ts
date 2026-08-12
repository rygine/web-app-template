import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

import type { LogRow } from "@/app/server/log/logger";
import { prisma } from "@/app/server/utils/prisma";
import { createLogger } from "@/app/shared/utils/log";

const log = createLogger("archive");

export type ArchiveOptions = {
  maxFileSize?: number;
  compress?: boolean;
  outDir?: string;
};

export type ArchiveResult = {
  files: string[];
  entries: number;
  error?: Error;
};

// Read per call, not at import: a test sets LOGS_DIR after the module loads.
export const logsDir = () => process.env.LOGS_DIR ?? "./logs";

const BATCH = 500;
const TEMPORARY_GRACE_MS = 60 * 60 * 1000;

const sweepTemporary = (outDir: string) => {
  try {
    for (const name of readdirSync(outDir)) {
      if (!name.endsWith(".tmp")) {
        continue;
      }
      const path = join(outDir, name);
      if (Date.now() - statSync(path).mtimeMs > TEMPORARY_GRACE_MS) {
        rmSync(path, { force: true });
        log.warn("sweepTemporary: removed stale temporary", { path });
      }
    }
  } catch {
    log.trace("sweepTemporary: archive directory unreadable", { outDir });
  }
};

const writeAtomic = (path: string, payload: string | Uint8Array) => {
  const temporary = `${path}.${process.pid}.tmp`;
  const handle = openSync(temporary, "w");
  try {
    writeFileSync(handle, payload);
    fsyncSync(handle);
  } finally {
    closeSync(handle);
  }
  renameSync(temporary, path);
};

const decode = (value: string | null): unknown => {
  if (value === null) {
    return undefined;
  }
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed;
  } catch {
    return undefined;
  }
};

const toRecord = (row: LogRow & { id: number }) => ({
  id: row.id,
  day: row.time.slice(0, 10),
  line: JSON.stringify({
    time: row.time,
    level: row.level,
    namespace: row.namespace,
    message: row.message,
    fields: decode(row.fields),
    errors: decode(row.errors),
    requestId: row.requestId ?? undefined,
  }),
});

export const archiveLogs = async (
  options: ArchiveOptions = {},
): Promise<ArchiveResult> => {
  const outDir = options.outDir ?? join(logsDir(), "archive");
  log.trace("archiveLogs: run started", { outDir });
  sweepTemporary(outDir);

  const limit = options.maxFileSize ?? Number.POSITIVE_INFINITY;
  const suffix = options.compress ? ".jsonl.gz" : ".jsonl";

  const files: string[] = [];
  let entries = 0;
  let error: Error | undefined;
  let lines: string[] = [];
  let size = 0;
  let firstId = 0;
  let lastId = 0;
  let day = "";

  const flush = async () => {
    if (lines.length === 0) {
      return;
    }
    mkdirSync(outDir, { recursive: true });
    const file = join(outDir, `logs-${day}-${firstId}-${lastId}${suffix}`);
    if (!existsSync(file)) {
      const text = `${lines.join("\n")}\n`;
      writeAtomic(file, options.compress ? gzipSync(text) : text);
    }
    files.push(file);
    await prisma.log.deleteMany({
      where: { id: { gte: firstId, lte: lastId } },
    });
    entries += lines.length;
    lines = [];
    size = 0;
  };

  try {
    let cursor = 0;

    for (;;) {
      const rows = await prisma.log.findMany({
        where: { id: { gt: cursor } },
        orderBy: { id: "asc" },
        take: BATCH,
      });
      if (rows.length === 0) {
        break;
      }
      for (const row of rows) {
        const record = toRecord(row);
        cursor = record.id;
        const bytes = Buffer.byteLength(record.line) + 1;
        if (size > 0 && size + bytes > limit) {
          await flush();
        }
        if (lines.length === 0) {
          firstId = record.id;
          day = record.day;
        }
        lastId = record.id;
        lines.push(record.line);
        size += bytes;
      }
    }
    await flush();
  } catch (caught) {
    error = caught instanceof Error ? caught : new Error(String(caught));
  }

  if (error) {
    log.error("archiveLogs: run stopped early", {
      error,
      files: files.length,
      entries,
    });
  } else {
    log.info("archiveLogs: run complete", { files: files.length, entries });
  }

  return { files, entries, error };
};
