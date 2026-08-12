import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

describe("the scheduler's registration", () => {
  it("is listed as a nitro plugin in vite.config.ts", () => {
    const source = readFileSync("vite.config.ts", "utf8");

    expect(source).toContain("./src/app/server/jobs/startup.ts");
    expect(source).toMatch(/nitro\(\{\s*plugins:/);
  });
});
