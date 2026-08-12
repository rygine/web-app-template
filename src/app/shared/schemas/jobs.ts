import { z } from "zod";

import { pageSchema, pageSizeSchema } from "@/app/shared/schemas/paging";

export const jobNameSchema = z.object({
  name: z
    .string({ error: "A job name is required." })
    .min(1, "A job name is required."),
});

export const jobRunIdSchema = z.object({
  id: z
    .number({ error: "A run id is required." })
    .int("A run id must be a whole number."),
});

export const JOB_RUN_PAGE_SIZES = [10, 25, 50, 100] as const;
export const JOB_RUN_PAGE_SIZE_DEFAULT = 25;

export const JOB_RUN_STATUSES = [
  "running",
  "succeeded",
  "failed",
  "interrupted",
] as const;

export const jobRunStatusSchema = z.enum(JOB_RUN_STATUSES);

export type JobRunStatus = z.infer<typeof jobRunStatusSchema>;

export const jobRunStatusFilterSchema = z
  .enum(["all", ...JOB_RUN_STATUSES], {
    error: `Status must be all, ${JOB_RUN_STATUSES.join(", ")}.`,
  })
  .default("all");

export type JobRunStatusFilter = z.infer<typeof jobRunStatusFilterSchema>;

export const jobRunSearchSchema = z.object({
  page: pageSchema,
  job: z.string({ error: "Job must be text." }).default("all"),
  status: jobRunStatusFilterSchema,
  size: pageSizeSchema(JOB_RUN_PAGE_SIZES, JOB_RUN_PAGE_SIZE_DEFAULT),
});

export type JobRunSearch = z.infer<typeof jobRunSearchSchema>;

export type JobRunRecord = {
  id: number;
  name: string;
  startedAt: Date;
  status: JobRunStatus;
  durationMs: number | null;
  error: string | null;
};

export type JobRunPage = {
  runs: JobRunRecord[];
  total: number;
  pageCount: number;
};

export type JobView = {
  name: string;
  title: string;
  intervalMs: number;
  nextDueAt: Date | null;
  running: {
    startedAt: Date;
    progress: number | null;
    note: string | null;
  } | null;
  last: JobRunRecord | null;
};

export type JobLogLine = {
  time: Date;
  level: string;
  namespace: string;
  message: string;
};
