import { beforeEach, describe, expect, it } from "vitest";

import { listJobRuns } from "@/app/server/jobs/history";
import { prisma } from "@/app/server/utils/prisma";

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

  it("filters to one job", async () => {
    await seed([
      { name: "backup", status: "succeeded", minutesAgo: 10 },
      { name: "archive-logs", status: "succeeded", minutesAgo: 1 },
    ]);

    const { runs, total } = await listJobRuns({ job: "backup" });

    expect(total).toBe(1);
    expect(runs[0]?.name).toBe("backup");
  });

  it("filters by result", async () => {
    await seed([
      { name: "backup", status: "succeeded", minutesAgo: 10 },
      { name: "backup", status: "failed", minutesAgo: 1 },
    ]);

    const { runs } = await listJobRuns({ status: "failed" });

    expect(runs).toHaveLength(1);
    expect(runs[0]?.status).toBe("failed");
  });

  it("combines both filters rather than choosing one", async () => {
    await seed([
      { name: "backup", status: "failed", minutesAgo: 3 },
      { name: "archive-logs", status: "failed", minutesAgo: 2 },
      { name: "backup", status: "succeeded", minutesAgo: 1 },
    ]);

    const { total } = await listJobRuns({ job: "backup", status: "failed" });

    expect(total).toBe(1);
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
