import { describe, expect, it } from "vitest";

import { safeRedirect } from "@/app/shared/utils/redirect";

describe("safeRedirect", () => {
  it("keeps a path on this site", () => {
    expect(safeRedirect("/items?search=akira")).toBe("/items?search=akira");
  });

  it.each([
    undefined,
    "",
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "/\t/evil.example",
    "/\n/evil.example",
    "/\r/evil.example",
  ])("falls back to / for %s", (target) => {
    expect(safeRedirect(target)).toBe("/");
  });

  it.each(["/.//evil.example", "/a/..//evil.example"])(
    "never returns a scheme-relative path for %s",
    (target) => {
      expect(safeRedirect(target).startsWith("//")).toBe(false);
    },
  );
});
