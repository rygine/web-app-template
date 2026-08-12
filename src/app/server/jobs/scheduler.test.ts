import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  clearJobs,
  HOUR_MS,
  MINUTE_MS,
  registerJob,
  SECOND_MS,
} from "@/app/server/jobs/registry";
import {
  MAX_DELAY_MS,
  MIN_DELAY_MS,
  nextDelay,
} from "@/app/server/jobs/scheduler";
import { prisma } from "@/app/server/utils/prisma";

const noop = () => Promise.resolve();

const ranAt = (name: string, ago: number) =>
  prisma.jobRun.create({
    data: {
      name,
      startedAt: new Date(Date.now() - ago),
      status: "succeeded",
    },
  });

beforeEach(async () => {
  expect(process.env.DATA_DIR).toContain(".tmp/test");
  await prisma.jobRun.deleteMany();
  await prisma.job.deleteMany();
});

afterEach(() => {
  clearJobs();
});

describe("nextDelay", () => {
  it("waits until the soonest job is due, not a fixed tick", async () => {
    registerJob({
      name: "minutely",
      title: "Minutely",
      intervalMs: 90 * SECOND_MS,
      run: noop,
    });
    await ranAt("minutely", MINUTE_MS);

    const delay = await nextDelay();

    // Thirty seconds left, give or take the time this test took.
    expect(delay).toBeGreaterThan(20 * SECOND_MS);
    expect(delay).toBeLessThanOrEqual(30 * SECOND_MS);
  });

  it("fires as soon as it can for a job that has never run", async () => {
    registerJob({
      name: "fresh",
      title: "Fresh",
      intervalMs: 30 * HOUR_MS,
      run: noop,
    });

    expect(await nextDelay()).toBe(MIN_DELAY_MS);
  });

  it("never sleeps below the floor, so a due job cannot spin", async () => {
    registerJob({
      name: "overdue",
      title: "Overdue",
      intervalMs: MINUTE_MS,
      run: noop,
    });
    await ranAt("overdue", HOUR_MS);

    expect(await nextDelay()).toBe(MIN_DELAY_MS);
  });

  it("clamps a long interval instead of handing setTimeout an overflow", async () => {
    registerJob({
      name: "monthly",
      title: "Monthly",
      intervalMs: 30 * 24 * HOUR_MS,
      run: noop,
    });
    await ranAt("monthly", MINUTE_MS);

    expect(await nextDelay()).toBe(MAX_DELAY_MS);
  });

  it("takes the soonest across every registered job", async () => {
    registerJob({
      name: "slow",
      title: "Slow",
      intervalMs: 10 * HOUR_MS,
      run: noop,
    });
    registerJob({
      name: "quick",
      title: "Quick",
      intervalMs: 5 * MINUTE_MS,
      run: noop,
    });
    await ranAt("slow", MINUTE_MS);
    await ranAt("quick", MINUTE_MS);

    expect(await nextDelay()).toBeLessThanOrEqual(4 * MINUTE_MS);
  });
});

describe("the clamps", () => {
  it("keeps the ceiling below setTimeout's 32-bit limit", () => {
    expect(MAX_DELAY_MS).toBeLessThan(2_147_483_647);
    expect(MIN_DELAY_MS).toBeGreaterThan(0);
  });
});
