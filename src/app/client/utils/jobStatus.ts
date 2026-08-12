import type { JobRunStatus } from "@/app/shared/schemas/jobs";

// Short enough to fit the badge at every width the table is squeezed to, and
// exhaustive, so a new status is a type error here rather than a grey badge.
export const JOB_STATUS_LABELS: Record<JobRunStatus, string> = {
  succeeded: "success",
  failed: "fail",
  running: "run",
  interrupted: "interrupt",
};
