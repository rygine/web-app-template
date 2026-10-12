import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

// Vitest runs from the repository root.
const routeTreeSource = readFileSync("src/routeTree.gen.ts", "utf8");

// the app-level mounts in virtualRouteConfig
describe("app routes", () => {
  it.each([
    "/",
    "/health",
    "/login",
    "/setup",
    "/settings",
    "/settings/general",
    "/settings/security",
    "/settings/ui",
    "/system/logs",
  ])("mounts %s", (path) => {
    expect(routeTreeSource).toContain(`'${path}'`);
  });
});
