/**
 * One-time build script (intent doc §6): generate the fixed 4-week matchup
 * tables per team count (12/14/16), used as a static lookup at runtime.
 *
 * Constraints, in priority order:
 *   1. HARD: no team plays the same opponent twice within the cycle.
 *   2. HARD: every team in the same team-generation "time-slot group"
 *      (server/src/teamGeneration/groups.ts) lands in the same draw
 *      (early/late) together, every week — never split. This is what
 *      actually makes "same time-slot group" placement during team
 *      generation (§5 step 2, TimeSlotPair) mean anything: two paired
 *      players placed in the same group are guaranteed to curl at the same
 *      time each week, even though *which* time (early/late) that group
 *      gets can rotate week to week. Confirmed against every week of the
 *      old system's actual matrices (reference/ScheduleGenerator.gs) — it
 *      holds strictly there too, just never stated in the intent doc's
 *      prose. Groups never split across a draw in this generator either.
 *   3. SOFT / best-effort: each team rotates through as many distinct
 *      sheets as possible across the 4 weeks.
 *
 * Approach:
 *   - For each week, choose a way to partition the time-slot groups into
 *     two draw-sides whose real-team counts match the fixed draw capacity
 *     (8 real for 16-team; 8/6+ghost for 14-team; 6+ghost/6+ghost for
 *     12-team) — enumerated by subset-sum over group sizes. This is what
 *     enforces constraint 2 structurally: a side is always built from whole
 *     groups, so a group can never end up split.
 *   - Within a side, teams are randomly matched into games, retrying until
 *     no team repeats a prior week's opponent (small search spaces — a
 *     side is at most 8 teams — so this is cheap). If no valid matching is
 *     found for a chosen partition, backtrack to a different partition for
 *     that week; if every partition fails, restart the whole 4-week build.
 *   - Once a full valid 4-week schedule exists, permute each week's games
 *     onto sheets 1-4 to greedily minimize teams repeating a sheet they've
 *     already played, same as before. This step can't affect constraints 1
 *     or 2 (it only reassigns which sheet a fixed game is on).
 *   - Random-restart the whole pipeline many times and keep whichever
 *     valid result has the best sheet variety.
 *
 * Run with: npx tsx scripts/generate-fixed-schedules.ts (from server/)
 */

import { getTimeSlotGroups } from "../src/teamGeneration/groups.js";

type TeamCount = 12 | 14 | 16;
type Game = [number, number];
type Draw = { early: Game[]; late: Game[] };

function shuffle<T>(items: T[]): T[] {
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items];
  const result: T[][] = [];
  for (let i = 0; i < items.length; i++) {
    const rest = [...items.slice(0, i), ...items.slice(i + 1)];
    for (const perm of permutations(rest)) result.push([items[i], ...perm]);
  }
  return result;
}

// Real-team capacity each draw side must hit, and how many ghost games
// (2 ghost teams each) pad each side out to the fixed 4-sheet/8-slot
// layout. 16-team needs no ghosts at all; 14-team is structurally forced
// into an 8-real/6-real+ghost split (only one ghost game exists, and it
// can't be split across draws); 12-team mirrors the old system's
// symmetric 6-real+ghost/6-real+ghost split.
function drawCapacity(teamCount: TeamCount): { sideA: number; sideB: number; ghostGamesA: number; ghostGamesB: number } {
  if (teamCount === 16) return { sideA: 8, sideB: 8, ghostGamesA: 0, ghostGamesB: 0 };
  if (teamCount === 14) return { sideA: 8, sideB: 6, ghostGamesA: 0, ghostGamesB: 1 };
  return { sideA: 6, sideB: 6, ghostGamesA: 1, ghostGamesB: 1 };
}

function ghostGames(teamCount: TeamCount, count: number, startOffset: number): Game[] {
  const games: Game[] = [];
  let next = teamCount + 1 + startOffset;
  for (let i = 0; i < count; i++) {
    games.push([next, next + 1]);
    next += 2;
  }
  return games;
}

// All ways to split group indices into two sides whose *real* team counts
// match (targetA, totalReal - targetA). Small search (≤6 groups → ≤64
// subsets), trivial to brute force.
function enumerateGroupPartitions(groupSizes: number[], targetA: number): { a: number[]; b: number[] }[] {
  const n = groupSizes.length;
  const results: { a: number[]; b: number[] }[] = [];
  for (let mask = 1; mask < (1 << n) - 1; mask++) {
    let sum = 0;
    const a: number[] = [];
    for (let i = 0; i < n; i++) {
      if (mask & (1 << i)) {
        sum += groupSizes[i];
        a.push(i);
      }
    }
    if (sum === targetA) {
      const b: number[] = [];
      for (let i = 0; i < n; i++) if (!(mask & (1 << i))) b.push(i);
      results.push({ a, b });
    }
  }
  return results;
}

function tryMatchAvoidingRepeats(
  teams: number[],
  opponentsSoFar: Map<number, Set<number>>,
  maxAttempts: number,
): Game[] | null {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const shuffled = shuffle(teams);
    const games: Game[] = [];
    let valid = true;
    for (let i = 0; i < shuffled.length; i += 2) {
      const a = shuffled[i];
      const b = shuffled[i + 1];
      if (opponentsSoFar.get(a)?.has(b)) {
        valid = false;
        break;
      }
      games.push([a, b]);
    }
    if (valid) return games;
  }
  return null;
}

function recordOpponents(games: Game[], opponentsSoFar: Map<number, Set<number>>) {
  for (const [a, b] of games) {
    if (!opponentsSoFar.has(a)) opponentsSoFar.set(a, new Set());
    if (!opponentsSoFar.has(b)) opponentsSoFar.set(b, new Set());
    opponentsSoFar.get(a)!.add(b);
    opponentsSoFar.get(b)!.add(a);
  }
}

function tryGenerateWeek(
  groups: number[][],
  partitions: { a: number[]; b: number[] }[],
  cap: ReturnType<typeof drawCapacity>,
  teamCount: TeamCount,
  opponentsSoFar: Map<number, Set<number>>,
): { early: Game[]; late: Game[] } | null {
  for (const partition of shuffle(partitions)) {
    const sideATeams = partition.a.flatMap((gi) => groups[gi]);
    const sideBTeams = partition.b.flatMap((gi) => groups[gi]);

    const sideAGames = tryMatchAvoidingRepeats(sideATeams, opponentsSoFar, 200);
    const sideBGames = tryMatchAvoidingRepeats(sideBTeams, opponentsSoFar, 200);
    if (!sideAGames || !sideBGames) continue;

    const fullA = [...sideAGames, ...ghostGames(teamCount, cap.ghostGamesA, 0)];
    const fullB = [...sideBGames, ...ghostGames(teamCount, cap.ghostGamesB, cap.ghostGamesA * 2)];

    recordOpponents(sideAGames, opponentsSoFar);
    recordOpponents(sideBGames, opponentsSoFar);

    return Math.random() < 0.5 ? { early: fullA, late: fullB } : { early: fullB, late: fullA };
  }
  return null;
}

// Sheets 2 and 3 (the middle sheets) are what players actually prefer —
// ghost games ("open", nobody plays) should land on 1 or 4 instead
// whenever possible, which also means the *real* games sharing that draw
// get both middle sheets rather than just one. This is weighted ABOVE
// real-team sheet-rotation variety (per user preference) — variety is
// only used as a tiebreak among otherwise-equally-good-for-ghost-placement
// permutations.
const MIDDLE_SHEETS = new Set([2, 3]);

function orderForSheetVariety(games: Game[], teamCount: TeamCount, sheetsUsed: Map<number, Set<number>>): Game[] {
  let best = games;
  let bestScore = Infinity;
  for (const perm of permutations(games)) {
    let repeatScore = 0;
    let ghostMiddlePenalty = 0;
    perm.forEach((game, idx) => {
      const sheet = idx + 1;
      const isGhostGame = game[0] > teamCount;
      if (isGhostGame) {
        if (MIDDLE_SHEETS.has(sheet)) ghostMiddlePenalty++;
        return;
      }
      for (const team of game) {
        if (sheetsUsed.get(team)?.has(sheet)) repeatScore++;
      }
    });
    const score = ghostMiddlePenalty * 100 + repeatScore;
    if (score < bestScore) {
      bestScore = score;
      best = perm;
    }
  }
  best.forEach((game, idx) => {
    const sheet = idx + 1;
    for (const team of game) {
      if (team > teamCount) continue;
      if (!sheetsUsed.has(team)) sheetsUsed.set(team, new Set());
      sheetsUsed.get(team)!.add(sheet);
    }
  });
  return best;
}

function generateValidSchedule(teamCount: TeamCount): Draw[] | null {
  const groups = getTimeSlotGroups(teamCount);
  const groupSizes = groups.map((g) => g.length);
  const cap = drawCapacity(teamCount);
  const partitions = enumerateGroupPartitions(groupSizes, cap.sideA);

  const opponentsSoFar = new Map<number, Set<number>>();
  const weeks: { early: Game[]; late: Game[] }[] = [];

  for (let week = 0; week < 4; week++) {
    const result = tryGenerateWeek(groups, partitions, cap, teamCount, opponentsSoFar);
    if (!result) return null;
    weeks.push(result);
  }
  return weeks;
}

function applySheetVariety(schedule: Draw[], teamCount: TeamCount): Draw[] {
  const sheetsUsed = new Map<number, Set<number>>();
  return schedule.map((week) => ({
    early: orderForSheetVariety(week.early, teamCount, sheetsUsed),
    late: orderForSheetVariety(week.late, teamCount, sheetsUsed),
  }));
}

// Three-tier weighting, highest priority first:
//   1. No team ever plays the same sheet 3+ times (worst case must stay at
//      2x — confirmed acceptable, explicitly called the ideal outcome).
//   2. Keep ghosts off the preferred middle sheets.
//   3. Real-team sheet-rotation variety — only a tiebreak once 1 and 2 are
//      otherwise equal (or moot — no ghosts at all for 16-team).
function scheduleScore(schedule: Draw[], teamCount: TeamCount): number {
  const sheetsUsed = new Map<number, number[]>();
  let ghostMiddleCount = 0;
  for (const week of schedule) {
    for (const draw of [week.early, week.late]) {
      draw.forEach(([a, b], idx) => {
        const sheet = idx + 1;
        if (a > teamCount) {
          if (MIDDLE_SHEETS.has(sheet)) ghostMiddleCount++;
          return;
        }
        for (const team of [a, b]) {
          if (!sheetsUsed.has(team)) sheetsUsed.set(team, []);
          sheetsUsed.get(team)!.push(sheet);
        }
      });
    }
  }
  let repeats = 0;
  let worstRepeatViolations = 0;
  for (const sheets of sheetsUsed.values()) {
    repeats += sheets.length - new Set(sheets).size;
    const counts = new Map<number, number>();
    for (const s of sheets) counts.set(s, (counts.get(s) ?? 0) + 1);
    const worst = Math.max(...counts.values());
    if (worst > 2) worstRepeatViolations += worst - 2;
  }
  return worstRepeatViolations * 10000 + ghostMiddleCount * 100 + repeats;
}

const TRIALS = 20000;

function generateSchedule(teamCount: TeamCount): Draw[] {
  let best: Draw[] | null = null;
  let bestScore = Infinity;

  for (let i = 0; i < TRIALS && bestScore > 0; i++) {
    const raw = generateValidSchedule(teamCount);
    if (!raw) continue;
    const withSheets = applySheetVariety(raw, teamCount);
    const score = scheduleScore(withSheets, teamCount);
    if (score < bestScore) {
      bestScore = score;
      best = withSheets;
    }
  }

  if (!best) throw new Error(`Could not construct a valid ${teamCount}-team schedule at all — this shouldn't happen.`);
  return best;
}

// --- Verification -----------------------------------------------------

function verify(schedule: Draw[], teamCount: TeamCount) {
  const opponentsSeen = new Map<number, Set<number>>();
  const sheetsUsed = new Map<number, number[]>();
  const groups = getTimeSlotGroups(teamCount);
  let hardViolations = 0;
  let groupSplitViolations = 0;
  let ghostGameCount = 0;
  let ghostOnMiddleCount = 0;

  for (const week of schedule) {
    for (const [drawName, draw] of [["early", week.early], ["late", week.late]] as const) {
      draw.forEach((game, idx) => {
        const sheet = idx + 1;
        const [a, b] = game;
        const isGhostGame = a > teamCount || b > teamCount;
        if (isGhostGame) {
          ghostGameCount++;
          if (MIDDLE_SHEETS.has(sheet)) ghostOnMiddleCount++;
        } else {
          if (!opponentsSeen.has(a)) opponentsSeen.set(a, new Set());
          if (!opponentsSeen.has(b)) opponentsSeen.set(b, new Set());
          if (opponentsSeen.get(a)!.has(b)) hardViolations++;
          opponentsSeen.get(a)!.add(b);
          opponentsSeen.get(b)!.add(a);
          for (const team of [a, b]) {
            if (!sheetsUsed.has(team)) sheetsUsed.set(team, []);
            sheetsUsed.get(team)!.push(sheet);
          }
        }
      });
      void drawName;
    }

    // Group-atomicity check: every group's real teams must be entirely
    // within one draw this week.
    for (const group of groups) {
      const realTeams = group.filter((t) => t <= teamCount);
      if (realTeams.length === 0) continue;
      const inEarly = realTeams.filter((t) => week.early.some((g) => g.includes(t))).length;
      const inLate = realTeams.filter((t) => week.late.some((g) => g.includes(t))).length;
      if (inEarly > 0 && inLate > 0) groupSplitViolations++;
    }
  }

  let perfectVariety = 0;
  let totalDistinct = 0;
  let worstSingleSheetRepeat = 0;
  for (let team = 1; team <= teamCount; team++) {
    const sheets = sheetsUsed.get(team) ?? [];
    const distinct = new Set(sheets).size;
    totalDistinct += distinct;
    if (distinct === sheets.length) perfectVariety++;
    const counts = new Map<number, number>();
    for (const s of sheets) counts.set(s, (counts.get(s) ?? 0) + 1);
    worstSingleSheetRepeat = Math.max(worstSingleSheetRepeat, ...counts.values());
  }

  console.log(`\n--- ${teamCount}-team verification ---`);
  console.log(`Hard violations — repeat opponents: ${hardViolations}`);
  console.log(`Hard violations — a time-slot group split across draws in a week: ${groupSplitViolations}`);
  console.log(`Teams with all-distinct sheets across their games: ${perfectVariety}/${teamCount}`);
  console.log(`Average distinct sheets per team: ${(totalDistinct / teamCount).toFixed(2)} (max possible 4)`);
  // The metric that actually matters more than the average: does any team
  // get stuck on the same sheet repeatedly? 2x (one repeat, otherwise
  // varied) is fine; 3x or 4x would mean a team is effectively parked on
  // one sheet all cycle.
  console.log(`Worst case — most times any one team played the same sheet: ${worstSingleSheetRepeat}x`);
  console.log(`Ghost games on a middle sheet (2 or 3): ${ghostOnMiddleCount}/${ghostGameCount} (lower is better)`);

  return {
    hardViolations,
    groupSplitViolations,
    perfectVariety,
    avgDistinct: totalDistinct / teamCount,
    worstSingleSheetRepeat,
    ghostGameCount,
    ghostOnMiddleCount,
  };
}

function formatSchedule(schedule: Draw[]): string {
  const lines: string[] = ["["];
  schedule.forEach((week) => {
    lines.push("    {");
    lines.push(`      early: ${JSON.stringify(week.early)},`);
    lines.push(`      late: ${JSON.stringify(week.late)},`);
    lines.push("    },");
  });
  lines.push("  ]");
  return lines.join("\n");
}

async function main() {
  console.log(`\n=== Generating tables (up to ${TRIALS} trials each) ===`);
  const results: Record<TeamCount, Draw[]> = { 12: [], 14: [], 16: [] };
  const summaries: string[] = [];

  for (const teamCount of [12, 14, 16] as const) {
    const schedule = generateSchedule(teamCount);
    const stats = verify(schedule, teamCount);
    if (stats.hardViolations > 0 || stats.groupSplitViolations > 0) {
      throw new Error(
        `${teamCount}-team schedule has ${stats.hardViolations} repeat-opponent violation(s) and ${stats.groupSplitViolations} group-split violation(s) — refusing to write output.`,
      );
    }
    results[teamCount] = schedule;
    const ghostNote =
      stats.ghostGameCount > 0
        ? `, ${stats.ghostGameCount - stats.ghostOnMiddleCount}/${stats.ghostGameCount} ghost games kept off the middle sheets`
        : "";
    summaries.push(
      `// ${teamCount} teams: ${stats.perfectVariety}/${teamCount} teams get all-distinct sheets, avg ${stats.avgDistinct.toFixed(2)}/4${ghostNote}`,
    );
  }

  const fs = await import("node:fs");
  const path = await import("node:path");
  const outDir = path.join(import.meta.dirname, "..", "src", "scheduleGeneration");
  fs.mkdirSync(outDir, { recursive: true });

  const header = `// GENERATED by scripts/generate-fixed-schedules.ts — do not hand-edit.
// Re-run the script and replace this file if the generation approach changes.
//
// Fixed 4-week matchup tables per team count (intent doc §6). Two hard
// constraints hold by construction: no repeat opponents within a cycle,
// and every team-generation time-slot group (teamGeneration/groups.ts)
// stays entirely within one draw each week — never split — since that's
// what makes a TimeSlotPair's "same time-slot group" placement actually
// mean "always plays at the same time". On top of that, best-effort via
// randomized search: real-team sheet variety across the cycle, then
// (secondary) keeping ghost ("open") games off sheets 2/3 — players prefer
// the middle sheets, so this also means more middle-sheet real games.
${summaries.join("\n")}
//
// Game = [teamNumberA, teamNumberB]. Team numbers beyond a config's real
// team count are ghosts (render as "open" — see intent doc §2) and only
// ever face other ghosts. Array index within early/late = sheet number - 1.

export type TeamCount = 12 | 14 | 16;
export type Game = [number, number];
export type WeekSchedule = { early: Game[]; late: Game[] };

export const FIXED_SCHEDULES: Record<TeamCount, WeekSchedule[]> = {
  12: ${formatSchedule(results[12])},
  14: ${formatSchedule(results[14])},
  16: ${formatSchedule(results[16])},
};
`;

  const outFile = path.join(outDir, "fixedSchedules.ts");
  fs.writeFileSync(outFile, header, "utf8");
  console.log(`\nWrote ${outFile}`);
}

main();
