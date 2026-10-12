import { prisma } from "@/app/server/utils/prisma";
import {
  jobRunSearchSchema,
  jobRunStatusSchema,
} from "@/app/shared/schemas/jobs";
import type {
  JobRunPage,
  JobRunRecord,
  JobRunSearch,
} from "@/app/shared/schemas/jobs";
import type { JobRun } from "@/generated/prisma/client";

// the correlation id of a run's log records
export const runCorrelationId = (id: number) => `job-${id}`;

const newestFirst = { startedAt: "desc" } as const;

export const latestRun = (name: string) =>
  prisma.jobRun.findFirst({
    where: { name, status: { not: "running" } },
    orderBy: newestFirst,
  });

export const latestSucceededRun = (name: string) =>
  prisma.jobRun.findFirst({
    where: { name, status: "succeeded" },
    orderBy: newestFirst,
  });

export const runningRun = (name: string) =>
  prisma.jobRun.findFirst({
    where: { name, status: "running" },
    orderBy: newestFirst,
  });

// The column is text and only runJob writes it, so anything else is corruption.
export const toJobRunRecord = (run: JobRun): JobRunRecord => ({
  id: run.id,
  name: run.name,
  startedAt: run.startedAt,
  status: jobRunStatusSchema.parse(run.status),
  durationMs: run.durationMs,
  error: run.error,
});

export const listJobRuns = async (
  input: Partial<JobRunSearch> = {},
): Promise<JobRunPage> => {
  const { page, size, job, status } = jobRunSearchSchema.parse(input);

  const where = {
    ...(job === "all" ? {} : { name: job }),
    ...(status === "all" ? {} : { status }),
  };

  const [runs, total] = await Promise.all([
    prisma.jobRun.findMany({
      where,
      orderBy: newestFirst,
      skip: (page - 1) * size,
      take: size,
    }),
    prisma.jobRun.count({ where }),
  ]);

  return {
    runs: runs.map(toJobRunRecord),
    total,
    pageCount: Math.max(1, Math.ceil(total / size)),
  };
};

// Keeps runs in flight and each job's newest run and newest succeeded run.
export const pruneJobRuns = async (before: Date): Promise<number> => {
  const names = await prisma.jobRun.findMany({
    where: { startedAt: { lt: before } },
    distinct: ["name"],
    select: { name: true },
  });
  const kept = await Promise.all(
    names.flatMap(({ name }) => [latestRun(name), latestSucceededRun(name)]),
  );
  const { count } = await prisma.jobRun.deleteMany({
    where: {
      startedAt: { lt: before },
      status: { not: "running" },
      id: { notIn: kept.flatMap((run) => (run === null ? [] : [run.id])) },
    },
  });
  return count;
};
