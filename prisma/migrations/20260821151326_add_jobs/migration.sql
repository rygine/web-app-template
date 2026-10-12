-- CreateTable
CREATE TABLE "Job" (
    "name" TEXT NOT NULL PRIMARY KEY,
    "lastRunAt" DATETIME,
    "lastStatus" TEXT,
    "lastDuration" INTEGER,
    "lastError" TEXT,
    "runningSince" DATETIME,
    "runningPid" INTEGER
);
