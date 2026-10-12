import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { runWorker } from "@/app/server/jobs/subprocess";

const fixture = (name: string) =>
  join(process.cwd(), "src/app/testing/workers", `${name}.ts`);

describe("runWorker", () => {
  it("resolves when the worker exits cleanly", async () => {
    await expect(
      runWorker(fixture("echo"), { hello: "world" }),
    ).resolves.toBeUndefined();
  });

  it("delivers the payload and reports progress back", async () => {
    const onProgress = vi.fn();

    await runWorker(fixture("echo"), { hello: "world" }, { onProgress });

    expect(onProgress).toHaveBeenCalledWith({
      progress: 50,
      saw: { hello: "world" },
    });
  });

  it("rejects with the exit code and stderr when the worker fails", async () => {
    await expect(runWorker(fixture("failing"), {})).rejects.toThrow(
      /could not open the database/,
    );
  });

  it("kills a worker that never exits, rather than hanging the job", async () => {
    await expect(
      runWorker(fixture("hanging"), {}, { timeoutMs: 300 }),
    ).rejects.toThrow(/timed out/i);
  });
});
