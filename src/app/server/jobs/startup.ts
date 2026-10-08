import { ensureJobsRegistered } from "@/app/server/jobs/jobs";
import { reclaimStaleRuns } from "@/app/server/jobs/runner";
import { startScheduler } from "@/app/server/jobs/scheduler";
import { loadLogLevel } from "@/app/server/log/logger";
import { envValue } from "@/app/server/utils/env";

// Off when CI or TEST holds a value; an empty value counts as unset.
export const schedulerEnabled = () =>
  envValue("CI") === undefined && envValue("TEST") === undefined;

export default async () => {
  if (!schedulerEnabled()) {
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
