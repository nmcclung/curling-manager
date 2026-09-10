import type { PrismaClient } from "@prisma/client";
import type { HistoryMap } from "./types.js";

const DEFAULT_DECAY_RATE = 1 / 6;

/**
 * Season-scoped, decay-weighted teammate history (intent doc §5, §4.7).
 * cyclesAgo never crosses a season boundary since we only ever query cycles
 * within the given seasonId. Formula: weight = max(0, 1 - (cyclesAgo-1) * decayRate)
 * — full weight for last cycle's teammates, decayed to 0 by ~6 cycles back
 * with the default rate. If the same two players were teammates in more than
 * one past cycle this season, weights are summed (repeat pairings compound).
 */
export async function computeSeasonHistory(
  prisma: PrismaClient,
  params: { seasonId: string; leagueId: string; beforeCycleNumber: number; decayRate?: number },
): Promise<HistoryMap> {
  const decayRate = params.decayRate ?? DEFAULT_DECAY_RATE;

  const pastCycles = await prisma.cycle.findMany({
    where: {
      seasonId: params.seasonId,
      leagueId: params.leagueId,
      cycleNumber: { lt: params.beforeCycleNumber },
    },
    include: {
      teams: {
        include: {
          slots: { where: { playerId: { not: null } } },
        },
      },
    },
  });

  const history: HistoryMap = new Map();

  const addWeight = (a: string, b: string, weight: number) => {
    if (!history.has(a)) history.set(a, new Map());
    const inner = history.get(a)!;
    inner.set(b, (inner.get(b) ?? 0) + weight);
  };

  for (const cycle of pastCycles) {
    const cyclesAgo = params.beforeCycleNumber - cycle.cycleNumber;
    const weight = Math.max(0, 1 - (cyclesAgo - 1) * decayRate);
    if (weight <= 0) continue;

    for (const team of cycle.teams) {
      const playerIds = team.slots.map((s) => s.playerId).filter((id): id is string => id !== null);
      for (let i = 0; i < playerIds.length; i++) {
        for (let j = i + 1; j < playerIds.length; j++) {
          addWeight(playerIds[i], playerIds[j], weight);
          addWeight(playerIds[j], playerIds[i], weight);
        }
      }
    }
  }

  return history;
}
