import { randomUUID } from "node:crypto";

import type { APIRequestContext } from "@playwright/test";
import { request as apiRequest, test as base, expect } from "@playwright/test";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

import { E2E_API_KEY, E2E_BASE_URL, E2E_DIR } from "@/app/testing/db";
import { PrismaClient } from "@/generated/prisma/client";

const assertServerSharesDatabase = async (
  request: APIRequestContext,
  dataDir: string,
) => {
  if (process.env.E2E_TARGET === "docker") {
    return;
  }
  const db = new PrismaClient({
    adapter: new PrismaBetterSqlite3({ url: `file:${dataDir}/app.db` }),
  });
  try {
    const probe = await db.item.create({
      data: { name: `__datadir-probe-${randomUUID()}` },
    });
    try {
      const response = await request.get(
        `/api/v1/items/${encodeURIComponent(probe.id)}`,
      );
      if (!response.ok()) {
        throw new Error(
          `Server is not reading ${dataDir}. DATA_DIR did not reach it; ` +
            "refusing to run tests that would write to the real ./data database.",
        );
      }
    } finally {
      await db.item.deleteMany({ where: { id: probe.id } });
    }
  } finally {
    await db.$disconnect();
  }
};

const expectOk = (
  response: { ok: () => boolean; status: () => number },
  what: string,
) => {
  if (!response.ok()) {
    throw new Error(`${what} failed with ${response.status()}`);
  }
};

export const totalItems = async (
  request: APIRequestContext,
  search: Record<string, string> = {},
) => {
  const query = new URLSearchParams(search).toString();
  const response = await request.get(
    query === "" ? "/api/v1/items" : `/api/v1/items?${query}`,
  );
  expectOk(response, "listing items");
  const { total }: { total: number } = await response.json();
  return total;
};

export const seedItems = async (
  request: APIRequestContext,
  names: string[],
) => {
  for (const name of names) {
    expectOk(
      await request.post("/api/v1/items", { data: { name } }),
      `creating ${name}`,
    );
  }
};

type WorkerFixtures = {
  sharedDatabase: void;
};

export const test = base.extend<object, WorkerFixtures>({
  page: async ({ page }, provide) => {
    const errors: Error[] = [];

    page.on("pageerror", (error) => errors.push(error));
    await provide(page);

    expect(errors.map((error) => error.message)).toEqual([]);
  },

  sharedDatabase: [
    async ({}, provide) => {
      const context = await apiRequest.newContext({
        baseURL: E2E_BASE_URL,
        extraHTTPHeaders: { "X-Api-Key": E2E_API_KEY },
      });
      try {
        await assertServerSharesDatabase(context, E2E_DIR);
      } finally {
        await context.dispose();
      }
      await provide();
    },
    { scope: "worker", auto: true },
  ],
});

export { expect } from "@playwright/test";
