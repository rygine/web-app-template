import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { gunzipSync } from "node:zlib";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { archiveLogs } from "@/app/server/log/archive";
import { createLogger } from "@/app/server/log/logger";
import { prisma } from "@/app/server/utils/prisma";

const originalLevel = process.env.LOG_LEVEL;
const originalLogsDir = process.env.LOGS_DIR;

let dir: string;

const entriesIn = (file: string) => {
  const raw = readFileSync(file);
  const text = (file.endsWith(".gz") ? gunzipSync(raw) : raw).toString("utf8");
  return text
    .trimEnd()
    .split("\n")
    .map((line) => JSON.parse(line));
};

const expectedName = async (suffix = ".jsonl") => {
  const rows = await prisma.log.findMany({ orderBy: { id: "asc" } });
  const first = rows.at(0)!;
  const last = rows.at(-1)!;
  return `logs-${first.time.slice(0, 10)}-${first.id}-${last.id}${suffix}`;
};

beforeEach(async () => {
  expect(process.env.DATA_DIR).toContain(".tmp/test");
  await prisma.log.deleteMany();

  dir = mkdtempSync(join(tmpdir(), "logarchive-"));
  process.env.LOG_LEVEL = "info";
  process.env.LOGS_DIR = dir;
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});

  const log = createLogger("items");
  log.info("item.created", { id: "a" });
  log.info("item.updated", { id: "b" });
  log.info("item.deleted", { id: "c" });
});

afterEach(() => {
  process.env.LOGS_DIR = originalLogsDir;
  process.env.LOG_LEVEL = originalLevel;
  rmSync(dir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe("archiveLogs", () => {
  it("exports every entry as JSON Lines in one file", async () => {
    const { files, entries } = await archiveLogs();

    expect(entries).toBe(3);
    expect(files).toHaveLength(1);
    expect(entriesIn(files[0]!).map((entry) => entry.message)).toEqual([
      "item.created",
      "item.updated",
      "item.deleted",
    ]);
  });

  it("keeps one self-describing record per line", async () => {
    const [entry] = entriesIn((await archiveLogs()).files[0]!);

    expect(entry).toMatchObject({
      level: "info",
      namespace: "items",
      message: "item.created",
      fields: { id: "a" },
    });
    expect(new Date(entry.time).toISOString()).toBe(entry.time);
  });

  it("rolls to a new file once the limit is reached", async () => {
    const { files, entries } = await archiveLogs({ maxFileSize: 1 });

    expect(entries).toBe(3);
    expect(files).toHaveLength(3);
    expect(
      files.flatMap((file) => entriesIn(file)).map((e) => e.message),
    ).toEqual(["item.created", "item.updated", "item.deleted"]);
  });

  it("gzips each file when compression is on", async () => {
    const { files } = await archiveLogs({ compress: true });

    expect(files[0]!.endsWith(".jsonl.gz")).toBe(true);
    expect(entriesIn(files[0]!)).toHaveLength(3);
  });

  it("removes archived entries from the database", async () => {
    expect((await archiveLogs()).entries).toBe(3);

    expect(await archiveLogs()).toEqual({ files: [], entries: 0 });
  });

  it("keeps entries written after the archive", async () => {
    await archiveLogs();
    createLogger("items").info("item.later", { id: "d" });

    const { files, entries } = await archiveLogs();

    expect(entries).toBe(1);
    expect(entriesIn(files[0]!).map((entry) => entry.message)).toEqual([
      "item.later",
    ]);
  });

  it("names each file by the id range it holds and leaves no temporary", async () => {
    const name = await expectedName();

    const { files } = await archiveLogs();

    expect(basename(files[0]!)).toBe(name);
    expect(basename(files[0]!)).toMatch(
      /^logs-\d{4}-\d{2}-\d{2}-\d+-\d+\.jsonl$/,
    );
    expect(readdirSync(join(dir, "archive"))).toEqual([basename(files[0]!)]);
  });

  it("keeps an archive file that already exists and still clears its rows", async () => {
    const name = await expectedName();
    mkdirSync(join(dir, "archive"), { recursive: true });
    const existing = join(dir, "archive", name);
    writeFileSync(existing, "untouched\n");

    const result = await archiveLogs();

    expect(result.files).toEqual([existing]);
    expect(result.entries).toBe(3);
    expect(readFileSync(existing, "utf8")).toBe("untouched\n");
    expect((await archiveLogs()).entries).toBe(0);
  });

  it("does not reuse the ids of archived rows", async () => {
    const firstName = await expectedName();
    await archiveLogs();

    const log = createLogger("items");
    log.info("item.created", { id: "a" });
    log.info("item.updated", { id: "b" });
    log.info("item.deleted", { id: "c" });

    expect(await expectedName()).not.toBe(firstName);

    const second = await archiveLogs();

    expect(second.entries).toBe(3);
    expect(entriesIn(second.files[0]!).map((entry) => entry.message)).toEqual([
      "item.created",
      "item.updated",
      "item.deleted",
    ]);
  });

  it("reports a failure and keeps the rows it could not write", async () => {
    const blocker = join(dir, "blocker");
    writeFileSync(blocker, "");

    const failed = await archiveLogs({ outDir: join(blocker, "archive") });

    expect(failed.error).toBeInstanceOf(Error);
    expect(failed.entries).toBe(0);
    expect(failed.files).toEqual([]);
    expect((await archiveLogs()).entries).toBe(3);
  });

  it("reports a failed run to the console", async () => {
    const blocker = join(dir, "blocker");
    writeFileSync(blocker, "");

    await archiveLogs({ outDir: join(blocker, "archive") });

    expect(vi.mocked(console.error).mock.calls[0]?.[0]).toContain(
      "archiveLogs: run stopped early",
    );
  });

  it("stores none of its own records in the database", async () => {
    await archiveLogs();

    expect(await prisma.log.count()).toBe(0);
  });

  it("sweeps a temporary left behind by an interrupted run", async () => {
    const stale = join(dir, "archive", "logs-2026-08-01-1-2.jsonl.999.tmp");
    mkdirSync(join(dir, "archive"), { recursive: true });
    writeFileSync(stale, "half a file");
    const old = new Date(Date.now() - 2 * 60 * 60 * 1000);
    utimesSync(stale, old, old);

    await archiveLogs();

    expect(existsSync(stale)).toBe(false);
  });

  it("leaves a temporary young enough to belong to a running archive", async () => {
    const fresh = join(dir, "archive", "logs-2026-08-01-1-2.jsonl.999.tmp");
    mkdirSync(join(dir, "archive"), { recursive: true });
    writeFileSync(fresh, "being written right now");

    await archiveLogs();

    expect(existsSync(fresh)).toBe(true);
  });

  it("returns an empty result when nothing is stored", async () => {
    await prisma.log.deleteMany();

    expect(await archiveLogs()).toEqual({ files: [], entries: 0 });
  });
});
