import { existsSync, readFileSync, utimesSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { ZipBuffer } from "node:zlib";

import { beforeEach, describe, expect, it } from "vitest";

import {
  backupDir,
  createBackup,
  currentManifest,
  listBackups,
  pruneBackups,
} from "@/app/server/jobs/backup";
import { BACKUP_JOB, ensureJobsRegistered } from "@/app/server/jobs/jobs";
import { getJob } from "@/app/server/jobs/registry";
import { runJob } from "@/app/server/jobs/runner";
import { updateSettings } from "@/app/server/services/settings";
import { prisma } from "@/app/server/utils/prisma";

// Read back through the archive index, so a name the test asks for is looked
// up the way a restore would look it up.
const entries = (path: string) => {
  const archive = new ZipBuffer(readFileSync(path));
  return Object.fromEntries(
    [...archive.entries()].map(([name, entry]) => [name, entry.contentSync()]),
  );
};

const addRun = (name: string) =>
  prisma.jobRun.create({
    data: { name, startedAt: new Date(), status: "succeeded" },
  });

beforeEach(async () => {
  expect(process.env.DATA_DIR).toContain(".tmp/test");
  await prisma.setting.deleteMany();
  await prisma.jobRun.deleteMany();
});

describe("createBackup", () => {
  it("writes an archive holding the database and a manifest", async () => {
    await addRun("backed up");

    const path = await createBackup();
    const files = entries(path);

    expect(Object.keys(files).toSorted()).toEqual(["app.db", "manifest.json"]);
    expect(existsSync(path)).toBe(true);
  });

  it("stamps the manifest with the running version and migration", async () => {
    const path = await createBackup();
    const raw = entries(path)["manifest.json"];
    const manifest: unknown = JSON.parse(Buffer.from(raw!).toString("utf8"));
    const { appVersion, migration } = await currentManifest();

    expect(manifest).toMatchObject({ appVersion, migration });
    expect(migration).toMatch(/^\d+_/);
  });

  it("leaves no staging or temporary files behind", async () => {
    await createBackup();

    const dir = await backupDir();
    const leftovers = (await listBackups()).map(({ name }) => name);
    const { readdirSync } = await import("node:fs");

    expect(readdirSync(dir).filter((n) => n.endsWith(".tmp"))).toEqual([]);
    expect(readdirSync(dir).filter((n) => n.startsWith("staging"))).toEqual([]);
    expect(leftovers.length).toBeGreaterThan(0);
  });
});

const age = async (name: string, days: number) => {
  const path = join(await backupDir(), name);
  const when = new Date(Date.now() - days * 86_400_000);
  utimesSync(path, when, when);
};

describe("pruneBackups", () => {
  it("keeps the newer archive and deletes only the old one", async () => {
    await updateSettings({ backupRetention: 7 });
    const old = await createBackup();
    await age(basename(old), 30);
    const recent = await createBackup();

    expect(await pruneBackups()).toBe(1);
    expect(existsSync(old)).toBe(false);
    expect(existsSync(recent)).toBe(true);
  });

  it("reads the retention setting rather than a fixed window", async () => {
    await updateSettings({ backupRetention: 90 });
    const path = await createBackup();
    await age(basename(path), 30);

    // Thirty days old is inside a ninety-day window and outside a seven-day one.
    expect(await pruneBackups()).toBe(0);
    await updateSettings({ backupRetention: 7 });
    expect(await pruneBackups()).toBe(1);
  });

  it("ignores files it did not write, however old they are", async () => {
    await updateSettings({ backupRetention: 7 });
    const dir = await backupDir();
    const stranger = join(dir, "notes.txt");
    writeFileSync(stranger, "someone else's file");
    const when = new Date(Date.now() - 400 * 86_400_000);
    utimesSync(stranger, when, when);

    expect(await pruneBackups()).toBe(0);
    expect(existsSync(stranger)).toBe(true);
  });
});

describe("the backup job", () => {
  it("prunes as part of the same run that creates", async () => {
    await updateSettings({ backupRetention: 7 });
    const old = await createBackup();
    await age(basename(old), 30);

    const before = new Set((await listBackups()).map(({ name }) => name));
    ensureJobsRegistered();

    expect(await runJob(getJob(BACKUP_JOB)!)).toBe("succeeded");

    const after = (await listBackups()).map(({ name }) => name);
    expect(existsSync(old)).toBe(false);
    expect(after.filter((name) => !before.has(name))).toHaveLength(1);
  });
});
