-- CreateTable
CREATE TABLE "ApiKey" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "logs" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "time" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "namespace" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "fields" TEXT,
    "errors" TEXT,
    "requestId" TEXT
);

-- CreateTable
CREATE TABLE "Item" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "logs_time_idx" ON "logs"("time");

-- CreateIndex
CREATE INDEX "logs_namespace_idx" ON "logs"("namespace");

-- CreateIndex
CREATE INDEX "logs_requestId_idx" ON "logs"("requestId");

-- CreateIndex
CREATE INDEX "Item_createdAt_idx" ON "Item"("createdAt");
