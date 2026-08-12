import {
  latestRun,
  runCorrelationId,
  runningRun,
  toJobRunRecord,
} from "@/app/server/jobs/history";
import { intervalOf, listJobs } from "@/app/server/jobs/registry";
import type { JobDefinition } from "@/app/server/jobs/registry";
import { withCorrelation } from "@/app/server/log/context";
import { createLogger, refreshLogLevel } from "@/app/server/log/logger";
import { prisma } from "@/app/server/utils/prisma";
import type { JobRunStatus, JobView } from "@/app/shared/schemas/jobs";

const log = createLogger("jobs");

export const STALE_LOCK_MS = 6 * 60 * 60 * 1000;

export type JobOutcome = "succeeded" | "failed" | "locked";

const acquire = async (name: string): Promise<boolean> => {
  await prisma.job.upsert({ where: { name }, update: {}, create: { name } });

  const { count } = await prisma.job.updateMany({
    where: {
      name,
      OR: [
        { runningSince: null },
        { runningSince: { lt: new Date(Date.now() - STALE_LOCK_MS) } },
      ],
    },
    data: { runningSince: new Date(), runningPid: process.pid },
  });
  return count === 1;
};

export const reclaimStaleRuns = async (): Promise<number> => {
  const { count } = await prisma.jobRun.updateMany({
    where: { status: "running" },
    data: {
      status: "interrupted",
      finishedAt: new Date(),
      error: "The server stopped while this run was in progress.",
    },
  });
  await prisma.job.updateMany({
    where: { runningSince: { not: null } },
    data: { runningSince: null, runningPid: null },
  });
  if (count > 0) {
    log.warn("reclaimStaleRuns: interrupted runs released", { count });
  }
  return count;
};

export const runJob = async (
  definition: JobDefinition,
): Promise<JobOutcome> => {
  const { name } = definition;

  if (!(await acquire(name))) {
    log.debug("runJob: already running", { name });
    return "locked";
  }

  await refreshLogLevel();

  const startedAt = new Date();
  const run = await prisma.jobRun.create({
    data: { name, startedAt, status: "running" },
  });

  const release = (status: JobRunStatus, error: string | null) =>
    Promise.all([
      prisma.jobRun.update({
        where: { id: run.id },
        data: {
          status,
          error,
          finishedAt: new Date(),
          durationMs: Date.now() - startedAt.getTime(),
          progress: status === "succeeded" ? 100 : undefined,
        },
      }),
      prisma.job.update({
        where: { name },
        data: { runningSince: null, runningPid: null },
      }),
    ]);

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
      const message = caught instanceof Error ? caught.message : String(caught);
      log.error("runJob: failed", { name, error: caught });
      await release("failed", message);
      return "failed";
    }
  });
};

// Null when the job has never run, which is "due now". A caller that already
// holds the latest run passes it rather than paying for the read twice.
export const dueAt = async (
  definition: JobDefinition,
  latest?: { startedAt: Date } | null,
): Promise<number | null> => {
  const last = latest === undefined ? await latestRun(definition.name) : latest;
  if (last === null) {
    return null;
  }
  return last.startedAt.getTime() + (await intervalOf(definition));
};

// What a page renders for one job: its schedule, the run in flight, and the
// last run that finished. The shape is the same whichever page asks.
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

export const runDueJobs = async (): Promise<void> => {
  await Promise.allSettled(
    listJobs().map(async (definition) => {
      if (await isDue(definition)) {
        await runJob(definition);
      }
    }),
  );
};
