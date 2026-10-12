import { setTimeout as sleep } from "node:timers/promises";

import {
  latestRun,
  runCorrelationId,
  runningRun,
  toJobRunRecord,
} from "@/app/server/jobs/history";
import {
  intervalOf,
  listJobs,
  MINUTE_MS,
  SECOND_MS,
} from "@/app/server/jobs/registry";
import type { JobDefinition } from "@/app/server/jobs/registry";
import { withCorrelation } from "@/app/server/log/context";
import { createLogger } from "@/app/server/log/logger";
import { prisma } from "@/app/server/utils/prisma";
import type { JobRunStatus, JobView } from "@/app/shared/schemas/jobs";
import { messageOf } from "@/app/shared/utils/errors";

const log = createLogger("jobs");

export const STALE_LOCK_MS = 6 * 60 * 60 * 1000;
export const HEARTBEAT_MS = MINUTE_MS;
export const LOCK_WAIT_MS = 5 * MINUTE_MS;

export type JobOutcome = "succeeded" | "failed" | "locked";

// A lock taken before this belongs to a dead run, and acquire may take it over.
const staleCutoff = () => new Date(Date.now() - STALE_LOCK_MS);

// The jobs running in this process.
const runningHere = () => (globalThis.runningJobs ??= new Set<string>());

// The time written is the lock's token: only the run that wrote it may move or release it.
const acquire = async (name: string): Promise<Date | null> => {
  await prisma.job.upsert({ where: { name }, update: {}, create: { name } });

  const since = new Date();
  const { count } = await prisma.job.updateMany({
    where: {
      name,
      OR: [{ runningSince: null }, { runningSince: { lt: staleCutoff() } }],
    },
    data: {
      runningSince: since,
      runningPid: process.pid,
      rerunRequested: false,
    },
  });
  return count === 1 ? since : null;
};

// Runs a function under a job's lock, with no JobRun.
export const withLock = async <T>(
  name: string,
  run: () => Promise<T>,
  busy?: Error,
): Promise<T> => {
  const deadline = Date.now() + LOCK_WAIT_MS;
  let since = await acquire(name);
  while (since === null) {
    if (busy !== undefined) {
      throw busy;
    }
    if (Date.now() >= deadline) {
      throw new Error(`The lock ${name} did not free in time.`);
    }
    await sleep(SECOND_MS);
    since = await acquire(name);
  }
  try {
    return await run();
  } finally {
    await prisma.job.updateMany({
      where: { name, runningPid: process.pid, runningSince: since },
      data: { runningSince: null, runningPid: null },
    });
  }
};

// With a cutoff, only runs and locks taken before it are released.
export const reclaimStaleRuns = async (
  reason = "The server stopped while this run was in progress.",
  cutoff?: Date,
): Promise<number> => {
  const { count } = await prisma.jobRun.updateMany({
    where: { status: "running", startedAt: { lt: cutoff } },
    data: { status: "interrupted", finishedAt: new Date(), error: reason },
  });
  await prisma.job.updateMany({
    where: { runningSince: { not: null, lt: cutoff } },
    data: { runningSince: null, runningPid: null },
  });
  if (count > 0) {
    log.warn("reclaimStaleRuns: interrupted runs released", { count });
  }
  return count;
};

const runOnce = async (definition: JobDefinition): Promise<JobOutcome> => {
  const { name } = definition;

  const acquired = await acquire(name);
  if (acquired === null) {
    log.debug("runJob: already running", { name });
    return "locked";
  }
  runningHere().add(name);
  let lockedSince = acquired;
  const ownLock = () => ({
    name,
    runningPid: process.pid,
    runningSince: lockedSince,
  });

  const startedAt = new Date();
  let run;
  try {
    run = await prisma.jobRun.create({
      data: { name, startedAt, status: "running" },
    });
  } catch (error) {
    log.error("runJob: could not start", { name, error });
    runningHere().delete(name);
    await prisma.job.updateMany({
      where: ownLock(),
      data: { runningSince: null, runningPid: null },
    });
    return "failed";
  }

  let beat = Promise.resolve();
  const refresh = async () => {
    const now = new Date();
    const { count } = await prisma.job.updateMany({
      where: ownLock(),
      data: { runningSince: now },
    });
    if (count === 1) {
      lockedSince = now;
    }
  };
  const heartbeat = setInterval(() => {
    beat = beat.then(refresh).catch((error: unknown) => {
      log.warn("runJob: lock refresh failed", { name, error });
    });
  }, HEARTBEAT_MS);

  const release = async (status: JobRunStatus, error: string | null) => {
    clearInterval(heartbeat);
    await beat;
    try {
      await prisma.jobRun.update({
        where: { id: run.id },
        data: {
          status,
          error,
          finishedAt: new Date(),
          durationMs: Date.now() - startedAt.getTime(),
          progress: status === "succeeded" ? 100 : undefined,
        },
      });
    } finally {
      await prisma.job.updateMany({
        where: ownLock(),
        data: { runningSince: null, runningPid: null },
      });
    }
  };

  let reported = -1;
  const context = {
    report: (percent: number, note?: string) => {
      const next = Math.min(100, Math.max(0, Math.round(percent)));
      if (next <= reported) {
        return;
      }
      reported = next;
      void prisma.jobRun
        .update({ where: { id: run.id }, data: { progress: next, note } })
        .catch(() => {
          // Progress is decoration; losing it must never fail the run.
        });
    },
  };

  return withCorrelation(runCorrelationId(run.id), async () => {
    try {
      log.info("runJob: started", { name });
      await definition.run(context);
      await release("succeeded", null);
      log.info("runJob: finished", {
        name,
        ms: Date.now() - startedAt.getTime(),
      });
      return "succeeded";
    } catch (caught) {
      log.error("runJob: failed", { name, error: caught });
      await release("failed", messageOf(caught));
      return "failed";
    } finally {
      clearInterval(heartbeat);
      runningHere().delete(name);
    }
  });
};

export const consumeRerun = async (name: string): Promise<boolean> => {
  const { count } = await prisma.job.updateMany({
    where: { name, rerunRequested: true },
    data: { rerunRequested: false },
  });
  return count === 1;
};

export const runJob = async (
  definition: JobDefinition,
): Promise<JobOutcome> => {
  let outcome = await runOnce(definition);
  while (outcome !== "locked" && (await consumeRerun(definition.name))) {
    outcome = await runOnce(definition);
  }
  return outcome;
};

// Runs now if the job is free; otherwise the run holding the lock runs again.
export const requestRun = async (definition: JobDefinition): Promise<void> => {
  if ((await runJob(definition)) !== "locked") {
    return;
  }
  await prisma.job.update({
    where: { name: definition.name },
    data: { rerunRequested: true },
  });
  // The holder may have released between the two writes.
  await runJob(definition);
};

// null when the job has never run, which means due now, and Infinity while a live run holds its lock
export const dueAt = async (
  definition: JobDefinition,
  latest?: { startedAt: Date } | null,
): Promise<number | null> => {
  if (runningHere().has(definition.name)) {
    return Number.POSITIVE_INFINITY;
  }
  const held = await prisma.job.count({
    where: { name: definition.name, runningSince: { gte: staleCutoff() } },
  });
  if (held > 0) {
    return Number.POSITIVE_INFINITY;
  }
  const last = latest === undefined ? await latestRun(definition.name) : latest;
  if (last === null) {
    return null;
  }
  return last.startedAt.getTime() + (await intervalOf(definition));
};

export const describeJob = async (
  definition: JobDefinition,
): Promise<JobView> => {
  const [latest, running, intervalMs] = await Promise.all([
    latestRun(definition.name),
    runningRun(definition.name),
    intervalOf(definition),
  ]);
  return {
    name: definition.name,
    title: definition.title,
    intervalMs,
    nextDueAt:
      latest === null
        ? null
        : new Date(latest.startedAt.getTime() + intervalMs),
    running:
      running === null
        ? null
        : {
            startedAt: running.startedAt,
            progress: running.progress,
            note: running.note,
          },
    last: latest === null ? null : toJobRunRecord(latest),
  };
};

const isDue = async (definition: JobDefinition): Promise<boolean> => {
  const due = await dueAt(definition);
  return due === null || due <= Date.now();
};

// Starts every due job without waiting for it, and resolves to the names it started.
export const runDueJobs = async (): Promise<string[]> => {
  const checks = await Promise.allSettled(
    listJobs().map(async (definition) => {
      if (!(await isDue(definition))) {
        return [];
      }
      void runJob(definition).catch((error: unknown) => {
        log.error("runDueJobs: job failed", { name: definition.name, error });
      });
      return [definition.name];
    }),
  );
  return checks.flatMap((check) =>
    check.status === "fulfilled" ? check.value : [],
  );
};
