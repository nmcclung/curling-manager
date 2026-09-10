-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_TeamSlot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "teamId" TEXT NOT NULL,
    "position" TEXT NOT NULL,
    "playerId" TEXT,
    CONSTRAINT "TeamSlot_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TeamSlot_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_TeamSlot" ("id", "playerId", "position", "teamId") SELECT "id", "playerId", "position", "teamId" FROM "TeamSlot";
DROP TABLE "TeamSlot";
ALTER TABLE "new_TeamSlot" RENAME TO "TeamSlot";
CREATE UNIQUE INDEX "TeamSlot_teamId_position_key" ON "TeamSlot"("teamId", "position");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
