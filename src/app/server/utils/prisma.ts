import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { createServerOnlyFn } from "@tanstack/react-start";

import { databaseUrl, ensureDataDir } from "@/app/server/utils/database";
import { PrismaClient } from "@/generated/prisma/client";

const createClient = () => {
  ensureDataDir();
  const adapter = new PrismaBetterSqlite3({ url: databaseUrl });
  return new PrismaClient({ adapter });
};

const getPrisma = createServerOnlyFn(createClient);

// One client for both bundle copies of this module.
export const prisma = (globalThis.prismaClient ??= getPrisma());
