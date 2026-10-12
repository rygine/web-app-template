import { randomUUID } from "node:crypto";
import { createWriteStream, existsSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";

import { currentManifest } from "@/app/server/jobs/backup";
import { reclaimStaleRuns, withLock } from "@/app/server/jobs/runner";
import { runWorker, workerPath } from "@/app/server/jobs/subprocess";
import { createLogger } from "@/app/server/log/logger";
import { databasePath, dataDir } from "@/app/server/utils/database";
import { prisma } from "@/app/server/utils/prisma";
import { SETTINGS_ID } from "@/app/shared/schemas/settings";
import { ReportableError } from "@/app/shared/utils/errors";
import { safeJson } from "@/app/shared/utils/json";
import { isLogLevel, setLogLevel } from "@/app/shared/utils/log";

const log = createLogger("restore");

const WORKER = workerPath("restore");

// 2GB: large enough for any realistic database, small enough that a stray
// upload cannot fill the volume.
const MAX_UPLOAD_BYTES = 2_000_000_000;

type ArchiveReport = { manifest: string | null; migration: string | null };

const asReport = (value: unknown): ArchiveReport | null => {
  if (value === null || typeof value !== "object") {
    return null;
  }
  const manifest =
    "manifest" in value && typeof value.manifest === "string"
      ? value.manifest
      : null;
  const migration =
    "migration" in value && typeof value.migration === "string"
      ? value.migration
      : null;
  return { manifest, migration };
};

const versionOf = (manifest: string | null): string | null => {
  const parsed = safeJson(manifest);
  return parsed !== null &&
    typeof parsed === "object" &&
    "appVersion" in parsed &&
    typeof parsed.appVersion === "string"
    ? parsed.appVersion
    : null;
};

const check = async (report: ArchiveReport) => {
  const expected = await currentManifest();
  const found = versionOf(report.manifest);

  if (found === null) {
    throw new ReportableError(
      "This archive has no manifest, so it was not created by this application.",
    );
  }
  if (found !== expected.appVersion) {
    throw new ReportableError(
      `This archive was created by version ${found}, and this instance is version ${expected.appVersion}. Restore only accepts an archive from the running version.`,
    );
  }
  if (report.migration !== expected.migration) {
    throw new ReportableError(
      "This archive is at a different migration than this instance, so it cannot be restored here.",
    );
  }
};

const apply = async (archivePath: string): Promise<void> => {
  const id = randomUUID();
  const staging = join(dataDir, `restore.${id}.db`);
  const live = databasePath;
  const aside = join(dataDir, `previous.${id}.db`);

  let report: ArchiveReport | null = null;
  try {
    await runWorker(
      WORKER,
      { archivePath, stagingPath: staging },
      {
        onProgress: (message) => {
          report ??= asReport(message);
        },
      },
    );
    if (report === null) {
      throw new ReportableError("This archive could not be read.");
    }
    await check(report);
  } catch (error) {
    rmSync(staging, { force: true });
    if (error instanceof ReportableError) {
      throw error;
    }

    log.warn("restoreBackup: archive rejected", { error });
    throw new ReportableError("This archive could not be read.");
  }

  await prisma.$disconnect();
  const cutoff = new Date();
  let restored: { logLevel: string } | null = null;
  try {
    renameSync(live, aside);

    for (const suffix of ["-wal", "-shm"]) {
      rmSync(`${live}${suffix}`, { force: true });
    }
    renameSync(staging, live);

    // Closes a connection a concurrent query reopened on the old file during the first disconnect.
    await prisma.$disconnect();
    await prisma.$connect();
    // Proves the restored file is usable before the old one is discarded.
    restored = await prisma.setting.findUnique({
      where: { id: SETTINGS_ID },
      select: { logLevel: true },
    });
    // The archive holds the backup's own running row and lock.
    await reclaimStaleRuns(
      "A restore replaced the database while this run was in progress.",
      cutoff,
    );
  } catch (error) {
    await prisma.$disconnect();
    if (existsSync(aside)) {
      rmSync(live, { force: true });
      renameSync(aside, live);
    }
    await prisma.$disconnect();
    await prisma.$connect();
    rmSync(staging, { force: true });
    log.error("restoreBackup: restore failed and was rolled back", { error });
    throw new ReportableError(
      "The archive could not be applied, so the previous database was kept.",
    );
  }

  if (isLogLevel(restored?.logLevel)) {
    setLogLevel(restored.logLevel);
  }
  rmSync(aside, { force: true });
  log.info("restoreBackup: archive applied", { archivePath });
};

export const restoreBackup = (archivePath: string): Promise<void> =>
  withLock(
    "restore",
    () => apply(archivePath),
    new ReportableError(
      "Another restore is running. Try again when it finishes.",
    ),
  );

export const restoreFromUpload = async (file: File): Promise<void> => {
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new ReportableError(
      `That archive is larger than the ${Math.round(MAX_UPLOAD_BYTES / 1_000_000)}MB limit.`,
    );
  }
  const staged = join(dataDir, `upload.${randomUUID()}.zip`);
  try {
    await pipeline(file.stream(), createWriteStream(staged));
    await restoreBackup(staged);
  } finally {
    rmSync(staged, { force: true });
  }
};
