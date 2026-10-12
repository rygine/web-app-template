import { z } from "zod";

import { authModeSchema } from "@/app/shared/schemas/auth";
import { APP_NAME } from "@/app/shared/utils/app";
import {
  longDateFormatSchema,
  shortDateFormatSchema,
  timeFormatSchema,
} from "@/app/shared/utils/dates";
import { isLogLevel, LOG_RANK } from "@/app/shared/utils/log";
import type { LogLevel } from "@/app/shared/utils/log";

// the levels of LOG_RANK as the tuple z.enum needs
const toLogLevelTuple = (): [LogLevel, ...LogLevel[]] => {
  const [first, ...rest] = Object.keys(LOG_RANK).filter(isLogLevel);
  if (first === undefined) {
    throw new Error("LOG_RANK must declare at least one level.");
  }
  return [first, ...rest];
};

export const LOG_LEVELS = toLogLevelTuple();

// the id of the one Setting row
export const SETTINGS_ID = "app";

// Exported so the controls take their bounds from the schema they submit to.
export const INSTANCE_NAME_MAX = 60;
export const BACKUP_FOLDER_MAX = 200;
export const BACKUP_INTERVAL_DAYS = { min: 1, max: 365 };
export const BACKUP_RETENTION_DAYS = { min: 1, max: 3650 };

export const logLevelSchema = z.enum(LOG_LEVELS, {
  error: `Log level must be one of ${LOG_LEVELS.join(", ")}.`,
});

const INTERVAL_RANGE = `Backup interval must be between ${BACKUP_INTERVAL_DAYS.min} and ${BACKUP_INTERVAL_DAYS.max} days.`;
const RETENTION_RANGE = `Backup retention must be between ${BACKUP_RETENTION_DAYS.min} and ${BACKUP_RETENTION_DAYS.max} days.`;

export const settingsSchema = z.object({
  instanceName: z
    .string({ error: "Instance name must be text." })
    .max(
      INSTANCE_NAME_MAX,
      `Instance name must be ${INSTANCE_NAME_MAX} characters or fewer.`,
    )
    .nullable(),
  logLevel: logLevelSchema,
  backupFolder: z
    .string({ error: "Backup folder must be text." })
    .min(1, "Backup folder is required.")
    .max(
      BACKUP_FOLDER_MAX,
      `Backup folder must be ${BACKUP_FOLDER_MAX} characters or fewer.`,
    ),
  backupInterval: z
    .number({ error: "Backup interval must be a number." })
    .int("Backup interval must be a whole number of days.")
    .min(BACKUP_INTERVAL_DAYS.min, INTERVAL_RANGE)
    .max(BACKUP_INTERVAL_DAYS.max, INTERVAL_RANGE),
  backupRetention: z
    .number({ error: "Backup retention must be a number." })
    .int("Backup retention must be a whole number of days.")
    .min(BACKUP_RETENTION_DAYS.min, RETENTION_RANGE)
    .max(BACKUP_RETENTION_DAYS.max, RETENTION_RANGE),
  shortDateFormat: shortDateFormatSchema,
  longDateFormat: longDateFormatSchema,
  timeFormat: timeFormatSchema,
  showRelativeDates: z.boolean({
    error: "Show relative dates must be true or false.",
  }),
  authMode: authModeSchema,
  logRetentionDays: z
    .number({ error: "Log retention must be a number." })
    .int("Log retention must be a whole number.")
    .min(1, "Log retention must be between 1 and 3650.")
    .max(3650, "Log retention must be between 1 and 3650."),
});

export type Settings = z.infer<typeof settingsSchema>;

// Every field optional, refusing a body that names none.
export const updateSettingsSchema = settingsSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    error: "No settings were provided to update.",
  });

export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;

// the instance name, or the app name when none is set
export const resolveInstanceName = (instanceName: string | null) =>
  instanceName ?? APP_NAME;
