-- CreateTable
CREATE TABLE "MedicationConfirmation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "medicationId" TEXT NOT NULL,
    "reminderTime" TEXT NOT NULL,
    "dateKey" TEXT NOT NULL,
    "confirmedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MedicationConfirmation_medicationId_fkey" FOREIGN KEY ("medicationId") REFERENCES "Medication" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "MedicationConfirmation_medicationId_reminderTime_dateKey_key" ON "MedicationConfirmation"("medicationId", "reminderTime", "dateKey");

-- AlterTable
ALTER TABLE "CalendarEvent" ADD COLUMN "announcedAt" DATETIME;
