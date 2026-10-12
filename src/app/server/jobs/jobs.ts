import {
  backupDirFor,
  createBackup,
  pruneBackups,
} from "@/app/server/jobs/backup";
import { pruneJobRuns } from "@/app/server/jobs/history";
import { DAY_MS, getJob, registerJob } from "@/app/server/jobs/registry";
import type { Engine, JobDefinition } from "@/app/server/jobs/registry";
import { requestRun } from "@/app/server/jobs/runner";
import { archiveLogs } from "@/app/server/log/archive";
import { createLogger } from "@/app/server/log/logger";
import { getSettings } from "@/app/server/services/settings";

const log = createLogger("jobs");

// The second app → feature crossing, a glob like the nav's; lint cannot see it.
const featureJobs = import.meta.glob<{
  jobs: JobDefinition[];
  engines?: Engine[];
}>("@/features/*/server/jobs.ts", { eager: true });

// Named once, so the backups page can ask for this job without spelling it.
export const BACKUP_JOB = "backup";

// uncompressed bytes per archive file
const ARCHIVE_FILE_BYTES = 16 * 1024 * 1024;

let registered = false;

export const ensureJobsRegistered = () => {
  if (registered) {
    return;
  }
  registered = true;

  registerJob({
    name: "archive-logs",
    title: "Archive logs",
    intervalMs: DAY_MS,
    run: async () => {
      const { logRetentionDays } = await getSettings();
      await pruneJobRuns(new Date(Date.now() - logRetentionDays * DAY_MS));
      const result = await archiveLogs({
        compress: true,
        maxFileSize: ARCHIVE_FILE_BYTES,
      });
      if (result.error !== undefined) {
        throw result.error;
      }
    },
  });

  registerJob({
    name: BACKUP_JOB,
    title: "Backup",
    intervalMs: async () => (await getSettings()).backupInterval * DAY_MS,
    run: async (context) => {
      const { backupFolder, backupRetention } = await getSettings();
      const dir = backupDirFor(backupFolder);
      await createBackup(context.report, dir);
      context.report(100, "Pruning old archives");
      await pruneBackups({ dir, retentionDays: backupRetention });
    },
  });

  for (const module of Object.values(featureJobs)) {
    for (const job of module.jobs) {
      registerJob(job);
    }
  }
};

// starts a job without waiting
export const startJob = (name: string): void => {
  ensureJobsRegistered();
  const job = getJob(name);
  if (job === undefined) {
    return;
  }
  requestRun(job).catch((error: unknown) => {
    log.error("startJob: job failed to start", { name, error });
  });
};

export const startEngines = (): (() => void)[] => {
  const stops: (() => void)[] = [];
  for (const module of Object.values(featureJobs)) {
    for (const engine of module.engines ?? []) {
      try {
        stops.push(engine());
      } catch (error) {
        log.error("startEngines: an engine failed to start", { error });
      }
    }
  }
  return stops;
};
