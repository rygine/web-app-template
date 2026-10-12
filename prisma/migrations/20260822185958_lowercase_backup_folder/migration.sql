-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
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
    "showRelativeDates" BOOLEAN NOT NULL DEFAULT true
);
INSERT INTO "new_Setting" ("backupFolder", "backupInterval", "backupRetention", "id", "instanceName", "logLevel", "longDateFormat", "shortDateFormat", "showRelativeDates", "timeFormat") SELECT "backupFolder", "backupInterval", "backupRetention", "id", "instanceName", "logLevel", "longDateFormat", "shortDateFormat", "showRelativeDates", "timeFormat" FROM "Setting";
DROP TABLE "Setting";
ALTER TABLE "new_Setting" RENAME TO "Setting";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
