import { resolve } from "node:path";

import { logsDir } from "@/app/server/log/archive";
import { dataDir } from "@/app/server/utils/database";
import { envValue } from "@/app/server/utils/env";
import type { RuntimeView } from "@/app/shared/schemas/runtime";

// Reads process.env only: none of these can be changed by the application, so
// there is nothing to store and nothing to apply.
export const getRuntimeInfo = (): RuntimeView => ({
  port: envValue("PORT") ?? "3000",
  host: envValue("HOST") ?? "localhost",
  dataDir: resolve(dataDir),
  logsDir: resolve(logsDir()),
  logLevelEnvManaged: envValue("LOG_LEVEL") !== undefined,
});
