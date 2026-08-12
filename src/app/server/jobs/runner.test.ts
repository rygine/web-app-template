import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { clearJobs, MINUTE_MS, registerJob } from "@/app/server/jobs/registry";
import {
  reclaimStaleRuns,
  runDueJobs,
  runJob,
  STALE_LOCK_MS,
} from "@/app/server/jobs/runner";
import { queryLogs } from "@/app/server/log/query";
import { prisma } from "@/app/server/utils/prisma";

const noop = () => Promise.resolve();
const job = (
  name: string,
  over: Partial<Parameters<typeof runJob>[0]> = {},
) => ({
  name,
  title: name,
  intervalMs: MINUTE_MS,
  run: noop,
  ...over,
});

const latestRun = (name: string) =>
  prisma.jobRun.findFirst({ where: { name }, orderBy: { startedAt: "desc" } });

beforeEach(async () => {
  expect(process.env.DATA_DIR).toContain(".tmp/test");
  await prisma.jobRun.deleteMany();
  await prisma.job.deleteMany();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  clearJobs();
  vi.restoreAllMocks();
});

describe("runJob", () => {
  it("records a run that succeeded, with its duration", async () => {
    await runJob(job("archive"));

    const run = await latestRun("archive");
    expect(run?.status).toBe("succeeded");
    expect(run?.durationMs).toBeGreaterThanOrEqual(0);
    expect(run?.finishedAt).toBeInstanceOf(Date);
    expect(run?.error).toBeNull();
  });

  it("keeps every run, not just the most recent", async () => {
    await runJob(job("archive"));
    await runJob(job("archive"));
    await runJob(job("archive"));

    expect(await prisma.jobRun.count({ where: { name: "archive" } })).toBe(3);
  });

  it("releases the lock on the way out", async () => {
    await runJob(job("archive"));

    const row = await prisma.job.findUnique({ where: { name: "archive" } });
    expect(row?.runningSince).toBeNull();
    expect(row?.runningPid).toBeNull();
  });

  it("records a throwing job as failed, with its message", async () => {
    await runJob(
      job("archive", { run: () => Promise.reject(new Error("disk full")) }),
    );

    const run = await latestRun("archive");
    expect(run?.status).toBe("failed");
    expect(run?.error).toContain("disk full");
  });

  it("refuses a second run while the first is still going", async () => {
    const { promise, resolve } = Promise.withResolvers<void>();
    const run = vi.fn().mockReturnValue(promise);

    const first = runJob(job("archive", { run }));
    const second = await runJob(job("archive", { run }));

    expect(second).toBe("locked");

    resolve();
    expect(await first).toBe("succeeded");

    expect(run).toHaveBeenCalledOnce();
  });

  it("shows a run in flight as a row, not just a timestamp", async () => {
    const { promise, resolve } = Promise.withResolvers<void>();

    const inFlight = runJob(job("archive", { run: () => promise }));

    // The row is created inside runJob, so wait for it rather than racing it.
    await vi.waitFor(async () => {
      const running = await latestRun("archive");
      expect(running?.status).toBe("running");
      expect(running?.finishedAt).toBeNull();
    });

    resolve();
    await inFlight;
  });

  it("reclaims a lock left behind by a process that never released it", async () => {
    await prisma.job.create({
      data: {
        name: "archive",
        runningSince: new Date(Date.now() - STALE_LOCK_MS - 1000),
        runningPid: 999_999,
      },
    });

    expect(await runJob(job("archive"))).toBe("succeeded");
  });
});

describe("progress", () => {
  it("records what a job reports", async () => {
    await runJob(
      job("archive", {
        run: (context) => {
          context.report(40, "halfway-ish");
          return Promise.resolve();
        },
      }),
    );

    // The run finished, so progress is 100; the note is what it reported.
    const run = await latestRun("archive");
    expect(run?.note).toBe("halfway-ish");
    expect(run?.progress).toBe(100);
  });

  it("leaves progress unset for a job that never reports", async () => {
    const { promise, resolve } = Promise.withResolvers<void>();
    const inFlight = runJob(job("archive", { run: () => promise }));

    await vi.waitFor(async () => {
      const running = await latestRun("archive");
      expect(running?.status).toBe("running");
      expect(running?.progress).toBeNull();
    });

    resolve();
    await inFlight;
  });
});

describe("log correlation", () => {
  it("tags every record emitted during a run with that run's id", async () => {
    const { createLogger } = await import("@/app/server/log/logger");
    const log = createLogger("probe");

    await runJob(
      job("archive", {
        run: () => {
          log.info("something the job did");
          return Promise.resolve();
        },
      }),
    );

    const run = await latestRun("archive");
    const { entries } = await queryLogs({ requestId: `job-${run!.id}` });

    expect(entries.map((entry) => entry.message)).toContain(
      "something the job did",
    );
  });
});

describe("reclaimStaleRuns", () => {
  it("closes a run the server died in the middle of, and frees its lock", async () => {
    await prisma.job.create({
      data: { name: "archive", runningSince: new Date(), runningPid: 4242 },
    });
    await prisma.jobRun.create({
      data: { name: "archive", startedAt: new Date(), status: "running" },
    });

    expect(await reclaimStaleRuns()).toBe(1);

    const run = await latestRun("archive");
    expect(run?.status).toBe("interrupted");
    expect(run?.error).toMatch(/server stopped/i);
    const row = await prisma.job.findUnique({ where: { name: "archive" } });
    expect(row?.runningSince).toBeNull();
  });

  it("lets an interrupted job run again immediately, rather than waiting out the stale window", async () => {
    await prisma.job.create({
      data: { name: "archive", runningSince: new Date(), runningPid: 4242 },
    });
    await prisma.jobRun.create({
      data: { name: "archive", startedAt: new Date(), status: "running" },
    });

    await reclaimStaleRuns();

    expect(await runJob(job("archive"))).toBe("succeeded");
  });
});

describe("runDueJobs", () => {
  it("runs a job whose interval elapsed while the process was down", async () => {
    const run = vi.fn().mockResolvedValue(undefined);
    registerJob(job("archive", { run }));
    await prisma.jobRun.create({
      data: {
        name: "archive",
        startedAt: new Date(Date.now() - 5 * MINUTE_MS),
        status: "succeeded",
      },
    });

    await runDueJobs();

    expect(run).toHaveBeenCalledOnce();
  });

  it("leaves a job alone until its interval has elapsed", async () => {
    const run = vi.fn().mockResolvedValue(undefined);
    registerJob(job("archive", { intervalMs: 60 * MINUTE_MS, run }));
    await prisma.jobRun.create({
      data: {
        name: "archive",
        startedAt: new Date(Date.now() - MINUTE_MS),
        status: "succeeded",
      },
    });

    await runDueJobs();

    expect(run).not.toHaveBeenCalled();
  });

  it("runs a job that has never run", async () => {
    const run = vi.fn().mockResolvedValue(undefined);
    registerJob(job("archive", { run }));

    await runDueJobs();

    expect(run).toHaveBeenCalledOnce();
  });

  it("runs due jobs in parallel rather than one after another", async () => {
    const started: string[] = [];
    const gate = Promise.withResolvers<void>();

    registerJob(
      job("slow", {
        run: () => {
          started.push("slow");
          return gate.promise;
        },
      }),
    );
    registerJob(
      job("fast", {
        run: () => {
          started.push("fast");
          return Promise.resolve();
        },
      }),
    );

    const sweep = runDueJobs();
    await vi.waitFor(() => expect(started).toHaveLength(2));

    // The fast job started without waiting for the slow one to finish.
    gate.resolve();
    await sweep;
  });

  it("keeps going after one job throws", async () => {
    const second = vi.fn().mockResolvedValue(undefined);
    registerJob(job("first", { run: () => Promise.reject(new Error("nope")) }));
    registerJob(job("second", { run: second }));

    await runDueJobs();

    expect(second).toHaveBeenCalledOnce();
  });

  it("reads a configurable interval on every pass", async () => {
    const intervalMs = vi.fn().mockResolvedValue(30 * MINUTE_MS);
    registerJob(job("backup", { intervalMs }));
    await prisma.jobRun.create({
      data: {
        name: "backup",
        startedAt: new Date(Date.now() - MINUTE_MS),
        status: "succeeded",
      },
    });

    await runDueJobs();

    expect(intervalMs).toHaveBeenCalled();
  });
});

describe("the log level a job runs at", () => {
  it("is re-read per run, so a settings change reaches a scheduled job", async () => {
    delete process.env.LOG_LEVEL;
    await prisma.setting.deleteMany();
    await prisma.setting.create({ data: { id: "app", logLevel: "error" } });

    const debug = vi.spyOn(console, "debug").mockImplementation(() => {});
    const { createLogger } = await import("@/app/server/log/logger");
    const log = createLogger("probe");

    await runJob(
      job("quiet", {
        run: () => {
          log.debug("hush");
          return Promise.resolve();
        },
      }),
    );
    expect(debug).not.toHaveBeenCalled();

    await prisma.setting.update({
      where: { id: "app" },
      data: { logLevel: "trace" },
    });

    await runJob(
      job("loud", {
        run: () => {
          log.debug("audible");
          return Promise.resolve();
        },
      }),
    );
    expect(debug).toHaveBeenCalled();
  });
});
