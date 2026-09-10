import type { TeamCount } from "./types.js";

// Direct port of getTimeSlotGroups() from the old TeamGenerator.gs, confirmed
// against the production fixed schedule matrix (reference/ScheduleGenerator.gs).
// These are NOT early/late draw groupings — a team's draw time actually
// varies week to week (see Team model comment in schema.prisma). This is a
// purely algorithmic partition of team numbers used only during generation:
// to decide which teams a timeslot pair's two members can jointly land on,
// and to scope the swap-optimization pass. Singleton (length-1) groups exist
// only for the 14-team config and can never host a pair (§4.6) — pair
// placement simply skips them as candidates.
const TIME_SLOT_GROUPS: Record<TeamCount, number[][]> = {
  16: [
    [1, 3, 5, 7],
    [2, 4, 6, 8],
    [9, 11, 13, 15],
    [10, 12, 14, 16],
  ],
  14: [
    [1, 3, 5],
    [2, 4, 6, 7],
    [10, 12, 14],
    [11, 13],
    [8],
    [9],
  ],
  12: [
    [1, 3, 5],
    [2, 4, 6],
    [7, 9, 11],
    [8, 10, 12],
  ],
};

export function getTimeSlotGroups(teamCount: TeamCount): number[][] {
  return TIME_SLOT_GROUPS[teamCount];
}

export function getTeamGroupIndex(teamNumber: number, teamCount: TeamCount): number {
  const groups = getTimeSlotGroups(teamCount);
  const index = groups.findIndex((group) => group.includes(teamNumber));
  if (index === -1) {
    throw new Error(`Team ${teamNumber} not found in any time-slot group for teamCount=${teamCount}`);
  }
  return index;
}

export function isSingletonGroup(groupIndex: number, teamCount: TeamCount): boolean {
  return getTimeSlotGroups(teamCount)[groupIndex].length === 1;
}
