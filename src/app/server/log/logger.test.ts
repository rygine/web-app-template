import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createLogger } from "@/app/server/log/logger";
import { prisma } from "@/app/server/utils/prisma";

const originalLevel = process.env.LOG_LEVEL;

const rows = () => prisma.log.findMany({ orderBy: { id: "asc" } });

beforeEach(async () => {
  expect(process.env.DATA_DIR).toContain(".tmp/test");
  await prisma.log.deleteMany();
  process.env.LOG_LEVEL = "debug";
  vi.spyOn(console, "debug").mockImplementation(() => {});
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  process.env.LOG_LEVEL = originalLevel;
  vi.restoreAllMocks();
});

describe("prisma log handler", () => {
  it("writes one row per record, at every level LOG_LEVEL admits", async () => {
    const log = createLogger("items");

    log.debug("listing", { page: 1 });
    log.info("item.created", { id: "abc" });
    log.warn("degraded");

    expect(await rows()).toMatchObject([
      { level: "debug", namespace: "items", message: "listing" },
      { level: "info", namespace: "items", message: "item.created" },
      { level: "warn", namespace: "items", message: "degraded" },
    ]);
  });

  it("stores no request id for a record emitted outside a request", async () => {
    createLogger("items").info("item.created", { id: "abc" });

    const [row] = await rows();

    expect(row!.requestId).toBeNull();
  });

  it("stores a request id passed explicitly in fields", async () => {
    process.env.LOG_LEVEL = "trace";
    createLogger("http").trace("requestContext: request received", {
      requestId: "req-1",
      method: "GET",
    });

    const [row] = await rows();

    expect(row).toMatchObject({ level: "trace", requestId: "req-1" });
  });

  it("stores fields and error stacks as JSON", async () => {
    createLogger("ui").error("action failed", {
      id: "abc",
      error: new Error("connection refused"),
    });

    const [row] = await rows();

    expect(JSON.parse(String(row!.fields))).toEqual({
      id: "abc",
      error: "connection refused",
    });
    expect(JSON.parse(String(row!.errors))[0]).toContain("connection refused");
  });

  it("assigns ids in the order records were emitted", async () => {
    const log = createLogger("items");

    const messages = Array.from(
      { length: 25 },
      (_, index) => `record ${index}`,
    );
    for (const message of messages) {
      log.info(message);
    }

    expect((await rows()).map((row) => row.message)).toEqual(messages);
  });

  it("stores a write nothing awaited before the next query runs", async () => {
    createLogger("items").info("item.created");

    expect(await prisma.log.count()).toBe(1);
  });

  it("keeps logging after a failed write", async () => {
    const log = createLogger("items");
    await prisma.$executeRawUnsafe("ALTER TABLE logs RENAME TO logs_moved");
    log.info("lands nowhere");
    await prisma.$executeRawUnsafe("ALTER TABLE logs_moved RENAME TO logs");

    log.info("lands fine");

    expect((await rows()).map((row) => row.message)).toEqual(["lands fine"]);
  });
});
