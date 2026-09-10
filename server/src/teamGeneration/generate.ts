import { getTeamGroupIndex, getTimeSlotGroups, isSingletonGroup } from "./groups.js";
import { conflictScore } from "./score.js";
import {
  POSITIONS,
  type DraftPair,
  type DraftPlayer,
  type GenerationResult,
  type HistoryMap,
  type Position,
  type TeamCount,
  type WorkingTeam,
} from "./types.js";

// Bounded multi-pass swap optimization (intent doc §5 step 6). The old
// system scaled maxPasses down by cycle number to fit Apps Script's
// execution-time limits — not a concern here, so we just use one fixed,
// generous bound. threshold=0 means "try to improve any nonzero conflict",
// which is reasonable now that conflict scores are naturally small
// (decay-weighted, not the old flat 10000/1000/500 penalties).
const MAX_SWAP_PASSES = 20;
const MAX_SWAPS_PER_PASS = 20;
const IMPROVEMENT_THRESHOLD = 0;

export function validateRosterForGeneration(players: DraftPlayer[], teamCount: TeamCount): string[] {
  const issues: string[] = [];
  const min = teamCount * 3;
  const max = teamCount * 4;
  if (players.length < min || players.length > max) {
    issues.push(`Roster size must be between ${min} and ${max} for a ${teamCount}-team cycle (found ${players.length}).`);
  }

  const skipCount = players.filter((p) => p.canPlaySkip).length;
  if (skipCount < teamCount) {
    issues.push(`Need at least ${teamCount} skip-eligible players (Skip can never be a SPARE) — found ${skipCount}.`);
  }

  const minFrontEnd = teamCount - 3;
  for (const [label, count] of [
    ["Vice", players.filter((p) => p.canPlayVice).length],
    ["Second", players.filter((p) => p.canPlaySecond).length],
    ["Lead", players.filter((p) => p.canPlayLead).length],
  ] as const) {
    if (count < minFrontEnd) {
      issues.push(`Need at least ${minFrontEnd} ${label}-eligible players — found ${count}.`);
    }
  }

  return issues;
}

export function generateTeams(params: {
  teamCount: TeamCount;
  cycleNumber: number;
  players: DraftPlayer[];
  pairs: DraftPair[];
  history: HistoryMap;
}): GenerationResult {
  const { teamCount, cycleNumber, pairs, history } = params;
  const groups = getTimeSlotGroups(teamCount);
  const playersById = new Map(params.players.map((p) => [p.id, p]));
  const warnings: string[] = [];

  const teams: WorkingTeam[] = [];
  for (let i = 1; i <= teamCount; i++) {
    teams.push({
      teamNumber: i,
      groupIndex: getTeamGroupIndex(i, teamCount),
      slots: { SKIP: null, VICE: null, SECOND: null, LEAD: null },
    });
  }

  const assignedPlayerIds = new Set<string>();
  const pairedPlayerIds = new Set<string>();
  for (const pair of pairs) {
    pairedPlayerIds.add(pair.playerAId);
    pairedPlayerIds.add(pair.playerBId);
  }

  placePairs(teams, groups, playersById, pairs, history, assignedPlayerIds, warnings);
  draftRemaining(teams, playersById, assignedPlayerIds, history, warnings);

  if (params.players.length < teamCount * 4) {
    redistributeForSpareLimit(teams, teamCount, playersById, history, pairedPlayerIds, warnings);
  }

  fillSparePositions(teams);

  if (cycleNumber > 1) {
    performSwapOptimization(teams, groups, playersById, history, pairedPlayerIds);
  }

  return { teams, warnings };
}

function shuffle<T>(items: T[]): T[] {
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Positions a player is a candidate for *specifically when being placed as
// part of a timeslot pair* — port of getAvailablePositions() in the old
// TeamGenerator.gs. Deliberately narrower than general eligibility: a
// skip-only specialist only tries Skip; a new curler who's lead-eligible is
// forced to Lead only (even if also Vice/Second eligible), matching the old
// system's real behavior of prioritizing new curlers into Lead.
function getAvailablePositionsForPairing(player: DraftPlayer): Position[] {
  if (player.canPlaySkip && !player.canPlayVice && !player.canPlaySecond && !player.canPlayLead) {
    return ["SKIP"];
  }
  if (player.isNewCurler && player.canPlayLead) {
    return ["LEAD"];
  }
  const positions: Position[] = [];
  if (player.canPlaySkip) positions.push("SKIP");
  if (player.canPlayVice) positions.push("VICE");
  if (player.canPlaySecond) positions.push("SECOND");
  if (player.canPlayLead) positions.push("LEAD");
  return positions;
}

// Score a candidate time-slot group for a pair: prefer groups with more open
// capacity (baseScore), but let history-conflict avoidance dominate that —
// heavily penalized if either player has prior-teammate history with an
// existing occupant, extra-penalized if *both* do (echoing the old system's
// -100/-50/-200 flat penalties, just on the new decayed scale). With no
// history yet (cycle 1), this collapses to pure capacity-balancing, matching
// the old system's separate cycle-1 "balanced" path — so one function covers both.
function scoreGroupForPair(
  teams: WorkingTeam[],
  groupTeams: number[],
  playerAId: string,
  playerBId: string,
  history: HistoryMap,
): number {
  let assignedCount = 0;
  for (const teamNum of groupTeams) {
    const team = teams[teamNum - 1];
    assignedCount += POSITIONS.filter((p) => team.slots[p] !== null).length;
  }
  const baseScore = groupTeams.length * 4 - assignedCount;

  const historyA = history.get(playerAId);
  const historyB = history.get(playerBId);
  let historyPenalty = 0;

  for (const teamNum of groupTeams) {
    const team = teams[teamNum - 1];
    for (const position of POSITIONS) {
      const occupant = team.slots[position];
      if (!occupant || occupant === "SPARE") continue;
      const wA = historyA?.get(occupant) ?? 0;
      const wB = historyB?.get(occupant) ?? 0;
      if (wA > 0) historyPenalty -= wA;
      if (wB > 0) historyPenalty -= wB;
      if (wA > 0 && wB > 0) historyPenalty -= 2; // both share history with the same occupant
    }
  }

  // History dominates the group choice; baseScore only breaks ties between
  // otherwise-equal (typically conflict-free) groups.
  return baseScore + historyPenalty * 20;
}

function assignPlayerToGroupTeam(
  teams: WorkingTeam[],
  groupTeams: number[],
  playerId: string,
  positions: Position[],
  avoidTeamNumber?: number,
): number | null {
  for (const position of positions) {
    const candidates = groupTeams.filter(
      (teamNum) => teams[teamNum - 1].slots[position] === null && teamNum !== avoidTeamNumber,
    );
    if (candidates.length > 0) {
      const teamNum = candidates[0];
      teams[teamNum - 1].slots[position] = playerId;
      return teamNum;
    }
  }
  return null;
}

function placePairs(
  teams: WorkingTeam[],
  groups: number[][],
  playersById: Map<string, DraftPlayer>,
  pairs: DraftPair[],
  history: HistoryMap,
  assignedPlayerIds: Set<string>,
  warnings: string[],
) {
  // Priority high-to-low, ties broken randomly — priority is actually wired
  // in here (intent doc §9), unlike the old system which captured it but
  // never used it for ordering.
  const ordered = shuffle(pairs).sort((a, b) => b.priority - a.priority);

  for (const pair of ordered) {
    const playerA = playersById.get(pair.playerAId);
    const playerB = playersById.get(pair.playerBId);
    if (!playerA || !playerB) continue; // inactive/removed player — not in this generation's roster
    if (assignedPlayerIds.has(playerA.id) || assignedPlayerIds.has(playerB.id)) continue;

    const positionsA = getAvailablePositionsForPairing(playerA);
    const positionsB = getAvailablePositionsForPairing(playerB);

    let bestGroup = -1;
    let bestScore = -Infinity;
    for (let g = 0; g < groups.length; g++) {
      const groupTeams = groups[g];
      if (groupTeams.length === 1) continue; // singleton — never usable for pairs (§4.6)

      const hasSpaceForA = positionsA.some((pos) => groupTeams.some((t) => teams[t - 1].slots[pos] === null));
      const hasSpaceForB = positionsB.some((pos) => groupTeams.some((t) => teams[t - 1].slots[pos] === null));
      if (!hasSpaceForA || !hasSpaceForB) continue;

      const score = scoreGroupForPair(teams, groupTeams, playerA.id, playerB.id, history);
      if (score > bestScore) {
        bestScore = score;
        bestGroup = g;
      }
    }

    if (bestGroup === -1) {
      warnings.push(
        `Could not place pair ${playerA.name} & ${playerB.name} together — no time-slot group had room for both; they'll be drafted individually.`,
      );
      continue;
    }

    const groupTeams = groups[bestGroup];
    const teamA = assignPlayerToGroupTeam(teams, groupTeams, playerA.id, positionsA);
    if (teamA === null) {
      warnings.push(`Could not place ${playerA.name} for pair with ${playerB.name} — they'll be drafted individually.`);
      continue;
    }
    assignedPlayerIds.add(playerA.id);

    const teamB = assignPlayerToGroupTeam(teams, groupTeams, playerB.id, positionsB, teamA);
    if (teamB === null) {
      for (const position of positionsA) {
        if (teams[teamA - 1].slots[position] === playerA.id) {
          teams[teamA - 1].slots[position] = null;
          break;
        }
      }
      assignedPlayerIds.delete(playerA.id);
      warnings.push(
        `Could not place pair ${playerA.name} & ${playerB.name} together — rolled back; they'll be drafted individually.`,
      );
      continue;
    }
    assignedPlayerIds.add(playerB.id);
  }
}

function draftToBestTeam(
  teams: WorkingTeam[],
  playerIds: string[],
  position: Position,
  playersById: Map<string, DraftPlayer>,
  history: HistoryMap,
  assignedPlayerIds: Set<string>,
  available: string[],
) {
  for (const playerId of playerIds) {
    if (assignedPlayerIds.has(playerId)) continue;
    const player = playersById.get(playerId)!;

    let bestTeam: WorkingTeam | null = null;
    let bestScore = Infinity;
    for (const team of teams) {
      if (team.slots[position] !== null) continue;
      const score = conflictScore(player, team, history);
      if (score < bestScore) {
        bestScore = score;
        bestTeam = team;
      }
    }

    if (bestTeam) {
      bestTeam.slots[position] = playerId;
      assignedPlayerIds.add(playerId);
      const idx = available.indexOf(playerId);
      if (idx > -1) available.splice(idx, 1);
    }
  }
}

function draftVersatile(
  teams: WorkingTeam[],
  playersById: Map<string, DraftPlayer>,
  history: HistoryMap,
  assignedPlayerIds: Set<string>,
  available: string[],
) {
  for (const position of ["VICE", "SECOND"] as const) {
    for (const team of shuffle(teams)) {
      if (team.slots[position] !== null) continue;

      let bestPlayerId: string | null = null;
      let bestScore = Infinity;
      for (const playerId of available) {
        const player = playersById.get(playerId)!;
        const eligible = position === "VICE" ? player.canPlayVice : player.canPlaySecond;
        if (!eligible) continue;
        const score = conflictScore(player, team, history);
        if (score < bestScore) {
          bestScore = score;
          bestPlayerId = playerId;
        }
      }

      if (bestPlayerId) {
        team.slots[position] = bestPlayerId;
        assignedPlayerIds.add(bestPlayerId);
        const idx = available.indexOf(bestPlayerId);
        if (idx > -1) available.splice(idx, 1);
      }
    }
  }
}

function draftRemaining(
  teams: WorkingTeam[],
  playersById: Map<string, DraftPlayer>,
  assignedPlayerIds: Set<string>,
  history: HistoryMap,
  warnings: string[],
) {
  const available = shuffle(
    [...playersById.values()].filter((p) => !assignedPlayerIds.has(p.id)).map((p) => p.id),
  );

  const skipSpecialists = available.filter((id) => {
    const p = playersById.get(id)!;
    return p.eligibilityCount === 1 && p.canPlaySkip;
  });
  const skipGeneralists = available.filter((id) => {
    const p = playersById.get(id)!;
    return p.eligibilityCount > 1 && p.canPlaySkip;
  });
  draftToBestTeam(teams, skipSpecialists, "SKIP", playersById, history, assignedPlayerIds, available);
  draftToBestTeam(teams, skipGeneralists, "SKIP", playersById, history, assignedPlayerIds, available);

  const newCurlerLeads = available.filter((id) => {
    const p = playersById.get(id)!;
    return p.isNewCurler && p.canPlayLead;
  });
  const otherLeads = available.filter((id) => {
    const p = playersById.get(id)!;
    return !p.isNewCurler && p.canPlayLead;
  });
  draftToBestTeam(teams, newCurlerLeads, "LEAD", playersById, history, assignedPlayerIds, available);
  draftToBestTeam(teams, otherLeads, "LEAD", playersById, history, assignedPlayerIds, available);

  const viceSpecialists = available.filter((id) => {
    const p = playersById.get(id)!;
    return p.frontEndEligibilityCount === 1 && p.canPlayVice;
  });
  const secondSpecialists = available.filter((id) => {
    const p = playersById.get(id)!;
    return p.frontEndEligibilityCount === 1 && p.canPlaySecond;
  });
  draftToBestTeam(teams, viceSpecialists, "VICE", playersById, history, assignedPlayerIds, available);
  draftToBestTeam(teams, secondSpecialists, "SECOND", playersById, history, assignedPlayerIds, available);

  draftVersatile(teams, playersById, history, assignedPlayerIds, available);

  if (available.length > 0) {
    const names = available.map((id) => playersById.get(id)!.name).join(", ");
    warnings.push(`${available.length} player(s) could not be placed by any drafting phase: ${names}.`);
  }
}

function redistributeForSpareLimit(
  teams: WorkingTeam[],
  teamCount: TeamCount,
  playersById: Map<string, DraftPlayer>,
  history: HistoryMap,
  pairedPlayerIds: Set<string>,
  warnings: string[],
) {
  const emptyCount = (team: WorkingTeam) => POSITIONS.filter((p) => team.slots[p] === null).length;
  const eligibleFor = (position: Position, player: DraftPlayer) =>
    position === "VICE" ? player.canPlayVice : position === "SECOND" ? player.canPlaySecond : player.canPlayLead;

  for (const needTeam of teams) {
    while (emptyCount(needTeam) > 1) {
      const emptyPosition = (["VICE", "SECOND", "LEAD"] as const).find((p) => needTeam.slots[p] === null);
      if (!emptyPosition) break;

      const needTeamIsSingleton = isSingletonGroup(needTeam.groupIndex, teamCount);

      let best: { sourceTeam: WorkingTeam; playerId: string } | null = null;
      let bestScore = Infinity;

      for (const sourceTeam of teams) {
        if (sourceTeam.teamNumber === needTeam.teamNumber) continue;
        if (emptyCount(sourceTeam) > 0) continue;
        if (!needTeamIsSingleton && sourceTeam.groupIndex !== needTeam.groupIndex) continue;

        const playerId = sourceTeam.slots[emptyPosition];
        if (!playerId || playerId === "SPARE") continue;
        if (pairedPlayerIds.has(playerId)) continue;

        const player = playersById.get(playerId)!;
        if (!eligibleFor(emptyPosition, player)) continue;

        const score = conflictScore(player, needTeam, history);
        if (score < bestScore) {
          bestScore = score;
          best = { sourceTeam, playerId };
        }
      }

      if (!best) {
        warnings.push(`Team ${needTeam.teamNumber} ${emptyPosition} has no eligible player to redistribute in — will use SPARE.`);
        break;
      }

      best.sourceTeam.slots[emptyPosition] = null;
      needTeam.slots[emptyPosition] = best.playerId;
    }
  }
}

function fillSparePositions(teams: WorkingTeam[]) {
  for (const team of teams) {
    for (const position of ["VICE", "SECOND", "LEAD"] as const) {
      if (team.slots[position] === null) team.slots[position] = "SPARE";
    }
    if (team.slots.SKIP === null) {
      throw new Error(
        `Internal error: Team ${team.teamNumber} has no Skip assigned after drafting — should be impossible given roster validation.`,
      );
    }
  }
}

function eligibilityCheck(position: Position, player: DraftPlayer): boolean {
  switch (position) {
    case "SKIP":
      return player.canPlaySkip;
    case "VICE":
      return player.canPlayVice;
    case "SECOND":
      return player.canPlaySecond;
    case "LEAD":
      return player.canPlayLead;
  }
}

function performSwapOptimization(
  teams: WorkingTeam[],
  groups: number[][],
  playersById: Map<string, DraftPlayer>,
  history: HistoryMap,
  pairedPlayerIds: Set<string>,
) {
  for (let pass = 0; pass < MAX_SWAP_PASSES; pass++) {
    const conflicts: { team: WorkingTeam; position: Position; playerId: string; score: number }[] = [];
    for (const team of teams) {
      for (const position of POSITIONS) {
        const playerId = team.slots[position];
        if (!playerId || playerId === "SPARE" || pairedPlayerIds.has(playerId)) continue;
        const score = conflictScore(playersById.get(playerId)!, team, history);
        if (score > IMPROVEMENT_THRESHOLD) {
          conflicts.push({ team, position, playerId, score });
        }
      }
    }
    conflicts.sort((a, b) => b.score - a.score);

    let improvementsThisPass = 0;
    for (const conflict of conflicts) {
      if (improvementsThisPass >= MAX_SWAPS_PER_PASS) break;

      const groupTeamNumbers = groups[conflict.team.groupIndex];
      let bestSwap: { otherTeam: WorkingTeam; otherPlayerId: string; improvement: number } | null = null;

      for (const teamNum of groupTeamNumbers) {
        if (teamNum === conflict.team.teamNumber) continue;
        const otherTeam = teams[teamNum - 1];
        const otherPlayerId = otherTeam.slots[conflict.position];
        if (!otherPlayerId || otherPlayerId === "SPARE" || pairedPlayerIds.has(otherPlayerId)) continue;

        const conflictPlayer = playersById.get(conflict.playerId)!;
        const otherPlayer = playersById.get(otherPlayerId)!;
        if (
          !eligibilityCheck(conflict.position, conflictPlayer) ||
          !eligibilityCheck(conflict.position, otherPlayer)
        ) {
          continue;
        }

        const currentTotal =
          conflictScore(conflictPlayer, conflict.team, history) + conflictScore(otherPlayer, otherTeam, history);
        const newTotal =
          conflictScore(conflictPlayer, otherTeam, history) + conflictScore(otherPlayer, conflict.team, history);
        const improvement = currentTotal - newTotal;

        if (improvement > 0 && (!bestSwap || improvement > bestSwap.improvement)) {
          bestSwap = { otherTeam, otherPlayerId, improvement };
        }
      }

      if (bestSwap) {
        conflict.team.slots[conflict.position] = bestSwap.otherPlayerId;
        bestSwap.otherTeam.slots[conflict.position] = conflict.playerId;
        improvementsThisPass++;
      }
    }

    if (improvementsThisPass === 0) break;
  }
}
