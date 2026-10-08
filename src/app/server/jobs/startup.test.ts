import { readFileSync } from "node:fs";

import { afterEach, describe, expect, it, vi } from "vitest";

import { schedulerEnabled } from "@/app/server/jobs/startup";

describe("the scheduler's registration", () => {
  it("is listed as a nitro plugin in vite.config.ts", () => {
    const source = readFileSync("vite.config.ts", "utf8");

    expect(source).toContain("./src/app/server/jobs/startup.ts");
    expect(source).toMatch(/nitro\(\{\s*plugins:/);
  });
});

describe("schedulerEnabled", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is on unless CI or TEST holds a value", () => {
    vi.stubEnv("CI", undefined);
    vi.stubEnv("TEST", undefined);
    expect(schedulerEnabled()).toBe(true);

    vi.stubEnv("TEST", "");
    expect(schedulerEnabled()).toBe(true);

    vi.stubEnv("TEST", "1");
    expect(schedulerEnabled()).toBe(false);

    vi.stubEnv("TEST", undefined);
    vi.stubEnv("CI", "1");
    expect(schedulerEnabled()).toBe(false);
  });
});
