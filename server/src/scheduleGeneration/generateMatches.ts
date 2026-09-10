import { FIXED_SCHEDULES, type TeamCount } from "./fixedSchedules.js";

export type MatchInput = {
  weekNumber: number;
  drawTime: "EARLY" | "LATE";
  sheetNumber: number;
  homeTeamId: string | null;
  awayTeamId: string | null;
  isGhost: boolean;
};

/**
 * Map the static fixed-schedule table (team numbers) onto this cycle's
 * actual Team rows (by teamNumber) to produce the Match rows to persist.
 * Team numbers beyond teamCount are ghosts (§2) — no real team, isGhost.
 */
export function generateMatches(teamCount: TeamCount, teamIdByNumber: Map<number, string>): MatchInput[] {
  const weeks = FIXED_SCHEDULES[teamCount];
  const matches: MatchInput[] = [];

  weeks.forEach((week, weekIdx) => {
    for (const [drawTime, games] of [
      ["EARLY", week.early],
      ["LATE", week.late],
    ] as const) {
      games.forEach((game, gameIdx) => {
        const [a, b] = game;
        const isGhost = a > teamCount || b > teamCount;
        matches.push({
          weekNumber: weekIdx + 1,
          drawTime,
          sheetNumber: gameIdx + 1,
          homeTeamId: isGhost ? null : (teamIdByNumber.get(a) ?? null),
          awayTeamId: isGhost ? null : (teamIdByNumber.get(b) ?? null),
          isGhost,
        });
      });
    }
  });

  return matches;
}
