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

beforeEach(async () => {
  expect(process.env.DATA_DIR).toContain(".tmp/test");
  await prisma.setting.deleteMany();
  await prisma.item.deleteMany();
});

describe("createBackup", () => {
  it("writes an archive holding the database and a manifest", async () => {
    await prisma.item.create({ data: { name: "backed up" } });

    const path = await createBackup();
    const files = entries(path);

    expect(Object.keys(files).toSorted()).toEqual(["app.db", "manifest.json"]);
    expect(existsSync(path)).toBe(true);
  });

  it("carries no WAL sidecars, because backup() writes one consistent file", async () => {
    const path = await createBackup();

    expect(Object.keys(entries(path))).not.toContain("app.db-wal");
    expect(Object.keys(entries(path))).not.toContain("app.db-shm");
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

  it("contains a database a reader can open and query", async () => {
    await prisma.item.create({ data: { name: "inside the archive" } });
    const path = await createBackup();

    const { DatabaseSync } = await import("node:sqlite");
    const extracted = join(await backupDir(), "extracted.db");
    writeFileSync(extracted, entries(path)["app.db"]!);

    const db = new DatabaseSync(extracted, { readOnly: true });
    const rows = db.prepare("SELECT name FROM Item").all();
    db.close();

    expect(rows).toContainEqual(
      expect.objectContaining({ name: "inside the archive" }),
    );
  });
});

const age = async (name: string, days: number) => {
  const path = join(await backupDir(), name);
  const when = new Date(Date.now() - days * 86_400_000);
  utimesSync(path, when, when);
};

describe("pruneBackups", () => {
  it("keeps an archive that is inside the retention window", async () => {
    await updateSettings({ backupRetention: 28 });
    await createBackup();

    expect(await pruneBackups()).toBe(0);
    expect((await listBackups()).length).toBeGreaterThan(0);
  });

  it("deletes an archive older than the retention window", async () => {
    await updateSettings({ backupRetention: 7 });
    const path = await createBackup();
    await age(basename(path), 30);

    expect(await pruneBackups()).toBe(1);
    expect(existsSync(path)).toBe(false);
  });

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

    // What the registered job does, in the order it does it.
    const created = await createBackup();
    await pruneBackups();

    expect(existsSync(old)).toBe(false);
    expect(existsSync(created)).toBe(true);
  });
});
