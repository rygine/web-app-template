import { afterEach, describe, expect, it, vi } from "vitest";

import {
  clearJobs,
  intervalOf,
  listJobs,
  registerJob,
} from "@/app/server/jobs/registry";

const noop = () => Promise.resolve();

afterEach(() => {
  clearJobs();
});

describe("registerJob", () => {
  it("lists what was registered", () => {
    registerJob({
      name: "archive",
      title: "Archive",
      intervalMs: 1,
      run: noop,
    });
    registerJob({ name: "backup", title: "Backup", intervalMs: 7, run: noop });

    expect(listJobs().map((job) => job.name)).toEqual(["archive", "backup"]);
  });

  it("refuses a duplicate name rather than replacing it", () => {
    registerJob({
      name: "archive",
      title: "Archive",
      intervalMs: 1,
      run: noop,
    });

    expect(() =>
      registerJob({
        name: "archive",
        title: "Archive",
        intervalMs: 2,
        run: noop,
      }),
    ).toThrow(/archive/);
  });
});

describe("intervalOf", () => {
  it("takes a fixed interval straight from the definition", async () => {
    await expect(
      intervalOf({
        name: "archive",
        title: "Archive",
        intervalMs: 3,
        run: noop,
      }),
    ).resolves.toBe(3);
  });

  it("asks for the interval at run time when it is configurable", async () => {
    const intervalMs = vi.fn().mockResolvedValue(9);

    await expect(
      intervalOf({ name: "backup", title: "Backup", intervalMs, run: noop }),
    ).resolves.toBe(9);
    expect(intervalMs).toHaveBeenCalledOnce();
  });
});
