import {
  backupDirFor,
  createBackup,
  pruneBackups,
} from "@/app/server/jobs/backup";
import { DAY_MS, registerJob } from "@/app/server/jobs/registry";
import { archiveLogs } from "@/app/server/log/archive";
import { getSettings } from "@/app/server/services/settings";

// Named once, so the backups page can ask for this job without spelling it.
export const BACKUP_JOB = "backup";

// Bounds the buffer an archive file is built in, and lets the loop yield between
// files: unbounded, a day of debug records is gzipped in one synchronous call.
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
};
