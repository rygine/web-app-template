import { beforeEach, expect, it, vi } from "vitest";

import { createBackup } from "@/app/server/jobs/backup";
import { restoreBackup } from "@/app/server/jobs/restore";
import { prisma } from "@/app/server/utils/prisma";

// Its own file: vi.resetModules() would hand later cases fresh copies of every module.

const addRun = (name: string) =>
  prisma.jobRun.create({
    data: { name, startedAt: new Date(), status: "succeeded" },
  });

beforeEach(async () => {
  expect(process.env.DATA_DIR).toContain(".tmp/test");
  await prisma.jobRun.deleteMany();
});

it("reconnects the other bundle's copy of the client too", async () => {
  vi.resetModules();
  const { prisma: other } = await import("@/app/server/utils/prisma");
  await addRun("present at backup");
  const archive = await createBackup();
  await addRun("added afterwards");
  expect(await other.jobRun.count()).toBe(2);

  await restoreBackup(archive);

  expect((await other.jobRun.findMany()).map((run) => run.name)).toEqual([
    "present at backup",
  ]);
});
