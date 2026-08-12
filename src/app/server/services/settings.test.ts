import { beforeEach, describe, expect, it } from "vitest";

import { getSettings, updateSettings } from "@/app/server/services/settings";
import { prisma } from "@/app/server/utils/prisma";
import { resolveInstanceName } from "@/app/shared/schemas/settings";
import { APP_NAME } from "@/app/shared/utils/app";

beforeEach(async () => {
  // Without this, a missing setup file would truncate the real ./data.
  expect(process.env.DATA_DIR).toContain(".tmp/test");
  await prisma.setting.deleteMany();
});

describe("getSettings", () => {
  it("returns the schema defaults against an empty table", async () => {
    const settings = await getSettings();

    expect(settings.logLevel).toBe("debug");
    expect(settings.shortDateFormat).toBe("mdy");
    expect(settings.timeFormat).toBe("h12");
    expect(settings.showRelativeDates).toBe(true);
    expect(settings.backupInterval).toBe(7);
    expect(settings.instanceName).toBeNull();
  });

  it("creates exactly one row however often it is called", async () => {
    await getSettings();
    await getSettings();

    expect(await prisma.setting.count()).toBe(1);
  });
});

describe("updateSettings", () => {
  it("writes a field and reads it back", async () => {
    await updateSettings({ logLevel: "warn" });

    expect((await getSettings()).logLevel).toBe("warn");
  });

  it("leaves the fields it was not given alone", async () => {
    await updateSettings({ logLevel: "warn" });
    await updateSettings({ timeFormat: "h24" });

    const settings = await getSettings();

    expect(settings.logLevel).toBe("warn");
    expect(settings.timeFormat).toBe("h24");
    expect(settings.shortDateFormat).toBe("mdy");
  });

  it("stays a singleton across repeated writes", async () => {
    await updateSettings({ logLevel: "warn" });
    await updateSettings({ logLevel: "info" });

    expect(await prisma.setting.count()).toBe(1);
  });

  it("rejects a value outside the offered set, naming the field", async () => {
    await expect(
      // @ts-expect-error rejected at runtime as well as in types.
      updateSettings({ logLevel: "chatty" }),
    ).rejects.toThrow(/log level/i);
  });

  it("rejects a body that names no field", async () => {
    await expect(updateSettings({})).rejects.toThrow(/no settings/i);
  });

  it("stores a blank instance name as unset rather than empty", async () => {
    await updateSettings({ instanceName: "Reef" });
    await updateSettings({ instanceName: "   " });

    expect((await getSettings()).instanceName).toBeNull();
  });
});

describe("resolveInstanceName", () => {
  it("falls back to the package name when unset", () => {
    expect(resolveInstanceName(null)).toBe(APP_NAME);
  });

  it("prefers a configured name", () => {
    expect(resolveInstanceName("Reef")).toBe("Reef");
  });
});
