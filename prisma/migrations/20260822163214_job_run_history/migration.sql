/*
  Warnings:

  - You are about to drop the column `lastDuration` on the `Job` table. All the data in the column will be lost.
  - You are about to drop the column `lastError` on the `Job` table. All the data in the column will be lost.
  - You are about to drop the column `lastRunAt` on the `Job` table. All the data in the column will be lost.
  - You are about to drop the column `lastStatus` on the `Job` table. All the data in the column will be lost.

*/
-- CreateTable
CREATE TABLE "JobRun" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL,
    "finishedAt" DATETIME,
    "status" TEXT NOT NULL,
    "durationMs" INTEGER,
    "progress" INTEGER,
    "note" TEXT,
    "error" TEXT
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Job" (
    "name" TEXT NOT NULL PRIMARY KEY,
    "runningSince" DATETIME,
    "runningPid" INTEGER
);
INSERT INTO "new_Job" ("name", "runningPid", "runningSince") SELECT "name", "runningPid", "runningSince" FROM "Job";
DROP TABLE "Job";
ALTER TABLE "new_Job" RENAME TO "Job";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "JobRun_name_startedAt_idx" ON "JobRun"("name", "startedAt");

-- CreateIndex
CREATE INDEX "JobRun_startedAt_idx" ON "JobRun"("startedAt");
