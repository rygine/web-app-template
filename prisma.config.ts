// do not move this import
import "dotenv/config";
import { defineConfig } from "prisma/config";

import { databaseUrl, ensureDataDir } from "./src/app/server/utils/database";

ensureDataDir();

export default defineConfig({
  schema: "src",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: databaseUrl,
  },
});
