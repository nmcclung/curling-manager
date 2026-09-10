/*
  Warnings:

  - Added the required column `seasonId` to the `Player` table without a default value. This is not possible if the table is not empty.
  - Added the required column `seasonId` to the `TimeSlotPair` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Player" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "canPlaySkip" BOOLEAN NOT NULL DEFAULT false,
    "canPlayVice" BOOLEAN NOT NULL DEFAULT false,
    "canPlaySecond" BOOLEAN NOT NULL DEFAULT false,
    "canPlayLead" BOOLEAN NOT NULL DEFAULT false,
    "isNewCurler" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "experienceYears" INTEGER,
    CONSTRAINT "Player_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Player_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Player" ("active", "canPlayLead", "canPlaySecond", "canPlaySkip", "canPlayVice", "experienceYears", "id", "isNewCurler", "leagueId", "name", "notes") SELECT "active", "canPlayLead", "canPlaySecond", "canPlaySkip", "canPlayVice", "experienceYears", "id", "isNewCurler", "leagueId", "name", "notes" FROM "Player";
DROP TABLE "Player";
ALTER TABLE "new_Player" RENAME TO "Player";
CREATE UNIQUE INDEX "Player_seasonId_leagueId_name_key" ON "Player"("seasonId", "leagueId", "name");
CREATE TABLE "new_TimeSlotPair" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "seasonId" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "playerAId" TEXT NOT NULL,
    "playerBId" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    CONSTRAINT "TimeSlotPair_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TimeSlotPair_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TimeSlotPair_playerAId_fkey" FOREIGN KEY ("playerAId") REFERENCES "Player" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TimeSlotPair_playerBId_fkey" FOREIGN KEY ("playerBId") REFERENCES "Player" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_TimeSlotPair" ("id", "leagueId", "notes", "playerAId", "playerBId", "priority") SELECT "id", "leagueId", "notes", "playerAId", "playerBId", "priority" FROM "TimeSlotPair";
DROP TABLE "TimeSlotPair";
ALTER TABLE "new_TimeSlotPair" RENAME TO "TimeSlotPair";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
