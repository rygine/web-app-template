import { prisma } from "@/app/server/utils/prisma";

// Newest first, from the table `migrate deploy` itself writes.
export const appliedMigrations = async (): Promise<string[]> => {
  const rows = await prisma.$queryRaw<{ migration_name: string }[]>`
    SELECT migration_name FROM _prisma_migrations
    WHERE finished_at IS NOT NULL
    ORDER BY finished_at DESC
  `;
  return rows.map((row) => row.migration_name);
};
