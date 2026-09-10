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
