import { scrypt } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  SESSION_TTL_MS,
  checkCredentials,
  createSession,
  deleteSession,
  getAuthConfig,
  hashPassword,
  resetAuth,
  setupUser,
  verifyPassword,
  verifySession,
} from "@/app/server/services/auth";
import { getSettings } from "@/app/server/services/settings";
import { prisma } from "@/app/server/utils/prisma";
import { ReportableError } from "@/app/shared/utils/errors";

vi.mock("node:crypto", async (importOriginal) => {
  const actual = await importOriginal<{ scrypt: typeof scrypt }>();
  return { ...actual, scrypt: vi.fn(actual.scrypt) };
});

const OWNER = { username: "owner", password: "correct horse" };

beforeEach(async () => {
  // Without this, a missing setup file would truncate the real ./data.
  expect(process.env.DATA_DIR).toContain(".tmp/test");
  await prisma.session.deleteMany();
  await prisma.setting.deleteMany();
  globalThis.loginFailures = [];
});

describe("passwords", () => {
  it("hashes with scrypt", async () => {
    expect(await hashPassword("correct horse")).toMatch(/^scrypt\$/);
  });

  it("salts each hash", async () => {
    expect(await hashPassword("same")).not.toBe(await hashPassword("same"));
  });

  it("rejects a malformed stored value", async () => {
    expect(await verifyPassword("anything", "plaintext")).toBe(false);
  });
});

describe("setupUser", () => {
  it("creates the one account", async () => {
    expect((await getAuthConfig()).hasUser).toBe(false);

    await setupUser(OWNER);

    expect((await getAuthConfig()).hasUser).toBe(true);
  });

  it("refuses a second account", async () => {
    await setupUser(OWNER);

    await expect(
      setupUser({ username: "intruder", password: "another password" }),
    ).rejects.toThrow(ReportableError);
  });

  it("rejects a short password", async () => {
    await expect(
      setupUser({ username: "owner", password: "short" }),
    ).rejects.toThrow("Password must be 8 characters or more.");
  });

  it("keeps the account out of the settings a page reads", async () => {
    await setupUser(OWNER);

    const settings: Record<string, unknown> = await getSettings();

    expect(settings).not.toHaveProperty("passwordHash");
    expect(settings).not.toHaveProperty("username");
    expect(settings.authMode).toBe("forms");
  });
});

describe("checkCredentials", () => {
  it("rejects everything before setup", async () => {
    expect(await checkCredentials(OWNER)).toBe(false);
  });

  it("accepts only the right pair", async () => {
    await setupUser(OWNER);

    expect(await checkCredentials(OWNER)).toBe(true);
    expect(
      await checkCredentials({ username: "owner", password: "wrong horse" }),
    ).toBe(false);
    expect(
      await checkCredentials({ username: "other", password: "correct horse" }),
    ).toBe(false);
  });
});

describe("the login limit", () => {
  const WRONG = { username: "owner", password: "wrong horse" };

  afterEach(() => {
    vi.useRealTimers();
  });

  it("refuses without hashing after 5 failures, until a minute passes", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    await setupUser(OWNER);
    for (let attempt = 0; attempt < 5; attempt++) {
      expect(await checkCredentials(WRONG)).toBe(false);
    }
    vi.mocked(scrypt).mockClear();

    const refused = checkCredentials(OWNER);

    await expect(refused).rejects.toThrow(ReportableError);
    await expect(refused).rejects.toThrow(
      "Too many failed logins. Wait a minute, then try again.",
    );
    expect(scrypt).not.toHaveBeenCalled();

    vi.setSystemTime(Date.now() + 60_000);

    expect(await checkCredentials(OWNER)).toBe(true);
  });

  it("counts attempts that run in parallel", async () => {
    await setupUser(OWNER);

    const results = await Promise.allSettled(
      Array.from({ length: 6 }, () => checkCredentials(WRONG)),
    );

    expect(results.filter(({ status }) => status === "rejected")).toHaveLength(
      1,
    );
  });

  it("does not count a success", async () => {
    await setupUser(OWNER);
    for (let attempt = 0; attempt < 4; attempt++) {
      expect(await checkCredentials(WRONG)).toBe(false);
    }
    for (let attempt = 0; attempt < 3; attempt++) {
      expect(await checkCredentials(OWNER)).toBe(true);
    }
  });
});

describe("sessions", () => {
  it("accepts a token it issued and stores only its hash", async () => {
    const token = await createSession();

    expect(await verifySession(token)).toBe(true);
    const rows = await prisma.session.findMany();
    expect(rows.map((row) => row.tokenHash)).not.toContain(token);
  });

  it("rejects an unknown or missing token", async () => {
    expect(await verifySession("unknown")).toBe(false);
    expect(await verifySession(undefined)).toBe(false);
  });

  it("rejects an expired session", async () => {
    const token = await createSession();
    await prisma.session.updateMany({
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    expect(await verifySession(token)).toBe(false);
  });

  it("extends a session that is used after an hour", async () => {
    const token = await createSession();
    await prisma.session.updateMany({
      data: {
        lastSeenAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
        expiresAt: new Date(Date.now() + 60_000),
      },
    });

    expect(await verifySession(token)).toBe(true);

    const [row] = await prisma.session.findMany();
    expect(row!.expiresAt.getTime()).toBeGreaterThan(
      Date.now() + SESSION_TTL_MS - 60_000,
    );
  });

  it("forgets a deleted session", async () => {
    const token = await createSession();
    await deleteSession(token);

    expect(await verifySession(token)).toBe(false);
  });
});

describe("resetAuth", () => {
  it("removes the account and every session", async () => {
    await setupUser(OWNER);
    await createSession();

    await resetAuth();

    expect((await getAuthConfig()).hasUser).toBe(false);
    expect(await prisma.session.count()).toBe(0);
  });
});

it("deletes expired sessions when a new one starts", async () => {
  await prisma.session.create({
    data: { tokenHash: "old", expiresAt: new Date(Date.now() - 1000) },
  });

  await createSession();

  expect(
    await prisma.session.findUnique({ where: { tokenHash: "old" } }),
  ).toBeNull();
});
