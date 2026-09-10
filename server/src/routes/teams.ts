import { Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { generateTeams, validateRosterForGeneration } from "../teamGeneration/generate.js";
import { getTeamGroupIndex } from "../teamGeneration/groups.js";
import { computeSeasonHistory } from "../teamGeneration/history.js";
import type { DraftPair, DraftPlayer, TeamCount } from "../teamGeneration/types.js";

export const teamsRouter = Router();

class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public issues?: string[],
  ) {
    super(message);
  }
}

function toDraftPlayer(p: {
  id: string;
  name: string;
  canPlaySkip: boolean;
  canPlayVice: boolean;
  canPlaySecond: boolean;
  canPlayLead: boolean;
  isNewCurler: boolean;
}): DraftPlayer {
  const eligibilityCount =
    Number(p.canPlaySkip) + Number(p.canPlayVice) + Number(p.canPlaySecond) + Number(p.canPlayLead);
  const frontEndEligibilityCount = Number(p.canPlayVice) + Number(p.canPlaySecond) + Number(p.canPlayLead);
  return { ...p, eligibilityCount, frontEndEligibilityCount };
}

// POST /api/cycles/:cycleId/teams/generate
teamsRouter.post("/cycles/:cycleId/teams/generate", async (req, res) => {
  try {
    const cycle = await prisma.cycle.findUnique({ where: { id: req.params.cycleId } });
    if (!cycle) throw new HttpError(404, "Cycle not found");
    const teamCount = cycle.teamCount as TeamCount;

    const activePlayers = await prisma.player.findMany({
      where: { leagueId: cycle.leagueId, active: true },
    });
    const draftPlayers = activePlayers.map(toDraftPlayer);

    const issues = validateRosterForGeneration(draftPlayers, teamCount);
    if (issues.length > 0) throw new HttpError(400, "Roster is not ready for generation", issues);

    const activeIds = new Set(activePlayers.map((p) => p.id));
    const pairs = await prisma.timeSlotPair.findMany({ where: { leagueId: cycle.leagueId } });
    const draftPairs: DraftPair[] = pairs
      .filter((p) => activeIds.has(p.playerAId) && activeIds.has(p.playerBId))
      .map((p) => ({ id: p.id, playerAId: p.playerAId, playerBId: p.playerBId, priority: p.priority }));

    const history = await computeSeasonHistory(prisma, {
      seasonId: cycle.seasonId,
      leagueId: cycle.leagueId,
      beforeCycleNumber: cycle.cycleNumber,
    });

    const result = generateTeams({
      teamCount,
      cycleNumber: cycle.cycleNumber,
      players: draftPlayers,
      pairs: draftPairs,
      history,
    });

    await prisma.$transaction(async (tx) => {
      // Cascades to TeamSlot (and SetNulls any Match references) via schema.
      await tx.team.deleteMany({ where: { cycleId: cycle.id } });

      for (const team of result.teams) {
        await tx.team.create({
          data: {
            cycleId: cycle.id,
            teamNumber: team.teamNumber,
            slots: {
              create: Object.entries(team.slots).map(([position, value]) => ({
                position,
                playerId: value === "SPARE" || value === null ? null : value,
              })),
            },
          },
        });
      }

      await tx.schedule.updateMany({ where: { cycleId: cycle.id }, data: { isStale: true } });
    });

    const teams = await fetchTeamsWithPlayers(cycle.id);
    res.status(201).json({ teams, warnings: result.warnings });
  } catch (err) {
    handleError(err, res);
  }
});

// GET /api/cycles/:cycleId/teams
teamsRouter.get("/cycles/:cycleId/teams", async (req, res) => {
  const teams = await fetchTeamsWithPlayers(req.params.cycleId);
  res.json(teams);
});

const slotUpdateInput = z.object({
  playerId: z.string().min(1).nullable(),
});

// PATCH /api/team-slots/:id — manual override (intent doc §3).
teamsRouter.patch("/team-slots/:id", async (req, res) => {
  try {
    const data = slotUpdateInput.parse(req.body);

    const slot = await prisma.teamSlot.findUnique({
      where: { id: req.params.id },
      include: { team: { include: { cycle: true } } },
    });
    if (!slot) throw new HttpError(404, "Slot not found");

    if (slot.position === "SKIP" && data.playerId === null) {
      throw new HttpError(400, "Skip can never be left as a SPARE.");
    }

    if (data.playerId !== null) {
      const player = await prisma.player.findUnique({ where: { id: data.playerId } });
      if (!player) throw new HttpError(404, "Player not found");
      if (player.leagueId !== slot.team.cycle.leagueId) {
        throw new HttpError(400, "Player does not belong to this cycle's league.");
      }
      const duplicate = await prisma.teamSlot.findFirst({
        where: { teamId: slot.teamId, playerId: data.playerId, id: { not: slot.id } },
      });
      if (duplicate) throw new HttpError(409, `${player.name} is already on this team.`);
    }

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.teamSlot.update({ where: { id: slot.id }, data: { playerId: data.playerId } });
      await tx.schedule.updateMany({ where: { cycleId: slot.team.cycle.id }, data: { isStale: true } });
      return result;
    });

    res.json(updated);
  } catch (err) {
    handleError(err, res);
  }
});

// groupIndex is the team-generation time-slot group (teamGeneration/groups.ts)
// this team belongs to — included here purely for display (e.g. the printable
// schedule color-codes teams by group, mirroring the old system, since that's
// the actual mechanism keeping TimeSlotPair members together).
async function fetchTeamsWithPlayers(cycleId: string) {
  const cycle = await prisma.cycle.findUnique({ where: { id: cycleId } });
  const teams = await prisma.team.findMany({
    where: { cycleId },
    orderBy: { teamNumber: "asc" },
    include: { slots: { include: { player: true } } },
  });
  if (!cycle) return teams.map((t) => ({ ...t, groupIndex: 0 }));
  const teamCount = cycle.teamCount as TeamCount;
  return teams.map((t) => ({ ...t, groupIndex: getTeamGroupIndex(t.teamNumber, teamCount) }));
}

function handleError(err: unknown, res: import("express").Response) {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message, issues: err.issues });
    return;
  }
  if (err instanceof z.ZodError) {
    res.status(400).json({ error: err.issues.map((i) => i.message).join(", ") });
    return;
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
    res.status(404).json({ error: "Not found" });
    return;
  }
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
}
