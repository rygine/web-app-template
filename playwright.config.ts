import { defineConfig, devices } from "@playwright/test";

import {
  E2E_API_KEY,
  E2E_BASE_URL,
  E2E_DIR,
  E2E_PORT,
  E2E_SESSION_FILE,
} from "./src/app/testing/db";

const docker = process.env.E2E_TARGET === "docker";

const config = defineConfig({
  testDir: "src",
  testMatch: "**/*.spec.ts",
  workers: 1,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  reporter: "list",
  projects: [
    { name: "session", testMatch: "**/session.setup.ts" },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], storageState: E2E_SESSION_FILE },
      dependencies: ["session"],
    },
  ],
  use: {
    baseURL: E2E_BASE_URL,
    extraHTTPHeaders: { "X-Api-Key": E2E_API_KEY },
  },
  webServer: docker
    ? undefined
    : {
        command: `node src/app/testing/db.ts && ${
          process.env.CI ? "yarn start" : `yarn vite dev --port ${E2E_PORT}`
        }`,
        port: E2E_PORT,
        reuseExistingServer: false,
        env: {
          DATA_DIR: E2E_DIR,
          LOGS_DIR: E2E_DIR,
          PORT: String(E2E_PORT),
          API_KEY: E2E_API_KEY,
        },
        stdout: "pipe",
        stderr: "pipe",
      },
});

export default config;
