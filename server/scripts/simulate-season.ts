/**
 * Standalone simulation: does the random-restart wrapper (§5, generate.ts)
 * actually beat a single deterministic-ish pass, across a realistic 7-cycle
 * season, for each supported team count? Entirely in-memory — no DB writes,
 * synthetic-but-valid rosters constructed per team count so this is safe to
 * run repeatedly without touching real data.
 *
 * Run with: npx tsx scripts/simulate-season.ts (from server/)
 */

import { generateTeams, validateRosterForGeneration } from "../src/teamGeneration/generate.js";
import { POSITIONS } from "../src/teamGeneration/types.js";
import type { DraftPair, DraftPlayer, HistoryMap, TeamCount, WorkingTeam } from "../src/teamGeneration/types.js";

const CYCLES_PER_SEASON = 7;
const SEASONS_PER_CONFIG = 12; // independent repeats, since a single run has its own randomness
const RESTART_TRIALS = 300;
const DECAY_RATE = 1 / 6;

// --- Synthetic roster construction ------------------------------------

let nextId = 0;
function player(overrides: Partial<DraftPlayer> & Pick<DraftPlayer, "canPlaySkip" | "canPlayVice" | "canPlaySecond" | "canPlayLead">): DraftPlayer {
  const eligibilityCount =
    Number(overrides.canPlaySkip) + Number(overrides.canPlayVice) + Number(overrides.canPlaySecond) + Number(overrides.canPlayLead);
  const frontEndEligibilityCount = Number(overrides.canPlayVice) + Number(overrides.canPlaySecond) + Number(overrides.canPlayLead);
  nextId++;
  return {
    id: `p${nextId}`,
    name: `Player ${nextId}`,
    isNewCurler: false,
    eligibilityCount,
    frontEndEligibilityCount,
    ...overrides,
  };
}

// Realistic-ish proportions mirroring what we've seen in real roster data:
// skip specialists dominate skip-eligibility, front-end positions have a
// healthy mix of specialists and versatile generalists. Kept just under the
// specialist-oversupply gate (teamCount) for skip specifically.
function buildSyntheticRoster(teamCount: TeamCount): { players: DraftPlayer[]; pairs: DraftPair[] } {
  const players: DraftPlayer[] = [];

  // Tuned so total per-position demand comfortably covers teamCount slots
  // via *versatile* players (not just barely-passing the specialist-only
  // gate) — mirrors what a healthy real roster looks like (verified
  // warning-free below before this is trusted for the full simulation).
  const skipOnly = teamCount - 2;
  const skipGeneralist = 3;
  const viceOnly = Math.round(teamCount * 0.25);
  const secondOnly = Math.round(teamCount * 0.25);
  const leadOnly = Math.round(teamCount * 0.25);
  const viceSecond = Math.round(teamCount * 0.55);
  const viceLead = Math.round(teamCount * 0.35);
  const secondLead = Math.round(teamCount * 0.35);
  const allFrontEnd = Math.round(teamCount * 0.5);

  for (let i = 0; i < skipOnly; i++) players.push(player({ canPlaySkip: true, canPlayVice: false, canPlaySecond: false, canPlayLead: false }));
  for (let i = 0; i < skipGeneralist; i++) players.push(player({ canPlaySkip: true, canPlayVice: true, canPlaySecond: false, canPlayLead: false }));
  for (let i = 0; i < viceOnly; i++) players.push(player({ canPlaySkip: false, canPlayVice: true, canPlaySecond: false, canPlayLead: false }));
  for (let i = 0; i < secondOnly; i++) players.push(player({ canPlaySkip: false, canPlayVice: false, canPlaySecond: true, canPlayLead: false }));
  for (let i = 0; i < leadOnly; i++)
    players.push(player({ canPlaySkip: false, canPlayVice: false, canPlaySecond: false, canPlayLead: true, isNewCurler: i % 3 === 0 }));
  for (let i = 0; i < viceSecond; i++) players.push(player({ canPlaySkip: false, canPlayVice: true, canPlaySecond: true, canPlayLead: false }));
  for (let i = 0; i < viceLead; i++) players.push(player({ canPlaySkip: false, canPlayVice: true, canPlaySecond: false, canPlayLead: true }));
  for (let i = 0; i < secondLead; i++) players.push(player({ canPlaySkip: false, canPlayVice: false, canPlaySecond: true, canPlayLead: true }));
  for (let i = 0; i < allFrontEnd; i++) players.push(player({ canPlaySkip: false, canPlayVice: true, canPlaySecond: true, canPlayLead: true }));

  players.forEach((p, i) => {
    p.name = `Player ${i + 1}`;
  });

  // ~25% of the roster paired off, mirroring real pair density.
  const pairs: DraftPair[] = [];
  const shuffled = [...players].sort(() => Math.random() - 0.5);
  const pairedCount = Math.floor(players.length * 0.25);
  for (let i = 0; i + 1 < pairedCount; i += 2) {
    pairs.push({
      id: `pair${i / 2}`,
      playerAId: shuffled[i].id,
      playerBId: shuffled[i + 1].id,
      priority: [0, 1, 2][Math.floor(Math.random() * 3)],
    });
  }

  return { players, pairs };
}

// --- In-memory season-scoped decay history (mirrors history.ts exactly,
// just sourced from in-memory results instead of a DB query) ------------

function buildHistory(pastCycles: { cycleNumber: number; teams: WorkingTeam[] }[], beforeCycleNumber: number): HistoryMap {
  const history: HistoryMap = new Map();
  const addWeight = (a: string, b: string, weight: number) => {
    if (!history.has(a)) history.set(a, new Map());
    const inner = history.get(a)!;
    inner.set(b, (inner.get(b) ?? 0) + weight);
  };

  for (const cycle of pastCycles) {
    const cyclesAgo = beforeCycleNumber - cycle.cycleNumber;
    const weight = Math.max(0, 1 - (cyclesAgo - 1) * DECAY_RATE);
    if (weight <= 0) continue;
    for (const team of cycle.teams) {
      const occupants = POSITIONS.map((p) => team.slots[p]).filter((v): v is string => v !== null && v !== "SPARE");
      for (let i = 0; i < occupants.length; i++) {
        for (let j = i + 1; j < occupants.length; j++) {
          addWeight(occupants[i], occupants[j], weight);
          addWeight(occupants[j], occupants[i], weight);
        }
      }
    }
  }
  return history;
}

// Unweighted, human-readable companion metric: how many teammate pairings
// this cycle have happened at least once before this season (regardless of
// how long ago / how decayed) — "how often did someone see a repeat face."
function countRawRepeats(teams: WorkingTeam[], pastCycles: { teams: WorkingTeam[] }[]): number {
  const everTeammates = new Set<string>();
  const key = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  for (const cycle of pastCycles) {
    for (const team of cycle.teams) {
      const occ = POSITIONS.map((p) => team.slots[p]).filter((v): v is string => v !== null && v !== "SPARE");
      for (let i = 0; i < occ.length; i++) for (let j = i + 1; j < occ.length; j++) everTeammates.add(key(occ[i], occ[j]));
    }
  }
  let repeats = 0;
  for (const team of teams) {
    const occ = POSITIONS.map((p) => team.slots[p]).filter((v): v is string => v !== null && v !== "SPARE");
    for (let i = 0; i < occ.length; i++) for (let j = i + 1; j < occ.length; j++) if (everTeammates.has(key(occ[i], occ[j]))) repeats++;
  }
  return repeats;
}

type CycleRow = { cycleNumber: number; conflictScore: number; warnings: number; rawRepeats: number };

function runSeason(teamCount: TeamCount, trials: number, players: DraftPlayer[], pairs: DraftPair[]): CycleRow[] {
  const pastCycles: { cycleNumber: number; teams: WorkingTeam[] }[] = [];
  const rows: CycleRow[] = [];
  for (let cycleNumber = 1; cycleNumber <= CYCLES_PER_SEASON; cycleNumber++) {
    const history = buildHistory(pastCycles, cycleNumber);
    const result = generateTeams({ teamCount, cycleNumber, players, pairs, history, trials });
    rows.push({
      cycleNumber,
      conflictScore: result.conflictScore,
      warnings: result.warnings.length,
      rawRepeats: countRawRepeats(result.teams, pastCycles),
    });
    pastCycles.push({ cycleNumber, teams: result.teams });
  }
  return rows;
}

function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

for (const teamCount of [12, 14, 16] as const) {
  const { players, pairs } = buildSyntheticRoster(teamCount);
  const issues = validateRosterForGeneration(players, teamCount);

  const skipTotal = players.filter((p) => p.canPlaySkip).length;
  const viceTotal = players.filter((p) => p.canPlayVice).length;
  const secondTotal = players.filter((p) => p.canPlaySecond).length;
  const leadTotal = players.filter((p) => p.canPlayLead).length;
  console.log(
    `\n[${teamCount}-team roster] players=${players.length}, skip=${skipTotal}, vice=${viceTotal}, second=${secondTotal}, lead=${leadTotal}`,
  );

  // Quick warning check before committing to the expensive full simulation.
  const probe = generateTeams({ teamCount, cycleNumber: 1, players, pairs, history: new Map(), trials: 50 });
  console.log(`[${teamCount}-team roster] cycle-1 probe warnings: ${probe.warnings.length}`);
  if (probe.warnings.length > 0) probe.warnings.forEach((w) => console.log(`    - ${w}`));

  if (issues.length > 0) {
    console.log(`\n=== ${teamCount}-team: SYNTHETIC ROSTER INVALID ===`);
    issues.forEach((i) => console.log(`  - ${i}`));
    continue;
  }

  console.log(`\n=== ${teamCount}-team, ${CYCLES_PER_SEASON}-cycle season (${players.length} players, ${pairs.length} pairs, ${SEASONS_PER_CONFIG} repeats each) ===`);

  const baselineRuns: CycleRow[][] = [];
  const restartedRuns: CycleRow[][] = [];
  for (let s = 0; s < SEASONS_PER_CONFIG; s++) {
    baselineRuns.push(runSeason(teamCount, 1, players, pairs));
    restartedRuns.push(runSeason(teamCount, RESTART_TRIALS, players, pairs));
  }

  console.log(`Cycle | Baseline (trials=1): avg conflict, avg warnings, avg repeats | Restarted (trials=${RESTART_TRIALS}): avg conflict, avg warnings, avg repeats`);
  for (let c = 0; c < CYCLES_PER_SEASON; c++) {
    const b = baselineRuns.map((run) => run[c]);
    const r = restartedRuns.map((run) => run[c]);
    const line =
      `  ${c + 1}   |  conflict=${mean(b.map((x) => x.conflictScore)).toFixed(2)}, warnings=${mean(b.map((x) => x.warnings)).toFixed(2)}, repeats=${mean(b.map((x) => x.rawRepeats)).toFixed(2)}` +
      `   |  conflict=${mean(r.map((x) => x.conflictScore)).toFixed(2)}, warnings=${mean(r.map((x) => x.warnings)).toFixed(2)}, repeats=${mean(r.map((x) => x.rawRepeats)).toFixed(2)}`;
    console.log(line);
  }
}
