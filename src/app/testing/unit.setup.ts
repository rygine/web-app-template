import { cpSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";

import { afterAll } from "vitest";

import { TEMPLATE_DIR, TEST_ROOT } from "@/app/testing/db";

mkdirSync(TEST_ROOT, { recursive: true });
const dir = mkdtempSync(join(TEST_ROOT, "case-"));
cpSync(TEMPLATE_DIR, dir, { recursive: true });
process.env.DATA_DIR = dir;
process.env.LOGS_DIR = dir;

afterAll(async () => {
  const { prisma } = await import("@/app/server/utils/prisma");
  await prisma.$disconnect();
  rmSync(dir, { recursive: true, force: true });
});
