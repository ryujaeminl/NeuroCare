-- CreateTable
CREATE TABLE "Medication" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "patientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "dosage" TEXT NOT NULL,
    "frequency" TEXT NOT NULL,
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME,
    "notes" TEXT,
    "addedBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Medication_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FamilyMember" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "patientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "relation" TEXT NOT NULL,
    "birthYear" INTEGER,
    "addedBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FamilyMember_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Memory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "patientId" TEXT NOT NULL,
    "familyMemberId" TEXT,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "dateOccurred" DATETIME,
    "tags" TEXT NOT NULL DEFAULT '[]',
    "addedBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pineconeId" TEXT,
    CONSTRAINT "Memory_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Memory_familyMemberId_fkey" FOREIGN KEY ("familyMemberId") REFERENCES "FamilyMember" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Photo" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "patientId" TEXT NOT NULL,
    "familyMemberId" TEXT,
    "memoryId" TEXT,
    "url" TEXT NOT NULL,
    "caption" TEXT,
    "addedBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Photo_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Photo_familyMemberId_fkey" FOREIGN KEY ("familyMemberId") REFERENCES "FamilyMember" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Photo_memoryId_fkey" FOREIGN KEY ("memoryId") REFERENCES "Memory" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GuardianPreference" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "guardianId" TEXT NOT NULL,
    "moodAlertEnabled" BOOLEAN NOT NULL DEFAULT true,
    "moodAlertThreshold" TEXT NOT NULL DEFAULT 'moderate',
    "medicationReminderOptIn" BOOLEAN NOT NULL DEFAULT false,
    "defaultPatientId" TEXT,
    "dashboardLayout" TEXT,
    "notificationChannel" TEXT NOT NULL DEFAULT 'push',
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "GuardianPreference_guardianId_fkey" FOREIGN KEY ("guardianId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PushSubscription" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "guardianId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PushSubscription_guardianId_fkey" FOREIGN KEY ("guardianId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EmergencyEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "patientId" TEXT NOT NULL,
    "triggerType" TEXT NOT NULL,
    "detail" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "acknowledgedBy" TEXT,
    "acknowledgedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EmergencyEvent_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Medication_patientId_idx" ON "Medication"("patientId");

-- CreateIndex
CREATE INDEX "FamilyMember_patientId_idx" ON "FamilyMember"("patientId");

-- CreateIndex
CREATE INDEX "Memory_patientId_idx" ON "Memory"("patientId");

-- CreateIndex
CREATE INDEX "Memory_familyMemberId_idx" ON "Memory"("familyMemberId");

-- CreateIndex
CREATE INDEX "Photo_patientId_idx" ON "Photo"("patientId");

-- CreateIndex
CREATE UNIQUE INDEX "GuardianPreference_guardianId_key" ON "GuardianPreference"("guardianId");

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");

-- CreateIndex
CREATE INDEX "PushSubscription_guardianId_idx" ON "PushSubscription"("guardianId");

-- CreateIndex
CREATE INDEX "EmergencyEvent_patientId_status_idx" ON "EmergencyEvent"("patientId", "status");
