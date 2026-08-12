import { defineConfig } from "vitest/config";

import pkg from "./package.json" with { type: "json" };

const config = defineConfig({
  define: {
    __APP_NAME__: JSON.stringify(pkg.name),
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    globalSetup: ["src/app/testing/unit.global.setup.ts"],
    setupFiles: ["src/app/testing/unit.setup.ts"],
  },
});

export default config;
