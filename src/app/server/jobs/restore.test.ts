import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createZipArchive, ZipBuffer, ZipEntry } from "node:zlib";

import { beforeEach, describe, expect, it, onTestFinished, vi } from "vitest";

import {
  backupDir,
  createBackup,
  currentManifest,
} from "@/app/server/jobs/backup";
import { restoreBackup, restoreFromUpload } from "@/app/server/jobs/restore";
import { dataDir } from "@/app/server/utils/database";
import { prisma } from "@/app/server/utils/prisma";
import { SETTINGS_ID } from "@/app/shared/schemas/settings";
import { ReportableError } from "@/app/shared/utils/errors";
import { clearLogLevel, setLogLevel } from "@/app/shared/utils/log";

const entries = (path: string) => {
  const archive = new ZipBuffer(readFileSync(path));
  return Object.fromEntries(
    [...archive.entries()].map(([name, entry]) => [name, entry.contentSync()]),
  );
};

const names = async () =>
  (await prisma.jobRun.findMany()).map((run) => run.name);

const writeZip = async (files: Record<string, Uint8Array>) => {
  const path = join(
    await backupDir(),
    `bad-${Date.now()}-${Math.random()}.zip`,
  );
  const { mkdirSync } = await import("node:fs");
  mkdirSync(await backupDir(), { recursive: true });
  const archive = await createZipArchive(
    Object.entries(files).map(([name, data]) =>
      ZipEntry.createSync(name, data),
    ),
  );
  writeFileSync(path, Buffer.concat(await archive.toArray()));
  return path;
};

const addRun = (name: string) =>
  prisma.jobRun.create({
    data: { name, startedAt: new Date(), status: "succeeded" },
  });

const restoreLockHeld = () =>
  prisma.job.count({
    where: { name: "restore", runningSince: { not: null } },
  });

beforeEach(async () => {
  expect(process.env.DATA_DIR).toContain(".tmp/test");
  await prisma.setting.deleteMany();
  await prisma.jobRun.deleteMany();
});

describe("restoreBackup", () => {
  it("puts the database back as it was when the archive was taken", async () => {
    await addRun("present at backup");
    const archive = await createBackup();

    await prisma.jobRun.deleteMany();
    await addRun("added afterwards");
    expect(await names()).toEqual(["added afterwards"]);

    await restoreBackup(archive);

    expect(await names()).toEqual(["present at backup"]);
  });

  it("ends on the restored file when a query reconnects during the disconnect", async () => {
    await addRun("present at backup");
    const archive = await createBackup();
    await addRun("added afterwards");
    const disconnect = prisma.$disconnect.bind(prisma);
    vi.spyOn(prisma, "$disconnect").mockImplementationOnce(async () => {
      await disconnect();
      // A concurrent query, landing while the restore disconnects.
      await prisma.setting.count();
    });

    await restoreBackup(archive);

    expect(await names()).toEqual(["present at backup"]);
  });

  it("leaves the instance usable afterwards, not just readable", async () => {
    const archive = await createBackup();
    await restoreBackup(archive);

    await addRun("written after restore");

    expect(await names()).toContain("written after restore");
  });

  it("applies the archive's log level at once", async () => {
    onTestFinished(() => clearLogLevel());
    await prisma.setting.create({
      data: { id: SETTINGS_ID, logLevel: "warn" },
    });
    const archive = await createBackup();
    await prisma.setting.update({
      where: { id: SETTINGS_ID },
      data: { logLevel: "trace" },
    });
    setLogLevel("trace");

    await restoreBackup(archive);

    expect(globalThis.logLevel).toBe("warn");
  });

  it("releases the run and the lock the archive was taken under", async () => {
    await prisma.jobRun.create({
      data: { name: "backup", startedAt: new Date(), status: "running" },
    });
    await prisma.job.upsert({
      where: { name: "backup" },
      update: { runningSince: new Date(), runningPid: process.pid },
      create: {
        name: "backup",
        runningSince: new Date(),
        runningPid: process.pid,
      },
    });
    const archive = await createBackup();

    await restoreBackup(archive);

    expect(
      await prisma.jobRun.findMany({ select: { status: true, error: true } }),
    ).toEqual([
      {
        status: "interrupted",
        error:
          "A restore replaced the database while this run was in progress.",
      },
    ]);
    expect(
      await prisma.job.count({ where: { runningSince: { not: null } } }),
    ).toBe(0);
  });

  it("keeps a lock taken after the swap", async () => {
    const archive = await createBackup();
    const connect = prisma.$connect.bind(prisma);
    vi.spyOn(prisma, "$connect").mockImplementationOnce(async () => {
      await connect();
      // A job that starts on the restored file before the reclaim.
      await prisma.job.upsert({
        where: { name: "backup" },
        update: { runningSince: new Date(), runningPid: process.pid },
        create: {
          name: "backup",
          runningSince: new Date(),
          runningPid: process.pid,
        },
      });
    });

    await restoreBackup(archive);

    expect(
      await prisma.job.count({
        where: { name: "backup", runningSince: { not: null } },
      }),
    ).toBe(1);
    await prisma.job.update({
      where: { name: "backup" },
      data: { runningSince: null, runningPid: null },
    });
  });

  it("accepts an archive whose tied migrations were written in another order", async () => {
    const { DatabaseSync } = await import("node:sqlite");
    const finishedAt = new Date("2100-01-01T00:00:00Z").getTime();
    const tied = ["21000101000000_earlier", "21000101000001_later"];

    // SQLite returns tied rows in insertion order, so the two files disagree on finished_at alone.
    for (const name of tied.toReversed()) {
      await prisma.$executeRaw`
        INSERT INTO _prisma_migrations (id, checksum, migration_name, finished_at, applied_steps_count)
        VALUES (${name}, '', ${name}, ${finishedAt}, 1)
      `;
    }
    try {
      const files = entries(await createBackup());
      const reordered = join(dataDir, "reordered.db");
      writeFileSync(reordered, files["app.db"]!);
      const db = new DatabaseSync(reordered);
      db.exec(
        "DELETE FROM _prisma_migrations WHERE migration_name LIKE '2100%';",
      );
      for (const name of tied) {
        db.prepare(
          "INSERT INTO _prisma_migrations (id, checksum, migration_name, finished_at, applied_steps_count) VALUES (?, '', ?, ?, 1)",
        ).run(name, name, finishedAt);
      }
      db.close();
      const archive = await writeZip({
        "app.db": new Uint8Array(readFileSync(reordered)),
        "manifest.json": files["manifest.json"]!,
      });

      await expect(restoreBackup(archive)).resolves.toBeUndefined();
    } finally {
      await prisma.$executeRaw`
        DELETE FROM _prisma_migrations WHERE migration_name LIKE '2100%'
      `;
    }
  });

  it("refuses a file that is not a zip at all", async () => {
    const path = join(dataDir, "not-a-zip.zip");
    writeFileSync(path, "this is plain text, not an archive");

    await expect(restoreBackup(path)).rejects.toThrow(ReportableError);
  });

  it("refuses an archive from a different version, naming both", async () => {
    const archive = await createBackup();
    const files = entries(archive);
    const manifest = {
      ...(await currentManifest()),
      appVersion: "0.0.0-other",
    };
    const tampered = await writeZip({
      "app.db": files["app.db"]!,
      "manifest.json": Buffer.from(JSON.stringify(manifest)),
    });

    await expect(restoreBackup(tampered)).rejects.toThrow(/0\.0\.0-other/);
  });

  it("rolls back to the previous database when the swap goes wrong", async () => {
    await addRun("must survive");
    const archive = await createBackup();

    const { DatabaseSync } = await import("node:sqlite");

    const files = entries(archive);
    const broken = join(dataDir, "broken.db");
    writeFileSync(broken, files["app.db"]!);
    const db = new DatabaseSync(broken);
    db.exec("DROP TABLE Setting;");
    db.close();

    const tampered = await writeZip({
      "app.db": new Uint8Array(readFileSync(broken)),
      "manifest.json": files["manifest.json"]!,
    });

    await expect(restoreBackup(tampered)).rejects.toThrow(
      /previous database was kept/,
    );

    // The live database is the original, still connected and still writable.
    expect(await names()).toEqual(["must survive"]);
    // The lock was taken in the file the rollback put back.
    expect(await restoreLockHeld()).toBe(0);
    await addRun("written after rollback");
    expect(await names()).toContain("written after rollback");
  });

  it("leaves the live database untouched when it refuses", async () => {
    await addRun("still here");
    const path = await writeZip({ "manifest.json": Buffer.from("{}") });

    await expect(restoreBackup(path)).rejects.toThrow(ReportableError);

    expect(await names()).toEqual(["still here"]);
  });

  it("refuses a second restore while one holds the lock", async () => {
    const archive = await createBackup();
    await prisma.job.upsert({
      where: { name: "restore" },
      update: { runningSince: new Date(), runningPid: process.pid },
      create: {
        name: "restore",
        runningSince: new Date(),
        runningPid: process.pid,
      },
    });

    await expect(restoreBackup(archive)).rejects.toThrow(
      "Another restore is running. Try again when it finishes.",
    );

    await prisma.job.delete({ where: { name: "restore" } });
  });

  it("releases the restore lock after a refused archive", async () => {
    const refused = await writeZip({ "manifest.json": Buffer.from("{}") });

    await expect(restoreBackup(refused)).rejects.toThrow(ReportableError);
    expect(await restoreLockHeld()).toBe(0);
  });
});

describe("restoreFromUpload", () => {
  it("restores an uploaded archive", async () => {
    await addRun("present at backup");
    const archive = await createBackup();
    await addRun("added afterwards");

    await restoreFromUpload(new File([readFileSync(archive)], "upload.zip"));

    expect(await names()).toEqual(["present at backup"]);
  });

  it("refuses a file over the size limit", async () => {
    const file = new File(["x"], "upload.zip");
    Object.defineProperty(file, "size", { value: 3_000_000_000 });

    await expect(restoreFromUpload(file)).rejects.toThrow(/2000MB limit/);
  });
});
