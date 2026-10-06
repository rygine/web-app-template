import { playwright } from "@vitest/browser-playwright";
import { defaultExclude, defineConfig } from "vitest/config";

import pkg from "./package.json" with { type: "json" };

const CLIENT_TESTS = "src/**/client/**/*.test.ts";

const config = defineConfig({
  define: {
    __APP_NAME__: JSON.stringify(pkg.name),
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    globalSetup: ["src/app/testing/unit.global.setup.ts"],
    projects: [
      {
        extends: true,
        test: {
          name: "node",
          environment: "node",
          include: ["src/**/*.test.ts"],
          exclude: [CLIENT_TESTS, ...defaultExclude],
          setupFiles: ["src/app/testing/unit.setup.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "browser",
          include: [CLIENT_TESTS],
          browser: {
            enabled: true,
            provider: playwright(),
            headless: true,
            instances: [{ browser: "chromium" }],
          },
        },
      },
    ],
  },
});

export default config;
