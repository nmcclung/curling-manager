import { POSITIONS, type DraftPlayer, type HistoryMap, type WorkingTeam } from "./types.js";

// Versatility tiebreak scale — must stay far smaller than the smallest real
// gap between two history weights (with decayRate=1/6, that gap is ~0.167),
// so it only ever breaks exact conflict-score ties, never overrides a real
// difference. Prefers consuming the *less* versatile candidate first when
// tied, saving more flexible players for later slots (intent doc §5:
// "position versatility as a lightweight tiebreaker").
const VERSATILITY_TIEBREAK_WEIGHT = 0.01;

/**
 * How much placing `player` on `team` conflicts with players already on that
 * team, based on season-scoped decayed teammate history, plus a lightweight
 * versatility tiebreak.
 */
export function conflictScore(player: DraftPlayer, team: WorkingTeam, history: HistoryMap): number {
  const playerHistory = history.get(player.id);
  let penalty = 0;

  if (playerHistory) {
    for (const position of POSITIONS) {
      const occupant = team.slots[position];
      if (occupant && occupant !== "SPARE") {
        penalty += playerHistory.get(occupant) ?? 0;
      }
    }
  }

  return penalty + player.frontEndEligibilityCount * VERSATILITY_TIEBREAK_WEIGHT;
}
