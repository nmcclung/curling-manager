-- CreateTable
CREATE TABLE "League" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "Season" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Cycle" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "seasonId" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "cycleNumber" INTEGER NOT NULL,
    "teamCount" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Cycle_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Cycle_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Team" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "cycleId" TEXT NOT NULL,
    "teamNumber" INTEGER NOT NULL,
    "timeSlot" TEXT NOT NULL,
    CONSTRAINT "Team_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "Cycle" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TeamSlot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "teamId" TEXT NOT NULL,
    "position" TEXT NOT NULL,
    "playerId" TEXT,
    CONSTRAINT "TeamSlot_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TeamSlot_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Player" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "canPlaySkip" BOOLEAN NOT NULL DEFAULT false,
    "canPlayVice" BOOLEAN NOT NULL DEFAULT false,
    "canPlaySecond" BOOLEAN NOT NULL DEFAULT false,
    "canPlayLead" BOOLEAN NOT NULL DEFAULT false,
    "isNewCurler" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    CONSTRAINT "Player_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TimeSlotPair" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "leagueId" TEXT NOT NULL,
    "playerAId" TEXT NOT NULL,
    "playerBId" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    CONSTRAINT "TimeSlotPair_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TimeSlotPair_playerAId_fkey" FOREIGN KEY ("playerAId") REFERENCES "Player" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TimeSlotPair_playerBId_fkey" FOREIGN KEY ("playerBId") REFERENCES "Player" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Match" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "cycleId" TEXT NOT NULL,
    "weekNumber" INTEGER NOT NULL,
    "drawTime" TEXT NOT NULL,
    "sheetNumber" INTEGER NOT NULL,
    "homeTeamId" TEXT,
    "awayTeamId" TEXT,
    "isGhost" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "Match_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "Cycle" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Match_homeTeamId_fkey" FOREIGN KEY ("homeTeamId") REFERENCES "Team" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Match_awayTeamId_fkey" FOREIGN KEY ("awayTeamId") REFERENCES "Team" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Schedule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "cycleId" TEXT NOT NULL,
    "isStale" BOOLEAN NOT NULL DEFAULT false,
    "generatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Schedule_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "Cycle" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "League_name_key" ON "League"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Cycle_seasonId_leagueId_cycleNumber_key" ON "Cycle"("seasonId", "leagueId", "cycleNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Team_cycleId_teamNumber_key" ON "Team"("cycleId", "teamNumber");

-- CreateIndex
CREATE UNIQUE INDEX "TeamSlot_teamId_position_key" ON "TeamSlot"("teamId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "Player_leagueId_name_key" ON "Player"("leagueId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Match_cycleId_weekNumber_drawTime_sheetNumber_key" ON "Match"("cycleId", "weekNumber", "drawTime", "sheetNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Schedule_cycleId_key" ON "Schedule"("cycleId");
