import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";

export const seasonsRouter = Router();

const seasonInput = z.object({
  name: z.string().trim().min(1, "Name is required"),
});

seasonsRouter.get("/", async (_req, res) => {
  const seasons = await prisma.season.findMany({ orderBy: { startedAt: "desc" } });
  res.json(seasons);
});

seasonsRouter.post("/", async (req, res) => {
  const parsed = seasonInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues.map((i) => i.message).join(", ") });
    return;
  }
  const season = await prisma.season.create({ data: parsed.data });
  res.status(201).json(season);
});

// Cascades to all of this season's cycles/teams/matches/schedules *and* its
// entire roster (players, timeslot pairs — schema onDelete: Cascade), since
// rosters are season-scoped now. Safe in isolation — history/decay never
// crosses a season boundary, so no other season can reference into this one.
seasonsRouter.delete("/:id", async (req, res) => {
  try {
    await prisma.season.delete({ where: { id: req.params.id } });
    res.status(204).end();
  } catch {
    res.status(404).json({ error: "Season not found" });
  }
});
