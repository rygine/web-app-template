import type { PrismaClient } from "@/generated/prisma/client";

declare global {
  var prismaClient: PrismaClient | undefined;
  var loginFailures: number[] | undefined;
  var runningJobs: Set<string> | undefined;
}
