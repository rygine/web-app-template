import {
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
} from "node:fs";
import { isAbsolute, join, resolve } from "node:path";

import { DAY_MS } from "@/app/server/jobs/registry";
import { runWorker, workerPath } from "@/app/server/jobs/subprocess";
import { createLogger } from "@/app/server/log/logger";
import { getSettings } from "@/app/server/services/settings";
import { databasePath, dataDir } from "@/app/server/utils/database";
import { appliedMigrations } from "@/app/server/utils/migrations";
import { APP_VERSION } from "@/app/shared/utils/app";
import { NotFoundError } from "@/app/shared/utils/errors";

const log = createLogger("backup");

const PREFIX = "backup-";
const SUFFIX = ".zip";

// Only ever a file this application wrote. Anything else — a traversal, a
// neighbouring file in the same folder — is not a backup.
export const ARCHIVE_NAME = /^backup-[A-Za-z0-9._-]+\.zip$/;

const WORKER = workerPath("backup");

type Report = (percent: number, note?: string) => void;

export const backupDirFor = (backupFolder: string): string =>
  isAbsolute(backupFolder)
    ? backupFolder
    : resolve(join(dataDir, backupFolder));

export const backupDir = async (): Promise<string> =>
  backupDirFor((await getSettings()).backupFolder);

export const currentManifest = async () => ({
  appVersion: APP_VERSION,
  migration: (await appliedMigrations())[0] ?? null,
  createdAt: new Date().toISOString(),
});

export const listBackups = async (dir?: string) => {
  const folder = dir ?? (await backupDir());
  let names: string[];
  try {
    names = readdirSync(folder);
  } catch {
    return [];
  }
  return names
    .filter((name) => ARCHIVE_NAME.test(name))
    .map((name) => {
      const { size, mtime } = statSync(join(folder, name));
      return { name, size, createdAt: mtime };
    })
    .toSorted((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
};

// The pattern, then the resolved path re-checked against its directory:
// traversal is the risk a name from outside carries. Null is "not a backup".
export const resolveBackupPath = async (
  name: string,
): Promise<string | null> => {
  if (!ARCHIVE_NAME.test(name)) {
    return null;
  }
  const dir = await backupDir();
  const path = join(dir, name);
  return resolve(path).startsWith(`${resolve(dir)}/`) && existsSync(path)
    ? path
    : null;
};

export const createBackup = async (
  report: Report = () => {},
  dir?: string,
): Promise<string> => {
  const folder = dir ?? (await backupDir());
  mkdirSync(folder, { recursive: true });

  const stamp = new Date().toISOString().replaceAll(":", "-");
  const outPath = join(folder, `${PREFIX}${stamp}${SUFFIX}`);
  const temporary = `${outPath}.${process.pid}.tmp`;
  const staging = join(folder, `staging.${process.pid}.db`);

  try {
    await runWorker(
      WORKER,
      {
        databasePath,
        stagingPath: staging,
        outPath: temporary,
        manifest: await currentManifest(),
      },
      {
        onProgress: (message) => {
          if (
            message !== null &&
            typeof message === "object" &&
            "totalPages" in message &&
            "remainingPages" in message &&
            typeof message.totalPages === "number" &&
            typeof message.remainingPages === "number" &&
            message.totalPages > 0
          ) {
            const done = message.totalPages - message.remainingPages;
            report((done / message.totalPages) * 100, "Copying the database");
          }
        },
      },
    );

    renameSync(temporary, outPath);
  } catch (error) {
    rmSync(temporary, { force: true });
    rmSync(staging, { force: true });
    throw error;
  }

  log.info("createBackup: archive written", { name: outPath });
  return outPath;
};

const currentPolicy = async () => {
  const { backupFolder, backupRetention } = await getSettings();
  return { dir: backupDirFor(backupFolder), retentionDays: backupRetention };
};

export const pruneBackups = async (policy?: {
  dir: string;
  retentionDays: number;
}): Promise<number> => {
  const { dir, retentionDays } = policy ?? (await currentPolicy());
  const cutoff = Date.now() - retentionDays * DAY_MS;

  let removed = 0;
  for (const { name, createdAt } of await listBackups(dir)) {
    if (createdAt.getTime() < cutoff) {
      rmSync(join(dir, name), { force: true });
      removed += 1;
    }
  }
  if (removed > 0) {
    log.info("pruneBackups: archives removed", { removed });
  }
  return removed;
};

export const deleteBackup = async (name: string): Promise<void> => {
  const path = await resolveBackupPath(name);
  if (path === null) {
    throw new NotFoundError("That backup does not exist.");
  }
  rmSync(path, { force: true });
  log.info("deleteBackup: archive removed", { name });
};
