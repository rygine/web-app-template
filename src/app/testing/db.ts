import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";

// Vitest and Playwright both run from the repository root.
const REPO_ROOT = process.cwd();
const PRISMA_BIN = resolve(REPO_ROOT, "node_modules/.bin/prisma");
export const TEST_ROOT = resolve(REPO_ROOT, ".tmp/test");

export const TEMPLATE_DIR = resolve(REPO_ROOT, ".tmp/test/template");

export const E2E_DIR = resolve(REPO_ROOT, ".tmp/e2e");

export const E2E_PORT = 3001;

export const E2E_BASE_URL =
  process.env.E2E_BASE_URL ?? `http://localhost:${E2E_PORT}`;

export const E2E_API_KEY =
  process.env.API_KEY ?? "e2e00000000000000000000000000000";

export const migrateInto = (dir: string) => {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  execFileSync(PRISMA_BIN, ["migrate", "deploy"], {
    env: { ...process.env, DATA_DIR: dir },
    stdio: "inherit",
  });
};
