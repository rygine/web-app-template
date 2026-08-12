import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

const original = {
  dataDir: process.env.DATA_DIR,
  dotenvPath: process.env.DOTENV_CONFIG_PATH,
};

const restore = (key: "DATA_DIR" | "DOTENV_CONFIG_PATH", value?: string) => {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
};

afterEach(() => {
  restore("DATA_DIR", original.dataDir);
  restore("DOTENV_CONFIG_PATH", original.dotenvPath);
  vi.resetModules();
});

// databaseUrl is computed at module scope here, so it is fixed before
// prisma.config.ts could load .env in its body. This pins the import order that
// makes DATA_DIR from .env reach it.
describe("databaseUrl", () => {
  it("takes DATA_DIR from .env", async () => {
    const dir = mkdtempSync(join(tmpdir(), "prisma-config-"));

    try {
      writeFileSync(join(dir, ".env"), `DATA_DIR=${dir}/data\n`);
      delete process.env.DATA_DIR;
      process.env.DOTENV_CONFIG_PATH = join(dir, ".env");
      vi.resetModules();

      const config = await import("~/prisma.config");

      expect(config.default.datasource?.url).toBe(`file:${dir}/data/app.db`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
