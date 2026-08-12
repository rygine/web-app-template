import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createZipArchive, ZipBuffer, ZipEntry } from "node:zlib";

import { beforeEach, describe, expect, it } from "vitest";

import {
  backupDir,
  createBackup,
  currentManifest,
} from "@/app/server/jobs/backup";
import { restoreBackup } from "@/app/server/jobs/restore";
import { dataDir } from "@/app/server/utils/database";
import { prisma } from "@/app/server/utils/prisma";
import { ReportableError } from "@/app/shared/utils/errors";

const entries = (path: string) => {
  const archive = new ZipBuffer(readFileSync(path));
  return Object.fromEntries(
    [...archive.entries()].map(([name, entry]) => [name, entry.contentSync()]),
  );
};

const names = async () =>
  (await prisma.item.findMany()).map((item) => item.name);

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

beforeEach(async () => {
  expect(process.env.DATA_DIR).toContain(".tmp/test");
  await prisma.setting.deleteMany();
  await prisma.item.deleteMany();
});

describe("restoreBackup", () => {
  it("puts the database back as it was when the archive was taken", async () => {
    await prisma.item.create({ data: { name: "present at backup" } });
    const archive = await createBackup();

    await prisma.item.deleteMany();
    await prisma.item.create({ data: { name: "added afterwards" } });
    expect(await names()).toEqual(["added afterwards"]);

    await restoreBackup(archive);

    expect(await names()).toEqual(["present at backup"]);
  });

  it("leaves the instance usable afterwards, not just readable", async () => {
    const archive = await createBackup();
    await restoreBackup(archive);

    await prisma.item.create({ data: { name: "written after restore" } });

    expect(await names()).toContain("written after restore");
  });

  it("refuses an archive with no database in it", async () => {
    const path = await writeZip({ "manifest.json": Buffer.from("{}") });

    await expect(restoreBackup(path)).rejects.toThrow(ReportableError);
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
    await prisma.item.create({ data: { name: "must survive" } });
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
    await prisma.item.create({ data: { name: "written after rollback" } });
    expect(await names()).toContain("written after rollback");
  });

  it("leaves the live database untouched when it refuses", async () => {
    await prisma.item.create({ data: { name: "still here" } });
    const path = await writeZip({ "manifest.json": Buffer.from("{}") });

    await expect(restoreBackup(path)).rejects.toThrow(ReportableError);

    expect(await names()).toEqual(["still here"]);
  });
});
