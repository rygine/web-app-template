import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  getApiKey,
  isEnvManaged,
  regenerateApiKey,
  verifyApiKey,
} from "@/app/server/services/apiKey";
import { prisma } from "@/app/server/utils/prisma";

beforeEach(async () => {
  expect(process.env.DATA_DIR).toContain(".tmp/test");
  delete process.env.API_KEY;
  await prisma.apiKey.deleteMany();
});

afterEach(() => {
  delete process.env.API_KEY;
});

describe("getApiKey", () => {
  it("generates a 32-character hex key on first read", async () => {
    const key = await getApiKey();

    expect(key).toMatch(/^[0-9a-f]{32}$/);
  });

  it("returns the same key on the next read", async () => {
    const first = await getApiKey();
    const second = await getApiKey();

    expect(second).toBe(first);
  });

  it("prefers API_KEY over the stored row", async () => {
    const stored = await getApiKey();
    process.env.API_KEY = "from-the-environment";

    expect(await getApiKey()).toBe("from-the-environment");
    expect(await getApiKey()).not.toBe(stored);
  });
});

describe("regenerateApiKey", () => {
  it("replaces the stored key", async () => {
    const before = await getApiKey();

    const after = await regenerateApiKey();

    expect(after).not.toBe(before);
    expect(await getApiKey()).toBe(after);
  });

  it("refuses while API_KEY is set", async () => {
    process.env.API_KEY = "pinned";

    await expect(regenerateApiKey()).rejects.toThrow(/API_KEY/);
  });
});

describe("verifyApiKey", () => {
  it("accepts the current key and rejects anything else", async () => {
    const key = await getApiKey();

    expect(await verifyApiKey(key)).toBe(true);
    expect(await verifyApiKey("")).toBe(false);
    expect(
      await verifyApiKey(
        `${key.slice(0, -1)}${key.at(-1) === "0" ? "1" : "0"}`,
      ),
    ).toBe(false);
  });

  it("rejects a key that was replaced", async () => {
    const old = await getApiKey();

    await regenerateApiKey();

    expect(await verifyApiKey(old)).toBe(false);
  });
});

describe("isEnvManaged", () => {
  it("tracks whether API_KEY is set and non-empty", () => {
    expect(isEnvManaged()).toBe(false);

    process.env.API_KEY = "";
    expect(isEnvManaged()).toBe(false);

    process.env.API_KEY = "pinned";
    expect(isEnvManaged()).toBe(true);
  });
});
