import { setTimeout as sleep } from "node:timers/promises";

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  onTestFinished,
  vi,
} from "vitest";

import {
  clearJobs,
  DAY_MS,
  MINUTE_MS,
  registerJob,
} from "@/app/server/jobs/registry";
import type { JobDefinition } from "@/app/server/jobs/registry";
import {
  consumeRerun,
  HEARTBEAT_MS,
  reclaimStaleRuns,
  requestRun,
  runDueJobs,
  runJob,
  STALE_LOCK_MS,
  withLock,
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

// Waits for a job's newest run to close out.
const settled = (name: string) =>
  vi.waitFor(async () => {
    const run = await latestRun(name);
    expect(run).not.toBeNull();
    expect(run?.status).not.toBe("running");
  });

beforeEach(async () => {
  expect(process.env.DATA_DIR).toContain(".tmp/test");
  await prisma.jobRun.deleteMany();
  await prisma.job.deleteMany();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  clearJobs();
  vi.restoreAllMocks();
  vi.useRealTimers();
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

  it("keeps every run, and releases the lock after each", async () => {
    await runJob(job("archive"));
    await runJob(job("archive"));
    await runJob(job("archive"));

    expect(await prisma.jobRun.count({ where: { name: "archive" } })).toBe(3);
    const row = await prisma.job.findUnique({ where: { name: "archive" } });
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
});

const lockOf = async (name: string) =>
  (await prisma.job.findUniqueOrThrow({ where: { name } })).runningSince;

describe("the lock of a long run", () => {
  it("is refreshed while the run is in progress, so it never goes stale", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
    const started = Promise.withResolvers<void>();
    const { promise, resolve } = Promise.withResolvers<void>();
    const inFlight = runJob(
      job("long", {
        run: () => {
          started.resolve();
          return promise;
        },
      }),
    );
    await started.promise;
    const acquired = (await lockOf("long"))!.getTime();

    vi.advanceTimersByTime(HEARTBEAT_MS);
    await expect
      .poll(async () => (await lockOf("long"))?.getTime())
      .toBe(acquired + HEARTBEAT_MS);

    // Past the stale window of the first write, but not of the refreshed one.
    vi.setSystemTime(acquired + STALE_LOCK_MS + 1000);
    expect(await runJob(job("long"))).toBe("locked");

    resolve();
    expect(await inFlight).toBe("succeeded");
    expect(await lockOf("long")).toBeNull();
  });

  it("is not released once another process has reclaimed it", async () => {
    const other = new Date();
    const outcome = await runJob(
      job("long", {
        run: async () => {
          await prisma.job.update({
            where: { name: "long" },
            data: { runningSince: other, runningPid: 999_999 },
          });
        },
      }),
    );

    expect(outcome).toBe("succeeded");
    expect(
      await prisma.job.findUnique({ where: { name: "long" } }),
    ).toMatchObject({ runningSince: other, runningPid: 999_999 });
    expect((await latestRun("long"))?.status).toBe("succeeded");
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
  it("closes a run the server died in the middle of", async () => {
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
  it("interrupts only the runs started before the cutoff, with the reason given", async () => {
    const cutoff = new Date();
    await prisma.jobRun.createMany({
      data: [
        {
          name: "before",
          startedAt: new Date(cutoff.getTime() - 1000),
          status: "running",
        },
        {
          name: "after",
          startedAt: new Date(cutoff.getTime() + 1000),
          status: "running",
        },
      ],
    });

    expect(await reclaimStaleRuns("A restore.", cutoff)).toBe(1);

    expect((await latestRun("after"))?.status).toBe("running");
    expect(await latestRun("before")).toMatchObject({
      status: "interrupted",
      error: "A restore.",
    });
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

    expect(await runDueJobs()).toEqual(["archive"]);

    await vi.waitFor(() => expect(run).toHaveBeenCalledOnce());
    await settled("archive");
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

    expect(await runDueJobs()).toEqual([]);
    expect(run).not.toHaveBeenCalled();
  });

  it("runs a job that has never run", async () => {
    const run = vi.fn().mockResolvedValue(undefined);
    registerJob(job("archive", { run }));

    expect(await runDueJobs()).toEqual(["archive"]);
    await settled("archive");

    expect(run).toHaveBeenCalledOnce();
  });

  it("returns while a slow job runs, and the other due jobs still finish", async () => {
    const gate = Promise.withResolvers<void>();
    onTestFinished(() => gate.resolve());
    registerJob(job("slow", { run: () => gate.promise }));
    registerJob(job("fast"));

    expect(await runDueJobs()).toEqual(["slow", "fast"]);
    await settled("fast");
    expect((await latestRun("fast"))?.status).toBe("succeeded");
    expect((await latestRun("slow"))?.status).toBe("running");

    gate.resolve();
    await settled("slow");
    expect((await latestRun("slow"))?.status).toBe("succeeded");
  });

  it("leaves a job alone while a live run holds its lock", async () => {
    const run = vi.fn().mockResolvedValue(undefined);
    registerJob(job("busy", { run }));
    await prisma.job.create({
      data: { name: "busy", runningSince: new Date(), runningPid: process.pid },
    });
    await prisma.jobRun.create({
      data: { name: "busy", startedAt: new Date(), status: "running" },
    });

    expect(await runDueJobs()).toEqual([]);
    expect(run).not.toHaveBeenCalled();
  });

  it("leaves a job alone while it runs in this process, even after a restore cleared its lock", async () => {
    const gate = Promise.withResolvers<void>();
    onTestFinished(() => gate.resolve());
    const run = vi.fn().mockReturnValue(gate.promise);
    registerJob(job("restored", { run }));
    expect(await runDueJobs()).toEqual(["restored"]);
    await vi.waitFor(() => expect(run).toHaveBeenCalledOnce());

    await prisma.job.updateMany({
      data: { runningSince: null, runningPid: null },
    });
    await prisma.jobRun.updateMany({
      data: { startedAt: new Date(Date.now() - DAY_MS) },
    });

    expect(await runDueJobs()).toEqual([]);
    gate.resolve();
    await settled("restored");
    expect(run).toHaveBeenCalledOnce();
  });

  it("runs a job again once its dead holder's lock has gone stale", async () => {
    const run = vi.fn().mockResolvedValue(undefined);
    registerJob(job("orphaned", { run }));
    const stale = new Date(Date.now() - STALE_LOCK_MS - MINUTE_MS);
    await prisma.job.create({
      data: { name: "orphaned", runningSince: stale, runningPid: 999_999 },
    });
    await prisma.jobRun.create({
      data: { name: "orphaned", startedAt: stale, status: "running" },
    });

    expect(await runDueJobs()).toEqual(["orphaned"]);
    await settled("orphaned");

    expect(run).toHaveBeenCalledOnce();
  });

  it("keeps going after one job throws", async () => {
    const second = vi.fn().mockResolvedValue(undefined);
    registerJob(job("first", { run: () => Promise.reject(new Error("nope")) }));
    registerJob(job("second", { run: second }));

    expect(await runDueJobs()).toEqual(["first", "second"]);
    await settled("first");
    await settled("second");

    expect((await latestRun("first"))?.status).toBe("failed");
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

    expect(await runDueJobs()).toEqual([]);

    expect(intervalMs).toHaveBeenCalled();
  });
});

describe("requestRun", () => {
  it("runs at once when the job is free", async () => {
    let runs = 0;
    const definition: JobDefinition = {
      name: "request-free",
      title: "Request free",
      intervalMs: DAY_MS,
      run: async () => {
        runs += 1;
      },
    };

    await requestRun(definition);

    expect(runs).toBe(1);
  });

  it("runs once more after a run that held the lock", async () => {
    const gate = Promise.withResolvers<void>();
    let runs = 0;
    const definition: JobDefinition = {
      name: "request-held",
      title: "Request held",
      intervalMs: DAY_MS,
      run: async () => {
        runs += 1;
        if (runs === 1) {
          await gate.promise;
        }
      },
    };

    const first = runJob(definition);
    await expect.poll(() => runs).toBe(1);
    await requestRun(definition);
    gate.resolve();
    await first;

    expect(runs).toBe(2);
  });

  it("forgets a request that a run already covered", async () => {
    let runs = 0;
    const definition: JobDefinition = {
      name: "request-covered",
      title: "Request covered",
      intervalMs: DAY_MS,
      run: async () => {
        runs += 1;
      },
    };
    await prisma.job.upsert({
      where: { name: definition.name },
      update: { rerunRequested: true },
      create: { name: definition.name, rerunRequested: true },
    });

    await runJob(definition);

    expect(runs).toBe(1);
    expect(await consumeRerun(definition.name)).toBe(false);
  });

  it("releases the lock when the run row cannot be written", async () => {
    const definition: JobDefinition = {
      name: "row-fails",
      title: "Row fails",
      intervalMs: DAY_MS,
      run: async () => {},
    };
    const create = vi
      .spyOn(prisma.jobRun, "create")
      .mockRejectedValueOnce(new Error("disk full"));

    expect(await runJob(definition)).toBe("failed");
    create.mockRestore();

    const row = await prisma.job.findUniqueOrThrow({
      where: { name: "row-fails" },
    });
    expect(row.runningSince).toBeNull();
    expect(await runJob(definition)).toBe("succeeded");
  });

  it("closes the run row before it frees the lock", async () => {
    const update = prisma.jobRun.update.bind(prisma.jobRun);
    const updateMany = prisma.job.updateMany.bind(prisma.job);
    let closed = false;
    let closedFirst: boolean | undefined;
    vi.spyOn(prisma.jobRun, "update").mockImplementation((args) => {
      const write = update(args);
      void write.then(() => (closed = true));
      return write;
    });
    vi.spyOn(prisma.job, "updateMany").mockImplementation((args) => {
      if (args.data.runningSince === null) {
        closedFirst = closed;
      }
      return updateMany(args);
    });

    expect(await runJob(job("ordered"))).toBe("succeeded");

    expect(closedFirst).toBe(true);
  });

  it("frees the lock when the run row cannot be closed", async () => {
    vi.spyOn(prisma.jobRun, "update").mockRejectedValue(new Error("disk full"));

    await expect(runJob(job("unclosed"))).rejects.toThrow("disk full");

    expect(await lockOf("unclosed")).toBeNull();
  });
});

describe("withLock", () => {
  it("runs a second holder after the first, and frees the lock after a throw", async () => {
    const order: string[] = [];
    const { promise: held, resolve: release } = Promise.withResolvers<void>();
    const first = withLock("item", async () => {
      order.push("first");
      await held;
      throw new Error("boom");
    });
    await vi.waitFor(() => {
      expect(order).toEqual(["first"]);
    });
    const second = withLock("item", async () => {
      order.push("second");
    });
    await sleep(50);
    expect(order).toEqual(["first"]);
    release();
    await expect(first).rejects.toThrow("boom");
    await second;

    expect(order).toEqual(["first", "second"]);
    expect(
      (await prisma.job.findUniqueOrThrow({ where: { name: "item" } }))
        .runningSince,
    ).toBeNull();
  });
});
