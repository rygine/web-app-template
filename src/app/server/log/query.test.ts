import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createLogger } from "@/app/server/log/logger";
import { queryLogs } from "@/app/server/log/query";
import { prisma } from "@/app/server/utils/prisma";
import type { LogFields } from "@/app/shared/utils/log";

const originalLevel = process.env.LOG_LEVEL;

const seed = (
  time: string,
  level: "info" | "warn" | "error",
  namespace: string,
  message: string,
  fields?: LogFields,
) => {
  vi.setSystemTime(new Date(time));
  createLogger(namespace)[level](message, fields);
};

beforeEach(async () => {
  expect(process.env.DATA_DIR).toContain(".tmp/test");
  await prisma.log.deleteMany();

  process.env.LOG_LEVEL = "info";
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.useFakeTimers({ toFake: ["Date"] });

  seed("2026-08-05T10:00:00.000Z", "info", "items", "item.created");
  seed("2026-08-05T11:00:00.000Z", "warn", "items", "degraded");
  seed("2026-08-06T10:00:00.000Z", "error", "http", "unhandled");
  seed("2026-08-06T11:00:00.000Z", "info", "items", "item.deleted");
});

afterEach(() => {
  process.env.LOG_LEVEL = originalLevel;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("queryLogs", () => {
  it("returns every entry newest first", async () => {
    const { entries, total, pageCount } = await queryLogs();

    expect(total).toBe(4);
    expect(pageCount).toBe(1);
    expect(entries.map((entry) => entry.message)).toEqual([
      "item.deleted",
      "unhandled",
      "degraded",
      "item.created",
    ]);
  });

  it("orders entries sharing a timestamp newest first", async () => {
    seed("2026-08-07T10:00:00.000Z", "info", "items", "written first");
    seed("2026-08-07T10:00:00.000Z", "info", "items", "written second");

    const { entries } = await queryLogs({
      from: new Date("2026-08-07T00:00:00.000Z"),
    });

    expect(entries.map((entry) => entry.message)).toEqual([
      "written second",
      "written first",
    ]);
  });

  it("exposes the parsed date, level, namespace and message", async () => {
    const [entry] = (await queryLogs({ namespace: "http" })).entries;

    expect(entry!.time.toISOString()).toBe("2026-08-06T10:00:00.000Z");
    expect(entry!.level).toBe("error");
    expect(entry!.namespace).toBe("http");
    expect(entry!.message).toBe("unhandled");
  });

  it("decodes fields and error stacks", async () => {
    seed("2026-08-07T10:00:00.000Z", "error", "ui", "action failed", {
      id: "abc",
      error: new Error("connection refused"),
    });

    const [entry] = (await queryLogs({ namespace: "ui" })).entries;

    expect(entry!.fields).toEqual({ id: "abc", error: "connection refused" });
    expect(entry!.errors![0]).toContain("connection refused");
  });

  it("filters to a time range", async () => {
    const { entries, total } = await queryLogs({
      from: new Date("2026-08-05T10:30:00.000Z"),
      to: new Date("2026-08-06T10:30:00.000Z"),
    });

    expect(total).toBe(2);
    expect(entries.map((entry) => entry.message)).toEqual([
      "unhandled",
      "degraded",
    ]);
  });

  it("treats level as a minimum severity", async () => {
    const { entries } = await queryLogs({ level: "warn" });

    expect(entries.map((entry) => entry.message)).toEqual([
      "unhandled",
      "degraded",
    ]);
  });

  it("filters to the records of one request", async () => {
    await prisma.log.createMany({
      data: [
        {
          time: "2026-08-06T12:00:00.000Z",
          level: "info",
          namespace: "http",
          message: "wanted",
          requestId: "req-1",
        },
        {
          time: "2026-08-06T12:00:01.000Z",
          level: "info",
          namespace: "http",
          message: "unwanted",
          requestId: "req-2",
        },
      ],
    });

    const { entries, total } = await queryLogs({ requestId: "req-1" });

    expect(total).toBe(1);
    expect(entries[0]?.message).toBe("wanted");
    expect(entries[0]?.requestId).toBe("req-1");
  });

  it("searches messages case-insensitively", async () => {
    const { entries, total } = await queryLogs({ search: "ITEM." });

    expect(total).toBe(2);
    expect(entries.map((entry) => entry.message)).toEqual([
      "item.deleted",
      "item.created",
    ]);
  });

  it("treats search as a literal substring, not a pattern", async () => {
    seed("2026-08-07T10:00:00.000Z", "info", "items", "item_created");

    const { entries } = await queryLogs({ search: "item_c" });

    expect(entries.map((entry) => entry.message)).toEqual(["item_created"]);
  });

  it("combines filters", async () => {
    const { entries, total } = await queryLogs({
      namespace: "items",
      level: "info",
      search: "created",
    });

    expect(total).toBe(1);
    expect(entries[0]!.message).toBe("item.created");
  });

  it("pages through results", async () => {
    const first = await queryLogs({ pageSize: 3 });
    const second = await queryLogs({ pageSize: 3, page: 2 });

    expect(first.entries).toHaveLength(3);
    expect(first.pageCount).toBe(2);
    expect(second.entries.map((entry) => entry.message)).toEqual([
      "item.created",
    ]);
  });

  it("returns an empty result when nothing is stored", async () => {
    await prisma.log.deleteMany();

    expect(await queryLogs()).toEqual({
      entries: [],
      total: 0,
      pageCount: 0,
    });
  });
});
