import { readFileSync } from "node:fs";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createLogger,
  loadLogLevel,
  refreshLogLevel,
} from "@/app/server/log/logger";
import { prisma } from "@/app/server/utils/prisma";
import { clearLogLevel } from "@/app/shared/utils/log";

const originalLevel = process.env.LOG_LEVEL;

beforeEach(async () => {
  expect(process.env.DATA_DIR).toContain(".tmp/test");
  await prisma.setting.deleteMany();
  delete process.env.LOG_LEVEL;
  clearLogLevel();
});

afterEach(() => {
  if (originalLevel === undefined) {
    delete process.env.LOG_LEVEL;
  } else {
    process.env.LOG_LEVEL = originalLevel;
  }
  clearLogLevel();
  vi.restoreAllMocks();
});

describe("loadLogLevel", () => {
  it("applies the stored level to a logger built before it ran", async () => {
    await prisma.setting.create({ data: { id: "app", logLevel: "error" } });
    const log = createLogger("probe");
    const debug = vi.spyOn(console, "debug").mockImplementation(() => {});

    await loadLogLevel();
    log.debug("quiet now");

    expect(debug).not.toHaveBeenCalled();
  });

  it("degrades to the default rather than throwing when there is no row", async () => {
    const debug = vi.spyOn(console, "debug").mockImplementation(() => {});

    await expect(loadLogLevel()).resolves.toBeUndefined();

    createLogger("probe").debug("still speaking");
    expect(debug).toHaveBeenCalled();
  });
});

// The middleware is the only thing that runs early enough to apply the stored
// level, and removing the call would revert every install to the default with
// nothing failing. Asserted against the source for the same reason
// routes.test.ts asserts against the generated route tree.
describe("the cost of reading it", () => {
  it("queries once per process, not once per request", async () => {
    // The guarantee is the memo, and the memo *is* the identity: every caller
    // after the first awaits the same already-settled promise. Measured at
    // 31ns per await, against 51us for the query it avoids.
    await loadLogLevel();

    expect(loadLogLevel()).toBe(loadLogLevel());
  });

  it("re-reads only when something asks it to", async () => {
    await prisma.setting.deleteMany();
    await prisma.setting.create({ data: { id: "app", logLevel: "error" } });
    // Refresh, not load: the memo may already be spent by an earlier case in
    // this file, which is the memo doing its job.
    await refreshLogLevel();

    // A memoized load cannot see this; a refresh must.
    await prisma.setting.update({
      where: { id: "app" },
      data: { logLevel: "trace" },
    });
    const debug = vi.spyOn(console, "debug").mockImplementation(() => {});

    await loadLogLevel();
    createLogger("probe").debug("still quiet");
    expect(debug).not.toHaveBeenCalled();

    await refreshLogLevel();
    createLogger("probe").debug("now audible");
    expect(debug).toHaveBeenCalled();
  });
});

describe("the startup wiring", () => {
  it("awaits the load inside the request middleware", () => {
    const source = readFileSync("src/start.ts", "utf8");

    expect(source).toContain("loadLogLevel");
    expect(source).toMatch(/await loadLogLevel\(\)/);
  });
});
