-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Cycle" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "seasonId" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "cycleNumber" INTEGER NOT NULL,
    "teamCount" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Cycle_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Cycle_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Cycle" ("createdAt", "cycleNumber", "id", "leagueId", "seasonId", "teamCount") SELECT "createdAt", "cycleNumber", "id", "leagueId", "seasonId", "teamCount" FROM "Cycle";
DROP TABLE "Cycle";
ALTER TABLE "new_Cycle" RENAME TO "Cycle";
CREATE UNIQUE INDEX "Cycle_seasonId_leagueId_cycleNumber_key" ON "Cycle"("seasonId", "leagueId", "cycleNumber");
CREATE TABLE "new_Match" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "cycleId" TEXT NOT NULL,
    "weekNumber" INTEGER NOT NULL,
    "drawTime" TEXT NOT NULL,
    "sheetNumber" INTEGER NOT NULL,
    "homeTeamId" TEXT,
    "awayTeamId" TEXT,
    "isGhost" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "Match_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "Cycle" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Match_homeTeamId_fkey" FOREIGN KEY ("homeTeamId") REFERENCES "Team" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Match_awayTeamId_fkey" FOREIGN KEY ("awayTeamId") REFERENCES "Team" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Match" ("awayTeamId", "cycleId", "drawTime", "homeTeamId", "id", "isGhost", "sheetNumber", "weekNumber") SELECT "awayTeamId", "cycleId", "drawTime", "homeTeamId", "id", "isGhost", "sheetNumber", "weekNumber" FROM "Match";
DROP TABLE "Match";
ALTER TABLE "new_Match" RENAME TO "Match";
CREATE UNIQUE INDEX "Match_cycleId_weekNumber_drawTime_sheetNumber_key" ON "Match"("cycleId", "weekNumber", "drawTime", "sheetNumber");
CREATE TABLE "new_Schedule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "cycleId" TEXT NOT NULL,
    "isStale" BOOLEAN NOT NULL DEFAULT false,
    "generatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Schedule_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "Cycle" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Schedule" ("cycleId", "generatedAt", "id", "isStale") SELECT "cycleId", "generatedAt", "id", "isStale" FROM "Schedule";
DROP TABLE "Schedule";
ALTER TABLE "new_Schedule" RENAME TO "Schedule";
CREATE UNIQUE INDEX "Schedule_cycleId_key" ON "Schedule"("cycleId");
CREATE TABLE "new_Team" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "cycleId" TEXT NOT NULL,
    "teamNumber" INTEGER NOT NULL,
    CONSTRAINT "Team_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "Cycle" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Team" ("cycleId", "id", "teamNumber") SELECT "cycleId", "id", "teamNumber" FROM "Team";
DROP TABLE "Team";
ALTER TABLE "new_Team" RENAME TO "Team";
CREATE UNIQUE INDEX "Team_cycleId_teamNumber_key" ON "Team"("cycleId", "teamNumber");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
