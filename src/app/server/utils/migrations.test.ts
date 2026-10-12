import { expect, it } from "vitest";

import { appliedMigrations } from "@/app/server/utils/migrations";
import { prisma } from "@/app/server/utils/prisma";

it("breaks a tie on finished_at by the migration name", async () => {
  expect(process.env.DATA_DIR).toContain(".tmp/test");
  const finishedAt = new Date("2100-01-01T00:00:00Z").getTime();
  for (const name of ["21000101000000_earlier", "21000101000001_later"]) {
    await prisma.$executeRaw`
      INSERT INTO _prisma_migrations (id, checksum, migration_name, finished_at, applied_steps_count)
      VALUES (${name}, '', ${name}, ${finishedAt}, 1)
    `;
  }

  expect((await appliedMigrations())[0]).toBe("21000101000001_later");
});
