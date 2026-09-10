import { Router } from "express";
import { prisma } from "../prisma.js";

export const leaguesRouter = Router();

leaguesRouter.get("/", async (_req, res) => {
  const leagues = await prisma.league.findMany({ orderBy: { name: "asc" } });
  res.json(leagues);
});
