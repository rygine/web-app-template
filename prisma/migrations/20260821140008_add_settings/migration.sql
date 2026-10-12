-- CreateTable
CREATE TABLE "Setting" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'app',
    "instanceName" TEXT,
    "logLevel" TEXT NOT NULL DEFAULT 'debug',
    "backupFolder" TEXT NOT NULL DEFAULT 'Backups',
    "backupInterval" INTEGER NOT NULL DEFAULT 7,
    "backupRetention" INTEGER NOT NULL DEFAULT 28,
    "shortDateFormat" TEXT NOT NULL DEFAULT 'mdy',
    "longDateFormat" TEXT NOT NULL DEFAULT 'weekdayMonthDay',
    "timeFormat" TEXT NOT NULL DEFAULT 'h12',
    "showRelativeDates" BOOLEAN NOT NULL DEFAULT true
);
