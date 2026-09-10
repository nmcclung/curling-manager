import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { generateMatches } from "../scheduleGeneration/generateMatches.js";
import type { TeamCount } from "../scheduleGeneration/fixedSchedules.js";

export const scheduleRouter = Router();

class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

// POST /api/cycles/:cycleId/schedule/generate
scheduleRouter.post("/cycles/:cycleId/schedule/generate", async (req, res) => {
  try {
    const cycle = await prisma.cycle.findUnique({
      where: { id: req.params.cycleId },
      include: { teams: true },
    });
    if (!cycle) throw new HttpError(404, "Cycle not found");

    const teamCount = cycle.teamCount as TeamCount;
    if (cycle.teams.length !== teamCount) {
      throw new HttpError(
        400,
        `This cycle needs ${teamCount} generated teams before a schedule can be built (found ${cycle.teams.length}). Generate teams first.`,
      );
    }

    const teamIdByNumber = new Map(cycle.teams.map((t) => [t.teamNumber, t.id]));
    const matchInputs = generateMatches(teamCount, teamIdByNumber);

    await prisma.$transaction(async (tx) => {
      await tx.match.deleteMany({ where: { cycleId: cycle.id } });
      await tx.match.createMany({
        data: matchInputs.map((m) => ({ ...m, cycleId: cycle.id })),
      });
      await tx.schedule.upsert({
        where: { cycleId: cycle.id },
        create: { cycleId: cycle.id, isStale: false },
        update: { isStale: false, generatedAt: new Date() },
      });
    });

    const schedule = await fetchScheduleWithMatches(cycle.id);
    res.status(201).json(schedule);
  } catch (err) {
    handleError(err, res);
  }
});

// GET /api/cycles/:cycleId/schedule
scheduleRouter.get("/cycles/:cycleId/schedule", async (req, res) => {
  const schedule = await fetchScheduleWithMatches(req.params.cycleId);
  res.json(schedule);
});

// PATCH /api/cycles/:cycleId/schedule/mark-reviewed — clears isStale
// without regenerating (§3: "manually reviewed/rerun" are the two ways
// to clear it; this is the "reviewed" path for when no regeneration is
// actually needed).
scheduleRouter.patch("/cycles/:cycleId/schedule/mark-reviewed", async (req, res) => {
  try {
    const schedule = await prisma.schedule.findUnique({ where: { cycleId: req.params.cycleId } });
    if (!schedule) throw new HttpError(404, "No schedule exists for this cycle yet");
    const updated = await prisma.schedule.update({ where: { id: schedule.id }, data: { isStale: false } });
    res.json(updated);
  } catch (err) {
    handleError(err, res);
  }
});

const startDateInput = z.object({
  // Plain "YYYY-MM-DD" from a <input type="date">, or null to clear it.
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
});

// PATCH /api/cycles/:cycleId/schedule/start-date — calendar date for week 1,
// used to print real dates on the weekly schedule instead of "Week 1" etc.
scheduleRouter.patch("/cycles/:cycleId/schedule/start-date", async (req, res) => {
  try {
    const data = startDateInput.parse(req.body);
    const schedule = await prisma.schedule.findUnique({ where: { cycleId: req.params.cycleId } });
    if (!schedule) throw new HttpError(404, "No schedule exists for this cycle yet — generate it first.");
    const updated = await prisma.schedule.update({
      where: { id: schedule.id },
      data: { startDate: data.startDate ? new Date(`${data.startDate}T00:00:00`) : null },
    });
    res.json(updated);
  } catch (err) {
    handleError(err, res);
  }
});

async function fetchScheduleWithMatches(cycleId: string) {
  const schedule = await prisma.schedule.findUnique({ where: { cycleId } });
  const matches = await prisma.match.findMany({
    where: { cycleId },
    orderBy: [{ weekNumber: "asc" }, { drawTime: "asc" }, { sheetNumber: "asc" }],
    include: {
      homeTeam: { include: { slots: { where: { position: "SKIP" }, include: { player: true } } } },
      awayTeam: { include: { slots: { where: { position: "SKIP" }, include: { player: true } } } },
    },
  });
  return { schedule, matches };
}

function handleError(err: unknown, res: import("express").Response) {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  if (err instanceof z.ZodError) {
    res.status(400).json({ error: err.issues.map((i) => i.message).join(", ") });
    return;
  }
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
}
