import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";

export const cyclesRouter = Router();

// Team counts are intentionally restricted to 12/14/16 — the full set the
// intent doc (§2) confirms as the only configurations worth supporting.
const cycleInput = z.object({
  seasonId: z.string().min(1),
  leagueId: z.string().min(1),
  teamCount: z.union([z.literal(12), z.literal(14), z.literal(16)]),
});

cyclesRouter.get("/", async (req, res) => {
  const { seasonId, leagueId } = req.query;
  const cycles = await prisma.cycle.findMany({
    where: {
      seasonId: typeof seasonId === "string" ? seasonId : undefined,
      leagueId: typeof leagueId === "string" ? leagueId : undefined,
    },
    orderBy: { cycleNumber: "asc" },
  });
  res.json(cycles);
});

cyclesRouter.post("/", async (req, res) => {
  const parsed = cycleInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues.map((i) => i.message).join(", ") });
    return;
  }
  const { seasonId, leagueId, teamCount } = parsed.data;

  const cycle = await prisma.$transaction(async (tx) => {
    // cycleNumber is scoped per (season, league) and always starts at 1 —
    // a new season naturally resets this since no prior cycles reference it.
    const last = await tx.cycle.findFirst({
      where: { seasonId, leagueId },
      orderBy: { cycleNumber: "desc" },
    });
    return tx.cycle.create({
      data: { seasonId, leagueId, teamCount, cycleNumber: (last?.cycleNumber ?? 0) + 1 },
    });
  });

  res.status(201).json(cycle);
});
