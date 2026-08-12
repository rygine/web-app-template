import { createLogger } from "@/app/server/log/logger";
import { prisma } from "@/app/server/utils/prisma";
import {
  SETTINGS_ID,
  settingsSchema,
  updateSettingsSchema,
} from "@/app/shared/schemas/settings";
import type {
  Settings,
  UpdateSettingsInput,
} from "@/app/shared/schemas/settings";
import { setLogLevel } from "@/app/shared/utils/log";

const log = createLogger("settings");

// A blank input means "unset", not "named the empty string": the placeholder
// then shows the fallback rather than the navbar rendering nothing.
const normalize = (patch: UpdateSettingsInput): UpdateSettingsInput =>
  patch.instanceName === undefined
    ? patch
    : { ...patch, instanceName: patch.instanceName?.trim() || null };

// The hottest read in the app, so it is a plain read; the upsert runs only
// while the row does not exist, and being race-free it needs none of
// apiKey.ts's create-then-catch.
export const getSettings = async (): Promise<Settings> => {
  const row =
    (await prisma.setting.findUnique({ where: { id: SETTINGS_ID } })) ??
    (await prisma.setting.upsert({
      where: { id: SETTINGS_ID },
      update: {},
      create: { id: SETTINGS_ID },
    }));
  log.trace("getSettings: settings read");
  return settingsSchema.parse(row);
};

export const updateSettings = async (
  input: UpdateSettingsInput,
): Promise<Settings> => {
  const patch = normalize(updateSettingsSchema.parse(input));

  const row = await prisma.setting.upsert({
    where: { id: SETTINGS_ID },
    update: patch,
    create: { id: SETTINGS_ID, ...patch },
  });
  const settings = settingsSchema.parse(row);
  // Applied in the same operation that stores it — this call is the whole of
  // what "no restart required" means for the log level.
  setLogLevel(settings.logLevel);
  log.info("updateSettings: settings updated", {
    fields: Object.keys(patch).join(","),
  });
  return settings;
};
