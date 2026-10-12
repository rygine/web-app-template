import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  latestRun,
  latestSucceededRun,
  listJobRuns,
  pruneJobRuns,
} from "@/app/server/jobs/history";
import { ensureJobsRegistered } from "@/app/server/jobs/jobs";
import { getJob } from "@/app/server/jobs/registry";
import { runJob } from "@/app/server/jobs/runner";
import { archiveLogs } from "@/app/server/log/archive";
import { updateSettings } from "@/app/server/services/settings";
import { prisma } from "@/app/server/utils/prisma";

vi.mock("@/app/server/log/archive", { spy: true });

const seed = async (
  entries: { name: string; status: string; minutesAgo: number }[],
) => {
  for (const { name, status, minutesAgo } of entries) {
    await prisma.jobRun.create({
      data: {
        name,
        status,
        startedAt: new Date(Date.now() - minutesAgo * 60_000),
        finishedAt: new Date(),
        durationMs: 12,
      },
    });
  }
};

beforeEach(async () => {
  expect(process.env.DATA_DIR).toContain(".tmp/test");
  await prisma.jobRun.deleteMany();
});

describe("listJobRuns", () => {
  it("returns every job's runs, newest first", async () => {
    await seed([
      { name: "backup", status: "succeeded", minutesAgo: 10 },
      { name: "archive-logs", status: "failed", minutesAgo: 1 },
    ]);

    const { runs, total } = await listJobRuns();

    expect(total).toBe(2);
    expect(runs.map((run) => run.name)).toEqual(["archive-logs", "backup"]);
  });

  it("combines both filters rather than choosing one", async () => {
    await seed([
      { name: "backup", status: "failed", minutesAgo: 3 },
      { name: "archive-logs", status: "failed", minutesAgo: 2 },
      { name: "backup", status: "succeeded", minutesAgo: 1 },
    ]);

    const { runs, total } = await listJobRuns({
      job: "backup",
      status: "failed",
    });

    expect(total).toBe(1);
    expect(runs[0]).toMatchObject({ name: "backup", status: "failed" });
  });

  it("pages, and reports how many pages there are", async () => {
    await seed(
      Array.from({ length: 12 }, (_, index) => ({
        name: "backup",
        status: "succeeded",
        minutesAgo: index + 1,
      })),
    );

    const { runs, total, pageCount } = await listJobRuns({ size: 10, page: 2 });

    expect(total).toBe(12);
    expect(pageCount).toBe(2);
    expect(runs).toHaveLength(2);
  });

  it("rejects a page size outside the offered set", async () => {
    await expect(
      // @ts-expect-error rejected at runtime as well as in types.
      listJobRuns({ size: 5000 }),
    ).rejects.toThrow(/page size/i);
  });

  it("reports one page when there is nothing to show", async () => {
    const { runs, total, pageCount } = await listJobRuns();

    expect(runs).toEqual([]);
    expect(total).toBe(0);
    expect(pageCount).toBe(1);
  });
});

describe("pruneJobRuns", () => {
  it("deletes finished runs that started before the cutoff and keeps the rest", async () => {
    const old = new Date("2026-01-01T00:00:00Z");
    const recent = new Date("2026-10-01T00:00:00Z");
    await prisma.jobRun.createMany({
      data: [
        { name: "a", startedAt: old, status: "succeeded" },
        { name: "a", startedAt: old, status: "running" },
        { name: "a", startedAt: recent, status: "succeeded" },
      ],
    });

    expect(await pruneJobRuns(new Date("2026-06-01T00:00:00Z"))).toBe(1);
    expect(await prisma.jobRun.count()).toBe(2);
  });

  it("keeps a job's newest run and newest succeeded run past the cutoff", async () => {
    await prisma.jobRun.createMany({
      data: [
        { name: "a", startedAt: new Date("2025-01-01"), status: "succeeded" },
        { name: "a", startedAt: new Date("2025-06-01"), status: "succeeded" },
        { name: "a", startedAt: new Date("2026-01-01"), status: "failed" },
      ],
    });

    expect(await pruneJobRuns(new Date("2026-06-01"))).toBe(1);
    expect(await latestRun("a")).toMatchObject({ status: "failed" });
    expect(await latestSucceededRun("a")).toMatchObject({
      startedAt: new Date("2025-06-01"),
    });
  });
});

describe("the archive-logs job", () => {
  it("prunes job runs older than the log retention", async () => {
    await updateSettings({ logRetentionDays: 90 });
    await seed([
      { name: "old", status: "succeeded", minutesAgo: 92 * 24 * 60 },
      { name: "old", status: "succeeded", minutesAgo: 91 * 24 * 60 },
      { name: "recent", status: "succeeded", minutesAgo: 89 * 24 * 60 },
    ]);
    ensureJobsRegistered();

    expect(await runJob(getJob("archive-logs")!)).toBe("succeeded");

    const names = (await prisma.jobRun.findMany()).map((run) => run.name);
    expect(names.filter((name) => name === "old")).toHaveLength(1);
    expect(names).toContain("recent");
  });

  it("prunes job runs when the archive fails", async () => {
    await updateSettings({ logRetentionDays: 90 });
    await seed([
      { name: "old", status: "succeeded", minutesAgo: 92 * 24 * 60 },
      { name: "old", status: "succeeded", minutesAgo: 91 * 24 * 60 },
    ]);
    vi.mocked(archiveLogs).mockResolvedValueOnce({
      files: [],
      entries: 0,
      error: new Error("disk full"),
    });
    ensureJobsRegistered();

    expect(await runJob(getJob("archive-logs")!)).toBe("failed");

    const names = (await prisma.jobRun.findMany()).map((run) => run.name);
    expect(names.filter((name) => name === "old")).toHaveLength(1);
  });
});
