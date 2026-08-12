-- RedefineTables
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_PlayedSong" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "patientId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "videoId" TEXT,
    "playedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PlayedSong_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_PlayedSong" ("id", "patientId", "title", "videoId", "playedAt") SELECT "id", "patientId", "title", "videoId", "playedAt" FROM "PlayedSong";
DROP TABLE "PlayedSong";
ALTER TABLE "new_PlayedSong" RENAME TO "PlayedSong";
CREATE INDEX "PlayedSong_patientId_playedAt_idx" ON "PlayedSong"("patientId", "playedAt");
PRAGMA foreign_keys=ON;
