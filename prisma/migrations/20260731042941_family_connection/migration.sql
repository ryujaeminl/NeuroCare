-- CreateTable
CREATE TABLE "FamilyMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "patientId" TEXT NOT NULL,
    "fromName" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "addedBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveredAt" DATETIME,
    CONSTRAINT "FamilyMessage_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FamilyPlan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "patientId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "notes" TEXT,
    "addedBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FamilyPlan_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FamilyTask" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "patientId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "dueDate" DATETIME,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "addedBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FamilyTask_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "FamilyMessage_patientId_idx" ON "FamilyMessage"("patientId");

-- CreateIndex
CREATE INDEX "FamilyPlan_patientId_idx" ON "FamilyPlan"("patientId");

-- CreateIndex
CREATE INDEX "FamilyTask_patientId_idx" ON "FamilyTask"("patientId");
