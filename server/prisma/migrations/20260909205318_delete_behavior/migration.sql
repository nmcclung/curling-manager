-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_TimeSlotPair" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "leagueId" TEXT NOT NULL,
    "playerAId" TEXT NOT NULL,
    "playerBId" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    CONSTRAINT "TimeSlotPair_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TimeSlotPair_playerAId_fkey" FOREIGN KEY ("playerAId") REFERENCES "Player" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TimeSlotPair_playerBId_fkey" FOREIGN KEY ("playerBId") REFERENCES "Player" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_TimeSlotPair" ("id", "leagueId", "notes", "playerAId", "playerBId", "priority") SELECT "id", "leagueId", "notes", "playerAId", "playerBId", "priority" FROM "TimeSlotPair";
DROP TABLE "TimeSlotPair";
ALTER TABLE "new_TimeSlotPair" RENAME TO "TimeSlotPair";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
