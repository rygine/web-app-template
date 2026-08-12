import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

// Vitest runs from the repository root.
const routeTreeSource = readFileSync("src/routeTree.gen.ts", "utf8");

// This feature owns its mounts in src/routes.config.ts, so it owns the assertion.
describe("items routes", () => {
  it.each(["/items", "/items/new"])("mounts the page %s", (path) => {
    expect(routeTreeSource).toContain(`'${path}'`);
  });

  it.each(["/api/v1/items", "/api/v1/items/$id"])(
    "mounts the endpoint %s",
    (path) => {
      expect(routeTreeSource).toContain(`'${path}'`);
    },
  );

  it.each([
    ["pages", "features/items/routes/pages"],
    ["api v1", "features/items/routes/api/v1"],
  ])("sources its %s from the feature", (_name, dir) => {
    expect(routeTreeSource).toContain(dir);
  });

  it("mounts the items layout route", () => {
    expect(routeTreeSource).toContain("features/items/routes/pages/route");
  });
});
