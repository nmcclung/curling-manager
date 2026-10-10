import { Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";

export const playersRouter = Router();

const playerInput = z.object({
  name: z.string().trim().min(1, "Name is required"),
  leagueId: z.string().min(1, "League is required"),
  seasonId: z.string().min(1, "Season is required"),
  canPlaySkip: z.boolean().default(false),
  canPlayVice: z.boolean().default(false),
  canPlaySecond: z.boolean().default(false),
  canPlayLead: z.boolean().default(false),
  isNewCurler: z.boolean().default(false),
  active: z.boolean().default(true),
  notes: z.string().trim().max(2000).optional().nullable(),
  experienceYears: z.number().int().min(0).optional().nullable(),
});

const playerUpdateInput = playerInput.partial();

// Invariant #5 (intent doc §4): every active player must be eligible for at
// least one position. Only meaningful once we know the *resulting* state of
// all four flags + active, so this runs after merging with existing data.
function assertActivePlayerHasEligibility(p: {
  active: boolean;
  canPlaySkip: boolean;
  canPlayVice: boolean;
  canPlaySecond: boolean;
  canPlayLead: boolean;
}) {
  if (p.active && !p.canPlaySkip && !p.canPlayVice && !p.canPlaySecond && !p.canPlayLead) {
    throw new HttpError(400, "An active player must be eligible for at least one position.");
  }
}

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

playersRouter.get("/", async (req, res) => {
  const leagueId = typeof req.query.leagueId === "string" ? req.query.leagueId : undefined;
  const seasonId = typeof req.query.seasonId === "string" ? req.query.seasonId : undefined;
  const players = await prisma.player.findMany({
    where: { ...(leagueId ? { leagueId } : {}), ...(seasonId ? { seasonId } : {}) },
    orderBy: { name: "asc" },
  });

  // hasTeamHistory drives the delete-vs-deactivate guard below (and lets
  // the client disable Delete proactively rather than only discovering the
  // block after attempting it) — computed here in one grouped query rather
  // than N+1 counts.
  const counts = await prisma.teamSlot.groupBy({
    by: ["playerId"],
    where: { playerId: { in: players.map((p) => p.id) } },
    _count: true,
  });
  const countByPlayerId = new Map(counts.map((c) => [c.playerId, c._count]));

  res.json(players.map((p) => ({ ...p, hasTeamHistory: (countByPlayerId.get(p.id) ?? 0) > 0 })));
});

// GET /api/players/last-cycle-positions?seasonId=X&leagueId=Y — for each
// player, which position they played in the most recent cycle (this
// season+league) that actually has generated teams. Lets the roster page
// show "what did they play last time" next to eligibility, so someone can
// spot a versatile player who's been stuck in one slot and diversify their
// checkboxes on purpose. Registered before "/:id"-shaped routes for the
// same reason as "/batch"/"/import" above, though there's currently no
// GET "/:id" route to collide with.
playersRouter.get("/last-cycle-positions", async (req, res) => {
  const seasonId = typeof req.query.seasonId === "string" ? req.query.seasonId : undefined;
  const leagueId = typeof req.query.leagueId === "string" ? req.query.leagueId : undefined;
  if (!seasonId || !leagueId) {
    res.status(400).json({ error: "seasonId and leagueId are required" });
    return;
  }

  const cycles = await prisma.cycle.findMany({
    where: { seasonId, leagueId },
    orderBy: { cycleNumber: "desc" },
    include: { teams: { include: { slots: true } } },
  });
  const lastCycleWithTeams = cycles.find((c) => c.teams.length > 0);

  const positions: Record<string, string> = {};
  if (lastCycleWithTeams) {
    for (const team of lastCycleWithTeams.teams) {
      for (const slot of team.slots) {
        if (slot.playerId) positions[slot.playerId] = slot.position;
      }
    }
  }
  res.json({ cycleNumber: lastCycleWithTeams?.cycleNumber ?? null, positions });
});

playersRouter.post("/", async (req, res) => {
  try {
    const data = playerInput.parse(req.body);
    assertActivePlayerHasEligibility(data);

    const player = await prisma.player.create({ data });
    res.status(201).json({ ...player, hasTeamHistory: false }); // just created — can't have any yet
  } catch (err) {
    handleError(err, res);
  }
});

const importInput = z.object({
  leagueId: z.string().min(1, "League is required"),
  seasonId: z.string().min(1, "Season is required"),
  players: z
    .array(
      z.object({
        name: z.string().trim().min(1, "Name is required"),
        notes: z.string().trim().max(2000).optional().nullable(),
        experienceYears: z.number().int().min(0).optional().nullable(),
        canPlaySkip: z.boolean().default(false),
        canPlayVice: z.boolean().default(false),
        canPlaySecond: z.boolean().default(false),
        canPlayLead: z.boolean().default(false),
        isNewCurler: z.boolean().default(false),
        active: z.boolean().default(false),
      }),
    )
    .min(1),
});

// Bulk-create from a season-start roster CSV import (client-side review
// screen). This source export carries real position-eligibility/new-curler/
// active signal per row (see CLAUDE.md's Roster import note — an earlier,
// column-poorer export this importer briefly supported had none, hence the
// now-obsolete "always land inactive" behavior), so it's taken as-is rather
// than forced off. Still enforces the same "active player needs >=1
// position" invariant as every other player-write path, checked per row
// before the transaction commits so one bad row doesn't partially apply.
playersRouter.post("/import", async (req, res) => {
  try {
    const { leagueId, seasonId, players: rows } = importInput.parse(req.body);

    for (const row of rows) {
      if (row.active && !row.canPlaySkip && !row.canPlayVice && !row.canPlaySecond && !row.canPlayLead) {
        throw new HttpError(400, `${row.name}: an active player must be eligible for at least one position.`);
      }
    }

    const created = await prisma.$transaction(
      rows.map((row) =>
        prisma.player.create({
          data: {
            name: row.name,
            leagueId,
            seasonId,
            notes: row.notes ?? null,
            experienceYears: row.experienceYears ?? null,
            canPlaySkip: row.canPlaySkip,
            canPlayVice: row.canPlayVice,
            canPlaySecond: row.canPlaySecond,
            canPlayLead: row.canPlayLead,
            isNewCurler: row.isNewCurler,
            active: row.active,
          },
        }),
      ),
    );
    res.status(201).json(created.map((p) => ({ ...p, hasTeamHistory: false }))); // just created — can't have any yet
  } catch (err) {
    handleError(err, res);
  }
});

const batchUpdateInput = z.object({
  updates: z
    .array(
      z.object({
        id: z.string().min(1),
        patch: playerUpdateInput,
      }),
    )
    .min(1),
});

// Registered before "/:id" — Express matches routes in registration order,
// so "/batch" would otherwise be swallowed by the "/:id" param route.
playersRouter.patch("/batch", async (req, res) => {
  try {
    const { updates } = batchUpdateInput.parse(req.body);

    const existing = await prisma.player.findMany({ where: { id: { in: updates.map((u) => u.id) } } });
    const existingById = new Map(existing.map((p) => [p.id, p]));

    for (const { id, patch } of updates) {
      const current = existingById.get(id);
      if (!current) throw new HttpError(404, `Player ${id} not found`);
      assertActivePlayerHasEligibility({ ...current, ...patch });
    }

    const players = await prisma.$transaction(
      updates.map(({ id, patch }) => prisma.player.update({ where: { id }, data: patch })),
    );
    res.json(players);
  } catch (err) {
    handleError(err, res);
  }
});

playersRouter.patch("/:id", async (req, res) => {
  try {
    const patch = playerUpdateInput.parse(req.body);

    const existing = await prisma.player.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new HttpError(404, "Player not found");

    const merged = { ...existing, ...patch };
    assertActivePlayerHasEligibility(merged);

    const player = await prisma.player.update({ where: { id: req.params.id }, data: patch });
    res.json(player);
  } catch (err) {
    handleError(err, res);
  }
});

// Once a player has ever been assigned to a TeamSlot, deleting them stops
// being safe: their slot would silently go empty (and could leave a Skip
// slot with no player, a state the rest of the app treats as impossible),
// the schedule for that cycle wouldn't get flagged stale (the FK's
// onDelete: SetNull happens at the DB level, bypassing the application
// logic that normally sets isStale on a slot change), and the decay-
// weighted teammate-history calculation would quietly lose their past
// co-occurrences — corrupting *other* players' history, not just theirs.
// Deactivating preserves all of that. Below this threshold (never
// assigned to a team) deletion is still fully safe and unrestricted.
playersRouter.delete("/:id", async (req, res) => {
  try {
    const assignmentCount = await prisma.teamSlot.count({ where: { playerId: req.params.id } });
    if (assignmentCount > 0) {
      throw new HttpError(
        400,
        `This player has been assigned to ${assignmentCount} team slot${assignmentCount === 1 ? "" : "s"} this season and can no longer be deleted — deactivate them instead to remove them from future team generation while preserving their history.`,
      );
    }
    await prisma.player.delete({ where: { id: req.params.id } });
    res.status(204).end();
  } catch (err) {
    handleError(err, res);
  }
});

function handleError(err: unknown, res: import("express").Response) {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  if (err instanceof z.ZodError) {
    res.status(400).json({ error: err.issues.map((i) => i.message).join(", ") });
    return;
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") {
      res.status(409).json({ error: "A player with this name already exists in this league for this season." });
      return;
    }
    if (err.code === "P2025") {
      res.status(404).json({ error: "Player not found" });
      return;
    }
  }
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
}
