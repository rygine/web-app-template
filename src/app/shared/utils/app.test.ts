import { describe, expect, it } from "vitest";
import pkg from "~/package.json" with { type: "json" };

import { APP_NAME, APP_VERSION } from "@/app/shared/utils/app";

describe("app identity", () => {
  it("carries the package version", () => {
    expect(APP_VERSION).toBe(pkg.version);
  });

  it("carries the package name", () => {
    expect(APP_NAME).toBe(pkg.name);
  });
});
