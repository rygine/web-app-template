import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

// Vitest runs from the repository root.
const routeTreeSource = readFileSync("src/routeTree.gen.ts", "utf8");

// virtualRouteConfig replaces automatic scanning, so a dropped mount would
// remove routes silently at build time. This is what makes it loud.
describe("app routes", () => {
  it.each(["/", "/health", "/settings", "/settings/general", "/settings/ui"])(
    "mounts %s",
    (path) => {
      expect(routeTreeSource).toContain(`'${path}'`);
    },
  );
});
