import { statSync } from "node:fs";

import { getSettings } from "@/app/server/services/settings";
import { databasePath } from "@/app/server/utils/database";
import { appliedMigrations } from "@/app/server/utils/migrations";
import { prisma } from "@/app/server/utils/prisma";
import { getRuntimeInfo } from "@/app/server/utils/runtime";
import { resolveInstanceName } from "@/app/shared/schemas/settings";
import type { SystemView } from "@/app/shared/schemas/system";
import { APP_NAME, APP_VERSION } from "@/app/shared/utils/app";

const sizeOf = (path: string): number => {
  try {
    return statSync(path).size;
  } catch {
    return 0;
  }
};

export const getSystemInfo = async (): Promise<SystemView> => {
  const [settings, migrations, logCount] = await Promise.all([
    getSettings(),
    appliedMigrations(),
    prisma.log.count(),
  ]);

  const runtime = getRuntimeInfo();

  return {
    appName: APP_NAME,
    instanceName: resolveInstanceName(settings.instanceName),
    version: APP_VERSION,

    startedAt: new Date(Date.now() - process.uptime() * 1000),
    node: process.version,
    platform: `${process.platform}/${process.arch}`,
    latestMigration: migrations[0] ?? null,
    migrationCount: migrations.length,
    databaseBytes: sizeOf(databasePath),
    dataDir: runtime.dataDir,
    logsDir: runtime.logsDir,
    logCount,
  };
};
