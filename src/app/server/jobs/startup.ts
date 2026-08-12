import { ensureJobsRegistered } from "@/app/server/jobs/jobs";
import { reclaimStaleRuns } from "@/app/server/jobs/runner";
import { startScheduler } from "@/app/server/jobs/scheduler";
import { loadLogLevel } from "@/app/server/log/logger";

export default async () => {
  if (process.env.CI !== undefined || process.env.TEST !== undefined) {
    return;
  }

  try {
    await loadLogLevel();

    ensureJobsRegistered();

    await reclaimStaleRuns();
    await startScheduler();
  } catch (error) {
    console.error("jobs: scheduler failed to start", error);
  }
};
