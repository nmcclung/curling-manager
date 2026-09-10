import { Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";

export const playersRouter = Router();

const playerInput = z.object({
  name: z.string().trim().min(1, "Name is required"),
  leagueId: z.string().min(1, "League is required"),
  canPlaySkip: z.boolean().default(false),
  canPlayVice: z.boolean().default(false),
  canPlaySecond: z.boolean().default(false),
  canPlayLead: z.boolean().default(false),
  isNewCurler: z.boolean().default(false),
  active: z.boolean().default(true),
  notes: z.string().trim().max(2000).optional().nullable(),
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
  const players = await prisma.player.findMany({
    where: leagueId ? { leagueId } : undefined,
    orderBy: { name: "asc" },
  });
  res.json(players);
});

playersRouter.post("/", async (req, res) => {
  try {
    const data = playerInput.parse(req.body);
    assertActivePlayerHasEligibility(data);

    const player = await prisma.player.create({ data });
    res.status(201).json(player);
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

playersRouter.delete("/:id", async (req, res) => {
  try {
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
      res.status(409).json({ error: "A player with this name already exists in this league." });
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
