-- CreateTable
CREATE TABLE "Session" (
    "tokenHash" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL,
    "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Job" (
    "name" TEXT NOT NULL PRIMARY KEY,
    "runningSince" DATETIME,
    "runningPid" INTEGER,
    "rerunRequested" BOOLEAN NOT NULL DEFAULT false
);
INSERT INTO "new_Job" ("name", "runningPid", "runningSince") SELECT "name", "runningPid", "runningSince" FROM "Job";
DROP TABLE "Job";
ALTER TABLE "new_Job" RENAME TO "Job";
CREATE TABLE "new_Setting" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'app',
    "instanceName" TEXT,
    "logLevel" TEXT NOT NULL DEFAULT 'debug',
    "backupFolder" TEXT NOT NULL DEFAULT 'backups',
    "backupInterval" INTEGER NOT NULL DEFAULT 7,
    "backupRetention" INTEGER NOT NULL DEFAULT 28,
    "shortDateFormat" TEXT NOT NULL DEFAULT 'mdy',
    "longDateFormat" TEXT NOT NULL DEFAULT 'weekdayMonthDay',
    "timeFormat" TEXT NOT NULL DEFAULT 'h12',
    "showRelativeDates" BOOLEAN NOT NULL DEFAULT true,
    "logRetentionDays" INTEGER NOT NULL DEFAULT 90,
    "authMode" TEXT NOT NULL DEFAULT 'forms',
    "username" TEXT,
    "passwordHash" TEXT
);
INSERT INTO "new_Setting" ("backupFolder", "backupInterval", "backupRetention", "id", "instanceName", "logLevel", "longDateFormat", "shortDateFormat", "showRelativeDates", "timeFormat") SELECT "backupFolder", "backupInterval", "backupRetention", "id", "instanceName", "logLevel", "longDateFormat", "shortDateFormat", "showRelativeDates", "timeFormat" FROM "Setting";
DROP TABLE "Setting";
ALTER TABLE "new_Setting" RENAME TO "Setting";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");
