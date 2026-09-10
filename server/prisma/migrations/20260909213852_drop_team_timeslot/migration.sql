/*
  Warnings:

  - You are about to drop the column `timeSlot` on the `Team` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Team" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "cycleId" TEXT NOT NULL,
    "teamNumber" INTEGER NOT NULL,
    CONSTRAINT "Team_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "Cycle" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Team" ("cycleId", "id", "teamNumber") SELECT "cycleId", "id", "teamNumber" FROM "Team";
DROP TABLE "Team";
ALTER TABLE "new_Team" RENAME TO "Team";
CREATE UNIQUE INDEX "Team_cycleId_teamNumber_key" ON "Team"("cycleId", "teamNumber");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
