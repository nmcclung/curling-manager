import { Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";

export const timeSlotPairsRouter = Router();

const pairInput = z.object({
  leagueId: z.string().min(1, "League is required"),
  playerAId: z.string().min(1, "Player A is required"),
  playerBId: z.string().min(1, "Player B is required"),
  priority: z.number().int().default(0),
  notes: z.string().trim().max(2000).optional().nullable(),
});

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

timeSlotPairsRouter.get("/", async (req, res) => {
  const leagueId = typeof req.query.leagueId === "string" ? req.query.leagueId : undefined;
  const pairs = await prisma.timeSlotPair.findMany({
    where: leagueId ? { leagueId } : undefined,
    include: { playerA: true, playerB: true },
    orderBy: { priority: "desc" },
  });
  res.json(pairs);
});

timeSlotPairsRouter.post("/", async (req, res) => {
  try {
    const data = pairInput.parse(req.body);

    if (data.playerAId === data.playerBId) {
      throw new HttpError(400, "A player cannot be paired with themselves.");
    }

    const [playerA, playerB] = await Promise.all([
      prisma.player.findUnique({ where: { id: data.playerAId } }),
      prisma.player.findUnique({ where: { id: data.playerBId } }),
    ]);
    if (!playerA || !playerB) throw new HttpError(404, "One or both players were not found.");
    if (playerA.leagueId !== data.leagueId || playerB.leagueId !== data.leagueId) {
      throw new HttpError(400, "Both players must belong to the pair's league.");
    }

    const pair = await prisma.timeSlotPair.create({
      data,
      include: { playerA: true, playerB: true },
    });
    res.status(201).json(pair);
  } catch (err) {
    handleError(err, res);
  }
});

timeSlotPairsRouter.delete("/:id", async (req, res) => {
  try {
    await prisma.timeSlotPair.delete({ where: { id: req.params.id } });
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
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
    res.status(404).json({ error: "Pair not found" });
    return;
  }
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
}
